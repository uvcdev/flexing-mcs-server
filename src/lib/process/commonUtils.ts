import { TrackingLogRedisUpdateParams, TrackingLogSelectInfoByCallIdParams } from './../../models/common/trackingLog';
import { RecentWorkOrderListByFacilitySerialAttributes } from './../../models/operation/workOrder';
import { FacilityAttributes, FacilityUpdateParams } from '../../models/operation/facility';
import { makeCallType, useKepServerUtil } from '../kepServerUtil';
import { logging, makeLogFormat, RequestLog } from '../logging';
import opcuaUtil from '../opcuaUtil';
import { usePlcConnectUtil } from '../plcConnectUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { MqttBranchInfoDataFromAcs } from './wmsBranch';
import { TrackingLogRedisAttributes } from '../../models/common/trackingLog';
import { MqttTopics, sendMqttRetain } from '../mqttUtil';
import { editTrackingLogRedis } from './trackingLog';
import { EqpCallStats, useCallTypeUtil } from '../callTypeUtil';
import { RemainingAckCommand } from './wmsAck';
import { InfoAckInCallByCallIdBody } from '../wms/mqtt/call';
import { AbortedCommandForRetryInfo, CancelCallInfo, checkCancelCallInfo, RecentCallInfo } from './wmsCommon';
import { service as facilityService } from '../../service/operation/facilityService';
import { generateUUIDNode } from '../hashUtil';
import { useSmartConnectorUtils } from '../smartConnectorUtils';

const redisUtil = useRedisUtil();
const plcConnectUtil = usePlcConnectUtil();
const smartConnectorUtils = useSmartConnectorUtils();

/** RecentWorkOrderList MQTT: 설비별 직전 전송 페이로드 (변경 시에만 재전송) */
const lastRecentWorkOrderListPayloadByFacilitySerial = new Map<string, string>();

/** Redis 목록에서 설비가 빠졌을 때 retain 스냅샷을 비우기 위한 페이로드 (일반 빈 목록과 동일 문자열) */
const EMPTY_RECENT_WORK_ORDER_LIST_JSON = JSON.stringify({ count: 0, callList: [] });
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
export const setEqpMissionOrder = (messageJson: MqttBranchInfoDataFromAcs) => {};

