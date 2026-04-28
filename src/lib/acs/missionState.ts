import { TrackingLogAttributes, TrackingLogRedisUpdateParams, TrackingLogState } from '../../models/common/trackingLog';
import { FacilityAttributes } from '../../models/operation/facility';
import { RecentWorkOrderListByFacilitySerialAttributes } from '../../models/operation/workOrder';
import { useCallTypeUtil } from '../callTypeUtil';
import { useKepServerUtil } from '../kepServerUtil';
import { separateMqttMessage, MbsMqttMesaage } from '../mqttUtil';
import { usePlcConnectUtil } from '../plcConnectUtil';
import { fixMultiCallFacilityStatus } from '../process/commonUtils';
import { useDockingUtil } from '../process/dockingUtil';
import { editAbnormalTrackingLogRedis, editTrackingLogRedis } from '../process/trackingLog';
import { sendAckToWms } from '../process/wmsAck';
import { MqttBranchInfoDataFromAcs } from '../process/wmsBranch';
import { RedisKeys, useRedisUtil } from '../redisUtil';

const topic = 'MISSION_STATE';

export type MissionStateType =
  | 'MISSION_INITIATED'
  | 'AMR_ASSIGNED'
  | 'FROM_START' // from 작업 시작
  | 'AMR_ARRIVED' // docking 완료 ( from , to 동일 )
  | 'AMR_ACQUIRE_STARTED' // from lift 시작
  | 'AMR_ACQUIRE_COMPLETED' // from lift 완료
  | 'FROM_COMPLETED'
  | 'CARRIER_TRANSFERRING'
  | 'TO_START' // to 작업 시작
  | 'AMR_DEPOSIT_STARTED' // to lift 시작
  | 'AMR_DEPOSIT_COMPLETED' // to lift 완료
  | 'TO_COMPLETED'
  | 'AMR_UNASSIGNED'
  | 'MISSION_COMPLETED'
  | 'MISSION_CANCELED'
  | 'MISSION_FAILED'
  | 'MISSION_ORDER_ASSIGNED'
  | 'MISSION_ORDER_STARTED'
  | 'MISSION_ORDER_COMPLETED';

export interface MissionStateBody {
  mission: string;
  state: MissionStateType;
  missionDestination?: string;
  workState?: string;
  mode?: 'auto' | 'manual' | '';
  fromFacilitySerial?: string;
  toFacilitySerial?: string;
  assign: {
    robot: string;
    task: string;
  };
}

export interface AllMissionState {
  missions: MissionStateBody[];
}

export interface MissionCompleted {
  mission: string;
  robot: string;
}

export interface MissionFailed {
  mission: string;
}

