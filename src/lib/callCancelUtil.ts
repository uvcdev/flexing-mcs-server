/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { CancelType, FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging, logToConsoleAndFile, makeLogFormat, RequestLog } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { formatToDateCode } from "./usefullToolUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { initTrackingLogRedis } from "./process/trackingLog";
import { TrackingLogRedisAttributes } from "../models/common/trackingLog";
import { sendMqtt } from "./mqttUtil";
import { service as workOrderService } from '../service/operation/workOrderService';
import { dao as facilityDao } from '../dao/operation/facilityDao';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { v4 as uuidv4 } from 'uuid';

export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  // NODE_ID: string;
};

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
};

export interface CancelWorkOrderRequestType {
  TX_ID: string;
  ZONE_ID: string;
  EQP_ID: string;       // 설비코드 : SP11
  LINKED_EQP_ID?: string | null; // 링크드 설비코드 : CS12
  IS_CALLER: boolean;
  EQP_CALL_ID: string;  // Call_Count : 1234 
  CALL_ID: string;      // 작업지시코드 : SP11202507161234
  CANCEL_TYPE: CancelType;
  ACS_RESULT?:
  'SUCCESS' |
  'FAIL' |
  'MISSION_ORDER';
  PORT_ID?: string | null;
  CALL_TYPE?: string | null;
}