// 데이터 보정 함수
export const fixEqpData = async () => {
  const plcConnectUtil = usePlcConnectUtil();
  // const facilityList = (await redisUtil.hgetAllObject<FacilityAttributes>(RedisKeys.InfoFacilityById)) || [];
  const facilityList = await redisUtil.keys(`${RedisKeys.PlcRealtimeData}:*`);

  for (let i = 0; i < facilityList.length; i++) {
    const facilitySerial = facilityList[i].split(':')[1];
    if (!facilitySerial) {
      continue;
    }

    // Call_Cancel_Response 데이터 보정
    const callCancelRequestValue =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Cancel_Request')) === 'true'
        ? true
        : false;
    const callCancelResponseValue =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Cancel_Response')) === 'true'
        ? true
        : false;
    if (callCancelRequestValue === false && callCancelResponseValue === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Cancel_Response', value: false }],
      });
    }

    // Call_Response_Multi_1 , Call_Response_Multi_2 데이터 보정
    const callRequestMulti1Value =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Request_Multi_1')) === 'true'
        ? true
        : false;
    const callRequestMulti2Value =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Request_Multi_2')) === 'true'
        ? true
        : false;
    const callResponseMulti1Value =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Response_Multi_1')) === 'true'
        ? true
        : false;
    const callResponseMulti2Value =
      (await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(facilitySerial, 'Call_Response_Multi_2')) === 'true'
        ? true
        : false;

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

  const seenFacilitySerials = new Set<string>();

  for (let i = 0; i < recentWorkOrderList.length; i++) {
    const facilitySerial = recentWorkOrderList[i].facilitySerial;
    const workOrderCount = recentWorkOrderList[i].count;
    const workOrderList = recentWorkOrderList[i].workOrderList;

    seenFacilitySerials.add(facilitySerial);

    const selectedCallIdList: { callId: string; detail: string }[] = [];
    if (workOrderCount > 0) {
      for (let j = 0; j < workOrderList.length; j++) {
        const callInfo = workOrderList[j];
        const callId = callInfo.callId;

        const selectedCallIdInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
          RedisKeys.InfoTrackingLogByCallId,
          callId
        );

        const callIdDetail = selectedCallIdInfo?.detail;

        selectedCallIdList.push({
          callId,
          detail: callIdDetail || 'BEFORE_CALL_REQUEST',
        });
      }
    }
    selectedCallIdList.sort((a, b) => (a.callId < b.callId ? -1 : a.callId > b.callId ? 1 : 0));

    const recentWorkOrderInfo = {
      count: selectedCallIdList.length,
      callList: selectedCallIdList,
    };
    const payload = JSON.stringify(recentWorkOrderInfo);
    if (lastRecentWorkOrderListPayloadByFacilitySerial.get(facilitySerial) === payload) {
      continue;
    }
    lastRecentWorkOrderListPayloadByFacilitySerial.set(facilitySerial, payload);
    sendMqttRetain(`${MqttTopics.RecentWorkOrderList}/${facilitySerial}`, payload);
  }

  const staleFacilitySerials = [...lastRecentWorkOrderListPayloadByFacilitySerial.keys()].filter(
    (serial) => !seenFacilitySerials.has(serial)
  );
  for (const cachedSerial of staleFacilitySerials) {
    // Redis 해시에서 설비 키가 사라진 경우: retain 토픽에 옛 스냅샷이 남지 않도록 빈 목록으로 갱신 후 캐시 제거
    sendMqttRetain(`${MqttTopics.RecentWorkOrderList}/${cachedSerial}`, EMPTY_RECENT_WORK_ORDER_LIST_JSON);
    lastRecentWorkOrderListPayloadByFacilitySerial.delete(cachedSerial);
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
  // 임시 주석
  // if (facilityInfo.system === 'WMS' && facilityInfo.type === 'in') {
  //   // WMS 설비
  //   // 설비 리셋 후 작업 생길 수 있도록 관련된 Redis 값 컨트롤
  //   // 설비 리셋 후 작업 생길 수 있도록 관련된 창고 통신 처리
  //   // 1. 진행 중인 work order list 조회
  //   const recentWorkOrderList = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
  //     RedisKeys.RecentWorkOrderListByFacilitySerial,
  //     facilitySerial
  //   );
  //   const removableCmdIds: string[] = [];
  //   // console.log('recentWorkOrderList', recentWorkOrderList);
  //   const recentWorkOrderCount = recentWorkOrderList?.count || 0;
  //   // 2. work order 상태 별 처리
  //   for (let i = 0; i < recentWorkOrderCount; i++) {
  //     const recentWorkOrderInfo = recentWorkOrderList?.workOrderList[i];

  //     const selectedCallId = recentWorkOrderInfo?.callId;

  //     if (selectedCallId) {
  //       if (recentWorkOrderInfo.state !== 'beforeRequest') {
  //         const trackingLogSubject = 'MISSION_CANCELED';
  //         const trackingLogDetail = 'MISSION_CANCELED';
  //         const trackingLogState = 'CANCELED';
  //         const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
  //           callId: selectedCallId,
  //           subject: trackingLogSubject,
  //           detail: trackingLogDetail,
  //           state: trackingLogState,
  //           startFacility: null,
  //           transferId: null,
  //           destFacility: null,
  //           assignedRobot: null,
  //           value: 'ACS',
  //           description: `Work reset by ACS - Call ID ${selectedCallId} cancelled on EQP ${facilitySerial}`,
  //           processState: 'CANCELED',
  //         };
  //         await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', facilitySerial);
  //       }

  //       // 2-1. before request
  //       // before request 관련 레디스 값 삭제
  //       // before request 데이터는 해당 창고에 CALL을 전송하지도 않고, CALL 판단 이전이기에 트래킹 로그도 기록하지 않음.

  //       // 2-2. before work order
  //       // Call Info를 요청한 상태인지 확인 후 Cancel_Call_Info 요청 후 삭제
  //       // if (recentWorkOrderInfo.state === 'beforeWorkOrder') {
  //       //   // 1) CALL_INFO 조차 보내기 이전 상태 InfoCallRequestOnBySerial 에 담겨져 있는 상태
  //       //   const infoCallRequestOnBySerial = await redisUtil.hgetObject<EqpCallStats>(
  //       //     RedisKeys.InfoCallRequestOnBySerial,
  //       //     facilitySerial
  //       //   );

  //       //   if (infoCallRequestOnBySerial) {
  //       //     redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, facilitySerial);
  //       //   }
  //       //   // 2) CALL_INFO 를 보냈으나 ACK_CALL_INFO 를 받지 못 한 상태
  //       //   // 2-1) RemainingAckCommandBySubjectCmdId 에 머물러 있는 상태
  //       //   const RemainingAckCommandList = await redisUtil.hgetAllObject<RemainingAckCommand>(
  //       //     RedisKeys.RemainingAckCommandBySubjectCmdId
  //       //   );
  //       //   const remainingAckCommandInfo = RemainingAckCommandList?.find(
  //       //     (command) => command?.message?.body?.Call_ID === selectedCallId
  //       //   );

  //       //   if (remainingAckCommandInfo) {
  //       //     redisUtil.hdel(
  //       //       RedisKeys.RemainingAckCommandBySubjectCmdId,
  //       //       remainingAckCommandInfo?.subjectCmdId.toString()
  //       //     );

  //       //     if (remainingAckCommandInfo?.message?.body?.Cmd_ID) {
  //       //       redisUtil.hdel(
  //       //         RedisKeys.RecentCallInfoTaskByCmdId,
  //       //         remainingAckCommandInfo?.message?.body?.Cmd_ID.toString()
  //       //       );
  //       //     }
  //       //   }

  //       //   // 2-2) IntervalCommandForRetryBySubjectCmdId 로 빠진 상태
  //       //   const intervalCommandForRetryList = await redisUtil.hgetAllObject<RemainingAckCommand>(
  //       //     RedisKeys.IntervalCommandForRetryBySubjectCmdId
  //       //   );
  //       //   const intervalCommandForRetryInfo = intervalCommandForRetryList?.find(
  //       //     (command) => command?.message?.body?.Call_ID === selectedCallId
  //       //   );

  //       //   if (intervalCommandForRetryInfo) {
  //       //     redisUtil.hdel(
  //       //       RedisKeys.RemainingAckCommandBySubjectCmdId,
  //       //       intervalCommandForRetryInfo?.subjectCmdId.toString()
  //       //     );

  //       //     if (intervalCommandForRetryInfo?.message?.body?.Cmd_ID) {
  //       //       redisUtil.hdel(
  //       //         RedisKeys.RecentCallInfoTaskByCmdId,
  //       //         intervalCommandForRetryInfo?.message?.body?.Cmd_ID.toString()
  //       //       );
  //       //     }
  //       //   }

  //       //   // 3) ACK_CALL_INFO 까지 보낸 상태
  //       //   const ackInCallInfo = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
  //       //     RedisKeys.InfoAckInCallByCallId,
  //       //     selectedCallId
  //       //   );

  //       //   if (ackInCallInfo) {
  //       //     const newCancelCallInfoData: CancelCallInfo = {
  //       //       Call_ID: selectedCallId,
  //       //       Call_Quantity: Number(ackInCallInfo.Call_Quantity) || 1,
  //       //       systemName: `${process.env.MQTT_WMS_TOPIC || 'MW01'}`,
  //       //     };

  //       //     await checkCancelCallInfo(newCancelCallInfoData);

  //       //     redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, selectedCallId);
  //       //     redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, ackInCallInfo.Cmd_ID);
  //       //   }
  //       // }
  //       // claude 코드
  //       if (recentWorkOrderInfo.state === 'beforeWorkOrder') {
  //         // 1) CALL_INFO 보내기 이전
  //         const infoCallRequestOnBySerial = await redisUtil.hgetObject<EqpCallStats>(
  //           RedisKeys.InfoCallRequestOnBySerial,
  //           facilitySerial
  //         );
  //         if (infoCallRequestOnBySerial) {
  //           redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, facilitySerial);
  //         }

  //         // 2) RemainingAck 상태
  //         const remainingCallInfoList =
  //           (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId)) || [];
  //         const facilityRemainingCallInfoList = remainingCallInfoList.filter(
  //           (remainingCallInfo) => remainingCallInfo?.message?.body?.Caller === facilitySerial
  //         );

  //         if (facilityRemainingCallInfoList.length > 0) {
  //           for (let i = 0, length = facilityRemainingCallInfoList.length; i < length; i++) {
  //             const facilityRemainingCallInfo = facilityRemainingCallInfoList[i];
  //             const cmdId = facilityRemainingCallInfo?.message?.body?.Cmd_ID || '';
  //             const subjectCmdId = facilityRemainingCallInfo.subjectCmdId;

  //             redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId.toString());
  //             removableCmdIds.push(cmdId);
  //           }
  //         }

  //         // 3) Interval 상태
  //         const intervalCallInfoList =
  //           (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.IntervalCommandForRetryBySubjectCmdId)) || [];
  //         const facilityIntervalCallInfoList = intervalCallInfoList.filter(
  //           (intervalCallInfo) => intervalCallInfo?.message?.body?.Caller === facilitySerial
  //         );

  //         if (facilityIntervalCallInfoList.length > 0) {
  //           for (let i = 0, length = facilityIntervalCallInfoList.length; i < length; i++) {
  //             const facilityIntervalCallInfo = facilityIntervalCallInfoList[i];
  //             const cmdId = facilityIntervalCallInfo?.message?.body?.Cmd_ID || '';
  //             const subjectCmdId = facilityIntervalCallInfo.subjectCmdId;

  //             redisUtil.hdel(RedisKeys.IntervalCommandForRetryBySubjectCmdId, subjectCmdId.toString());
  //             removableCmdIds.push(cmdId);
  //           }
  //         }

  //         // 4) Abort 상태
  //         const abortCallInfoList =
  //           (await redisUtil.hgetAllObject<AbortedCommandForRetryInfo>(
  //             RedisKeys.AbortedCommandForRetryBySubjectCmdId
  //           )) || [];
  //         const facilityAbortCallInfoList = abortCallInfoList.filter(
  //           (abortCallInfo) => abortCallInfo?.message?.body?.Caller === facilitySerial
  //         );

  //         if (facilityAbortCallInfoList.length > 0) {
  //           for (let i = 0, length = facilityAbortCallInfoList.length; i < length; i++) {
  //             const facilityAbortCallInfo = facilityAbortCallInfoList[i];
  //             const cmdId = facilityAbortCallInfo?.message?.body?.Cmd_ID || '';
  //             const subjectCmdId = facilityAbortCallInfo.subjectCmdId;

  //             redisUtil.hdel(RedisKeys.AbortedCommandForRetryBySubjectCmdId, subjectCmdId.toString());
  //             removableCmdIds.push(cmdId);
  //           }
  //         }

  //         // 5) NG 상태 - removableCmdIds에 없는 것만
  //         const recentCallInfoList =
  //           (await redisUtil.hgetAllObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId)) || [];
  //         const facilityNgCallInfoList = recentCallInfoList.filter(
  //           (callInfo) => callInfo.caller === facilitySerial && !removableCmdIds.includes(callInfo.cmdId)
  //         );

  //         for (const ngCallInfo of facilityNgCallInfoList) {
  //           removableCmdIds.push(ngCallInfo.cmdId);
  //         }

  //         // 6) ACK_CALL_INFO 받고 포트 배정 대기 중인 CALL_ID
  //         const infoAckInCallByCallIdList = await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(
  //           RedisKeys.InfoAckInCallByCallId
  //         );
  //         const facilityInfoAckInCallList =
  //           infoAckInCallByCallIdList?.filter((infoAckInCall) => infoAckInCall?.Caller === facilitySerial) || [];

  //         if (facilityInfoAckInCallList.length > 0) {
  //           for (let i = 0, length = facilityInfoAckInCallList.length; i < length; i++) {
  //             const facilityInfoAckInCall = facilityInfoAckInCallList[i];
  //             const ackCallId = facilityInfoAckInCall.CALL_ID;

  //             const newCancelCallInfoData: CancelCallInfo = {
  //               Call_ID: ackCallId,
  //               Call_Quantity: Number(facilityInfoAckInCall.Call_Quantity) || 1,
  //               systemName: `${process.env.MQTT_WMS_TOPIC || 'MW01'}`,
  //             };

  //             if (!newCancelCallInfoData.Cmd_ID || newCancelCallInfoData.Cmd_ID === '') {
  //               newCancelCallInfoData.Cmd_ID = generateUUIDNode();
  //             }

  //             await checkCancelCallInfo(newCancelCallInfoData);
  //             // InfoAckInCallByCallId 삭제는 ACK_CANCEL_CALL_INFO 단계에서 처리
  //           }
  //         }
  //       }

  //       // 2-3. work order 이후
  //       // work order 이후에는 있으면 안되지만 있으면 그냥 삭제
  //     }
  //   }

  //   const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
  //     facilitySerial: facilitySerial,
  //     facilityInfo: facilityInfo,
  //     count: 0,
  //     workOrderList: [],
  //   };

  //   redisUtil.hset(
  //     RedisKeys.RecentWorkOrderListByFacilitySerial,
  //     facilitySerial,
  //     JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
  //   );
  // }
  if (facilityInfo.system === 'WMS' && facilityInfo.type === 'in') {
    // WMS 설비
    // 설비 리셋 후 작업 생길 수 있도록 관련된 Redis 값 컨트롤
    // 설비 리셋 후 작업 생길 수 있도록 관련된 창고 통신 처리
    // 1. 진행 중인 work order list 조회
    const recentWorkOrderList = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial
    );
    const removableCmdIds: string[] = [];
    const recentWorkOrderCount = recentWorkOrderList?.count || 0;

    // 2. work order 상태 별 처리 - trackingLog만
    for (let i = 0; i < recentWorkOrderCount; i++) {
      const recentWorkOrderInfo = recentWorkOrderList?.workOrderList[i];
      const selectedCallId = recentWorkOrderInfo?.callId;

      if (selectedCallId && recentWorkOrderInfo.state !== 'beforeRequest') {
        const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
          callId: selectedCallId,
          subject: 'MISSION_CANCELED',
          detail: 'MISSION_CANCELED',
          state: 'CANCELED',
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
    }

    // 3. facilitySerial 기준 Redis 정리

    // 3-1. InfoCallRequestOnBySerial 삭제
    const infoCallRequestOnBySerial = await redisUtil.hgetObject<EqpCallStats>(
      RedisKeys.InfoCallRequestOnBySerial,
      facilitySerial
    );
    if (infoCallRequestOnBySerial) {
      redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, facilitySerial);
    }

    // 3-2. RemainingAck 상태
    const remainingCallInfoList =
      (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId)) || [];
    const facilityRemainingCallInfoList = remainingCallInfoList.filter(
      (remainingCallInfo) => remainingCallInfo?.message?.body?.Caller === facilitySerial
    );

    for (const facilityRemainingCallInfo of facilityRemainingCallInfoList) {
      const cmdId = facilityRemainingCallInfo?.message?.body?.Cmd_ID || '';
      const subjectCmdId = facilityRemainingCallInfo.subjectCmdId;
      redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId.toString());
      removableCmdIds.push(cmdId);
    }

    // 3-3. Interval 상태
    const intervalCallInfoList =
      (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.IntervalCommandForRetryBySubjectCmdId)) || [];
    const facilityIntervalCallInfoList = intervalCallInfoList.filter(
      (intervalCallInfo) => intervalCallInfo?.message?.body?.Caller === facilitySerial
    );

    for (const facilityIntervalCallInfo of facilityIntervalCallInfoList) {
      const cmdId = facilityIntervalCallInfo?.message?.body?.Cmd_ID || '';
      const subjectCmdId = facilityIntervalCallInfo.subjectCmdId;
      redisUtil.hdel(RedisKeys.IntervalCommandForRetryBySubjectCmdId, subjectCmdId.toString());
      removableCmdIds.push(cmdId);
    }

    // 3-4. Abort 상태
    const abortCallInfoList =
      (await redisUtil.hgetAllObject<AbortedCommandForRetryInfo>(RedisKeys.AbortedCommandForRetryBySubjectCmdId)) || [];
    const facilityAbortCallInfoList = abortCallInfoList.filter(
      (abortCallInfo) => abortCallInfo?.message?.body?.Caller === facilitySerial
    );

    for (const facilityAbortCallInfo of facilityAbortCallInfoList) {
      const cmdId = facilityAbortCallInfo?.message?.body?.Cmd_ID || '';
      const subjectCmdId = facilityAbortCallInfo.subjectCmdId;
      redisUtil.hdel(RedisKeys.AbortedCommandForRetryBySubjectCmdId, subjectCmdId.toString());
      removableCmdIds.push(cmdId);
    }

    // 3-5. NG 상태 - removableCmdIds에 없는 것만
    const recentCallInfoList =
      (await redisUtil.hgetAllObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId)) || [];
    const facilityNgCallInfoList = recentCallInfoList.filter(
      (callInfo) => callInfo.caller === facilitySerial && !removableCmdIds.includes(callInfo.cmdId)
    );

    for (const ngCallInfo of facilityNgCallInfoList) {
      removableCmdIds.push(ngCallInfo.cmdId);
    }

    // 3-6. ACK_CALL_INFO 받고 포트 배정 대기 중인 CALL_ID
    const infoAckInCallByCallIdList = await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(
      RedisKeys.InfoAckInCallByCallId
    );
    const facilityInfoAckInCallList =
      infoAckInCallByCallIdList?.filter((infoAckInCall) => infoAckInCall?.Caller === facilitySerial) || [];

    for (const facilityInfoAckInCall of facilityInfoAckInCallList) {
      const ackCallId = facilityInfoAckInCall.CALL_ID;

      const newCancelCallInfoData: CancelCallInfo = {
        Call_ID: ackCallId,
        Call_Quantity: Number(facilityInfoAckInCall.Call_Quantity) || 1,
        systemName: `${process.env.MQTT_WMS_TOPIC || 'MW01'}`,
      };

      if (!newCancelCallInfoData.Cmd_ID || newCancelCallInfoData.Cmd_ID === '') {
        newCancelCallInfoData.Cmd_ID = generateUUIDNode();
      }

      await checkCancelCallInfo(newCancelCallInfoData);
      // InfoAckInCallByCallId 삭제는 ACK_CANCEL_CALL_INFO 단계에서 처리
    }

    // 4. RecentCallInfoTaskByCmdId 일괄 삭제
    const setRemovableCmdIds = new Set(removableCmdIds);
    for (const cmdId of setRemovableCmdIds) {
      redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
    }

    // 5. RecentWorkOrderListByFacilitySerial 초기화
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

