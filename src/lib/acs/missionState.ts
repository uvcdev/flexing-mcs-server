import { TrackingLogRedisUpdateParams, TrackingLogState } from '../../models/common/trackingLog';
import { FacilityAttributes } from '../../models/operation/facility';
import { RecentWorkOrderListByFacilitySerialAttributes } from '../../models/operation/workOrder';
import { useKepServerUtil } from '../kepServerUtil';
import { separateMqttMessage, MbsMqttMesaage } from '../mqttUtil';
import { useMultiCallRegisterUtil } from '../multiCallRegisterUtil';
import { editTrackingLogRedis } from '../process/trackingLog';
import { sendAckToWms } from '../process/wmsAck';
import { RedisKeys, useRedisUtil } from '../redisUtil';

const topic = 'MISSION_STATE';

export type MissionStateType =
  | 'MISSION_INITIATED'
  | 'AMR_ASSIGNED'
  | 'AMR_ARRIVED'
  | 'AMR_ACQUIRE_STARTED'
  | 'AMR_ACQUIRE_COMPLETED'
  | 'CARRIER_TRANSFERRING'
  | 'AMR_DEPOSIT_STARTED'
  | 'AMR_DEPOSIT_COMPLETED'
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
    console.log('catch acs missionState');
    const kepServerUtil = useKepServerUtil();
    const missionStateBody = messageJson.body as MissionStateBody;
    const state = missionStateBody.state;
    const callId = missionStateBody.mission.split('$')[0];
    const assignAmrName = missionStateBody.assign.robot || '';
    let assignTask = (missionStateBody.assign.task as TrackingLogState) || '';
    let assignState = 'PROCESSING' as TrackingLogState;

    if (state === 'AMR_DEPOSIT_COMPLETED' || state === 'AMR_UNASSIGNED' || state === 'MISSION_COMPLETED') {
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
    };
    if (assignTask === 'FMS-CANCELED') {
      trackingLogUpdateData.description += `(Task Canceled - FMS)`;
    } else if (assignTask === 'WORK-ORDER-CANCELED') {
      trackingLogUpdateData.description += `(MISSION Canceled - ACS)`;
    }
    await editTrackingLogRedis(trackingLogUpdateData, assignAmrName, 'SUCCESS', 'ACS');

    // workOrder Count down
    const redisUtil = useRedisUtil();
    const facilitySerial = callId.slice(0, 4) ?? '';

    if (assignState === 'COMPLETED' || assignState === 'CANCELED') {
      if (facilitySerial && facilitySerial.length > 3) {
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );

        if (facilityInfo?.system === 'WMS') {
          let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
            RedisKeys.RecentWorkOrderListByFacilitySerial,
            facilitySerial
          );
          if (workOrderListInfo) {
            const removeWorkOrderByCallId = (targetCallId: string) => {
              const workOrderList = workOrderListInfo?.workOrderList || [];

              // targetCallId와 같은 항목이 있는지 확인
              const hasMatchingCallId = workOrderList.some((item) => item.callId === targetCallId);

              if (hasMatchingCallId) {
                workOrderListInfo = {
                  count: (workOrderListInfo?.count || 0) - 1,
                  workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                };
              }

              return workOrderListInfo;
            };

            const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
              removeWorkOrderByCallId(callId) ?? {
                count: 0,
                workOrderList: [],
              };

            redisUtil.hset(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              facilitySerial,
              JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
            );
          }
        }
      }
    }

    if (state === 'MISSION_CANCELED') {
      // // 물류 로그 저장
      // const trackingLogSubject = 'MISSION_STATE';
      // const trackingLogDetail = state;
      // const trackingLogState = assignState;
      // const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
      //   callId: callId,
      //   subject: trackingLogSubject,
      //   detail: trackingLogDetail,
      //   state: trackingLogState,
      //   transferId: null,
      //   startFacility: null,
      //   destFacility: null,
      //   assignedRobot: assignAmrName,
      //   value: assignAmrName,
      //   description: `AMR(${assignAmrName}) Mission State : ${state}`,
      // };
      // await editTrackingLogRedis(trackingLogUpdateData, assignAmrName, 'SUCCESS', 'ACS');
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
