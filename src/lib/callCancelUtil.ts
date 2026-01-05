/* eslint-disable prettier/prettier */
import { AttributeIds } from 'node-opcua-client';
import {
  PendingWorkOrderAttributes,
  RecentWorkOrderListByFacilitySerialAttributes,
} from '../models/operation/workOrder';
import { CancelType, FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { TagValue, useKepServerUtil } from './kepServerUtil';
import { logging, logToConsoleAndFile, makeLogFormat, RequestLog } from './logging';
import opcuaUtil from './opcuaUtil';
import { EQP_WCS } from './eqpCheckUtil';
import { formatToDateCode } from './usefullToolUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { editTrackingLogRedis, initTrackingLogRedis } from './process/trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { sendMqtt } from './mqttUtil';
import { service as workOrderService } from '../service/operation/workOrderService';
import { dao as facilityDao } from '../dao/operation/facilityDao';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { v4 as uuidv4 } from 'uuid';
import { RemainingAckCommand } from './process/wmsAck';
import { AbortedCommandForRetryInfo, CancelCallInfo, checkCancelCallInfo, RecentCallInfo } from './process/wmsCommon';
import { CallInfoBody } from './process/wmsCallInfo';
import { generateUUIDNode } from './hashUtil';
import { InfoAckInCallByCallIdBody } from './wms/mqtt/call';
import { count } from 'console';
import { usePlcConnectUtil } from './plcConnectUtil';

export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  // NODE_ID: string;
}

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
}

export interface CancelWorkOrderRequestType {
  TX_ID: string;
  ZONE_ID: string;
  EQP_ID: string; // 설비코드 : SP11
  LINKED_EQP_ID?: string | null; // 링크드 설비코드 : CS12
  IS_CALLER: boolean;
  EQP_CALL_ID: string; // Call_Count : 1234
  CALL_ID: string; // 작업지시코드 : SP11202507161234
  CANCEL_TYPE: CancelType;
  ACS_RESULT?: 'SUCCESS' | 'FAIL' | 'MISSION_ORDER';
  PORT_ID?: string | null;
  CALL_TYPE?: string | null;
}