export const checkSpBsWorkType = async (messageJson: any) => {
  const workType: 'EQP' | 'WMS' | '' = messageJson.type || '';

  if (workType === '') {
    // 에러 처리 추가 필요
    return;
  }

  const facilityList = await redisUtil.hgetAllObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial);

  const spInPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('SP') && facility.type === 'in') || [];
  const spOutPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('SP') && facility.type === 'out') ||
    [];
  const bsInPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('BS') && facility.type === 'in') || [];
  const bsOutPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('BS') && facility.type === 'out') ||
    [];

  const wsInPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('WS') && facility.type === 'in') || [];
  const wsOutPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('WS') && facility.type === 'out') ||
    [];
  const wcInPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('WC') && facility.type === 'in') || [];
  const wcOutPortFacilityList =
    facilityList?.filter((facility) => facility.serial?.toUpperCase().startsWith('WC') && facility.type === 'out') ||
    [];

  if (workType === 'WMS') {
    // SP
    for (let i = 0, length = spInPortFacilityList.length; i < length; i++) {
      const spInfacilityInfo = spInPortFacilityList[i];

      if (!spInfacilityInfo) {
        continue;
      }

      const wcOutFacilityIds = wcOutPortFacilityList.map((facility) => facility.id);

      const facilityUpdateParams: FacilityUpdateParams = {
        id: spInfacilityInfo.id,
        system: 'WMS',
        isMissionOrderCapable: false,
        linkedEqpIds: [],
        cancelType: 'EQP_TO_WMS',
        isActiveCallTrigger: true,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }

    for (let i = 0, length = spOutPortFacilityList.length; i < length; i++) {
      const spOutfacilityInfo = spOutPortFacilityList[i];

      if (!spOutfacilityInfo) {
        continue;
      }
      const wsInFacilityIds = wsInPortFacilityList.map((facility) => facility.id);
      const facilityUpdateParams: FacilityUpdateParams = {
        id: spOutfacilityInfo.id,
        system: 'WMS',
        linkedEqpIds: wsInFacilityIds,
        cancelType: 'EQP_TO_EQP_NO_MISSION',
        isActiveCallTrigger: true,
        isMissionOrderCapable: true,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }

    // BS
    for (let i = 0, length = bsInPortFacilityList.length; i < length; i++) {
      const bsInfacilityInfo = bsInPortFacilityList[i];

      if (!bsInfacilityInfo) {
        continue;
      }
      const wsOutFacilityIds = wsOutPortFacilityList.map((facility) => facility.id);
      const facilityUpdateParams: FacilityUpdateParams = {
        id: bsInfacilityInfo.id,
        system: 'WMS',
        linkedEqpIds: [],
        cancelType: 'EQP_TO_WMS',
        isActiveCallTrigger: true,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }

    for (let i = 0, length = bsOutPortFacilityList.length; i < length; i++) {
      const bsOutfacilityInfo = bsOutPortFacilityList[i];

      if (!bsOutfacilityInfo) {
        continue;
      }

      const wcInFacilityIds = wcInPortFacilityList.map((facility) => facility.id);
      const facilityUpdateParams: FacilityUpdateParams = {
        id: bsOutfacilityInfo.id,
        system: 'WMS',
        linkedEqpIds: wcInFacilityIds,
        cancelType: 'EQP_TO_EQP_NO_MISSION',
        isActiveCallTrigger: true,
        isMissionOrderCapable: true,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }
  }
  // workType === 'EQP'
  else {
    // SP - BS
    // 진행 중인 작업 SP는 삭제
    // 창고 관련 Call_Info 정보랑 Remain,Abort 정보를 삭제 해줘야함

    // WMS 관련 redis 전부 삭제
    redisUtil.del(RedisKeys.ReceivedAckCommandBySubjectCmdId);
    redisUtil.del(RedisKeys.RemainingAckCommandBySubjectCmdId);
    redisUtil.del(RedisKeys.IntervalCommandForRetryBySubjectCmdId);
    redisUtil.del(RedisKeys.AbortedCommandForRetryBySubjectCmdId);

    // 진행 중인 CALL_INFO 정보 모두 CANCEL
    const infoCallInfoList =
      (await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(RedisKeys.InfoAckInCallByCallId)) || [];

    for (let i = 0, length = infoCallInfoList.length; i < length; i++) {
      const infoCallInfo = infoCallInfoList[i];
      const selectedCallId = infoCallInfo.CALL_ID;

      const newCancelCallInfoData: CancelCallInfo = {
        Call_ID: selectedCallId,
        Call_Quantity: Number(infoCallInfo.Call_Quantity) || 1,
        systemName: `${process.env.MQTT_WMS_TOPIC || 'MW01'}`,
      };

      if (!newCancelCallInfoData.Cmd_ID || newCancelCallInfoData.Cmd_ID === '') {
        newCancelCallInfoData.Cmd_ID = generateUUIDNode();
      }

      await checkCancelCallInfo(newCancelCallInfoData);

      // 진행 중인 CALL 정보는 해당 단계에서 지우지 않고 ACK_CANCEL_CALL_INFO 단계에서 처리한다.

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
          value: null,
          description: `Call ID ${selectedCallId} cancelled due to mode change from Warehouse to Equipment`,
          processState: 'CANCELED',
        };
        await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', 'ACS');
      }
    }

    // SP
    for (let i = 0, length = spInPortFacilityList.length; i < length; i++) {
      const spInfacilityInfo = spInPortFacilityList[i];

      if (!spInfacilityInfo) {
        continue;
      }

      const facilityUpdateParams: FacilityUpdateParams = {
        id: spInfacilityInfo.id,
        system: 'EQP',
        linkedEqpIds: [],
        cancelType: 'NON_CANCELLABLE',
        isActiveCallTrigger: false,
        isMissionOrderCapable: false,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));

      // sp in 설비 콜 관련 정보 삭제
      const facilitySerial = spInfacilityInfo.serial || '';

      const facilityRecentWorkOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

      if (facilityRecentWorkOrderListInfo) {
        const resetFacilityRecentWorkOrderListInfo = {
          ...facilityRecentWorkOrderListInfo,
          workOrderList: [],
          count: 0,
        };

        redisUtil.hset(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          facilitySerial,
          JSON.stringify(resetFacilityRecentWorkOrderListInfo)
        );
      }
    }

    for (let i = 0, length = spOutPortFacilityList.length; i < length; i++) {
      const spOutfacilityInfo = spOutPortFacilityList[i];

      if (!spOutfacilityInfo) {
        continue;
      }

      const facilityUpdateParams: FacilityUpdateParams = {
        id: spOutfacilityInfo.id,
        system: 'EQP',
        linkedEqpIds: [],
        cancelType: 'NON_CANCELLABLE',
        isActiveCallTrigger: false,
        isMissionOrderCapable: false,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));

      // sp in 설비 콜 관련 정보 삭제
      const facilitySerial = spOutfacilityInfo.serial || '';

      const facilityRecentWorkOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

      if (facilityRecentWorkOrderListInfo) {
        const resetFacilityRecentWorkOrderListInfo = {
          ...facilityRecentWorkOrderListInfo,
          workOrderList: [],
          count: 0,
        };
        redisUtil.hset(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          facilitySerial,
          JSON.stringify(resetFacilityRecentWorkOrderListInfo)
        );
      }
    }

    // BS
    for (let i = 0, length = bsInPortFacilityList.length; i < length; i++) {
      const bsInfacilityInfo = bsInPortFacilityList[i];

      if (!bsInfacilityInfo) {
        continue;
      }
      const spOutFacilityIds = spOutPortFacilityList.map((facility) => facility.id);

      const facilityUpdateParams: FacilityUpdateParams = {
        id: bsInfacilityInfo.id,
        system: 'EQP',
        linkedEqpIds: spOutFacilityIds,
        cancelType: 'NON_CANCELLABLE',
        isActiveCallTrigger: true,
        isMissionOrderCapable: false,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }

    for (let i = 0, length = bsOutPortFacilityList.length; i < length; i++) {
      const bsOutfacilityInfo = bsOutPortFacilityList[i];

      if (!bsOutfacilityInfo) {
        continue;
      }

      const spInFacilityIds = spInPortFacilityList.map((facility) => facility.id);

      const facilityUpdateParams: FacilityUpdateParams = {
        id: bsOutfacilityInfo.id,
        system: 'EQP',
        linkedEqpIds: spInFacilityIds,
        cancelType: 'NON_CANCELLABLE',
        isActiveCallTrigger: true,
        isMissionOrderCapable: false,
      };
      facilityService.edit(facilityUpdateParams, makeLogFormat({} as RequestLog));
    }
  }
};