const missionState = async (acsName: string, messageJson: MbsMqttMesaage) => {
  try {
    // console.log('catch acs missionState');
    const kepServerUtil = useKepServerUtil();
    const plcConnectUtil = usePlcConnectUtil();
    const missionStateBody = messageJson.body as MissionStateBody;
    const state = missionStateBody.state;

    // const callId = missionStateBody.mission.split('$')[0];
    let normalCallId = missionStateBody.mission.split('$')[0];
    if (normalCallId.split('_').length === 2) {
      normalCallId = normalCallId.split('_')[0];
    }
    const callId = normalCallId;
    const assignAmrName = missionStateBody.assign.robot || '';
    const missionDestination = missionStateBody.missionDestination || '';
    let assignTask = (missionStateBody.assign.task as TrackingLogState) || '';
    let assignState = 'PROCESSING' as TrackingLogState;

    if (
      state === 'AMR_DEPOSIT_COMPLETED' ||
      state === 'AMR_UNASSIGNED' ||
      state === 'MISSION_COMPLETED' ||
      state === 'TO_COMPLETED'
    ) {
      assignState = 'COMPLETED';
    } else if (state === 'MISSION_CANCELED') {
      // assignState = 'ABORTED';
      assignState = 'CANCELED';
    }
    // 물류 로그 저장
    const trackingLogSubject = 'MISSION_STATE';
    const trackingLogDetail = state;
    const trackingLogState = assignState;
    const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
      callId: callId,
      subject: trackingLogSubject,
      detail: trackingLogDetail,
      state: trackingLogState,
      transferId: null,
      startFacility: null,
      destFacility: null,
      assignedRobot: assignAmrName,
      value: assignAmrName,
      description: `AMR(${assignAmrName}) Mission State : ${state}`,
      missionDestination: missionDestination,
    };
    if (assignTask === 'FMS-CANCELED') {
      trackingLogUpdateData.description += `(Task Canceled - FMS)`;
    } else if (assignTask === 'WORK-ORDER-CANCELED') {
      trackingLogUpdateData.description += `(MISSION Canceled - ACS)`;
    }

    if (callId.split('_').length === 4) {
      await editAbnormalTrackingLogRedis(trackingLogUpdateData, assignAmrName, 'SUCCESS', 'ACS');
    } else {
      await editTrackingLogRedis(trackingLogUpdateData, assignAmrName, 'SUCCESS', 'ACS');
    }

    // workOrder Count down
    const redisUtil = useRedisUtil();
    const facilitySerial = callId.slice(0, 4) ?? '';
    let recentWorkOrderStatus = '';

    if (assignState === 'COMPLETED' || assignState === 'CANCELED') {
      // 2026-01-09
      // CANCELED 상태에서 FMS로 취소 하는경우와 작업 취소되는 경우를 별도로 관리 해야 한다면 해당 함수에서 분기 처리 후 적용 필요
      if (facilitySerial && facilitySerial.length > 3) {
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );

        // if (facilityInfo?.system === 'WMS') {
        let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          facilitySerial
        );
        if (workOrderListInfo) {
          const removeWorkOrderByCallId = (targetCallId: string) => {
            const workOrderList = workOrderListInfo?.workOrderList || [];
            // targetCallId와 같은 항목이 있는지 확인
            // const hasMatchingCallId = workOrderList.some((item) => item.callId === targetCallId);

            // if (hasMatchingCallId && !!workOrderListInfo?.facilitySerial && facilityInfo) {
            //   workOrderListInfo = {
            //     facilitySerial: workOrderListInfo?.facilitySerial,
            //     facilityInfo: facilityInfo,
            //     count: (workOrderListInfo?.count || 0) - 1,
            //     workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
            //   };
            // }

            const matchingWorkOrder = workOrderList.find((item) => item.callId === targetCallId);
            recentWorkOrderStatus = matchingWorkOrder?.state || '';

            if (matchingWorkOrder && !!workOrderListInfo?.facilitySerial && facilityInfo) {
              workOrderListInfo = {
                facilitySerial: workOrderListInfo?.facilitySerial,
                facilityInfo: facilityInfo,
                count: (workOrderListInfo?.count || 0) - 1,
                workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
              };
              return workOrderListInfo;
            }
          };

          // const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
          //   removeWorkOrderByCallId(callId) ?? {
          //     facilitySerial: facilitySerial,
          //     facilityInfo: facilityInfo as FacilityAttributes,
          //     count: 0,
          //     workOrderList: [],
          //   };

          const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes | null =
            removeWorkOrderByCallId(callId) ?? null;

          if (newRecentWorkOrderListByFacilitySerialParams) {
            redisUtil.hset(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              facilitySerial,
              JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
            );
          }
        }
      }
    }

    if (state === 'AMR_ASSIGNED' || state === 'CARRIER_TRANSFERRING' || state === 'MISSION_ORDER_ASSIGNED') {
      if (facilitySerial && facilitySerial.length > 3) {
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );

        let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          facilitySerial
        );
        if (workOrderListInfo) {
          for (let i = 0; i < workOrderListInfo.count; i++) {
            if (workOrderListInfo.workOrderList[i].callId === callId) {
              if (state === 'AMR_ASSIGNED') {
                workOrderListInfo.workOrderList[i].state = 'fromWorkOrder';
              } else if (state === 'CARRIER_TRANSFERRING') {
                workOrderListInfo.workOrderList[i].state = 'toWorkOrder';
              } else if (state === 'MISSION_ORDER_ASSIGNED') {
                workOrderListInfo.workOrderList[i].state = 'missionWorkOrder';
              }
            }
          }

          const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
            facilitySerial: facilitySerial,
            facilityInfo: facilityInfo as FacilityAttributes,
            count: workOrderListInfo.count,
            workOrderList: workOrderListInfo.workOrderList,
          };

          redisUtil.hset(
            RedisKeys.RecentWorkOrderListByFacilitySerial,
            facilitySerial,
            JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
          );
        }
      }
    }

    if (state === 'MISSION_CANCELED') {
      // response 값 내리기
      if (assignTask === 'WORK-ORDER-CANCELED') {
        const canceledWorkOrderCallId = normalCallId || '';
        const workState = missionStateBody.workState || '';
        const workMode = missionStateBody.mode || '';
        const fromFacilitySerial = missionStateBody.fromFacilitySerial || '';
        const toFacilitySerial = missionStateBody.toFacilitySerial || '';

        // const trackingLogInfo = await redisUtil.hgetObject<TrackingLogAttributes>(
        //   RedisKeys.InfoTrackingLogByCallId,
        //   normalCallId
        // );

        // const fromFacilitySerial = trackingLogInfo?.startFacility || '';
        // const toFacilitySerial = trackingLogInfo?.destFacility || '';

        const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          fromFacilitySerial
        );
        const toFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          toFacilitySerial
        );

        let alwaysOnFacility = fromFacilitySerial;
        let triggerFacility = toFacilitySerial;

        // if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
        //   alwaysOnFacility = toFacilitySerial;
        //   triggerFacility = fromFacilitySerial;
        // }
        if (fromFacilityInfo?.isActiveCallTrigger) {
          alwaysOnFacility = toFacilitySerial;
          triggerFacility = fromFacilitySerial;
        }
        let cancelWorkOrderStatus = '';
        if (workMode === 'manual') {
          cancelWorkOrderStatus = workState;
        } else {
          cancelWorkOrderStatus = recentWorkOrderStatus;
        }

        if (
          !fromFacilityInfo ||
          (fromFacilityInfo?.isActiveCallTrigger === false && toFacilityInfo?.isActiveCallTrigger === false)
        ) {
          if (cancelWorkOrderStatus === 'fromWorkOrder') {
            if (fromFacilitySerial) {
              await plcConnectUtil.writeTagValue({
                targetFacility: fromFacilitySerial,
                tagInfo: [
                  { tagName: 'Call_Response', value: false },
                  { tagName: 'Call_Robot_Assigned', value: false },
                  { tagName: 'Call_Response_Count', value: '0' },
                  { tagName: 'Dock_Request', value: false },
                  { tagName: 'Call_Response_Multi_1', value: false },
                  { tagName: 'Call_Response_Multi_2', value: false },
                  { tagName: 'Call_Cancel_Response', value: false },
                ],
              });
              await useCallTypeUtil().callTypeResponseReset(fromFacilitySerial);
            }
          } else if (cancelWorkOrderStatus === 'toWorkOrder') {
            if (toFacilitySerial) {
              await plcConnectUtil.writeTagValue({
                targetFacility: toFacilitySerial,
                tagInfo: [
                  { tagName: 'Call_Response', value: false },
                  { tagName: 'Call_Robot_Assigned', value: false },
                  { tagName: 'Call_Response_Count', value: '0' },
                  { tagName: 'Dock_Request', value: false },
                  { tagName: 'Call_Response_Multi_1', value: false },
                  { tagName: 'Call_Response_Multi_2', value: false },
                  { tagName: 'Call_Cancel_Response', value: false },
                ],
              });
              await useCallTypeUtil().callTypeResponseReset(toFacilitySerial);
            }
          }
        } else {
          if (cancelWorkOrderStatus !== 'toWorkOrder' && cancelWorkOrderStatus !== 'missionWorkOrder') {
            if (fromFacilitySerial) {
              await plcConnectUtil.writeTagValue({
                targetFacility: fromFacilitySerial,
                tagInfo: [
                  { tagName: 'Call_Response', value: false },
                  { tagName: 'Call_Robot_Assigned', value: false },
                  { tagName: 'Call_Response_Count', value: '0' },
                  { tagName: 'Dock_Request', value: false },
                  { tagName: 'Call_Response_Multi_1', value: false },
                  { tagName: 'Call_Response_Multi_2', value: false },
                  { tagName: 'Call_Cancel_Response', value: false },
                ],
              });
              await useCallTypeUtil().callTypeResponseReset(fromFacilitySerial);
            }
          }
          if (toFacilitySerial) {
            if (triggerFacility === toFacilitySerial) {
              await fixMultiCallFacilityStatus(toFacilitySerial);
            } else {
              await plcConnectUtil.writeTagValue({
                targetFacility: toFacilitySerial,
                tagInfo: [
                  { tagName: 'Call_Response', value: false },
                  { tagName: 'Call_Robot_Assigned', value: false },
                  { tagName: 'Call_Response_Count', value: '0' },
                  { tagName: 'Dock_Request', value: false },
                  { tagName: 'Call_Response_Multi_1', value: false },
                  { tagName: 'Call_Response_Multi_2', value: false },
                  { tagName: 'Call_Cancel_Response', value: false },
                ],
              });
              await useCallTypeUtil().callTypeResponseReset(toFacilitySerial);
            }
          }
        }
      }
      if (assignTask === 'FMS-CANCELED') {
        useDockingUtil().dockingCanceled({ CALL_ID: callId });
      }

      redisUtil.hdel(RedisKeys.InfoMissionOrderByWorkOrderCode, callId);
    } else if (state === 'MISSION_FAILED') {
    } else if (state === 'MISSION_COMPLETED') {
    }
  } catch (error) {
    throw error;
  }
};

const allMissionState = (acsName: string) => {
  console.log('catch acs allMissionState');
};

const missionCompleted = (acsName: string, messageJson: MbsMqttMesaage) => {
  console.log('catch acs missionCompleted');
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);
  // acs 물류 로그 저장
  // 작업 완료 처리
  // ACK 전송
  const ackBody = {
    mission: messageBody.mission || '',
  };
  sendAckToWms(topic, subject, ackBody, acsName);
};

const missionFailed = (acsName: string, messageJson: MbsMqttMesaage) => {
  console.log('catch acs missionFailed');
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);
  // acs 물류 로그 저장
  // 작업 완료 처리
  // ACK 전송
  const ackBody = {
    mission: messageBody.mission || '',
  };
  sendAckToWms(topic, subject, ackBody, acsName);
};

export const acsMissionState = (acsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'MISSION_STATE') {
    missionState(acsName, messageJson);
  } else if (subject === 'ALL_MISSION_STATE') {
    allMissionState(acsName);
  } else if (subject === 'MISSION_COMPLETED') {
    missionCompleted(acsName, messageJson);
  } else if (subject === 'MISSION_FAILED') {
    missionFailed(acsName, messageJson);
  }
};
