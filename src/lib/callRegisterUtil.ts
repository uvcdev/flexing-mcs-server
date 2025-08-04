import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { useMultiCallRegisterUtil } from './multiCallRegisterUtil';
import { logging } from './logging';
import opcuaUtil from './opcuaUtil';
import { EQP_WCS } from './eqpCheckUtil';
import { formatToDateCode, makeCallCount } from './usefullToolUtil';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { editTrackingLogRedis, initTrackingLogRedis } from './process/trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { DryrunSetting } from '../models/common/setting';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { ErrorClass, responseCode } from './resUtil';

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
  TRIGGER_CALL_COUNT?: number;
  // NODE_ID: string;
}

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
}

export const useCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const callRegister = async () => {
    try {
      const callRegisterList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
      if (!callRegisterList) return;

      for (let i = 0, length = callRegisterList.length; i < length; i++) {
        const targetTagInfo = callRegisterList[i];
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
        const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
        const callPriority = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`);
        const callType = await makeCallType(targetCode);

        // 필요한 모든 nodeId들을 배열로 모음
        const needNodeIds = [callCount?.NODE_ID, callPriority?.NODE_ID].filter(
          (nodeId): nodeId is string => nodeId !== undefined
        );
        const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

        const needKeys = [callCount?.TAG_NAME, callPriority?.TAG_NAME].filter(
          (tagName): tagName is string => tagName !== undefined
        );

        for (let i = 0; i < needKeys.length; i++) {
          kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
        }

        // setting 에서 설비기준 dryrun 인 경우
        // const dryrunSetting = await redisUtil.hgetObject<DryrunSetting>(
        //   RedisKeys.Setting,
        //   RedisSettingKeys.DryrunSetting
        // );
        // if (!dryrunSetting) {
        //   logging.ACTION_DEBUG({
        //     filename: 'index.ts',
        //     error: 'redis에 dryrunSetting 데이터가 없습니다.',
        //     params: null,
        //     result: false,
        //   });
        //   break;
        // }
        // const dryrunMode = dryrunSetting.data.mode || 'normal';

        const callCountValue = Number(callCount?.value) || 0;
        const callPriorityValue = callPriority?.value.toString() || '0';

        // 유효성 검사 필요할 수도
        if (facilityInfo?.generatedCallCount) {
          let eqpCallId = await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister);
          console.log('🚀 ~ callRegister ~ eqpCallId:', eqpCallId);
          if (eqpCallId) {
            const eqpWcsInfo: EQP_WCS = {
              EQP_ID: eqpCallId.toString().substring(0, 4), // 앞의 4자리
              EQP_CALL_ID: parseInt(eqpCallId.toString().slice(-4), 10).toString(), // 뒤의 4자리
              CALL_ID: eqpCallId, // 작업지시코드
            };

            const callInfo: EqpCallStats = {
              EQP_CALL_ID: eqpWcsInfo.EQP_CALL_ID,
              CALL_ID: eqpWcsInfo.CALL_ID,
              Call_Type: callType || 'NC11',
              Caller: eqpWcsInfo.EQP_ID,
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
                const infoPendingMissionWorkOrder: PendingWorkOrderAttributes = {
                  callId: callInfo.CALL_ID,
                  fromFacilityName: callInfo.Caller,
                  toFacilityName: null,
                  type: 'MISSION',
                  isMissionOrder: true,
                  callPriority: callInfo.Call_Priority || '',
                  callType: callInfo.Call_Type || 'NC11',
                  portName: null,
                  eqpName: callInfo.Caller,
                  triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                };
                // 작업지시 예정 레디스 저장
                redisUtil.hset(
                  RedisKeys.InfoPendingWorkOrderByCallId,
                  callInfo.CALL_ID,
                  JSON.stringify(infoPendingMissionWorkOrder)
                );
                // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetTagInfo.EQ_CODE);
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
                  // todo 250801: linkedEqp 우선순위에 따라 정렬 필요할 수 있음
                  for (let i = 0; i < facilityInfo.linkedEqpIds.length; i++) {
                    const linkedEqpId = facilityInfo.linkedEqpIds[i];
                    const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                      RedisKeys.InfoFacilityById,
                      linkedEqpId.toString() || ''
                    );
                    const linkedFacilityCallRequestValue = opcuaUtil.tagMap.get(
                      `${linkedFacilityInfo?.serial}.Call_Request`
                    )?.value;
                    const linkedFacilityCallResponseValue = opcuaUtil.tagMap.get(
                      `${linkedFacilityInfo?.serial}.Call_Response`
                    )?.value;
                    const linkedFacilityCallCountValue = opcuaUtil.tagMap.get(
                      `${linkedFacilityInfo?.serial}.Call_Count`
                    )?.value;
                    const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                      callId: callInfo.CALL_ID,
                      eqpName: callInfo.Caller,
                      portName: linkedFacilityInfo?.serial,
                      type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                      isMissionOrder: false,
                      callPriority: callInfo.Call_Priority,
                      callType: callInfo.Call_Type || 'NC11',
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
                      linkedFacilityCallResponseValue === false
                    ) {
                      // 작업지시 예정 레디스 저장
                      redisUtil.hset(
                        RedisKeys.InfoPendingWorkOrderByCallId,
                        callInfo.CALL_ID,
                        JSON.stringify(infoPendingWorkOrder)
                      );
                      // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                      await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetTagInfo.EQ_CODE);
                      // 작업지시 개수 증가
                      await useMultiCallRegisterUtil().hsetWithIncrementCount(
                        RedisKeys.InfoWorkOrderCountBySerial,
                        targetTagInfo.EQ_CODE
                      );
                      // 콜 응답 관련 데이터 쓰기
                      await useKepServerUtil().writeSimpleTagValue({
                        targetFacility: facilityInfo.serial || '',
                        tagName: 'Call_Response',
                        value: true,
                      });
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

                      // 콜 응답 관련 데이터 쓰기
                      await useKepServerUtil().writeSimpleTagValue({
                        targetFacility: linkedFacilityInfo.serial || '',
                        tagName: 'Call_Response',
                        value: true,
                      });
                      await useKepServerUtil().writeSimpleTagValue({
                        targetFacility: linkedFacilityInfo.serial || '',
                        tagName: 'Call_Response_Count',
                        value: String(infoPendingWorkOrder.alwaysCallCount),
                      });

                      const trackingLogUpdateResData: TrackingLogRedisUpdateParams = {
                        callId: callInfo.CALL_ID,
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
                    } else if (linkedFacilityInfo && linkedFacilityCallRequestValue === false) {
                      // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
                      redisUtil.hset(
                        RedisKeys.InfoRemainCallById,
                        callInfo.CALL_ID,
                        JSON.stringify({
                          ...infoPendingWorkOrder,
                          // fromFacilityName: facilityInfo.serial,
                          // toFacilityName: linkedFacilityInfo.serial,
                        })
                      );
                      // 반대 콜에 대한 판단을 지속적으로 하기 때문에 더이상 callRegister 판단 필요 없음
                      await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetTagInfo.EQ_CODE);
                    }
                  }

                  console.log(`Call request sent to EQP from EQP. TYPE: ${callType}, CallID: ${callCountValue}`);
                  // } else if (facilityInfo?.linkedWmsIds) {
                } else {
                  // 설비 - 창고 로직
                  // 설비 테이블에 어떤 창고와 통신을 해야한다는 창고를 등록하고
                  if (facilityInfo?.type === 'in') {
                    await redisUtil.hset(RedisKeys.InfoInCallByCallId, callInfo.CALL_ID, callInfoString);
                  } else {
                    await redisUtil.hset(RedisKeys.InfoOutCallByCallId, callInfo.CALL_ID, callInfoString);
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
      }
    } catch (error) {
      throw error;
    }
  };
  const createAfterResponseWorkOrder = async () => {
    try {
      // const reRegisterFacilityList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoFacilityReRegisterBySerial);
      // if (!reRegisterFacilityList) return;
      // for (const facility of reRegisterFacilityList) {
      //   const eqCode = facility.EQ_CODE;
      //   if (!eqCode) continue;
      //   const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, eqCode);
      //   if (facilityInfo?.mode === 'manual') {
      //     continue;
      //   }
      //   // Call_Request 가 켜져있으면 CallRegister 꺼져있으면 레디스만 삭제
      //   const callRequestValue = opcuaUtil.tagMap.get(`${eqCode}.Call_Request`)?.value;
      //   if (callRequestValue === true) {
      //     // await callRegister(facility);
      //   }
      //   await redisUtil.hdel(RedisKeys.InfoFacilityReRegisterBySerial, eqCode);
      //   // if (facilityInfo?.linkedEqpIds && facilityInfo?.linkedEqpIds.length > 0) {
      //   //   // 해당 설비가 linkedFacility 가 있으면 callRegister(facility) 실행
      //   //   // 콜 주체가 되는 설비인 경우로 보면 안되고
      //   //   // 해당 설비에 대한 작업이 스키드를 뜨는 작업이라면
      //   //   console.log('callRegister(facility)123', facility)
      //   //   // await callRegister(facility);
      //   // } else {
      //   //   // 해당 설비의 linkedFacility 가 없으면 단순 response 작성하고 끝
      //   //   await useKepServerUtil().writeSimpleTagValue({
      //   //     targetFacility: eqCode || '',
      //   //     tagName: 'Call_Response',
      //   //     value: true,
      //   //   });
      //   // }
      //   // await redisUtil.hdel(RedisKeys.InfoFacilityReRegisterBySerial, eqCode);
      // }
    } catch (error) {
      console.error('[callRegisterUtil.createFacilityModeWorkOrder] error :', error);
      throw error;
    }
  };
  const createFacilityModeWorkOrder = async () => {
    try {
      const manualList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoFacilityModeBySerial);
      if (!manualList) return;

      for (const facility of manualList) {
        const eqCode = facility.EQ_CODE;
        if (!eqCode) continue;

        const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, eqCode);
        const callRequestValue = opcuaUtil.tagMap.get(`${eqCode}.Call_Request`)?.value;

        if (callRequestValue === false) {
          await redisUtil.hdel(RedisKeys.InfoFacilityModeBySerial, eqCode);
        }

        if (facilityInfo?.mode === 'auto' && callRequestValue === true) {
          // await callRegister(facility);
          await redisUtil.hdel(RedisKeys.InfoFacilityModeBySerial, eqCode);
        }
      }
    } catch (error) {
      console.error('[callRegisterUtil.createFacilityModeWorkOrder] error :', error);
      throw error;
    }
  };
  const createWorkOrderCode = async (
    targetKey: string,
    facilityInfo: FacilityAttributesDeep,
    reRegister: string
  ): Promise<string | null> => {
    try {
      const targetCode = kepServerUtil.getTagCode(targetKey);
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

      // callTimeMonthDayValue, generatedCallCountValue 값을 4자릿수로 변환
      const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString();
      const facilityYearMonthDayValue = targetCode + callTimeYearValue + callTimeMonthDayStr;
      const callCountValueStr = await makeCallCount(facilityInfo, facilityYearMonthDayValue);

      const result = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr;

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
  const checkRemainEqpCall = async () => {
    const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
    if (remainCallList) {
      for (const remainCall of remainCallList) {
        // eqpName => 콜 주체 설비
        // portName => 항상 켜있는 설비
        const alwaysCallCountFacilityName = remainCall?.portName;
        const triggerCallCountFacilityName = remainCall?.eqpName;

        const alwaysCallRequestValue = opcuaUtil.tagMap.get(`${alwaysCallCountFacilityName}.Call_Request`)?.value;
        const alwaysCallResponseValue = opcuaUtil.tagMap.get(`${alwaysCallCountFacilityName}.Call_Response`)?.value;
        const alwaysCallResponseCountValue = opcuaUtil.tagMap.get(
          `${alwaysCallCountFacilityName}.Call_Response_Count`
        )?.value;
        const triggerCallRequestValue = opcuaUtil.tagMap.get(`${triggerCallCountFacilityName}.Call_Request`)?.value;
        const triggerCallResponseValue = opcuaUtil.tagMap.get(`${triggerCallCountFacilityName}.Call_Response`)?.value;
        const triggerCallResponseCountValue = opcuaUtil.tagMap.get(
          `${triggerCallCountFacilityName}.Call_Response_Count`
        )?.value;

        const infoTrackingLogByFromFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
          RedisKeys.InfoTrackingLogByFacilityCode,
          remainCall.fromFacilityName || ''
        );
        const infoTrackingLogByToFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
          RedisKeys.InfoTrackingLogByFacilityCode,
          remainCall.toFacilityName || ''
        );
        // 양쪽 설비에 콜 요청은 떠 있고 콜 응답 내려가 있는 경우 작업 생성
        if (
          alwaysCallCountFacilityName &&
          triggerCallCountFacilityName &&
          alwaysCallRequestValue === true &&
          alwaysCallResponseValue === false &&
          triggerCallRequestValue === true &&
          triggerCallResponseValue === false
        ) {
          // 콜 응답 관련 데이터 쓰기
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: alwaysCallCountFacilityName,
            tagName: 'Call_Response',
            value: true,
          });
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: alwaysCallCountFacilityName,
            tagName: 'Call_Response_Count',
            value: String(alwaysCallResponseCountValue),
          });
          const trackingLogSubject = 'CALL_RESPONSE';
          const trackingLogDetail = 'CALL_RESPONSE';
          const trackingLogState = 'PROCESSING';
          const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
            callId: infoTrackingLogByFromFacilityCode?.callId,
            subject: trackingLogSubject,
            detail: trackingLogDetail,
            state: trackingLogState,
            startFacility: null,
            transferId: null,
            destFacility: infoTrackingLogByFromFacilityCode?.destFacility,
            assignedRobot: null,
            value: infoTrackingLogByFromFacilityCode?.destFacility,
            description: `Call ID ${infoTrackingLogByFromFacilityCode?.callId} responsed`,
          };
          await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', remainCall.fromFacilityName);

          // 콜 응답 관련 데이터 쓰기
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: triggerCallCountFacilityName,
            tagName: 'Call_Response',
            value: true,
          });
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: triggerCallCountFacilityName,
            tagName: 'Call_Response_Count',
            value: String(triggerCallResponseCountValue),
          });
          const trackingLogUpdateResData: TrackingLogRedisUpdateParams = {
            callId: infoTrackingLogByToFacilityCode?.callId,
            subject: trackingLogSubject,
            detail: trackingLogDetail,
            state: trackingLogState,
            startFacility: null,
            transferId: null,
            destFacility: infoTrackingLogByToFacilityCode?.destFacility,
            assignedRobot: null,
            value: infoTrackingLogByToFacilityCode?.destFacility,
            description: `Call ID ${infoTrackingLogByToFacilityCode?.callId} responsed`,
          };
          await editTrackingLogRedis(
            trackingLogUpdateResData,
            undefined,
            'SUCCESS',
            remainCall.toFacilityName?.toString()
          );
          const infoPendingWorkOrder: PendingWorkOrderAttributes = {
            callId: remainCall.callId,
            eqpName: remainCall.eqpName,
            portName: remainCall.portName,
            type: remainCall?.type.toUpperCase() === 'IN' ? 'IN' : 'OUT',
            isMissionOrder: false,
            callPriority: remainCall.callPriority,
            callType: remainCall.callType || 'NC11',
            fromFacilityName:
              remainCall?.type.toUpperCase() === 'IN' ? remainCall.toFacilityName! : remainCall.fromFacilityName,
            toFacilityName:
              remainCall?.type.toUpperCase() === 'IN' ? remainCall.fromFacilityName : remainCall.toFacilityName,
            alwaysCallCount: remainCall.alwaysCallCount,
            triggerCallCount: remainCall.triggerCallCount,
          };
          // 작업지시 예정 레디스 저장
          redisUtil.hset(
            RedisKeys.InfoPendingWorkOrderByCallId,
            remainCall.callId || '',
            JSON.stringify(infoPendingWorkOrder)
          );
          // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
          // await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, remainCall.callId || '');
          // 작업지시 개수 증가
          await useMultiCallRegisterUtil().hsetWithIncrementCount(
            RedisKeys.InfoWorkOrderCountBySerial,
            triggerCallCountFacilityName
          );
          redisUtil.hdel(RedisKeys.InfoRemainCallById, remainCall.callId || '');
        }
      }
    }
  };
  return { callRegister, createFacilityModeWorkOrder, checkRemainEqpCall };
};