export const acsWorkOrderCancel = async (messageJson: any) => {
  const plcConnectUtil = usePlcConnectUtil();
  const workOrderMode = messageJson?.mode;
  const canceledWorkOrderCallId = messageJson?.code || '';
  const fromFacilitySerial = messageJson?.FromFacility?.serial || '';
  const toFacilitySerial = messageJson?.ToFacility?.serial || '';

  const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
    RedisKeys.InfoFacilityById,
    fromFacilitySerial
  );
  let alwaysOnFacility = fromFacilitySerial;
  let triggerFacility = toFacilitySerial;

  if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
    alwaysOnFacility = toFacilitySerial;
    triggerFacility = fromFacilitySerial;
  }

  const recentWorkOrderListByFacilitySerial = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
    RedisKeys.RecentWorkOrderListByFacilitySerial,
    triggerFacility
  );

  const workOrderList = recentWorkOrderListByFacilitySerial?.workOrderList || [];

  const selectedWorkOrderInfo = workOrderList.find((workOrderInfo) => workOrderInfo.callId === canceledWorkOrderCallId);
  const selectedWorkOrderInfoState = selectedWorkOrderInfo?.state;

  if (selectedWorkOrderInfoState !== 'toWorkOrder' && selectedWorkOrderInfoState !== 'missionWorkOrder') {
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
};