export const useCallCancelUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();

  // ACS에 취소 요청 전달
  const cancelWorkOrderToAcs = async (callId: string, cancelType: CancelType, isCaller: boolean, linkedEqpId?: string) => {
    // targetCode는 callId에서 앞의 4자리 추출
    const targetCode = callId.slice(0, 4);
    // eqpCallId는 callId에서 맨 뒤의 4자리 추출
    const eqpCallId = callId.slice(-4);
    // acs 작업지시 취소 요청
    const params: CancelWorkOrderRequestType =
    {
      TX_ID: uuidv4(),
      ZONE_ID: process.env.FLOOR || '1F',
      EQP_ID: targetCode,
      LINKED_EQP_ID: linkedEqpId || null,
      IS_CALLER: isCaller,
      EQP_CALL_ID: eqpCallId,
      CALL_ID: callId,
      CANCEL_TYPE: cancelType,
    }

    const result = await workOrderService.facilityCancel(
      { code: params.CALL_ID },
      makeLogFormat({} as RequestLog)
    );

    if (result.updatedCount > 0) {
      const messageTopic = 'acs/cancelworkorder'
      try {
        logging.MQTT_LOG({
          title: 'callRemoveUtil cancel workorder',
          topic: messageTopic,
          message: params,
        });
        sendMqtt(messageTopic, JSON.stringify(params));
      } catch (err) {
        logging.MQTT_ERROR({
          title: 'mqtt message error',
          topic: messageTopic,
          message: params,
          error: err,
        });
      }
    }
  }

  // 창고 콜 취소 전달
  const cancelWorkOrderToWms = async (callId: string) => {
    const infoCancelCall: EqpCallStats = {
      CALL_ID: callId,
      Call_Quantity: 1,
      EQP_CALL_ID: "",
      Call_Type: "",
      Caller: "",
      Call_Priority: ""
    }

    // 창고 콜 취소 전달
    redisUtil.hset(RedisKeys.InfoCancelCallByCallId, infoCancelCall.CALL_ID, JSON.stringify(infoCancelCall))

  }

  // 콜 취소 응답 쓰기
  const writeCallCancelResponse = async (targetCode: string) => {

    try {

      // 콜 취소 응답 쓰기
      await kepServerUtil.writeSimpleTagValue({
        targetFacility: targetCode,
        tagName: 'Call_Cancel_Response',
        value: true,
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
  }
  // 응답 plc 초기화
  const initResponsePlc = async (targetCode: string) => {
    try {
      // 콜응답, 콜취소응답, 콜로봇할당, 콜ID, 콜타입 등은 callRemove에서 0으로 내림.
      await kepServerUtil.writeSimpleTagValue({
        targetFacility: targetCode,
        tagName: 'Call_Response',
        value: false,
      });
      await kepServerUtil.writeSimpleTagValue({
        targetFacility: targetCode,
        tagName: 'Call_Robot_Assigned',
        value: false,
      });
      await kepServerUtil.writeSimpleTagValue({
        targetFacility: targetCode,
        tagName: 'Call_Response_Count',
        value: '0',
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
  }
  // 설비 콜 취소 시 재반입 미션오더 만드는 함수
  const createReinboundMissionOrderOnCancel = async (params: CancelWorkOrderRequestType) => {
    // 취소 요청 타입 확인
    const cancelType = params.CANCEL_TYPE;

    if (cancelType === 'EQP_TO_WMS' && params.PORT_ID) {
      // 설비to창고 취소 시 재반입 미션오더 만드는 함수
      logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수`, "green");
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
        callType: params.CALL_TYPE || 'NC11',
        portName: null,
        eqpName: params.PORT_ID
      }

      // 작업지시 예정 레디스 저장
      redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, infoPendingMissionWorkOrder.callId!, JSON.stringify(infoPendingMissionWorkOrder))

    } else {
      // 여기는 들어올일이 없음 에러처리
      logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`, "red");
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - createReinboundMissionOrderOnCancel`,
        error: `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
        params: null,
        result: false,
      });
    }
  }

  // 창고 콜 취소 불가능 처리
  const handleWmsCallCancelRejection = async (callId: string) => {
    // 창고 콜 취소가 불가능하므로, redis 만들어놓고 포트배정이 되면 그때 미션 오더 만들어줘서 ACS에 전달
    redisUtil.hset(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId, JSON.stringify(callId))
  }

  // ACS로부터 온 취소 응답 처리
  const processCancelResponseFromAcs = async (params: CancelWorkOrderRequestType) => {
    // 취소 응답 타입 확인
    const cancelResponseType = params.ACS_RESULT;
    const eqpId = params.EQP_ID;
    const linkedEqpId = params.LINKED_EQP_ID || null;
    if (cancelResponseType === 'SUCCESS') {
      // 취소 응답 타입이 SUCCESS일 경우
      // 콜주체, 링크드 확인 후 콜 취소 응답 쓰기
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, eqpId)
      if (!facilityInfo) {
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] SUCCESS - eqpId = ${eqpId} 정보 없음`, "red");
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
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`, "red");
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] EQP_TO_WMS - 설비to창고 취소 시 재반입 미션오더 만드는 함수 - 여기는 들어올일이 없음 에러처리`,
          params: null,
          result: false,
        });
      } else {
        // 취소 타입이 정의되지 않은 경우
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`, "red");
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`,
          params: null,
          result: false,
        });
      }

    } else if (cancelResponseType === 'FAIL') {
      // 취소 응답 타입이 FAIL일 경우
      logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] FAIL - 취소 응답 타입이 FAIL일 경우`, "red");
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
        error: `[cancelResponseType = ${cancelResponseType}] FAIL - 취소 응답 타입이 FAIL일 경우`,
        params: null,
        result: false,
      });
    } else if (cancelResponseType === 'MISSION_ORDER') {
      // 취소 응답 타입이 MISSION_ORDER일 경우
      logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] MISSION_ORDER - 취소 응답 타입이 MISSION_ORDER일 경우`, "green");


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
        logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`, "red");
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] 취소 타입이 정의되지 않은 경우`,
          params: null,
          result: false,
        });
      }
    } else {
      // 취소 응답 타입이 정의되지 않은 경우
      logToConsoleAndFile(`[cancelResponseType = ${cancelResponseType}] 취소 응답 타입이 정의되지 않은 경우`, "red");
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
        error: `[cancelResponseType = ${cancelResponseType}] 취소 응답 타입이 정의되지 않은 경우`,
        params: null,
        result: false,
      });
    }
  }
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
        logToConsoleAndFile(`설비가 콜 취소 응답을 받고 콜 취소 요청 태그를 0으로 내림.`, "green");
        logging.KEPWARE_DEBUG({
          action: 'TAG_READ',
          tag: targetTagInfo.TAG_NAME,
          value: JSON.parse(JSON.stringify(targetTagInfo)),
          message: `설비가 콜 취소 응답을 받고 콜 취소 요청 태그를 0으로 내림.`,
        });

        // 콜응답, 콜취소응답, 콜로봇할당, 콜ID, 콜타입 등은 callRemove에서 0으로 내림.
        // 이 함수에서는 콜취소응답만 0으로 내리기.
        await kepServerUtil.writeSimpleTagValue({
          targetFacility: targetTagInfo.EQ_CODE,
          tagName: 'Call_Cancel_Response',
          value: false,
        });
        return;
      }

      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const targetCode = targetTagInfo.EQ_CODE;

      // 설비(caller) 설비 데이터 REDIS 조회
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, targetCode)
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
      const cancelType = facilityInfo?.cancelType || 'NON_CANCELLABLE'

      // NON_CANCELLABLE일 경우 해당 설비에서 들어온 취소 요청에 대해서 응답하지 않음
      if (cancelType === 'NON_CANCELLABLE') {
        logToConsoleAndFile(`[cancelType = ${cancelType}] NON_CANCELLABLE - 취소 로직 비활성화 - 취소 요청 무시`, "green");
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] NON_CANCELLABLE - 취소 로직 비활성화 - 취소 요청 무시`,
          params: null,
          result: true,
        });
        return;
      }

      // 필요한 태그 값들 업데이트
      await kepServerUtil.updateTagMapValues(
        targetKey,
        targetCode,
        [
          'Call_Request',
          'Call_Count',
          'Call_Response',
          'Call_Robot_Assigned',
          'Call_Time_Year',
          'Call_Time_MonthDay',
        ]
      );

      const callRequest = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`)?.value as boolean;
      const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`)?.value as number;
      const callPriority = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`)?.value as boolean;
      const callResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Response`)?.value as boolean;
      const callResponseCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Response_Count`)?.value as number;
      const callRobotAssigned = opcuaUtil.tagMap.get(`${targetCode}.Call_Robot_Assigned`)?.value as boolean;
      const callTimeYear = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_Year`)?.value as string;
      const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_MonthDay`)?.value as string;

      const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDay)).toString()
      const callCountStr = callCount.toString().padStart(4, '0');

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
        logToConsoleAndFile(`[cancelType = ${cancelType}] 포트 타입 없음`, "red");
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
        logToConsoleAndFile(`[cancelType = ${cancelType}] 작업지시가 생겨서 ACS에 전달되기 전에 취소요청이 들어온 경우`, "green");
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
        const linkedfacilityId = facilityInfo.type === 'in' ? workOrderInfo.fromFacilityId : workOrderInfo.toFacilityId || null;
        linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, linkedfacilityId?.toString() || '')
        if (!linkedFacilityInfo) {
          logToConsoleAndFile(`[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`, "red");
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
        const linkedfacilityId = facilityInfo.type === 'in' ? workOrderInfo.toFacilityId : workOrderInfo.fromFacilityId || null;
        linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, linkedfacilityId?.toString() || '')
        if (!linkedFacilityInfo) {
          logToConsoleAndFile(`[linkedFacilityId = ${linkedfacilityId}]  링크드 설비 정보 없음`, "red");
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
      logToConsoleAndFile(`callId is made in callCancelUtil: ${callId}`, "green");

      // 미션 결정지 있는 설비to설비에서 취소 요청 들어온 경우
      if (cancelType === 'EQP_TO_EQP_MISSION') {

        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O `, "green");
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O `,
          params: null,
          result: true,
        });

        // 공급포트인지 회수포트인지 확인
        if (facilityInfo.type === 'in') {

          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`, "green");
          // 작업지시 생성 되어있으니 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);

        } else if (facilityInfo.type === 'out') {

          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 회수포트 - 이 로직으로 들어올수 없음`, "red");
          // 작업지시 생성 되어있으니 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller);

        } else {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_MISSION - 설비to설비 미션O - 포트 타입 없음`, "red");
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
        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X `, "green");
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X `,
          params: null,
          result: true,
        });
        if (facilityInfo.type === 'in') {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`, "green");
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);
        } else if (facilityInfo.type === 'out') {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 회수포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`, "green");
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);

        } else {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_EQP_NO_MISSION - 설비to설비 미션X - 포트 타입 없음`, "red");
        }


        // 설비to창고에서 취소 요청 들어온 경우
      } else if (cancelType === 'EQP_TO_WMS') {

        logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 `, "green");
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 `,
          params: null,
          result: true,
        });

        if (facilityInfo.type === 'in') {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 공급포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`, "green");
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedFacilityInfo?.serial || undefined);

        } else if (facilityInfo.type === 'out') {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 회수포트 - 작업지시 생성 여부 확인 - 작업지시 생성 됨`, "green");
          // 작업지시 생성 되어있으면 ACS에 취소 요청 전달
          await cancelWorkOrderToAcs(callId, cancelType, isCaller);


        } else {
          logToConsoleAndFile(`[cancelType = ${cancelType}] EQP_TO_WMS - 설비to창고 - 포트 타입 없음`, "red");
        }

      } else {
        logToConsoleAndFile(`[cancelType = ${cancelType}] Invalid cancel type`, "red");
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `[cancelType = ${cancelType}] Invalid cancel type`,
          params: null,
          result: false,
        });
        return;
      }

    } catch (error) {
      console.error("Error in callRemove:", error);
    }
  };
  return { callCancel, processCancelResponseFromAcs, handleWmsCallCancelRejection };
};