export const useCallCancelUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  // ACS에 취소 요청 전달
  const cancelWorkOrderToAcs = async (
    callId: string,
    cancelType: CancelType,
    isCaller: boolean,
    linkedEqpId?: string
  ) => {
    // targetCode는 callId에서 앞의 4자리 추출
    const targetCode = callId.slice(0, 4);
    // eqpCallId는 callId에서 맨 뒤의 4자리 추출
    const eqpCallId = callId.slice(-4);
    // acs 작업지시 취소 요청
    const params: CancelWorkOrderRequestType = {
      TX_ID: uuidv4(),
      ZONE_ID: process.env.FLOOR || '1F',
      EQP_ID: targetCode,
      LINKED_EQP_ID: linkedEqpId || null,
      IS_CALLER: isCaller,
      EQP_CALL_ID: eqpCallId,
      CALL_ID: callId,
      CANCEL_TYPE: cancelType,
    };

    const result = await workOrderService.facilityCancel(
      { code: params.CALL_ID, linkedEqpId: params.LINKED_EQP_ID || '' },
      makeLogFormat({} as RequestLog)
    );

    if (result.updatedCount > 0) {
      const messageTopic = 'acs/cancelworkorder';
      try {
        logging.MQTT_LOG({
          title: 'callRemoveUtil cancel workorder',
          topic: messageTopic,
          message: params,
        });
        sendMqtt(messageTopic, JSON.stringify(params));

        // const recentWorkOrderInfoList =
        //   (await redisUtil.hgetAllObject<RecentWorkOrderListByFacilitySerialAttributes>(RedisKeys.RecentWorkOrderListByFacilitySerial)) || [];
        //   if(recentWorkOrderInfoList){
        //     for(let i = 0; i < recentWorkOrderInfoList.length; i++){
        //       const recentWorkOrderInfo = recentWorkOrderInfoList[i]
        //       recentWorkOrderInfo.workOrderList[0].callId
        //     }
        //     targetFacility
        //   }
        redisUtil.hdel(RedisKeys.RecentWorkOrderListByFacilitySerial, targetCode);

      } catch (err) {
        logging.MQTT_ERROR({
          title: 'mqtt message error',
          topic: messageTopic,
          message: params,
          error: err,
        });
      }
    }
  };

  // 창고 콜 취소 전달
  const cancelWorkOrderToWms = async (callId: string) => {
    const infoCancelCall: EqpCallStats = {
      CALL_ID: callId,
      Call_Quantity: 1,
      EQP_CALL_ID: '',
      Call_Type: '',
      Caller: '',
      Call_Priority: '',
    };

    // 창고 콜 취소 전달
    redisUtil.hset(RedisKeys.InfoCancelCallByCallId, infoCancelCall.CALL_ID, JSON.stringify(infoCancelCall));
  };

  // 콜 취소 응답 쓰기
  const writeCallCancelResponse = async (targetCode: string) => {
    try {
      // 콜 취소 응답 쓰기
      await plcConnectUtil.writeTagValue({
        targetFacility: targetCode,
        tagInfo: [{ tagName: 'Call_Cancel_Response', value: true }],
      });
    } catch (error) {
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: 'Call_Cancel_Response',
        value: 'true',
        message: `writeCallCancelResponse ${targetCode}`,
        error: error,
      });
    }
  };
  // 응답 plc 초기화
  const initResponsePlc = async (targetCode: string) => {
    try {
      // 콜응답, 콜취소응답, 콜로봇할당, 콜ID, 콜타입 등은 callRemove에서 0으로 내림.
      await plcConnectUtil.writeTagValue({
        targetFacility: targetCode,
        tagInfo: [
          { tagName: 'Call_Response', value: false },
          { tagName: 'Call_Robot_Assigned', value: false },
          { tagName: 'Call_Response_Count', value: '0' }
        ],
      });
    } catch (error) {
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: 'Call_Response, Call_Robot_Assigned, Call_Response_Count',
        value: 'false',
        message: `initResponsePlc ${targetCode}`,
        error: error,
      });
    }
  };
  // 설비 콜 취소 시 재반입 미션오더 만드는 함수
  const createReinboundMissionOrderOnCancel = async (params: CancelWorkOrderRequestType) => {
    // 취소 요청 타입 확인
    const cancelType = params.CANCEL_TYPE;

    if (cancelType === 'EQP_TO_WMS' && params.PORT_ID) {
      // 설비to창고 취소 시 재반입 미션오더 만드는 함수
      logToConsoleAndFile(
        `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수`,
        'green'
      );
      logging.ACTION_INFO({
        filename: `callCancelUtil.ts - createReinboundMissionOrderOnCancel`,
        error: `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수`,
        params: null,
        result: true,
      });

      // 미션오더 생성
      const infoPendingMissionWorkOrder: PendingWorkOrderAttributes = {
        callId: params.CALL_ID + '_canceled',
        fromFacilityName: params.PORT_ID,
        toFacilityName: null,
        type: 'MISSION',
        isMissionOrder: true,
        callPriority: '',
        callType: params.CALL_TYPE || 'SKID',
        cargoType: params.CALL_TYPE || '',
        portName: null,
        eqpName: params.PORT_ID,
      };

      // 작업지시 예정 레디스 저장
      redisUtil.hset(
        RedisKeys.InfoPendingWorkOrderByCallId,
        infoPendingMissionWorkOrder.callId!,
        JSON.stringify(infoPendingMissionWorkOrder)
      );
    } else {
      // 여기는 들어올일이 없음 에러처리
      logToConsoleAndFile(
        `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
        'red'
      );
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - createReinboundMissionOrderOnCancel`,
        error: `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
        params: null,
        result: false,
      });
    }
  };

  // 창고 콜 취소 불가능 처리
  const handleWmsCallCancelRejection = async (callId: string) => {
    // 창고 콜 취소가 불가능하므로, redis 만들어놓고 포트배정이 되면 그때 미션 오더 만들어줘서 ACS에 전달
    redisUtil.hset(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId, JSON.stringify(callId));
  };

  // ACS로부터 온 취소 응답 처리
  const processCancelResponseFromAcs = async (params: CancelWorkOrderRequestType) => {
    // 취소 응답 타입 확인
    const cancelResponseType = params.ACS_RESULT;
    const eqpId = params.EQP_ID;
    const linkedEqpId = params.LINKED_EQP_ID || null;
    if (cancelResponseType === 'SUCCESS') {
      // 취소 응답 타입이 SUCCESS일 경우
      // 콜주체, 링크드 확인 후 콜 취소 응답 쓰기
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, eqpId);
      if (!facilityInfo) {
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] SUCCESS - eqpId = ${eqpId} 정보 없음`, 'red');
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] SUCCESS - eqpId = ${eqpId} 정보 없음`,
          params: null,
          result: false,
        });
        return;
      }

      if (params.CANCEL_TYPE === 'EQP_TO_EQP_NO_MISSION') {
        // 취소 타입이 설비to설비 미션X 일 경우
        // 해당 설비가 콜주체인지 링크드인지 확인 후 적절히 콜 취소 응답 쓰기
        const isCaller = params.IS_CALLER;
        if (isCaller) {
          // 콜주체일 경우
          // 콜 취소 응답 쓰기(콜주체)
          await writeCallCancelResponse(eqpId);
          // 링크드 설비 응답 plc 초기화
          if (linkedEqpId) {
            await initResponsePlc(linkedEqpId);
          }
        } else {
          // 링크드일 경우
          // 콜 취소 응답 쓰기(링크드)
          if (linkedEqpId) {
            await writeCallCancelResponse(linkedEqpId);
          }
          // 콜주체 설비 응답 plc 초기화
          await initResponsePlc(eqpId);
        }
      } else if (params.CANCEL_TYPE === 'EQP_TO_EQP_MISSION') {
        // 취소 타입이 설비to설비 미션O 일 경우
        // 콜 취소 응답 쓰기
        await writeCallCancelResponse(eqpId);
        // 링크드 설비 응답 plc 초기화
        if (linkedEqpId && facilityInfo.type === 'in') {
          await initResponsePlc(linkedEqpId);
        }
      } else if (params.CANCEL_TYPE === 'EQP_TO_WMS') {
        // 취소 타입이 설비to창고 일 경우
        // 여기로 들어올 일 없음. 에러처리
        logToConsoleAndFile(
          `[cancelResponseType = ${cancelResponseType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
          'red'
        );
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
          params: null,
          result: false,
        });
      } else {
        // 취소 타입이 정의되지 않은 경우
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`, 'red');
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`,
          params: null,
          result: false,
        });
      }
    } else if (cancelResponseType === 'FAIL') {
      // 취소 응답 타입이 FAIL일 경우
      logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] FAIL - 취소 응답 타입이 FAIL일 경우`, 'red');
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
        error: `[cancelResponseType = ${cancelResponseType}] FAIL - 취소 응답 타입이 FAIL일 경우`,
        params: null,
        result: false,
      });
    } else if (cancelResponseType === 'MISSION_ORDER') {
      // 취소 응답 타입이 MISSION_ORDER일 경우
      logToConsoleAndFile(
        `[cancelResponseType = ${cancelResponseType}] MISSION_ORDER - 취소 응답 타입이 MISSION_ORDER일 경우`,
        'green'
      );

      if (params.CANCEL_TYPE === 'EQP_TO_EQP_MISSION') {
        // 취소 타입이 설비to설비 미션O 일 경우
        // 콜 취소 응답 쓰기
        await writeCallCancelResponse(eqpId);
      } else if (params.CANCEL_TYPE === 'EQP_TO_WMS') {
        // 취소 타입이 설비to창고 일 경우
        // 콜 취소 응답 쓰기
        await writeCallCancelResponse(eqpId);
      } else {
        // 취소 타입이 정의되지 않은 경우
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`, 'red');
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`,
          params: null,
          result: false,
        });
      }
    } else {
      // 취소 응답 타입이 정의되지 않은 경우
      logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 응답 타입이 정의되지 않은 경우`, 'red');
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
        error: `[cancelResponseType = ${cancelResponseType}] 취소 응답 타입이 정의되지 않은 경우`,
        params: null,
        result: false,
      });
    }
  };
  const callCancel = async (targetTagInfo: TagValue) => {
    // prevValue가 없으면 초기 연결시점이므로 무시
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `init 시점`,
      });
      return;
    }

    try {
      // 설비가 콜 취소 응답을 받고 콜 취소 요청 태그가 0으로 내려갔을 때
      if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
        logToConsoleAndFile(`설비가 콜 취소 응답을 받고 콜 취소 요청 태그를 0으로 내림.`, 'green');
        logging.KEPWARE_DEBUG({
          action: 'TAG_READ',
          tag: targetTagInfo.TAG_NAME,
          value: JSON.parse(JSON.stringify(targetTagInfo)),
          message: `설비가 콜 취소 응답을 받고 콜 취소 요청 태그를 0으로 내림.`,
        });

        // 콜응답, 콜취소응답, 콜로봇할당, 콜ID, 콜타입 등은 callRemove에서 0으로 내림.
        // 이 함수에서는 콜취소응답만 0으로 내리기.
        await plcConnectUtil.writeTagValue({
          targetFacility: targetTagInfo.EQ_CODE,
          tagInfo: [{ tagName: 'Call_Cancel_Response', value: false }, { tagName: 'Call_Response', value: false }],
        });
        return;
      }

      const targetCode = targetTagInfo.EQ_CODE;

      // 설비(caller) 설비 데이터 REDIS 조회
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, targetCode);
      if (!facilityInfo) {
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `${targetCode} 설비정보가 없습니다.`,
          params: null,
          result: true,
        });
        return;
      }

      // 취소 타입 확인
      const cancelType = facilityInfo?.cancelType || 'NON_CANCELLABLE';

      // NON_CANCELLABLE일 경우 해당 설비에서 들어온 취소 요청에 대해서 응답하지 않음
      // NON_CANCELLABLE 콜 Cancel Request 가 올라와 있을 것이고
      if (cancelType === 'NON_CANCELLABLE') {
        logToConsoleAndFile(
          `[cancelType = ${cancelType}] NON_CANCELLABLE - 취소 로직 비활성화 - 취소 요청 무시`,
          'green'
        );
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] NON_CANCELLABLE - 취소 로직 비활성화 - 취소 요청 무시`,
          params: null,
          result: true,
        });
        return;
      }

      const callCount = await plcConnectUtil.getTagValue(targetCode, 'Call_Count') as number;
      if (!callCount) {
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `${targetCode} 콜 카운트 정보가 없습니다.`,
          params: null,
          result: true,
        });
        return;
      }

      if (cancelType === 'EQP_TO_WMS') {
        let preWorkOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          targetCode
        );

        if (preWorkOrderListInfo && preWorkOrderListInfo.count > 0) {
          const preWorkOrderCount = preWorkOrderListInfo.count;
          const preWorkOrderList = preWorkOrderListInfo.workOrderList || [];

          // 0. MCS가 가지고 있는 Call 정보 중 WMS에 Call_Info도 안보낸 정보 확인
          // 해당 정보는 트래킹 로그도 만들기 전 상태라서 정보 삭제만 하면 된다.
          // 고민 사항 InfoCallRequestOnBySerial 에 있는 데이터는 삭제하지 않아도 괜찮을지 ?
          const notBeforeRequestWorkOrderList =
            preWorkOrderList.filter((workOrder) => workOrder.state !== 'beforeRequest') || [];
          const notBeforeRequestWorkOrderCount = notBeforeRequestWorkOrderList.length;

          const removeBeforeRequestRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
          {
            count: notBeforeRequestWorkOrderCount,
            workOrderList: notBeforeRequestWorkOrderList,
          };

          redisUtil.hset(
            RedisKeys.RecentWorkOrderListByFacilitySerial,
            targetCode,
            JSON.stringify(removeBeforeRequestRecentWorkOrderListByFacilitySerialParams)
          );

          // 1. MCS가 해당 설비 내용으로 보내고 있는 모든 CALL 정보 확인
          // 1-1. CALL_INFO ACK를 못 받은 경우
          const remainingCallInfoList =
            (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId)) || [];
          const samePlcRemainingCallInfoList = remainingCallInfoList.filter(
            (remainingCallInfo) => remainingCallInfo?.message?.body?.Caller === targetCode
          );

          // console.log('remainingCallInfoList', remainingCallInfoList)
          // console.log('samePlcRemainingCallInfoList', samePlcRemainingCallInfoList)
          if (samePlcRemainingCallInfoList && samePlcRemainingCallInfoList.length > 0) {
            for (let i = 0, length = samePlcRemainingCallInfoList.length; i < length; i++) {
              const samePlcRemainingCallInfo = samePlcRemainingCallInfoList[i];
              const cmdId = samePlcRemainingCallInfo?.message?.body?.Cmd_ID || '';
              const subjectCmdId = samePlcRemainingCallInfo.subjectCmdId;

              // TrackingLog 취소 반영
              const recentCallInfo = await redisUtil.hgetObject<RecentCallInfo>(
                RedisKeys.RecentCallInfoTaskByCmdId,
                cmdId
              );

              const recentCallInfoCallId = recentCallInfo?.callId;

              if (recentCallInfoCallId) {
                const trackingLogSubject = 'MISSION_CANCELED';
                const trackingLogDetail = 'MISSION_CANCELED';
                const trackingLogState = 'CANCELED';
                const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                  callId: recentCallInfoCallId,
                  subject: trackingLogSubject,
                  detail: trackingLogDetail,
                  state: trackingLogState,
                  startFacility: null,
                  transferId: null,
                  destFacility: null,
                  assignedRobot: null,
                  value: targetCode,
                  description: `Call ID ${recentCallInfoCallId} cancellation successful on EQP ${targetCode}`,
                  processState: 'CANCELED',
                };
                await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', targetCode);

                // workOrder 카운트처리
                let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                  RedisKeys.RecentWorkOrderListByFacilitySerial,
                  targetCode
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
                    removeWorkOrderByCallId(recentCallInfoCallId) ?? {
                      count: 0,
                      workOrderList: [],
                    };

                  redisUtil.hset(
                    RedisKeys.RecentWorkOrderListByFacilitySerial,
                    targetCode,
                    JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
                  );
                }
              }

              redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId);
              redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
            }
          }

          // 1-2. Abort로 남아있는 경우 삭제
          const abortCallInfoList =
            (await redisUtil.hgetAllObject<AbortedCommandForRetryInfo>(
              RedisKeys.AbortedCommandForRetryBySubjectCmdId
            )) || [];
          const samePlcAbortCallInfoList = abortCallInfoList.filter(
            (abortCallInfo) => abortCallInfo?.message?.body?.Caller === targetCode
          );
          // console.log('abortCallInfoList', abortCallInfoList);
          if (samePlcAbortCallInfoList && samePlcAbortCallInfoList.length > 0) {
            for (let i = 0, length = samePlcAbortCallInfoList.length; i < length; i++) {
              const samePlcAbortCallInfo = samePlcAbortCallInfoList[i];
              const cmdId = samePlcAbortCallInfo?.message?.body?.Cmd_ID || '';
              const subjectCmdId = samePlcAbortCallInfo.subjectCmdId;

              // TrackingLog 취소 반영
              const recentCallInfo = await redisUtil.hgetObject<RecentCallInfo>(
                RedisKeys.RecentCallInfoTaskByCmdId,
                cmdId
              );
              const recentCallInfoCallId = recentCallInfo?.callId;

              if (recentCallInfoCallId) {
                const trackingLogSubject = 'MISSION_CANCELED';
                const trackingLogDetail = 'MISSION_CANCELED';
                const trackingLogState = 'CANCELED';
                const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                  callId: recentCallInfoCallId,
                  subject: trackingLogSubject,
                  detail: trackingLogDetail,
                  state: trackingLogState,
                  startFacility: null,
                  transferId: null,
                  destFacility: null,
                  assignedRobot: null,
                  value: targetCode,
                  description: `Call ID ${recentCallInfoCallId} cancellation successful on EQP ${targetCode}`,
                  processState: 'CANCELED',
                };
                await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', targetCode);

                // workOrder 카운트처리
                let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                  RedisKeys.RecentWorkOrderListByFacilitySerial,
                  targetCode
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
                    removeWorkOrderByCallId(recentCallInfoCallId) ?? {
                      count: 0,
                      workOrderList: [],
                    };

                  redisUtil.hset(
                    RedisKeys.RecentWorkOrderListByFacilitySerial,
                    targetCode,
                    JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
                  );
                }
              }

              redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId);
              redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
            }
          }

          // 2. ACK_CALL_INFO 받고 포트 배정을 기다리고 있는 CALL_ID 확인
          // CANCEL_CALL_INFO 요청 -> 창고로부터 응답을 받지 않아도 후속 처리는 별도로 진행될 것이기 때문에 응답은 바로 씀
          const infoAckInCallByCallIdList = await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(
            RedisKeys.InfoAckInCallByCallId
          );
          const samePlcInfoAckInCallByCallIdList =
            infoAckInCallByCallIdList?.filter((InfoAckInCall) => InfoAckInCall?.Caller === targetCode) || [];

          // console.log('samePlcInfoAckInCallByCallIdList', samePlcInfoAckInCallByCallIdList);
          if (samePlcInfoAckInCallByCallIdList && samePlcInfoAckInCallByCallIdList.length > 0) {
            for (let i = 0, length = samePlcInfoAckInCallByCallIdList.length; i < length; i++) {
              const samePlcInfoAckInCallByCallId = samePlcInfoAckInCallByCallIdList[i];

              const selectedCallId = samePlcInfoAckInCallByCallId.CALL_ID;

              const newCancelCallInfoData: CancelCallInfo = {
                Call_ID: selectedCallId,
                Call_Quantity: Number(samePlcInfoAckInCallByCallId.Call_Quantity) || 1,
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
                  value: targetCode,
                  description: `Call ID ${selectedCallId} cancellation successful on EQP ${targetCode}`,
                  processState: 'CANCELED',
                };
                await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', targetCode);

                // workOrder 카운트처리
                let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                  RedisKeys.RecentWorkOrderListByFacilitySerial,
                  targetCode
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
                    removeWorkOrderByCallId(selectedCallId) ?? {
                      count: 0,
                      workOrderList: [],
                    };

                  redisUtil.hset(
                    RedisKeys.RecentWorkOrderListByFacilitySerial,
                    targetCode,
                    JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
                  );

                  redisUtil.hset(
                    RedisKeys.RecentWorkOrderListByFacilitySerial,
                    targetCode,
                    JSON.stringify({
                      count: 0,
                      workOrderList: [],
                    })
                  );
                }
              }
            }
          }

          // 3. 진행 중인 작업 지시 확인
          // console.log('facilityInfo?.system', facilityInfo?.system);
          if (facilityInfo?.system === 'WMS') {
            let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              targetCode
            );

            // console.log('workOrderListInfo', workOrderListInfo);
            if (workOrderListInfo) {
              const workOrderList = workOrderListInfo?.workOrderList || [];
              let workOrderCount = workOrderListInfo?.count || 0;

              // state가 'workOrder'인 항목들만 필터링
              const filterWorkOrderList = workOrderList.filter((workOrder) => workOrder.state === 'workOrder' || workOrder.state === 'fromWorkOrder' || workOrder.state === 'toWorkOrder') || [];

              // 취소할 callId들 저장
              const callIdsToRemove: string[] = [];

              for (let i = 0, length = filterWorkOrderList.length; i < length; i++) {
                const workOrderInfo = filterWorkOrderList[i];
                const workOrderCallId = workOrderInfo.callId;

                // workOrderCount down
                workOrderCount = workOrderCount - 1;

                // 삭제할 callId 저장
                callIdsToRemove.push(workOrderCallId);

                // 트래킹 로그 반영
                const trackingLogSubject = 'MISSION_CANCELED';
                const trackingLogDetail = 'MISSION_CANCELED';
                const trackingLogState = 'CANCELED';
                const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                  callId: workOrderCallId,
                  subject: trackingLogSubject,
                  detail: trackingLogDetail,
                  state: trackingLogState,
                  startFacility: null,
                  transferId: null,
                  destFacility: null,
                  assignedRobot: null,
                  value: targetCode,
                  description: `Call ID ${workOrderCallId} cancellation successful on EQP ${targetCode}`,
                  processState: 'CANCELED',
                };
                await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', targetCode);

                await cancelWorkOrderToAcs(workOrderCallId, cancelType, true, undefined);
              }

              // workOrderList에서 취소된 항목들 제거
              const updatedWorkOrderList = workOrderList.filter(
                (workOrder) => !callIdsToRemove.includes(workOrder.callId)
              );

              // console.log('updatedWorkOrderList', updatedWorkOrderList);
              const newRecentWorkOrderListByFacilitySerialParams = {
                count: workOrderCount,
                workOrderList: updatedWorkOrderList,
              };
              // console.log('newRecentWorkOrderListByFacilitySerialParams', newRecentWorkOrderListByFacilitySerialParams);
              redisUtil.hset(
                RedisKeys.RecentWorkOrderListByFacilitySerial,
                targetCode,
                JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
              );
            }
          }
        }

        // PLC 취소 응답 처리
        await writeCallCancelResponse(targetCode);
        await initResponsePlc(targetCode);

        return;
      }

      await writeCallCancelResponse(targetCode);

      let workOrderInfo = null;
      if (facilityInfo.isActiveCallTrigger === true) {
        if (facilityInfo.type === 'in') {
          workOrderInfo = await workOrderDao.selectInfoByTriggerCallCount({
            triggerCallCount: callCount,
            toFacilityId: facilityInfo.id,
          });
        } else if (facilityInfo.type === 'out') {
          workOrderInfo = await workOrderDao.selectInfoByTriggerCallCount({
            triggerCallCount: callCount,
            fromFacilityId: facilityInfo.id,
          });
        }
      } else if (facilityInfo.isActiveCallTrigger === false) {
        if (facilityInfo.type === 'in') {
          workOrderInfo = await workOrderDao.selectInfoByAlwaysCallCount({
            alwaysCallCount: callCount,
            toFacilityId: facilityInfo.id,
          });
        } else if (facilityInfo.type === 'out') {
          workOrderInfo = await workOrderDao.selectInfoByAlwaysCallCount({
            alwaysCallCount: callCount,
            fromFacilityId: facilityInfo.id,
          });
        }
      } else {
        logToConsoleAndFile(`[cancelType = ${cancelType}] 포트 타입 없음`, 'red');
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] 포트 타입 없음`,
          params: null,
          result: false,
        });
        return;
      }

      // 작업지시가 생겨서 ACS에 전달되기 전에 취소요청이 들어온 경우
      // ACS에 전달 되기 전이라면 취소요청을 보낼 필요가 없음
      if (!workOrderInfo) {
        logToConsoleAndFile(
          `[cancelType = ${cancelType}] 작업지시가 생겨서 ACS에 전달되기 전에 취소요청이 들어온 경우`,
          'green'
        );
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}, facilityInfo.serial = ${facilityInfo.serial}] 작업지시가 생겨서 ACS에 전달되기 전에 취소요청이 들어온 경우`,
          params: null,
          result: true,
        });

        // 250916 remove remain
        /*
        const infoRemainCalls = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
        if (infoRemainCalls) {
          for (const infoRemainCall of infoRemainCalls) {
            if (facilityInfo.serial === infoRemainCall.fromFacilityName || facilityInfo.serial === infoRemainCall.toFacilityName) {
              logToConsoleAndFile(`[cancelType = ${cancelType}] infoRemainCall.callId = ${infoRemainCall.callId} 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`, "green");
              logging.ACTION_INFO({
                filename: `callCancelUtil.ts - callCancel`,
                error: `[cancelType = ${cancelType}] infoRemainCall.callId = ${infoRemainCall.callId} 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`,
                params: null,
                result: true,
              });
              redisUtil.hdel(RedisKeys.InfoRemainCallById, infoRemainCall.callId || '');
            }
          }
        }
          */
        const infoRemainCalls = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
        if (infoRemainCalls) {
          for (const infoRemainCall of infoRemainCalls) {
            if (facilityInfo.serial === infoRemainCall.DEVICE) {
              logToConsoleAndFile(
                `[cancelType = ${cancelType}] 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`,
                'green'
              );
              logging.ACTION_INFO({
                filename: `callCancelUtil.ts - callCancel`,
                error: `[cancelType = ${cancelType}] 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`,
                params: null,
                result: true,
              });
              redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, infoRemainCall.DEVICE || '');
            }
          }
        }

        // 작지가 없음에도 작업자가 Call_Cancel_Request 를 올린 경우
        // Call_Cancel_Response 를 켜서 다음 콜이 생성되도록 해줘야 함
        await writeCallCancelResponse(targetCode);
        await initResponsePlc(targetCode);

        // 만약 취소 타입이 설비-창고라면 포트배정기다리는 레디스에서 찾아서 취소응답써주고 창고콜취소 요청 전달
        // if (cancelType === 'EQP_TO_WMS') {
        //   const infoRemainCalls = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
        //   if (infoRemainCalls) {
        //     for (const infoRemainCall of infoRemainCalls) {
        //       if (facilityInfo.serial === infoRemainCall.fromFacilityName || facilityInfo.serial === infoRemainCall.toFacilityName) {
        //         logToConsoleAndFile(`[cancelType = ${cancelType}] infoRemainCall.callId = ${infoRemainCall.callId} 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`, "green");
        //         logging.ACTION_INFO({
        //           filename: `callCancelUtil.ts - callCancel`,
        //           error: `[cancelType = ${cancelType}] infoRemainCall.callId = ${infoRemainCall.callId} 작업지시가 ACS에 전달되기 전에 취소요청이 들어온 경우`,
        //           params: null,
        //           result: true,
        //         });
        //         await writeCallCancelResponse(targetCode);
        //         redisUtil.hdel(RedisKeys.InfoRemainCallById, infoRemainCall.callId || '');
        //       }
        //     }
        //   }
        // }

        return;
      }

      const isCaller = facilityInfo.isActiveCallTrigger === true ? true : false;

      let linkedFacilityInfo = null;
      if (isCaller) {
        // 콜주체일 경우
        // 링크드 설비 정보 조회
        const linkedfacilityId =
          facilityInfo.type === 'in' ? workOrderInfo.fromFacilityId : workOrderInfo.toFacilityId || null;
        linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityById,
          linkedfacilityId?.toString() || ''
        );
        if (!linkedFacilityInfo) {
          logToConsoleAndFile(`[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`, 'red');
          logging.ACTION_ERROR({
            filename: `callCancelUtil.ts - callCancel`,
            error: `[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`,
            params: null,
            result: false,
          });
        }
      } else {
        // 링크드일 경우
        // 링크드 설비 정보 조회
        const linkedfacilityId =
          facilityInfo.type === 'in' ? workOrderInfo.toFacilityId : workOrderInfo.fromFacilityId || null;
        linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityById,
          linkedfacilityId?.toString() || ''
        );
        if (!linkedFacilityInfo) {
          logToConsoleAndFile(`[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`, 'red');
          logging.ACTION_ERROR({
            filename: `callCancelUtil.ts - callCancel`,
            error: `[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`,
            params: null,
            result: false,
          });
        }
      }

      // 작업지시 코드 ( 취소 요청 들어온 작업지시 코드 )
      const callId = workOrderInfo.code;
      logToConsoleAndFile(`callId is made in callCancelUtil: ${callId}`, 'green');

      // 미션 결정지 있는 설비to설비에서 취소 요청 들어온 경우
      if (cancelType === 'EQP_TO_EQP_MISSION') {
        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O `, 'green');
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O `,
          params: null,
          result: true,
        });

        // 공급포트인지 회수포트인지 확인
        if (facilityInfo.type === 'in') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`,
            'green'
          );
          // 작업지시 생성 되어있으니 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);
        } else if (facilityInfo.type === 'out') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 회수포트 - 이 로직으로 들어올수 없음`,
            'red'
          );
          // 작업지시 생성 되어있으니 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller);
        } else {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 포트 타입 없음`,
            'red'
          );
          logging.ACTION_ERROR({
            filename: `callCancelUtil.ts - callCancel`,
            error: `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 포트 타입 없음`,
            params: null,
            result: false,
          });
          return;
        }

        // 미션 결정지 없는 설비to설비에서 취소 요청 들어온 경우
      } else if (cancelType === 'EQP_TO_EQP_NO_MISSION') {
        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X `, 'green');
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X `,
          params: null,
          result: true,
        });
        if (facilityInfo.type === 'in') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`,
            'green'
          );
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);
        } else if (facilityInfo.type === 'out') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 회수포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`,
            'green'
          );
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);
        } else {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 포트 타입 없음`,
            'red'
          );
        }

        // 설비to창고에서 취소 요청 들어온 경우
      } else if (cancelType === 'EQP_TO_WMS') {
        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 `, 'green');
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 `,
          params: null,
          result: true,
        });

        if (facilityInfo.type === 'in') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`,
            'green'
          );
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);
        } else if (facilityInfo.type === 'out') {
          logToConsoleAndFile(
            `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 회수포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`,
            'green'
          );
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller);
        } else {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 포트 타입 없음`, 'red');
        }
      } else {
        logToConsoleAndFile(`[cancelType = ${cancelType}] Invalid cancel type`, 'red');
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] Invalid cancel type`,
          params: null,
          result: false,
        });
        return;
      }
    } catch (error) {
      console.error('Error in callRemove:', error);
    }
  };
  return { callCancel, processCancelResponseFromAcs, handleWmsCallCancelRejection };
};