export const fixMultiCallFacilityStatus = async (facilitySerial: string) => {
  const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  if (!facilityInfo) {
    logging.ACTION_ERROR({
      filename: `commonUtils.ts - fixMultiCallFacilityStatus`,
      error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  // 트리거 설비 중에 in 설비만 사용하는 함수
  if (facilityInfo.isActiveCallTrigger === false) {
    return;
  }
  if (facilityInfo.type === 'out') {
    return;
  }

  const recentWorkOrderListByFacilitySerial = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
    RedisKeys.RecentWorkOrderListByFacilitySerial,
    facilitySerial
  );
  const workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;
  const workOrderList = recentWorkOrderListByFacilitySerial?.workOrderList || [];

  const beforeAssignedAmrWorkOrderList = workOrderList.filter((workOrder) => workOrder.state === 'workOrder');
  const fromWorkOrderList = workOrderList.filter((workOrder) => workOrder.state === 'fromWorkOrder');
  const toWorkOrderList = workOrderList.filter((workOrder) => workOrder.state === 'toWorkOrder');

  const callResponseStatusTagNames = ['Call_Count', 'Call_Response', 'Call_Robot_Assigned', 'Call_Response_Count'];

  if (toWorkOrderList.length > 0) {
    const callType = await makeCallType(facilitySerial);
    const callResponseStatusByTag = await plcConnectUtil.batchGetTagValue(facilitySerial, callResponseStatusTagNames);
    const callCountValue = callResponseStatusByTag['Call_Count'] as number;
    const callResponseValue = callResponseStatusByTag['Call_Response'] as boolean;
    const callRobotAssignedValue = callResponseStatusByTag['Call_Robot_Assigned'] as boolean;
    const callResponseCountValue = callResponseStatusByTag['Call_Response_Count'] as number;

    if (callResponseValue === false) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response', value: true }],
      });
    }
    if (callRobotAssignedValue === false) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Robot_Assigned', value: true }],
      });
    }
    if (callResponseCountValue === 0) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Count', value: callCountValue.toString() }],
      });
    }
    if (callType === '') {
      await useCallTypeUtil().callTypeResponse(facilitySerial);
    }

    // await plcConnectUtil.writeTagValue({
    //   targetFacility: facilitySerial,
    //   tagInfo: [
    //     { tagName: 'Call_Response', value: true },
    //     { tagName: 'Call_Robot_Assigned', value: true },
    //     { tagName: 'Call_Response_Count', value: callCountValue.toString() },
    //   ],
    // });
  }

  if (toWorkOrderList.length === 0 && (beforeAssignedAmrWorkOrderList.length > 0 || fromWorkOrderList.length > 0)) {
    const callType = await makeCallType(facilitySerial);
    const callResponseStatusByTag = await plcConnectUtil.batchGetTagValue(facilitySerial, callResponseStatusTagNames);
    const callCountValue = callResponseStatusByTag['Call_Count'] as number;
    const callResponseValue = callResponseStatusByTag['Call_Response'] as boolean;
    const callRobotAssignedValue = callResponseStatusByTag['Call_Robot_Assigned'] as boolean;
    const callResponseCountValue = callResponseStatusByTag['Call_Response_Count'] as number;

    if (callResponseValue === false) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response', value: true }],
      });
    }
    if (callRobotAssignedValue === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Robot_Assigned', value: false }],
      });
    }
    if (callResponseCountValue === 0) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Response_Count', value: callCountValue.toString() }],
      });
    }
    if (callType === '') {
      await useCallTypeUtil().callTypeResponse(facilitySerial);
    }
  }
  if (facilityInfo.system === 'EQP') {
    if (toWorkOrderList.length === 0 && beforeAssignedAmrWorkOrderList.length === 0 && fromWorkOrderList.length === 0) {
      const callType = await makeCallType(facilitySerial);
      const callResponseStatusByTag = await plcConnectUtil.batchGetTagValue(facilitySerial, callResponseStatusTagNames);
      const callCountValue = callResponseStatusByTag['Call_Count'] as number;
      const callResponseValue = callResponseStatusByTag['Call_Response'] as boolean;
      const callRobotAssignedValue = callResponseStatusByTag['Call_Robot_Assigned'] as boolean;
      const callResponseCountValue = callResponseStatusByTag['Call_Response_Count'] as number;

      if (callResponseValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response', value: false }],
        });
      }
      if (callRobotAssignedValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Robot_Assigned', value: false }],
        });
      }
      if (callResponseCountValue !== 0) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response_Count', value: 0 }],
        });
      }
      if (callType !== '') {
        await useCallTypeUtil().callTypeResponseReset(facilitySerial);
      }
    }
  } else if (facilityInfo.system === 'WMS') {
    // 진행 중인 CALL_INFO 개수 파악
    const ackCallInfoList = await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(RedisKeys.InfoAckInCallByCallId);
    const selectedAckCallInfoList = ackCallInfoList?.filter((callInfo) => callInfo.Caller === facilitySerial) || [];

    if (
      toWorkOrderList.length === 0 &&
      beforeAssignedAmrWorkOrderList.length === 0 &&
      fromWorkOrderList.length === 0 &&
      selectedAckCallInfoList.length > 0
    ) {
      const callType = await makeCallType(facilitySerial);
      const callResponseStatusByTag = await plcConnectUtil.batchGetTagValue(facilitySerial, callResponseStatusTagNames);
      const callCountValue = callResponseStatusByTag['Call_Count'] as number;
      const callResponseValue = callResponseStatusByTag['Call_Response'] as boolean;
      const callRobotAssignedValue = callResponseStatusByTag['Call_Robot_Assigned'] as boolean;
      const callResponseCountValue = callResponseStatusByTag['Call_Response_Count'] as number;

      if (callResponseValue === false) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response', value: true }],
        });
      }
      if (callRobotAssignedValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Robot_Assigned', value: false }],
        });
      }
      if (callResponseCountValue === 0) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response_Count', value: callCountValue.toString() }],
        });
      }
      if (callType === '') {
        await useCallTypeUtil().callTypeResponse(facilitySerial);
      }
    }
    // 전부다 없을 때, 모든 값 내리기
    if (
      toWorkOrderList.length === 0 &&
      beforeAssignedAmrWorkOrderList.length === 0 &&
      fromWorkOrderList.length === 0 &&
      selectedAckCallInfoList.length === 0
    ) {
      const callType = await makeCallType(facilitySerial);
      const callResponseStatusByTag = await plcConnectUtil.batchGetTagValue(facilitySerial, callResponseStatusTagNames);
      const callCountValue = callResponseStatusByTag['Call_Count'] as number;
      const callResponseValue = callResponseStatusByTag['Call_Response'] as boolean;
      const callRobotAssignedValue = callResponseStatusByTag['Call_Robot_Assigned'] as boolean;
      const callResponseCountValue = callResponseStatusByTag['Call_Response_Count'] as number;

      if (callResponseValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response', value: false }],
        });
      }
      if (callRobotAssignedValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Robot_Assigned', value: false }],
        });
      }
      if (callResponseCountValue !== 0) {
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: 'Call_Response_Count', value: 0 }],
        });
      }
      if (callType !== '') {
        await useCallTypeUtil().callTypeResponseReset(facilitySerial);
      }
    }
  }
};

