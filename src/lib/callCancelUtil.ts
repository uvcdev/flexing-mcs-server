import { AttributeIds } from 'node-opcua-client';
import {
  PendingWorkOrderAttributes,
  RecentWorkOrderInfoByFacilitySerialAttributes,
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
import { useCallTypeUtil } from './callTypeUtil';

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

  // 취소 트래킹로그
  const writeTrackingLogForCancel = async (targetCode: string, callId: string) => {
    const trackingLogSubject = 'MISSION_CANCELED';
    const trackingLogDetail = 'MISSION_CANCELED';
    const trackingLogState = 'CANCELED';
    const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
      callId: callId,
      subject: trackingLogSubject,
      detail: trackingLogDetail,
      state: trackingLogState,
      startFacility: null,
      transferId: null,
      destFacility: null,
      assignedRobot: null,
      value: targetCode,
      description: `Call ID ${callId} cancellation successful on EQP ${targetCode}`,
      processState: 'CANCELED',
    };
    await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', targetCode);
  };
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
      if (!targetCode) {
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - initResponsePlc`,
          error: `targetCode is required`,
          params: null,
          result: false,
        });
        return;
      }
      await plcConnectUtil.writeTagValue({
        targetFacility: targetCode,
        tagInfo: [
          { tagName: 'Call_Response', value: false },
          { tagName: 'Call_Robot_Assigned', value: false },
          { tagName: 'Call_Response_Count', value: '0' },
        ],
      });
      await useCallTypeUtil().callTypeResponseReset(targetCode);
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
          // await writeCallCancelResponse(eqpId);
          // 링크드 설비 응답 plc 초기화
          if (linkedEqpId) {
            await initResponsePlc(linkedEqpId);
          }
          await writeTrackingLogForCancel(eqpId, params.CALL_ID);
        } else {
          // 링크드일 경우
          // 콜 취소 응답 쓰기(링크드)
          // if (linkedEqpId) {
          //   await writeCallCancelResponse(linkedEqpId);
          // }
          // 콜주체 설비 응답 plc 초기화
          await initResponsePlc(eqpId);
        }
        await initRecentWorkOrderListByFacilitySerial(eqpId, params.CALL_ID);
      } else if (params.CANCEL_TYPE === 'EQP_TO_EQP_MISSION') {
        // 취소 타입이 설비to설비 미션O 일 경우
        // 콜 취소 응답 쓰기
        // await writeCallCancelResponse(eqpId);
        // 링크드 설비 응답 plc 초기화
        if (linkedEqpId && facilityInfo.type === 'in') {
          await initResponsePlc(linkedEqpId);
        } else if (!linkedEqpId && params.IS_CALLER) {
          // await initResponsePlc(eqpId);
        } else {
          logging.ACTION_ERROR({
            filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
            error: `[cancelResponseType = ${cancelResponseType}] EQP_TO_EQP_MISSION - 링크드 설비 정보가 없고 콜주체가 아닌 경우`,
            params: null,
            result: false,
          });
        }
        await writeTrackingLogForCancel(eqpId, params.CALL_ID);
        // await initRecentWorkOrderListByFacilitySerial(eqpId, params.CALL_ID);
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
      // TempForCallCancelResponseReset이 있을 경우 redis 삭제
      const tempForCallCancelResponseReset = await redisUtil.hgetObject<{
        targetCode: string;
        callId: string;
        cancelType: CancelType;
      }>(RedisKeys.TempForCallCancelResponseReset, params.CALL_ID);
      if (tempForCallCancelResponseReset) {
        redisUtil.hdel(RedisKeys.TempForCallCancelResponseReset, params.CALL_ID);
        logging.ACTION_INFO({
          filename: `callCancelUtil.ts - processCancelResponseFromAcs`,
          error: `[cancelResponseType = ${cancelResponseType}] FAIL - TempForCallCancelResponseReset 삭제`,
          params: null,
          result: true,
        });
      }
    } else if (cancelResponseType === 'MISSION_ORDER') {
      // 취소 응답 타입이 MISSION_ORDER일 경우
      logToConsoleAndFile(
        `[cancelResponseType = ${cancelResponseType}] MISSION_ORDER - 취소 응답 타입이 MISSION_ORDER일 경우`,
        'green'
      );

      if (params.CANCEL_TYPE === 'EQP_TO_EQP_MISSION') {
        // 취소 타입이 설비to설비 미션O 일 경우
        // TempForCallCancelResponseReset이 있을 경우 To 작업중 설비취소인 경우, 해당 값 초기화
        const tempForCallCancelResponseReset = await redisUtil.hgetObject<{
          targetCode: string;
          callId: string;
          cancelType: CancelType;
        }>(RedisKeys.TempForCallCancelResponseReset, params.CALL_ID);
        if (tempForCallCancelResponseReset) {
          await writeCallCancelResponse(tempForCallCancelResponseReset.targetCode);
          await initRecentWorkOrderListByFacilitySerial(
            tempForCallCancelResponseReset.targetCode,
            tempForCallCancelResponseReset.callId
          );
          redisUtil.hdel(RedisKeys.TempForCallCancelResponseReset, params.CALL_ID);
        }

        await writeTrackingLogForCancel(eqpId, params.CALL_ID);
      } else if (params.CANCEL_TYPE === 'EQP_TO_WMS') {
        // 취소 타입이 설비to창고 일 경우
        // 콜 취소 응답 쓰기
        // await writeCallCancelResponse(eqpId);
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

  const findWorkOrderList = async (targetCode: string): Promise<RecentWorkOrderInfoByFacilitySerialAttributes[]> => {
    let workOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[] = [];
    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, targetCode);
    if (!facilityInfo) {
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - findWorkOrderList`,
        error: `${targetCode} 설비정보가 없습니다.`,
        params: null,
        result: true,
      });
      return [];
    }
    const isCaller = facilityInfo.isActiveCallTrigger === true;
    // 트리거 설비인 경우
    if (isCaller) {
      const recentWorkOrderListByFacilitySerial =
        await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          targetCode
        );
      if (recentWorkOrderListByFacilitySerial && recentWorkOrderListByFacilitySerial.count > 0) {
        workOrderList = recentWorkOrderListByFacilitySerial.workOrderList || [];
      }
    }
    // 링크드 설비인 경우
    // 260209 설비측 수정으로 작화에서 설비취소가 사라짐으로 인해 링크드 설비로 들어오는 경우 없음.
    else {
      // 여기로 들어올수 없기에 들어오면 에러처리해서 로그 확인
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - findWorkOrderList`,
        error: `${targetCode} 링크드 설비로 들어오는 경우 없음.`,
        params: null,
        result: true,
      });
      const CallResponseValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Response')) as boolean;
      // 콜응답이 ON이 아니라면 콜취소응답만 써줌.
      if (CallResponseValue === true) {
        // 콜응답이 ON이라면 설비 취소 로직 실행
        const isInType = facilityInfo.type === 'in';
        const recentWorkOrderListByFacilitySerialList =
          await redisUtil.hgetAllObject<RecentWorkOrderListByFacilitySerialAttributes>(
            RedisKeys.RecentWorkOrderListByFacilitySerial
          );
        if (recentWorkOrderListByFacilitySerialList && recentWorkOrderListByFacilitySerialList.length > 0) {
          for (const recentWorkOrderListByFacilitySerial of recentWorkOrderListByFacilitySerialList) {
            if (
              recentWorkOrderListByFacilitySerial.count > 0 &&
              recentWorkOrderListByFacilitySerial.facilityInfo.linkedEqpIds?.includes(facilityInfo.id)
            ) {
              for (const workOrder of recentWorkOrderListByFacilitySerial.workOrderList) {
                const trackingLog = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
                  RedisKeys.InfoTrackingLogByCallId,
                  workOrder.callId
                );
                if (!trackingLog) {
                  logging.ACTION_ERROR({
                    filename: `callCancelUtil.ts - callCancel`,
                    error: `[callCancel] ${workOrder.callId} 트래킹 로그 정보가 없습니다.`,
                    params: null,
                    result: true,
                  });
                  continue;
                }
                const linkedEqpinTracking = isInType ? trackingLog.destFacility : trackingLog.startFacility;
                if (linkedEqpinTracking !== targetCode) {
                  logging.ACTION_ERROR({
                    filename: `callCancelUtil.ts - callCancel`,
                    error: `[callCancel] ${workOrder.callId} 트래킹 로그 정보가 없습니다.`,
                    params: null,
                    result: true,
                  });
                  continue;
                }
                // 취소요청이 ON 된 링크드설비가 관련되어있는 작업지시를 찾은 상태
                // 멀티콜 이슈: 작업지시 상태에 따라 이 설비와 아직도 연관이 있는지 확인해야 함.
                if (!isInType && workOrder.state === 'toWorkOrder') {
                  continue;
                }
                workOrderList.push(workOrder);
              }
            }
          }
        }
      }
    }

    return workOrderList;
  };

  const changeWorkOrderState = async (targetCode: string, callId: string, state: string) => {
    let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      targetCode
    );
    if (workOrderListInfo) {
      for (const workOrder of workOrderListInfo.workOrderList) {
        if (workOrder.callId === callId) {
          workOrder.state = state;
          break;
        }
      }
    }
    redisUtil.hset(RedisKeys.RecentWorkOrderListByFacilitySerial, targetCode, JSON.stringify(workOrderListInfo));
  };

  const initInfoCallRequestOnBySerial = async (triggerFacilitySerial: string) => {
    redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, triggerFacilitySerial);
  };

  const initRecentWorkOrderListByFacilitySerial = async (triggerFacilitySerial: string, callId: string) => {
    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
      RedisKeys.InfoFacilityBySerial,
      triggerFacilitySerial
    );
    if (!facilityInfo) {
      logging.ACTION_ERROR({
        filename: `callCancelUtil.ts - initRecentWorkOrderListByFacilitySerial`,
        error: `${triggerFacilitySerial} 설비정보가 없습니다.`,
        params: null,
        result: true,
      });
      return;
    }

    let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      triggerFacilitySerial
    );
    if (workOrderListInfo) {
      const removeWorkOrderByCallId = (targetCallId: string) => {
        const workOrderList = workOrderListInfo?.workOrderList || [];

        // targetCallId와 같은 항목이 있는지 확인
        const hasMatchingCallId = workOrderList.some((item) => item.callId === targetCallId);

        if (hasMatchingCallId && !!workOrderListInfo?.facilitySerial && facilityInfo) {
          workOrderListInfo = {
            facilitySerial: workOrderListInfo?.facilitySerial,
            facilityInfo: facilityInfo,
            count: (workOrderListInfo?.count || 0) - 1,
            workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
          };
        }

        return workOrderListInfo;
      };

      const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
        removeWorkOrderByCallId(callId) ?? {
          facilitySerial: triggerFacilitySerial,
          facilityInfo: facilityInfo as FacilityAttributes,
          count: 0,
          workOrderList: [],
        };

      redisUtil.hset(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        triggerFacilitySerial,
        JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
      );
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
          tagInfo: [{ tagName: 'Call_Cancel_Response', value: false }],
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
      const cancelType = facilityInfo.cancelType || 'NON_CANCELLABLE';
      const isCaller = facilityInfo.isActiveCallTrigger || false;
      // NON_CANCELLABLE일 경우 해당 설비에서 들어온 취소 요청에 대해서 응답하지 않음
      // NON_CANCELLABLE 콜 Cancel Request 가 올라와 있을 것이고
      if (cancelType === 'NON_CANCELLABLE') {
        await writeCallCancelResponse(targetCode);
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

      if (cancelType === 'EQP_TO_WMS') {
        let preWorkOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
          RedisKeys.RecentWorkOrderListByFacilitySerial,
          targetCode
        );

        if (preWorkOrderListInfo && preWorkOrderListInfo.count > 0) {
          const preWorkOrderCount = preWorkOrderListInfo.count;
          const preWorkOrderList = preWorkOrderListInfo.workOrderList || [];
          const removableCmdIds: string[] = [];

          // 0. MCS가 가지고 있는 Call 정보 중 WMS에 Call_Info도 안보낸 정보 확인
          // 해당 정보는 트래킹 로그도 만들기 전 상태라서 정보 삭제만 하면 된다.
          // 고민 사항 InfoCallRequestOnBySerial 에 있는 데이터는 삭제하지 않아도 괜찮을지 ?
          const notBeforeRequestWorkOrderList =
            preWorkOrderList.filter((workOrder) => workOrder.state !== 'beforeRequest') || [];
          const notBeforeRequestWorkOrderCount = notBeforeRequestWorkOrderList.length;

          const removeBeforeRequestRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
            {
              facilitySerial: targetCode,
              facilityInfo: facilityInfo,
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
                        facilitySerial: targetCode,
                        facilityInfo: facilityInfo,
                        count: (workOrderListInfo?.count || 0) - 1,
                        workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                      };
                    }

                    return workOrderListInfo;
                  };

                  const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                    removeWorkOrderByCallId(recentCallInfoCallId) ?? {
                      facilitySerial: targetCode,
                      facilityInfo: facilityInfo,
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
              // redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
              removableCmdIds.push(cmdId);
            }
          }
          // 1-1 추가 Interval 상태에 있는 정보도 삭제 ( 삭제 해주지 않으면 해당 정보를 다시 요청하게 됨 )
          const intervalCallInfoList =
            (await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.IntervalCommandForRetryBySubjectCmdId)) || [];

          const samePlcIntervalCallInfoList = intervalCallInfoList.filter(
            (remainingCallInfo) => remainingCallInfo?.message?.body?.Caller === targetCode
          );

          if (samePlcIntervalCallInfoList && samePlcIntervalCallInfoList.length > 0) {
            for (let i = 0, length = samePlcIntervalCallInfoList.length; i < length; i++) {
              const samePlcIntervalCallInfo = samePlcIntervalCallInfoList[i];
              const cmdId = samePlcIntervalCallInfo?.message?.body?.Cmd_ID || '';
              const subjectCmdId = samePlcIntervalCallInfo.subjectCmdId;

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
                        facilitySerial: targetCode,
                        facilityInfo: facilityInfo,
                        count: (workOrderListInfo?.count || 0) - 1,
                        workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                      };
                    }

                    return workOrderListInfo;
                  };

                  const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                    removeWorkOrderByCallId(recentCallInfoCallId) ?? {
                      facilitySerial: targetCode,
                      facilityInfo: facilityInfo,
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

              redisUtil.hdel(RedisKeys.IntervalCommandForRetryBySubjectCmdId, subjectCmdId);
              // redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
              removableCmdIds.push(cmdId);
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
                        facilitySerial: targetCode,
                        facilityInfo: facilityInfo,
                        count: (workOrderListInfo?.count || 0) - 1,
                        workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                      };
                    }

                    return workOrderListInfo;
                  };

                  const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                    removeWorkOrderByCallId(recentCallInfoCallId) ?? {
                      facilitySerial: targetCode,
                      facilityInfo: facilityInfo,
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

              redisUtil.hdel(RedisKeys.AbortedCommandForRetryBySubjectCmdId, subjectCmdId);
              // redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
              removableCmdIds.push(cmdId);
            }
          }

          // 1-3. NG로 남아있는 경우 삭제
          // 1-2까지 RecentCallInfoTaskByCmdId 내용을 모두 삭제하고도 남은 cmd로 찾아내야한다.
          const recentCallInfoList =
            (await redisUtil.hgetAllObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId)) || [];

          const targetCodeRecentCallInfoList = recentCallInfoList.filter((callInfo) => callInfo.caller === targetCode);

          const remainTargetCodeRecentCallInfoList = targetCodeRecentCallInfoList.filter(
            (callInfo) => !removableCmdIds.includes(callInfo.cmdId)
          );

          if (remainTargetCodeRecentCallInfoList && remainTargetCodeRecentCallInfoList.length > 0) {
            for (let i = 0, length = remainTargetCodeRecentCallInfoList.length; i < length; i++) {
              const samePlcNgCallInfo = remainTargetCodeRecentCallInfoList[i];
              const cmdId = samePlcNgCallInfo?.cmdId || '';
              const ngCallInfoCallId = samePlcNgCallInfo?.callId || '';

              if (ngCallInfoCallId) {
                const trackingLogSubject = 'MISSION_CANCELED';
                const trackingLogDetail = 'MISSION_CANCELED';
                const trackingLogState = 'CANCELED';
                const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                  callId: ngCallInfoCallId,
                  subject: trackingLogSubject,
                  detail: trackingLogDetail,
                  state: trackingLogState,
                  startFacility: null,
                  transferId: null,
                  destFacility: null,
                  assignedRobot: null,
                  value: targetCode,
                  description: `Call ID ${ngCallInfoCallId} cancellation successful on EQP ${targetCode}`,
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
                        facilitySerial: targetCode,
                        facilityInfo: facilityInfo,
                        count: (workOrderListInfo?.count || 0) - 1,
                        workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                      };
                    }

                    return workOrderListInfo;
                  };

                  const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                    removeWorkOrderByCallId(ngCallInfoCallId) ?? {
                      facilitySerial: targetCode,
                      facilityInfo: facilityInfo,
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

              removableCmdIds.push(cmdId);
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
                        facilitySerial: targetCode,
                        facilityInfo: facilityInfo,
                        count: (workOrderListInfo?.count || 0) - 1,
                        workOrderList: workOrderList.filter((item) => item.callId !== targetCallId),
                      };
                    }

                    return workOrderListInfo;
                  };

                  const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                    removeWorkOrderByCallId(selectedCallId) ?? {
                      facilitySerial: targetCode,
                      facilityInfo: facilityInfo,
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
          if (facilityInfo?.system === 'WMS' || facilityInfo?.system === 'PRI') {
            let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              targetCode
            );

            // console.log('workOrderListInfo', workOrderListInfo);
            if (workOrderListInfo) {
              const workOrderList = workOrderListInfo?.workOrderList || [];
              let workOrderCount = workOrderListInfo?.count || 0;

              // state가 'workOrder'인 항목들만 필터링
              const filterWorkOrderList =
                workOrderList.filter(
                  (workOrder) =>
                    workOrder.state === 'workOrder' ||
                    workOrder.state === 'fromWorkOrder' ||
                    workOrder.state === 'toWorkOrder'
                ) || [];

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
          // RecentCallInfoTaskByCmdId 삭제
          const setRemovableCmdIds = new Set(removableCmdIds);

          for (const cmdId of setRemovableCmdIds) {
            redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
          }
        }
        // PLC 취소 응답 처리
        await writeCallCancelResponse(targetCode);
        await initResponsePlc(targetCode);

        return;
      }

      // 취소요청이 ON 된 설비와 관련있는 작업지시 찾기
      const workOrderList = await findWorkOrderList(targetCode);

      // 관련있는 작업지시가 없을 시 콜취소응답만 쓰고 종료
      if (workOrderList.length === 0) {
        // 260209 설비측 수정 이후 이 조건문을 타면 안됨
        // call_request가 떠있어야만 취소 요청이 들어오기 때문이다.
        // 그러므로 이 조건문으로 들어왔다는 건 call_request가 떠있지 않는 경우인데 설비취소가 눌린것이다.
        await writeCallCancelResponse(targetCode);
        logging.ACTION_ERROR({
          filename: `callCancelUtil.ts - callCancel`,
          error: `${targetCode} call_request가 떠있지 않는데 설비취소가 눌린것이다.`,
          params: null,
          result: true,
        });
        return;
      } else {
        logToConsoleAndFile(`${targetCode}에 진행 중인 작업지시 정보가 있습니다.`, 'green');
        logToConsoleAndFile(JSON.stringify(workOrderList, null, 2), 'green');
        logging.KEPWARE_LOG({
          action: 'TAG_READ',
          tag: `${targetCode}에 진행 중인 작업지시 정보`,
          value: JSON.parse(JSON.stringify(workOrderList)),
          message: `진행 중인 작업지시 정보 조회`,
        });
      }

      for (const workOrder of workOrderList) {
        const callId = workOrder.callId;
        const triggerFacilitySerial = callId.slice(0, 4);
        const workOrderState = workOrder.state;

        // ============================================================================
        // 작업지시 상태별 콜취소 처리
        // ============================================================================

        // ──────────────────────────────────────────────────────────────────────────
        // [1] beforeRequest 상태 처리
        // - Call Request 감지까지는 했지만 어떠한 요청도 하지 않은 상태
        // - beforeRequest 상태에서 취소 요청이 들어온 경우는 trigger 설비에서 온 취소요청
        // - 처리: 콜취소응답만 작성
        // ──────────────────────────────────────────────────────────────────────────
        if (workOrderState === 'beforeRequest') {
          await writeCallCancelResponse(targetCode);
          await initRecentWorkOrderListByFacilitySerial(targetCode, callId);
          // 취소 트래킹로그 함수
          await writeTrackingLogForCancel(targetCode, callId);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [2] beforeWorkOrder 상태 처리
        // - InfoCallRequestOnBySerial까지 생긴 뒤 linkedEqp 기다리는 상태
        // - 처리: 콜취소응답 작성 + beforeRequest로 상태 변경
        // ──────────────────────────────────────────────────────────────────────────
        else if (workOrderState === 'beforeWorkOrder') {
          await writeCallCancelResponse(targetCode);
          await initRecentWorkOrderListByFacilitySerial(targetCode, callId);
          await initInfoCallRequestOnBySerial(targetCode);
          await writeTrackingLogForCancel(targetCode, callId);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [3] workOrder 상태 처리
        // - workOrder 생성 후 AMR 할당 전까지 유지되는 상태
        // - 처리: 콜취소응답 작성 + 연결된 설비의 콜응답 PLC 초기화 + ACS 취소 요청
        // ──────────────────────────────────────────────────────────────────────────
        else if (workOrderState === 'workOrder') {
          let linkedEqp = '';

          // 작업지시 정보 조회
          const workOrderInfo = await workOrderDao.selectInfoByCode({ code: callId });
          if (!workOrderInfo) {
            logging.ACTION_ERROR({
              filename: `callCancelUtil.ts - callCancel`,
              error: `[callCancel] ${callId} 작업지시 정보가 없습니다.`,
              params: null,
              result: true,
            });
            continue;
          }

          // 콜취소응답 쓰기
          await writeCallCancelResponse(targetCode);

          // 콜취소설비와 연결된 설비의 콜응답 PLC 초기화
          if (facilityInfo.type === 'in') {
            // IN 타입: fromFacility 정보 조회 및 초기화
            const fromFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              workOrderInfo.fromFacilityId?.toString() || ''
            );
            await initResponsePlc(fromFacilityInfo?.serial || '');
            linkedEqp = fromFacilityInfo?.serial || '';
          } else {
            // OUT 타입: toFacility 정보 조회 및 초기화
            // 260209 설비측 수정으로 작화에서 설비취소가 사라짐으로 인해 out타입으로 들어올수 없음.
            // 260331 모비스 측 요청으로 배출취소가 들어올 수 있음.
            // 여기로 들어올수 없기에 들어오면 에러처리해서 로그 확인
            logging.ACTION_ERROR({
              filename: `callCancelUtil.ts - callCancel`,
              error: `${targetCode} 260209 설비측 수정으로 작화에서 설비취소가 사라짐으로 인해 out타입으로 들어올수 없음. 260331 모비스 측 요청으로 배출취소가 들어올 수 있음.`,
              params: null,
              result: true,
            });
            // continue;
            // const toFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
            //   RedisKeys.InfoFacilityById,
            //   workOrderInfo.toFacilityId?.toString() || ''
            // );
            // await initResponsePlc(toFacilityInfo?.serial || '');
            // linkedEqp = toFacilityInfo?.serial || '';
          }

          // ACS 작업지시 취소 요청
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, isCaller ? linkedEqp : undefined);

          // RecentWorkOrderListByFacilitySerialAttributes에서 해당 callId 제거
          await initRecentWorkOrderListByFacilitySerial(triggerFacilitySerial, callId);

          await writeTrackingLogForCancel(targetCode, callId);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [4] fromWorkOrder 상태 처리
        // - fromWorkOrder 상태에서 취소 요청이 들어온 경우
        // - 처리: ACS 취소 요청 + 콜취소응답 작성 + 연결된 설비의 콜응답 PLC 초기화
        // ──────────────────────────────────────────────────────────────────────────
        else if (workOrderState === 'fromWorkOrder') {
          let linkedEqp = '';

          // 작업지시 정보 조회
          const workOrderInfo = await workOrderDao.selectInfoByCode({ code: callId });
          if (!workOrderInfo) {
            logging.ACTION_ERROR({
              filename: `callCancelUtil.ts - callCancel`,
              error: `[callCancel] ${callId} 작업지시 정보가 없습니다.`,
              params: null,
              result: true,
            });
            continue;
          }

          // 콜취소응답 쓰기
          await writeCallCancelResponse(targetCode);
          await initRecentWorkOrderListByFacilitySerial(targetCode, callId);
          // 콜취소설비와 연결된 설비의 콜응답 PLC 초기화
          if (facilityInfo.type === 'in') {
            // IN 타입: fromFacility 정보 조회 및 초기화
            const fromFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              workOrderInfo.fromFacilityId?.toString() || ''
            );
            // await initResponsePlc(fromFacilityInfo?.serial || '');
            linkedEqp = fromFacilityInfo?.serial || '';
          } else {
            // OUT 타입: toFacility 정보 조회 및 초기화
            const toFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              workOrderInfo.toFacilityId?.toString() || ''
            );
            // await initResponsePlc(toFacilityInfo?.serial || '');
            linkedEqp = toFacilityInfo?.serial || '';
          }

          // ACS 작업지시 취소 요청
          // RecentWorkOrderListByFacilitySerialAttributes는 취소요청 응답에 따라 변경됨.
          // SUCCESS 응답이 오면 초기화.
          // FAIL 응답이 오면 도킹시작이후므로 missionState의 COMPLETED에 의해 변경됨.
          await cancelWorkOrderToAcs(callId, cancelType, isCaller, linkedEqp);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [5] toWorkOrder 상태 처리
        // - toWorkOrder 상태에서 취소 요청이 들어온 경우
        // - OUT 타입 설비의 경우 무시되어야 함( 해당 콜에 대한 관여는 끝난 상태 )
        // - IN 타입의 경우
        //  - cancelType이 EQP_TO_EQP_MISSION일 경우 취소 요청
        //  - cancelType이 EQP_TO_EQP_NO_MISSION일 경우 취소 요청 보내지 않음(무조건 공급)
        //  - cancelType이 정의되지 않은 경우 취소 요청
        // ──────────────────────────────────────────────────────────────────────────
        else if (workOrderState === 'toWorkOrder') {
          // 작업지시 정보 조회
          const workOrderInfo = await workOrderDao.selectInfoByCode({ code: callId });
          if (!workOrderInfo) {
            logging.ACTION_ERROR({
              filename: `callCancelUtil.ts - callCancel`,
              error: `[callCancel] ${callId} 작업지시 정보가 없습니다.`,
              params: null,
              result: true,
            });
            continue;
          }

          if (facilityInfo.type === 'out') {
            await writeCallCancelResponse(targetCode);
            continue;
          } else {
            if (cancelType === 'EQP_TO_EQP_MISSION') {
              // ACS 작업지시 취소 요청
              // RecentWorkOrderListByFacilitySerialAttributes는 취소요청 응답에 따라 변경됨.
              // SUCCESS 응답이 오면 초기화.
              // FAIL 응답이 오면 도킹시작이후므로 missionState의 COMPLETED에 의해 변경됨.
              await cancelWorkOrderToAcs(callId, cancelType, isCaller, undefined);
              redisUtil.hset(
                RedisKeys.TempForCallCancelResponseReset,
                callId,
                JSON.stringify({
                  targetCode: targetCode,
                  callId: callId,
                  cancelType: cancelType,
                })
              );
            } else if (cancelType === 'EQP_TO_EQP_NO_MISSION') {
              await writeCallCancelResponse(targetCode);
            } else {
              logging.ACTION_ERROR({
                filename: `callCancelUtil.ts - callCancel`,
                error: `[callCancel] ${callId} 취소 타입이 정의되지 않은 경우`,
                params: null,
                result: true,
              });
              continue;
            }
          }
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [6] missionWorkOrder 상태 처리
        // - 미션오더 상태에서 취소 요청이 들어온 경우 (예: SP12, SC12 등)
        // - 주의: missionWorkOrder 상태는 어느 설비에서도 취소 불가능
        // - 처리: 콜취소응답만 작성
        // ──────────────────────────────────────────────────────────────────────────
        else if (workOrderState === 'missionWorkOrder') {
          await writeCallCancelResponse(targetCode);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // [예외] 정의되지 않은 상태
        // ──────────────────────────────────────────────────────────────────────────
        else {
          logging.ACTION_ERROR({
            filename: `callCancelUtil.ts - callCancel`,
            error: `[callCancel] ${callId} 작업지시 상태가 없습니다.`,
            params: null,
            result: true,
          });
        }
      }
    } catch (error) {
      console.error('Error in callRemove:', error);
    }
  };
  return { callCancel, processCancelResponseFromAcs, handleWmsCallCancelRejection };
};
