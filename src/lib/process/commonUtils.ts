import { TrackingLogRedisUpdateParams, TrackingLogSelectInfoByCallIdParams } from './../../models/common/trackingLog';
import { RecentWorkOrderListByFacilitySerialAttributes } from './../../models/operation/workOrder';
import { FacilityAttributes } from '../../models/operation/facility';
import { useKepServerUtil } from '../kepServerUtil';
import { logging } from '../logging';
import opcuaUtil from '../opcuaUtil';
import { usePlcConnectUtil } from '../plcConnectUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { MqttBranchInfoDataFromAcs } from './wmsBranch';
import { TrackingLogRedisAttributes } from '../../models/common/trackingLog';
import { MqttTopics, sendMqtt } from '../mqttUtil';
import { editTrackingLogRedis } from './trackingLog';
import { EqpCallStats } from '../callTypeUtil';
import { RemainingAckCommand } from './wmsAck';
import { InfoAckInCallByCallIdBody } from '../wms/mqtt/call';
import { CancelCallInfo, checkCancelCallInfo } from './wmsCommon';

const redisUtil = useRedisUtil();

export const routeMissionOrderMqttMessage = async (messageJson: MqttBranchInfoDataFromAcs) => {
  const mode = messageJson.mode;

  // 자동인 경우 미션 오더 처리
  // if (mode === 'auto') {
  //   const facilitySerial = messageJson.workOrderCode.substring(0, 4);

  //   if (!facilitySerial || facilitySerial.length < 4) {
  //     logging.ACTION_ERROR({
  //       filename: `call.ts - ackCancelCallInfo`,
  //       error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
  //       params: null,
  //       result: false,
  //     });
  //     return;
  //   }

  //   const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  //   const facilityLinckedList = facilityInfo?.linkedEqpIds || [];

  //   // EQP에 생긴 미션오더
  //   if (facilityLinckedList && facilityLinckedList.length > 0) {
  //     for (let i = 0, length = facilityLinckedList.length; i < length; i++) {
  //       // 모든 설비 데이터가
  //     }
  //     return {
  //       state: 'EQP',
  //       facilityInfo: facilityInfo,
  //     };
  //   }
  //   // WMS에 생긴 미션오더
  //   else {
  //     return {
  //       state: 'WMS',
  //       facilityInfo: facilityInfo,
  //     };
  //   }
  // }
  // // manual 인 경우
  // else {
  //   const facilitySerial = messageJson.fromFacilitySerial;

  //   if (!facilitySerial || facilitySerial.length < 4) {
  //     logging.ACTION_ERROR({
  //       filename: `call.ts - ackCancelCallInfo`,
  //       error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
  //       params: null,
  //       result: false,
  //     });
  //     return;
  //   }

  //   const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  //   return {
  //     state: 'EQP',
  //     facilityInfo: facilityInfo,
  //   };
  // }
  const facilitySerial = messageJson.fromFacilitySerial;

  if (!facilitySerial || facilitySerial.length < 4) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCancelCallInfo`,
      error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  return {
    state: 'EQP',
    facilityInfo: facilityInfo,
  };
};

// EQP 도킹 실행 시키는 함수 ( 파트장님이 원하는 위치로 옮기셔도 될 것 같습니다 ! )
export const setEqpMissionOrder = (messageJson: MqttBranchInfoDataFromAcs) => { };

// 데이터 보정 함수
export const fixEqpData = async () => {
  const plcConnectUtil = usePlcConnectUtil();
  const facilityList = (await redisUtil.hgetAllObject<FacilityAttributes>(RedisKeys.InfoFacilityById)) || [];

  for (let i = 0; i < facilityList.length; i++) {
    const facilityInfo = facilityList[i];
    const facilitySerial = facilityInfo.serial;

    if (!facilitySerial) {
      continue;
    }

    // Call_Cancel_Response 데이터 보정
    const callCancelRequestValue = (await plcConnectUtil.getTagValue(facilitySerial, 'Call_Cancel_Request')) as boolean;
    const callCancelResponseValue = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Cancel_Response'
    )) as boolean;

    if (callCancelRequestValue === false && callCancelResponseValue === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Cancel_Response', value: false }],
      });
    }

    // Call_Response_Multi_1 , Call_Response_Multi_2 데이터 보정
    const callRequestMulti1Value = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Request_Multi_1'
    )) as boolean;
    const callRequestMulti2Value = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Request_Multi_2'
    )) as boolean;
    const callResponseMulti1Value = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Response_Multi_1'
    )) as boolean;
    const callResponseMulti2Value = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Response_Multi_2'
    )) as boolean;

    // REQ 가 꺼져있는데 RES가 켜져있으면 RES를 끈다.
    // multi 1
    if (callRequestMulti1Value === false && callResponseMulti1Value === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Multi_1', value: false }],
      });
    }
    // multi 2
    if (callRequestMulti2Value === false && callResponseMulti2Value === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Multi_2', value: false }],
      });
    }

    // REQ가 켜져 있는데 RES가 꺼져 있으면 RES 를 킨다.
    // multi 1
    if (callRequestMulti1Value === true && callResponseMulti1Value === false) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Multi_1', value: true }],
      });
    }
    // multi 2
    if (callRequestMulti2Value === true && callResponseMulti2Value === false) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Multi_2', value: true }],
      });
    }
  }
};

// 작업 진행 현황 전달 함수 ( MCS - ACS 프론트 )
export const sendMqttWorkOrderList = async () => {
  const recentWorkOrderList =
    (await redisUtil.hgetAllObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial
    )) || [];

  for (let i = 0; i < recentWorkOrderList.length; i++) {
    const facilitySerial = recentWorkOrderList[i].facilitySerial;
    const workOrderCount = recentWorkOrderList[i].count;
    const workOrderList = recentWorkOrderList[i].workOrderList;

    const selectedCallIdList = [];
    if (workOrderCount > 0) {
      for (let j = 0; j < workOrderList.length; j++) {
        const callInfo = workOrderList[j];
        const callId = callInfo.callId;

        const selectedCallIdInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
          RedisKeys.InfoTrackingLogByCallId,
          callId
        );

        const callIdSubject = selectedCallIdInfo?.subject;

        selectedCallIdList.push({
          callId,
          subjcet: callIdSubject || 'BEFORE_CALL_REQUEST',
        });
      }
    }
    const recentWorkOrderInfo = {
      count: selectedCallIdList.length,
      callList: selectedCallIdList,
    };
    sendMqtt(`${MqttTopics.RecentWorkOrderList}/${facilitySerial}`, JSON.stringify(recentWorkOrderInfo));
  }
};

export const checkCallSignalResetWorkOrder = async (
  messageTopic: any,
  messageJson: any,
  facilityInfo: FacilityAttributes
) => {
  const facilitySerial = facilityInfo.serial;

  if (!facilitySerial) {
    logging.ACTION_ERROR({
      filename: `commonUtils.ts - checkCallSignalResetWorkOrder`,
      error: `Not allowed null (facility serial)`,
      params: null,
      result: false,
    });
    return;
  }
  // 트리거 설비
  // 트리거 설비가 관리하고 있는 모든 작업을 종료 시킨 후 새로운 작업을 진행한다.
  logging.MQTT_LOG({
    title: `mcs call-signal-reset - active call trigger ${facilitySerial}`,
    topic: messageTopic,
    message: messageJson,
  });
  if (!facilityInfo.system) {
    logging.ACTION_ERROR({
      filename: 'mqttUtil.ts - receiveMqtt',
      error: `mcs call-signal-reset - active call trigger ${facilitySerial} - system not found`,
      params: null,
      result: false,
    });
    return;
  }
  // SP IN and BS IN 라인 공급
  if (facilityInfo.system === 'WMS' && facilityInfo.type === 'in') {
    // WMS 설비
    // 설비 리셋 후 작업 생길 수 있도록 관련된 Redis 값 컨트롤
    // 설비 리셋 후 작업 생길 수 있도록 관련된 창고 통신 처리
    // 1. 진행 중인 work order list 조회
    const recentWorkOrderList = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial
    );
    // console.log('recentWorkOrderList', recentWorkOrderList);
    const recentWorkOrderCount = recentWorkOrderList?.count || 0;
    // 2. work order 상태 별 처리
    for (let i = 0; i < recentWorkOrderCount; i++) {
      const recentWorkOrderInfo = recentWorkOrderList?.workOrderList[i];

      const selectedCallId = recentWorkOrderInfo?.callId;

      if (selectedCallId) {
        if (recentWorkOrderInfo.state !== 'beforeRequest') {
          const trackingLogSubject = 'MISSION_CANCELED';
          const trackingLogDetail = 'MISSION_CANCELED';
          const trackingLogState = 'CANCELED';
          const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
            callId: selectedCallId,
            subject: trackingLogSubject,
            detail: trackingLogDetail,
            state: trackingLogState,
            startFacility: null,
            transferId: null,
            destFacility: null,
            assignedRobot: null,
            value: 'ACS',
            description: `Work reset by ACS - Call ID ${selectedCallId} cancelled on EQP ${facilitySerial}`,
            processState: 'CANCELED',
          };
          await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', facilitySerial);
        }

        // 2-1. before request
        // before request 관련 레디스 값 삭제
        // before request 데이터는 해당 창고에 CALL을 전송하지도 않고, CALL 판단 이전이기에 트래킹 로그도 기록하지 않음.

        // 2-2. before work order
        // Call Info를 요청한 상태인지 확인 후 Cancel_Call_Info 요청 후 삭제
        if (recentWorkOrderInfo.state === 'beforeWorkOrder') {
          // 1) CALL_INFO 조차 보내기 이전 상태 InfoCallRequestOnBySerial 에 담겨져 있는 상태
          const infoCallRequestOnBySerial = await redisUtil.hgetObject<EqpCallStats>(
            RedisKeys.InfoCallRequestOnBySerial,
            facilitySerial
          );

          if (infoCallRequestOnBySerial) {
            redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, facilitySerial);
          }
          // 2) CALL_INFO 를 보냈으나 ACK_CALL_INFO 를 받지 못 한 상태
          // 2-1) RemainingAckCommandBySubjectCmdId 에 머물러 있는 상태
          const RemainingAckCommandList = await redisUtil.hgetAllObject<RemainingAckCommand>(
            RedisKeys.RemainingAckCommandBySubjectCmdId
          );
          const remainingAckCommandInfo = RemainingAckCommandList?.find(
            (command) => command?.message?.body?.Call_ID === selectedCallId
          );

          if (remainingAckCommandInfo) {
            redisUtil.hdel(
              RedisKeys.RemainingAckCommandBySubjectCmdId,
              remainingAckCommandInfo?.subjectCmdId.toString()
            );

            if (remainingAckCommandInfo?.message?.body?.Cmd_ID) {
              redisUtil.hdel(
                RedisKeys.RecentCallInfoTaskByCmdId,
                remainingAckCommandInfo?.message?.body?.Cmd_ID.toString()
              );
            }
          }

          // 2-2) IntervalCommandForRetryBySubjectCmdId 로 빠진 상태
          const intervalCommandForRetryList = await redisUtil.hgetAllObject<RemainingAckCommand>(
            RedisKeys.IntervalCommandForRetryBySubjectCmdId
          );
          const intervalCommandForRetryInfo = intervalCommandForRetryList?.find(
            (command) => command?.message?.body?.Call_ID === selectedCallId
          );

          if (intervalCommandForRetryInfo) {
            redisUtil.hdel(
              RedisKeys.RemainingAckCommandBySubjectCmdId,
              intervalCommandForRetryInfo?.subjectCmdId.toString()
            );

            if (intervalCommandForRetryInfo?.message?.body?.Cmd_ID) {
              redisUtil.hdel(
                RedisKeys.RecentCallInfoTaskByCmdId,
                intervalCommandForRetryInfo?.message?.body?.Cmd_ID.toString()
              );
            }
          }

          // 3) ACK_CALL_INFO 까지 보낸 상태
          const ackInCallInfo = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
            RedisKeys.InfoAckInCallByCallId,
            selectedCallId
          );

          if (ackInCallInfo) {
            const newCancelCallInfoData: CancelCallInfo = {
              Call_ID: selectedCallId,
              Call_Quantity: Number(ackInCallInfo.Call_Quantity) || 1,
              systemName: `${process.env.MQTT_WMS_TOPIC || 'MW01'}`,
            };

            await checkCancelCallInfo(newCancelCallInfoData);

            redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, selectedCallId);
            redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, ackInCallInfo.Cmd_ID);
          }
        }
        // 2-3. work order 이후
        // work order 이후에는 있으면 안되지만 있으면 그냥 삭제
      }
    }

    const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
      facilitySerial: facilitySerial,
      facilityInfo: facilityInfo,
      count: 0,
      workOrderList: [],
    };

    redisUtil.hset(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial,
      JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
    );
  }
  // (facilityInfo.system === 'EQP' || ( facilityInfo.system === 'WMS && facility.type === 'out' ))
  // EQP 설비 || WMS 설비 중 OUT ( SP out , BS out 설비)
  else {
    // EQP 설비
    // 설비 리셋 후 [RecentWorkOrderListByFacilitySerial] workOrder 상태에 따라 작업 생길 수 있도록 관련된 Redis 값 컨트롤
    // 트래킹로그 반영
    const recentWorkOrderList = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial
    );
    // console.log('recentWorkOrderList', recentWorkOrderList);

    const recentWorkOrderCount = recentWorkOrderList?.count || 0;

    for (let i = 0; i < recentWorkOrderCount; i++) {
      const recentWorkOrderInfo = recentWorkOrderList?.workOrderList[i];

      const selectedCallId = recentWorkOrderInfo?.callId;

      if (selectedCallId) {
        const trackingLogSubject = 'MISSION_CANCELED';
        const trackingLogDetail = 'MISSION_CANCELED';
        const trackingLogState = 'CANCELED';
        const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
          callId: selectedCallId,
          subject: trackingLogSubject,
          detail: trackingLogDetail,
          state: trackingLogState,
          startFacility: null,
          transferId: null,
          destFacility: null,
          assignedRobot: null,
          value: 'ACS',
          description: `Work reset by ACS - Call ID ${selectedCallId} cancelled on EQP ${facilitySerial}`,
          processState: 'CANCELED',
        };
        await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', facilitySerial);

        // 2-2. before work order
        // Call Info를 요청한 상태인지 확인 후 Cancel_Call_Info 요청 후 삭제
        if (recentWorkOrderInfo.state === 'beforeWorkOrder') {
          // 1) CALL_INFO 조차 보내기 이전 상태 InfoCallRequestOnBySerial 에 담겨져 있는 상태 ( 설비 - 설비 데이터 매칭을 기다리고 있는 값 )
          const infoCallRequestOnBySerial = await redisUtil.hgetObject<EqpCallStats>(
            RedisKeys.InfoCallRequestOnBySerial,
            facilitySerial
          );

          if (infoCallRequestOnBySerial) {
            redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, facilitySerial);
          }
        }
      }
    }

    const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
      facilitySerial: facilitySerial,
      facilityInfo: facilityInfo,
      count: 0,
      workOrderList: [],
    };

    redisUtil.hset(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial,
      JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
    );

    // // 데이터 보정 CALL COUNT 관련
    // const callRequestValue = (await plcConnectUtil.getTagValue(
    //   facilitySerial,
    //   'Call_Request'
    // )) as boolean;
    // const callRequestMulti1Value = (await plcConnectUtil.getTagValue(
    //   facilitySerial,
    //   'Call_Request_Multi_1'
    // )) as boolean;
    // const callRequestMulti2Value = (await plcConnectUtil.getTagValue(
    //   facilitySerial,
    //   'Call_Request_Multi_2'
    // )) as boolean;

    // // 신규로 데이터 보정 후 등록
    // const oldCallCountByFacilitySerialInfo =
    //   await redisUtil.hgetObject<RecentCallCountByFacilitySerialAttributes>(
    //     RedisKeys.RecentCallCountByFacilitySerial,
    //     facilitySerial
    //   );
    // if (oldCallCountByFacilitySerialInfo) {
    //   const recentCallCountByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
    //     targetTagInfo: oldCallCountByFacilitySerialInfo.targetTagInfo,
    //     facilitySerial: facilitySerial,
    //     targetKey: oldCallCountByFacilitySerialInfo.targetKey,
    //     callRequest: callRequestValue,
    //     callRequestMulti1: callRequestMulti1Value,
    //     callRequestMulti2: callRequestMulti2Value,
    //   };
    //   redisUtil.hset(
    //     RedisKeys.RecentCallCountByFacilitySerial,
    //     facilitySerial,
    //     JSON.stringify(recentCallCountByFacilitySerialParams)
    //   );
    // }
  }
};
