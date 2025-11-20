import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import opcuaUtil from './opcuaUtil';
import { editTrackingLogRedis, initTrackingLogRedis } from './process/trackingLog';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { useCallRegisterUtil } from './callRegisterUtil';
import { formatToDateCode, makeCallCount } from './usefullToolUtil';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { EQP_WCS } from './eqpCheckUtil';
import { DryrunSetting } from '../models/common/setting';
import { logging } from './logging';
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { ErrorClass } from './resUtil';
import { useCallTypeUtil } from './callTypeUtil';
export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  DATA_TYPE?: string;
  ALWAYS_CALL_COUNT?: number;
  TRIGGER_CALL_COUNT: number;
  // NODE_ID: string;
  Cargo_Type: string;
}

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
}

export const useMultiCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const multiCallRegister = async () => {
    try {
      const multiCallRegisterList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoMultiCallRequestOnBySerial);
      if (!multiCallRegisterList) return;

      for (let i = 0, length = multiCallRegisterList.length; i < length; i++) {
        const targetTagInfo = multiCallRegisterList[i];
        const targetCode = targetTagInfo.EQ_CODE;
        if (!targetCode) continue; // 코드 없으면 처리 불가

        const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
          RedisKeys.InfoFacilityBySerial,
          targetCode
        );

        if (facilityInfo?.mode === 'manual') {
          continue;
        }

        const targetKey = targetTagInfo.TAGGROUP
          ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
          : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
        // 필요한 태그 값들 가져오기

        await kepServerUtil.updateTagMapValues(targetKey, targetCode, [
          'Call_Count',
          'Call_Priority',
          'Call_Request_Multi_1',
          'Call_Request_Multi_2',
        ]);

        const callCountValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`)?.value as number;
        const callPriorityValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`)?.value as string;
        const multiCallFirstValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_1`)?.value as boolean;
        const multiCallSecondValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_2`)?.value as boolean;
        const callType = await makeCallType(targetCode);

        // // remainCall doesn't need multiCallRegister again
        // let nextCallInfo = false;
        // let sameCount = 0
        // const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
        // if (remainCallList) {
        //   for (let i = 0; i < remainCallList.length; i++) {
        //     const remainCallInfo = remainCallList[i].callId
        //     const remainCallIdSub = remainCallInfo?.substring(0, 4)
        //     nextCallInfo = true;
        //     if (targetCode === remainCallIdSub) {
        //       sameCount++
        //     }
        //   }
        //   if ((multiCallFirstValue === true && multiCallSecondValue === false && sameCount > 3) ||
        //     (multiCallFirstValue === true && multiCallSecondValue === true && sameCount > 4)) {
        //     continue;
        //   }
        // }

        if (facilityInfo?.generatedCallCount) {
          let multiCallEqCode = '';
          if (targetTagInfo.TAG_NAME === 'Call_Request_Multi_1') {
            multiCallEqCode = `${targetTagInfo.EQ_CODE}_1`;
          } else if (targetTagInfo.TAG_NAME === 'Call_Request_Multi_2') {
            multiCallEqCode = `${targetTagInfo.EQ_CODE}_2`;
          }
          const callInfo: EqpCallStats = {
            EQP_CALL_ID: String(callCountValue), // 뒤의 4자리,
            CALL_ID: '', // 작업지시코드
            Call_Type: callType || 'SKID',
            Cargo_Type: callType || '',
            Caller: targetCode, // 앞의 4자리
            Call_Quantity: 1,
            Call_Priority: callPriorityValue === 'true' ? '99' : '1',
            DATA_TYPE: targetTagInfo.DATA_TYPE,
            TRIGGER_CALL_COUNT: callCountValue,
            ALWAYS_CALL_COUNT: -1,
          };

          // 작업 생성 트리거 판단
          if (facilityInfo?.isActiveCallTrigger === true) {
            const callInfoString = JSON.stringify(callInfo);
            // init TrackingLog
            await initTrackingLogRedis(callInfo);
            if (facilityInfo?.isMissionOrderCapable) {
              // ======= 미션결정 작업지시 (설비기준 회수) =======
              const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(
                targetKey,
                facilityInfo,
                targetTagInfo.reRegister
              );
              const infoPendingMissionWorkOrder: PendingWorkOrderAttributes = {
                callId: String(eqpCallId),
                fromFacilityName: callInfo.Caller,
                toFacilityName: null,
                type: 'MISSION',
                isMissionOrder: true,
                callPriority: callInfo.Call_Priority || '',
                callType: callInfo.Call_Type || 'SKID',
                cargoType: callInfo.Call_Type || '',
                portName: null,
                eqpName: callInfo.Caller,
                triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
              };

              // 작업지시 예정 레디스 저장
              redisUtil.hset(
                RedisKeys.InfoPendingWorkOrderByCallId,
                String(eqpCallId),
                JSON.stringify(infoPendingMissionWorkOrder)
              );
              // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
              await redisUtil.hdel(RedisKeys.InfoMultiCallRequestOnBySerial, multiCallEqCode);
              // 현재 설비에 대한 작업지시 개수 증가
              await useMultiCallRegisterUtil().hsetWithIncrementCount(
                RedisKeys.InfoWorkOrderCountBySerial,
                callInfo.Caller
              );
              await kepServerUtil.writeSimpleTagValue({
                targetFacility: callInfo.Caller,
                tagName: 'Call_Response',
                value: true,
              });
              await useCallTypeUtil().callTypeResponse(callInfo.Caller);
              await kepServerUtil.writeSimpleTagValue({
                targetFacility: callInfo.Caller,
                tagName: 'Call_Response_Count',
                value: callCountValue.toString(),
              });
              const trackingLogSubject = 'CALL_RESPONSE';
              const trackingLogDetail = 'CALL_RESPONSE';
              const trackingLogState = 'PROCESSING';
              const trackingLogUpdateMissionData: TrackingLogRedisUpdateParams = {
                callId: infoPendingMissionWorkOrder?.callId,
                subject: trackingLogSubject,
                detail: trackingLogDetail,
                state: trackingLogState,
                startFacility: null,
                transferId: null,
                destFacility: null,
                assignedRobot: null,
                value: null,
                description: `Call ID ${infoPendingMissionWorkOrder?.callId} responsed`,
              };
              await editTrackingLogRedis(trackingLogUpdateMissionData, undefined, 'SUCCESS', callInfo.Caller);
            } else {
              // ======= to 작업지시 =======
              if (facilityInfo?.linkedEqpIds && facilityInfo?.linkedEqpIds.length > 0) {
                // 설비 - 설비로직
                for (let i = 0; i < facilityInfo.linkedEqpIds.length; i++) {
                  const linkedEqpId = facilityInfo.linkedEqpIds[i];
                  const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                    RedisKeys.InfoFacilityById,
                    linkedEqpId.toString() || ''
                  );

                  if (!linkedFacilityInfo?.serial) {
                    continue;
                  }
                  const linkedTargetKey = kepServerUtil.getTargetKey(linkedFacilityInfo?.serial || '');
                  await kepServerUtil.updateTagMapValues(linkedTargetKey, linkedFacilityInfo?.serial || '', [
                    'Call_Request',
                    'Call_Response',
                    'Call_Count',
                  ]);

                  const linkedFacilityCallRequestValue = opcuaUtil.tagMap.get(
                    `${linkedFacilityInfo?.serial}.Call_Request`
                  )?.value as boolean;
                  const linkedFacilityCallResponseValue = opcuaUtil.tagMap.get(
                    `${linkedFacilityInfo?.serial}.Call_Response`
                  )?.value as boolean;
                  const linkedFacilityCallCountValue = opcuaUtil.tagMap.get(`${linkedFacilityInfo?.serial}.Call_Count`)
                    ?.value as number;
                  const linkedFacilityCallTypeValue = await makeCallType(linkedFacilityInfo?.serial?.toString());

                  const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(
                    targetKey,
                    facilityInfo,
                    targetTagInfo.reRegister
                  );
                  const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                    callId: String(eqpCallId),
                    eqpName: callInfo.Caller,
                    portName: linkedFacilityInfo?.serial,
                    type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                    isMissionOrder: false,
                    callPriority: callInfo.Call_Priority,
                    callType: callInfo.Call_Type || 'SKID',
                    cargoType: callInfo.Call_Type || '',
                    fromFacilityName:
                      (facilityInfo?.type === 'in' ? linkedFacilityInfo?.serial : callInfo.Caller) || '',
                    toFacilityName: facilityInfo?.type === 'in' ? callInfo.Caller : linkedFacilityInfo?.serial,
                    alwaysCallCount: Number(linkedFacilityCallCountValue),
                    triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                  };

                  // 반대쪽에 콜 요청 떠 있고 콜 응답 내려가 있는 경우 작업 생성
                  if (
                    linkedFacilityInfo &&
                    linkedFacilityCallRequestValue === true &&
                    linkedFacilityCallResponseValue === false &&
                    linkedFacilityCallTypeValue === callType
                  ) {
                    // 작업지시 예정 레디스 저장
                    redisUtil.hset(
                      RedisKeys.InfoPendingWorkOrderByCallId,
                      callInfo.CALL_ID,
                      JSON.stringify(infoPendingWorkOrder)
                    );
                    // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                    await redisUtil.hdel(RedisKeys.InfoMultiCallRequestOnBySerial, multiCallEqCode);
                    // 작업지시 개수 증가
                    await useMultiCallRegisterUtil().hsetWithIncrementCount(
                      RedisKeys.InfoWorkOrderCountBySerial,
                      targetTagInfo.EQ_CODE
                    );
                    // 콜 기준 설비 call_response 작성
                    await useKepServerUtil().writeSimpleTagValue({
                      targetFacility: facilityInfo.serial || '',
                      tagName: 'Call_Response',
                      value: true,
                    });
                    await useCallTypeUtil().callTypeResponse(facilityInfo.serial || '');
                    await useKepServerUtil().writeSimpleTagValue({
                      targetFacility: facilityInfo.serial || '',
                      tagName: 'Call_Response_Count',
                      value: String(infoPendingWorkOrder.triggerCallCount),
                    });

                    const trackingLogSubject = 'CALL_RESPONSE';
                    const trackingLogDetail = 'CALL_RESPONSE';
                    const trackingLogState = 'PROCESSING';
                    const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
                      callId: callInfo.CALL_ID,
                      subject: trackingLogSubject,
                      detail: trackingLogDetail,
                      state: trackingLogState,
                      startFacility: callInfo.Caller,
                      transferId: null,
                      destFacility: linkedFacilityInfo?.serial,
                      assignedRobot: null,
                      value: null,
                      description: `Call ID ${callInfo.CALL_ID} responsed`,
                    };
                    await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', callInfo.Caller);

                    // call_response 작성
                    await useKepServerUtil().writeSimpleTagValue({
                      targetFacility: linkedFacilityInfo.serial || '',
                      tagName: 'Call_Response',
                      value: true,
                    });
                    await useCallTypeUtil().callTypeResponse(linkedFacilityInfo.serial || '');
                    await useKepServerUtil().writeSimpleTagValue({
                      targetFacility: linkedFacilityInfo.serial || '',
                      tagName: 'Call_Response_Count',
                      value: String(infoPendingWorkOrder.alwaysCallCount),
                    });

                    const trackingLogUpdateResData: TrackingLogRedisUpdateParams = {
                      callId: String(eqpCallId),
                      subject: trackingLogSubject,
                      detail: trackingLogDetail,
                      state: trackingLogState,
                      startFacility: linkedFacilityInfo?.serial,
                      transferId: null,
                      destFacility: callInfo.Caller,
                      assignedRobot: null,
                      value: null,
                      description: `Call ID ${callInfo.CALL_ID} responsed`,
                    };
                    await editTrackingLogRedis(
                      trackingLogUpdateResData,
                      undefined,
                      'SUCCESS',
                      linkedFacilityInfo?.serial?.toString()
                    );
                    break;
                  }
                  // 250916 remove remain
                  // else if (
                  //   ((linkedFacilityInfo && linkedFacilityCallRequestValue === false) ||
                  //     (linkedFacilityInfo &&
                  //       linkedFacilityCallRequestValue === true &&
                  //       linkedFacilityCallResponseValue === true)) &&
                  //   linkedFacilityCallTypeValue === callType
                  // ) {
                  //   // 반대쪽에 콜이 떠 있지 않은 경우와
                  //   // 반대쪽에 작업중인 경우 (Call_Request, Call_Response 켜져 있는 경우)
                  //   // 반복해서 판단하는 redis에 저장
                  //   redisUtil.hset(
                  //     RedisKeys.InfoRemainCallById,
                  //     String(eqpCallId),
                  //     JSON.stringify({
                  //       ...infoPendingWorkOrder,
                  //       // fromFacilityName: facilityInfo.serial,
                  //       // toFacilityName: linkedFacilityInfo.serial,
                  //     })
                  //   );
                  //   // 반대 콜에 대한 판단을 지속적으로 하기 때문에 더이상 callRegister 판단 필요 없음
                  //   await redisUtil.hdel(RedisKeys.InfoMultiCallRequestOnBySerial, multiCallEqCode);
                  // }
                  /////////// 250916
                }

                console.log(`Call request sent to EQP from EQP. TYPE: ${callType}, CallID: ${callCountValue}`);
                // } else if (facilityInfo?.linkedWmsIds) {
              } else {
                // 설비 - 창고 로직
                // 설비 테이블에 어떤 창고와 통신을 해야한다는 창고를 등록하고
                const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(
                  targetKey,
                  facilityInfo,
                  targetTagInfo.reRegister
                );
                if (facilityInfo?.type === 'in') {
                  await redisUtil.hset(RedisKeys.InfoInCallByCallId, String(eqpCallId), callInfoString);
                } else {
                  await redisUtil.hset(RedisKeys.InfoOutCallByCallId, String(eqpCallId), callInfoString);
                }
              }
              // else {
              //   // todo: 도착지와 통신 없이 바로 작업 생성
              // }
            }
          } else if (facilityInfo?.isActiveCallTrigger === false) {
            // todo: 창고 to 창고 작업지시
            console.log(`Call request sent to WCS. TYPE: ${callType}, CallID: ${callCountValue}`);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  };
  // callRequestMulti1Value와 callRequestMulti2Value의 값을 기반으로 multiValue 결정
  const hsetWithIncrementCount = async (key: string, field: string): Promise<void> => {
    const existing = await redisUtil.hget(key, field);
    const newCount = Math.min((Number(existing) || 0) + 1, 3); // 최대 3까지만 증가
    await redisUtil.hset(key, field, String(newCount));
  };
  const hsetWithDecrementCount = async (key: string, field: string): Promise<void> => {
    const existing = await redisUtil.hget(key, field);
    const newCount = Math.max(Number(existing) - 1, 0);
    await redisUtil.hset(key, field, String(newCount));
  };
  const createMultiWorkOrderCode = async (
    targetKey: string,
    facilityInfo: FacilityAttributesDeep,
    reRegister: string
  ): Promise<string | null> => {
    try {
      const targetCode = kepServerUtil.getTagCode(targetKey);
      await kepServerUtil.updateTagMapValues(targetKey, targetCode, ['Call_Time_Year', 'Call_Time_MonthDay']);

      const callTimeYear = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_Year`);
      const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_MonthDay`);

      // 필요한 모든 nodeId들을 배열로 모음
      const needNodeIds = [callTimeYear?.NODE_ID, callTimeMonthDay?.NODE_ID].filter(
        (nodeId): nodeId is string => nodeId !== undefined
      );

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [callTimeYear?.TAG_NAME, callTimeMonthDay?.TAG_NAME].filter(
        (tagName): tagName is string => tagName !== undefined
      );

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }

      const callTimeYearValue = callTimeYear?.value.toString() || '0';
      const callTimeMonthDayValue = callTimeMonthDay?.value.toString() || '0';
      // callTimeMonthDay 값을 4자릿수로 변환
      const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString();
      const facilityYearMonthDayValue = targetCode + callTimeYearValue + callTimeMonthDayStr;
      const callCountValueStr = await makeCallCount(facilityInfo);

      const result = facilityYearMonthDayValue + callCountValueStr;
      // let result = `_M${callCountValueStr}`;

      // if (reRegister === '_R') {
      //   // ACS로부터 취소돼서 MCS가 자동으로 만드는 작업
      //   // 작업지시 코드로 조회해서 있으면 숫자만큼 뒤에 붙이기
      //   const lastWorkOrder = await workOrderDao.selectListCount({ code: result });
      //   if (!lastWorkOrder) {
      //     const errorMessage = `code: ${result} 작업지시를 찾을 수 없습니다.`;
      //     logging.ACTION_ERROR({
      //       filename: 'callRegisterUtil.ts.createEQPCallId',
      //       error: errorMessage,
      //       params: null,
      //       result: false,
      //     });
      //     const err = new ErrorClass(responseCode.BAD_REQUEST_NODATA, errorMessage);
      //     return new Promise((resolve, reject) => {
      //       reject(err);
      //     });
      //   }
      //   const workOrderCodeIndex = lastWorkOrder.count;
      //   result = `${result}_R${workOrderCodeIndex}`;
      // }
      // const result = [];
      // for (let i = 0; i < multiValue; i++) {
      //   const callId = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
      //   result.push(callId);
      // }
      // const result = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr;
      return result;
    } catch (error) {
      console.error('Error creating EQP Call ID:', error);
      return null;
    }
  };
  return { multiCallRegister, hsetWithIncrementCount, hsetWithDecrementCount };
};
