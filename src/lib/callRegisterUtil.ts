/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { formatToDateCode } from "./usefullToolUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { initTrackingLogRedis } from "./process/trackingLog";
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

export const useCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callRegister = async (targetTagInfo: TagValue) => {

    // ##### 1. EQP-EQP 통신으로 인한 작업 생성
    // targetKey 형식: STACK01.SC11 || SC.11
    const lastNodeNameIndex = targetTagInfo.NODE_ID.lastIndexOf('.')
    const nodeName = targetTagInfo.NODE_ID.substring(0, lastNodeNameIndex);
    const targetKey = targetTagInfo.TAGGROUP
      ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
    // targetCode 형식: SC11
    const targetCode = targetTagInfo.EQ_CODE;
    // 필요한 태그 값들 가져오기    
    const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
    const callType01 = opcuaUtil.tagMap.get(`${targetCode}.Call_Type_01`);
    const callPriority = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`);
    // const EQCode01 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_01`);
    // const EQCode02 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_02`);
    // TODO: 멀티콜 로직 추가 필요
    // const callRequestMulti1 = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_1`);
    // const callRequestMulti2 = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_2`);

    // 필요한 모든 nodeId들을 배열로 모음
    const needNodeIds = [
      // EQCode01?.NODE_ID,
      // EQCode02?.NODE_ID,
      callCount?.NODE_ID,
      callType01?.NODE_ID,
      callPriority?.NODE_ID,
      // CallResponseCount?.NODE_ID,
      // callRequestMulti1?.NODE_ID,
      // callRequestMulti2?.NODE_ID,
      // callResponseMulti1?.NODE_ID,
      // callResponseMulti2?.NODE_ID
    ].filter((nodeId): nodeId is string => nodeId !== undefined);
    const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

    const needKeys = [
      // EQCode01?.TAG_NAME,
      // EQCode02?.TAG_NAME,
      callCount?.TAG_NAME,
      callType01?.TAG_NAME,
      callPriority?.TAG_NAME,
      // CallResponseCount?.TAG_NAME,
      // callRequestMulti1?.TAG_NAME,
      // callRequestMulti2?.TAG_NAME,
      // callResponseMulti1?.TAG_NAME,
      // callResponseMulti2?.TAG_NAME
    ].filter((tagName): tagName is string => tagName !== undefined);

    for (let i = 0; i < needKeys.length; i++) {
      kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
    }

    const callCountValue = callCount?.value.toString() || "0";
    const callType01Value = callType01?.value.toString() || "0";
    const callPriorityValue = callPriority?.value.toString() || "0";
    const callCountPrevValue = callCount?.prevValue.toString() || "0";
    // const callRequestMulti1Value = callRequestMulti1?.value.toString() || "0";
    // const callRequestMulti2Value = callRequestMulti2?.value.toString() || "0";


    // 유효성 검사
    if (callType01Value === "0" || callCountValue === "0") {
      // console.log(`callTypeValue가 0이거나 callCountValue가 0
      //             callType: ${callType01Value}, 
      //             callCount: ${callCountValue}
      //             `);

      // logging.SYSTEM_LOG({
      //   title: "얘네가 다 0이 아니어야 되는데 0이 들어옴.",
      //   message: `callType: ${callType01Value}, callCount: ${callCountValue}
      //             ` });

      // throw new Error(`callTypeValue가 0이거나 callCountValue가 0.
      //             callType: ${callType01Value}, 
      //             callCount: ${callCountValue}
      //             `);
    }

    // 우선순위 체크
    // callPriorityValue === "1"
    // 중복 콜 체크
    // callCountPrevValue === callCountValue
    // 다중 호출 체크
    // callRequestMulti1Value === "1"
    // callRequestMulti2Value === "1"

    // TODO: 기존에 동일한 콜이 들어와 있는지 확인 필요 (중복 콜 방지)
    // if (CallMatchingInfo.ContainsKey(callId))
    //   {
    //       LogManager.WriteLogMessage($"{DeviceID}", LogType_T.Info, $"Call already exists in CallMatchingInfo. Return. CALL ID: {callId}");
    //       return;
    //   }

    // const multiValue = determineMultiValue(callRequestMulti1Value, callRequestMulti2Value);
    const multiValue = 1
    // todo: 현재 작업중인 작업지시의 최대개수 = 멀티콜 호출 신호
    const eqpCallId = await createEQPCallId(targetKey, callCountValue, multiValue);
    console.log("🚀 ~ callRegister ~ eqpCallId:", eqpCallId)

    const eqpWcsInfo: EQP_WCS[] = eqpCallId?.map((callId) => ({
      EQP_ID: callId.toString().substring(0, 4),  // 앞의 4자리
      EQP_CALL_ID: parseInt(callId.toString().slice(-4), 10).toString(),  // 뒤의 4자리
      CALL_ID: callId // 작업지시코드
    })) || [];

    // TODO: 로그 저장
    console.log("🚀 ~ consteqpWcsInfo:EQP_WCS[]=eqpCallId?.map ~ eqpWcsInfo:", eqpWcsInfo)

    const callInfoList: EqpCallStats[] = eqpWcsInfo.map((info) => ({
      EQP_CALL_ID: info.EQP_CALL_ID,
      CALL_ID: info.CALL_ID,
      Call_Type: callType01Value,
      Caller: info.EQP_ID,
      Call_Quantity: 1,
      Call_Priority: callPriorityValue === 'true' ? '99' : '1',
      DATA_TYPE: targetTagInfo.DATA_TYPE,
    }));

    for (const callInfo of callInfoList) {
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(RedisKeys.InfoFacilityBySerial, callInfo.Caller || '')
      // 설비 시스템인 경우에만 콜 생성(셀창고는 제외하기 위함)
      console.log('facilityInfo?.system123', facilityInfo?.system)
      if (facilityInfo?.system === 'EQP') {
        const callInfoString = JSON.stringify(callInfo);
        // init TrackingLog 
        await initTrackingLogRedis(callInfo)
        // ======= 미션결정 작업지시 (설비기준 회수) =======
        if (facilityInfo?.isMissionOrderCapable) {
          const infoPendingMissionWorkOrder: PendingWorkOrderAttributes = {
            callId: callInfo.CALL_ID,
            fromFacilityName: callInfo.Caller,
            toFacilityName: null,
            type: 'MISSION',
            isMissionOrder: true,
            callPriority: callInfo.Call_Priority || '',
            callType: callInfo.Call_Type,
            portName: null,
            eqpName: callInfo.Caller
          }

          // 작업지시 예정 레디스 저장
          redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callInfo.CALL_ID, JSON.stringify(infoPendingMissionWorkOrder))
          await kepServerUtil.writeSimpleTagValue({
            targetFacility: callInfo.Caller,
            tagName: 'Call_Response',
            value: true,
          });
          await kepServerUtil.writeSimpleTagValue({
            targetFacility: callInfo.Caller,
            tagName: 'Call_Response_Count',
            value: callInfo.CALL_ID.slice(-4),
          });
        } else {
          // ======= to 작업지시 =======
          if (facilityInfo?.linkedEqpIds) {
            // 설비 - 설비로직
            for (let i = 0; i < facilityInfo.linkedEqpIds.length; i++) {
              const linkedEqpId = facilityInfo.linkedEqpIds[i]
              const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                RedisKeys.InfoFacilityById,
                linkedEqpId.toString() || ''
              );
              console.log("🚀 ~ callRegister ~ linkedFacilityInfo:", linkedFacilityInfo?.serial)
              const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
                RedisKeys.InfoPlcBySerial,
                linkedFacilityInfo?.serial?.toString() || ''
              );

              // 반대쪽에 콜이 떠 있는 경우 작업 생성 
              const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo))
              const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                callId: callInfo.CALL_ID,
                eqpName: callInfo.Caller,
                portName: linkedFacilityInfo?.serial,
                type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                isMissionOrder: false,
                callPriority: callInfo.Call_Priority,
                callType: callInfo.Call_Type
              }

              if (plcInfoToJson.Call_Request && linkedFacilityInfo) {
                // 작업지시 예정 레디스 저장
                redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callInfo.CALL_ID, JSON.stringify(infoPendingWorkOrder))

                // 콜 기준 설비 call_response 작성
                await useKepServerUtil().writeSimpleTagValue({
                  targetFacility: facilityInfo.serial || '',
                  tagName: 'Call_Response',
                  value: true,
                });
                // call_response 작성
                await useKepServerUtil().writeSimpleTagValue({
                  targetFacility: linkedFacilityInfo.serial || '',
                  tagName: 'Call_Response',
                  value: true,
                });

                break
              } else if (!plcInfoToJson.Call_Request && linkedFacilityInfo) {
                // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
                redisUtil.hset(RedisKeys.InfoRemainCallById, callInfo.CALL_ID, JSON.stringify({
                  ...infoPendingWorkOrder,
                  fromFacilityName: facilityInfo.serial,
                  toFacilityName: linkedFacilityInfo.serial
                }))
              }
            }
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
      }
    }

    // eqp-eqp / eqp-wms 를 콜 발생하는 설비에 다중으로 매핑해주는 방법은 어떤지...
    // eqpWcsInfo.EQP_CALL_ID로 ACS_info_facility_by_serial 로 조회해서 컬럼 값이 설비인지 


    console.log(`Call request sent to WCS. TYPE: ${callType01Value}, CallID: ${callCountValue}`);
  };
  // callRequestMulti1Value와 callRequestMulti2Value의 값을 기반으로 multiValue 결정
  const determineMultiValue = (callRequestMulti1Value: string, callRequestMulti2Value: string): number => {
    if (callRequestMulti1Value === "true" && callRequestMulti2Value === "true") {
      return 3;
    } else if (callRequestMulti1Value === "true") {
      return 2;
    } else {
      return 1;
    }
  };
  const createEQPCallId = async (targetKey: string, callCountValue: string, multiValue: number): Promise<string[] | null> => {
    // targetKey 형식: STACK01.SC11 || SC.11
    // targetCode 형식: SC11
    const targetCode = kepServerUtil.getTagCode(targetKey);

    try {
      // 설비코드 1 + 설비코드 2 + 콜 ID 시간1(년도) + 콜 ID시간2(월,일) + 콜ID(0~9999)
      // const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
      // const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
      // const callTimeYear = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_Year`);
      // const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_MonthDay`);

      // const EQCode01 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_01`);
      // const EQCode02 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_02`);
      const callTimeYear = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_Year`);
      const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_MonthDay`);


      // 필요한 모든 nodeId들을 배열로 모음
      const needNodeIds = [
        // EQCode01?.NODE_ID,
        // EQCode02?.NODE_ID,
        callTimeYear?.NODE_ID,
        callTimeMonthDay?.NODE_ID,
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [
        // EQCode01?.TAG_NAME,
        // EQCode02?.TAG_NAME,
        callTimeYear?.TAG_NAME,
        callTimeMonthDay?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }


      // const EQCode01Value = EQCode01?.value.toString() || "0";
      // const EQCode02Value = EQCode02?.value.toString() || "0";
      const callTimeYearValue = callTimeYear?.value.toString() || "0";
      const callTimeMonthDayValue = callTimeMonthDay?.value.toString() || "0";

      // callTimeMonthDay 값을 4자릿수로 변환
      const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString()
      const callCountValueStr = callCountValue.toString().padStart(4, '0');

      const result = [];
      for (let i = 0; i < multiValue; i++) {
        const callId = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
        result.push(callId);
      }

      return result;
    } catch (error) {
      console.error("Error creating EQP Call ID:", error);
      return null;
    }
  };
  const checkRemainEqpCall = async () => {
    const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
    if (remainCallList) {
      for (const remainCall of remainCallList) {
        const reqCallInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoPlcBySerial,
          remainCall?.fromFacilityName?.toString() || ''
        );
        const resCallInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoPlcBySerial,
          remainCall?.toFacilityName?.toString() || ''
        );

        const reqCallInfoJson = JSON.parse(JSON.stringify(reqCallInfo))
        const resCallInfoJson = JSON.parse(JSON.stringify(resCallInfo))

        if (reqCallInfoJson.Call_Request && resCallInfoJson.Call_Request) {
          // 콜 기준 설비 call_response 작성
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: remainCall.fromFacilityName || '',
            tagName: 'Call_Response',
            value: true,
          });
          // call_response 작성
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: remainCall.toFacilityName || '',
            tagName: 'Call_Response',
            value: true,
          });
          redisUtil.hdel(RedisKeys.InfoRemainCallById, remainCall.callId || '');
        }
      }
    }
  };
  return { callRegister, checkRemainEqpCall };
};