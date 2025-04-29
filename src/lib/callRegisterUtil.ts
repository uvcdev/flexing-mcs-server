/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { WorkOrderAttributesDeep, WorkOrderUpdateByCodeParams } from 'models/operation/workOrder';
import Facility, { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import Amr from 'models/common/amr';
import { calculateDurationInSeconds } from './dateUtil';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { formatToDateCode } from "./usefullToolUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { CallInfoForWms } from "./process/wmsCallInfo";
import { useWorkOrderUtil, McsWorkOrderRequestType } from "./workOrderUtil";
import { initTrackingLogRedis } from "./process/trackingLog";
import { InfoBranchCallAttributes } from "./wms/mqtt/branch";
export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  NODE_ID: string;
};

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
};

export const useCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callRegister = async (targetTagInfo: TagValue) => {
    if (targetTagInfo.value !== true) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `Error reading value from kepServerUtil.readTagsValue`,
      });
      return;
    }

    // ##### 1. EQP-EQP 통신으로 인한 작업 생성
    const targetKey = targetTagInfo.TAGGROUP
      ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
    // 필요한 태그 값들 가져오기
    // TODO: call_type 01~10 들어오는 값 확인 후 가공 필요
    const callResponse = opcuaUtil.tagMap.get(`${targetKey}.Call_Response`);
    const callType01 = opcuaUtil.tagMap.get(`${targetKey}.Call_Type_01`);
    const callPriority = opcuaUtil.tagMap.get(`${targetKey}.Call_Priority`);
    const callCount = opcuaUtil.tagMap.get(`${targetKey}.Call_Count`);
    const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
    const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
    // TODO: 멀티콜 로직 추가 필요
    // const callRequestMulti1 = opcuaUtil.tagMap.get(`${targetKey}.Call_Request_Multi_1`);
    // const callRequestMulti2 = opcuaUtil.tagMap.get(`${targetKey}.Call_Request_Multi_2`);

    // 필요한 모든 nodeId들을 배열로 모음
    const needNodeIds = [
      callResponse?.NODE_ID,
      callType01?.NODE_ID,
      callPriority?.NODE_ID,
      callCount?.NODE_ID,
      EQCode01?.NODE_ID,
      EQCode02?.NODE_ID
      // callRequestMulti1?.NODE_ID,
      // callRequestMulti2?.NODE_ID
    ].filter((nodeId): nodeId is string => nodeId !== undefined);
    console.log('needNodeIds123', needNodeIds)
    const readDatas = await kepServerUtil.readTagsValue(needNodeIds);
    console.log("🚀 ~ testRegWorkOrder ~ readDatas:", readDatas)

    const needKeys = [
      callResponse?.TAG_NAME,
      callType01?.TAG_NAME,
      callPriority?.TAG_NAME,
      callCount?.TAG_NAME,
      EQCode01?.TAG_NAME,
      EQCode02?.TAG_NAME,
      // callRequestMulti1?.TAG_NAME,
      // callRequestMulti2?.TAG_NAME
    ].filter((tagName): tagName is string => tagName !== undefined);

    for (let i = 0; i < needKeys.length; i++) {
      kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
    }

    const callType01Value = callType01?.value.toString() || "0";
    const callPriorityValue = callPriority?.value.toString() || "0";
    const callCountPrevValue = callCount?.prevValue.toString() || "0";
    const callCountValue = callCount?.value.toString() || "0";
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

    // TODO: 멀티콜 로직 추가시 값 제거 (현재는 단일콜)
    const multiValue = 1
    // const multiValue = determineMultiValue(callRequestMulti1Value, callRequestMulti2Value);



    // ##### 2. EQP-WMS 통신으로 인한 작업 생성
    const eqpCallId = await createEQPCallId(targetKey, callCountValue, multiValue);
    const eqpWcsInfo: EQP_WCS[] = eqpCallId?.map((callId) => ({
      EQP_ID: callId.toString().substring(0, 4),  // 앞의 4자리
      EQP_CALL_ID: parseInt(callId.toString().slice(-4), 10).toString(),  // 뒤뒤의 4자리
      CALL_ID: callId // 작업지시코드
    })) || [];

    // TODO: 로그 저장
    console.log("🚀 ~ consteqpWcsInfo:EQP_WCS[]=eqpCallId?.map ~ eqpWcsInfo:", eqpWcsInfo)

    const callInfoList: EqpCallStats[] = eqpWcsInfo.map((info) => ({
      EQP_CALL_ID: info.EQP_CALL_ID,
      CALL_ID: info.CALL_ID,
      Call_Type: 'N0961',
      Caller: info.EQP_ID,
      Call_Quantity: 1,
      Call_Priority: callPriorityValue === 'true' ? '99' : '1',
      NODE_ID: callResponse?.NODE_ID || '',
      DATA_TYPE: targetTagInfo.DATA_TYPE
    }));

    for (const callInfo of callInfoList) {
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, callInfo.Caller || '')
      const callInfoString = JSON.stringify(callInfo);
      // init TrackingLog 
      await initTrackingLogRedis(callInfo)

      // 미션결정지 여부 판단
      if (facilityInfo?.isMissionOrderCapable) {
        // 설비 - 설비 로직
        // useWorkOrderUtil().createMissionWorkOrder()
        // await redisUtil.hset(RedisKeys.InfoAckOutCallByCallId, callInfo.EQP_CALL_ID, callInfoString);
        // 설비 - 창고 로직
      } else {
        // todo: 설비 - 설비 로직

        // 설비 - 창고 로직
        if (facilityInfo?.type === 'in') {
          await redisUtil.hset(RedisKeys.InfoInCallByCallId, callInfo.CALL_ID, callInfoString);
          await redisUtil.hset(RedisKeys.InfoInCallByNodeId, callInfo.NODE_ID, callInfoString);
        } else {
          await redisUtil.hset(RedisKeys.InfoOutCallByCallId, callInfo.CALL_ID, callInfoString);
          await redisUtil.hset(RedisKeys.InfoInCallByNodeId, callInfo.NODE_ID, callInfoString);
        }
        // TODO: call_info redis 삭제 시점 확인 필요
      }
    }

    // ##### 3. 도착지와 통신 없이 바로 작업 생성

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
    try {
      // 설비코드 1 + 설비코드 2 + 콜 ID 시간1(년도) + 콜 ID시간2(월,일) + 콜ID(0~9999)
      const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
      const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
      const callTimeYear = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_Year`);
      const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_MonthDay`);

      // 필요한 모든 nodeId들을 배열로 모음
      const needNodeIds = [
        EQCode01?.NODE_ID,
        EQCode02?.NODE_ID,
        callTimeYear?.NODE_ID,
        callTimeMonthDay?.NODE_ID,
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [
        EQCode01?.TAG_NAME,
        EQCode02?.TAG_NAME,
        callTimeYear?.TAG_NAME,
        callTimeMonthDay?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }


      const EQCode01Value = EQCode01?.value.toString() || "0";
      const EQCode02Value = EQCode02?.value.toString() || "0";
      const callTimeYearValue = callTimeYear?.value.toString() || "0";
      const callTimeMonthDayValue = callTimeMonthDay?.value.toString() || "0";

      // callTimeMonthDay 값을 4자릿수로 변환
      const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString()
      const callCountValueStr = callCountValue.toString().padStart(4, '0');

      const result = [];
      for (let i = 0; i < multiValue; i++) {
        const callId = EQCode01Value + EQCode02Value + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
        result.push(callId);
      }

      return result;
    } catch (error) {
      console.error("Error creating EQP Call ID:", error);
      return null;
    }
  };
  const checkCallSave = async () => {
    // TODO: 동일 EQP ID에 존재하는 레거시 콜들 전부 삭제
    // CallCancel();

    // call_request 켜 있으면 call_response write
    const writeAckInfos = async (list: TagValue[] | null) => {
      if (!list) return;

      for (const info of list) {
        await kepServerUtil.writeTagsValue([
          {
            nodeId: info.NODE_ID,
            attributeId: AttributeIds.Value,
            value: {
              value: {
                dataType: info.DATA_TYPE,
                value: true,
              },
            },
          },
        ]);
        redisUtil.hdel(RedisKeys.InfoInCallByNodeId, info.NODE_ID);
        redisUtil.hdel(RedisKeys.InfoOutCallByNodeId, info.NODE_ID);
      }
    };

    const [infoAckInList, infoAckOutList] = await Promise.all([

      redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoInCallByNodeId),
      redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoOutCallByNodeId)
    ]);

    await writeAckInfos(infoAckInList);
    await writeAckInfos(infoAckOutList);
  };
  return { callRegister, checkCallSave };
};