export const fixMultiCallFacilityStatusList = async () => {
  const facilityList = (await redisUtil.hgetAllObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial)) || [];

  for (let i = 0; i < facilityList.length; i++) {
    const facilityInfo = facilityList[i];

    if (facilityInfo.isActiveCallTrigger === true && facilityInfo.type === 'in') {
      fixMultiCallFacilityStatus(String(facilityInfo?.serial));
    }
  }
};

interface MarkerOccupancyParams {
  map: string;
  workerId: string | null;
  status: 'occupied' | 'empty';
  resourceId: string;
  id: string;
  type: string;
  facilitySerial: string;
  amrName: string;
}

// 현재는 가상 설비의 마커 점유 상태만 기록함
export const setMarkerOccupancy = async (payload: MarkerOccupancyParams) => {
  const markerFacilitySerial = payload.facilitySerial;

  redisUtil.hset(RedisKeys.MarkerOccupancyByVirtualFacilitySerial, markerFacilitySerial, JSON.stringify(payload));

  const markerFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
    RedisKeys.InfoFacilityBySerial,
    markerFacilitySerial
  );

  const RecentWorkOrderListByFacilityInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
    RedisKeys.RecentWorkOrderListByFacilitySerial,
    markerFacilitySerial
  );
  if (markerFacilityInfo) {
    if (!RecentWorkOrderListByFacilityInfo) {
      // 해당 정보가 없을 경우 신규 등록
      const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
        facilitySerial: markerFacilitySerial,
        facilityInfo: markerFacilityInfo,
        count: 0,
        workOrderList: [],
      };
      redisUtil.hset(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        markerFacilitySerial,
        JSON.stringify(recentWorkOrderListByFacilitySerialParams)
      );
    }
  }
};
