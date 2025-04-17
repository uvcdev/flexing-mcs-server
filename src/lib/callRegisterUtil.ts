/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { WorkOrderAttributesDeep, WorkOrderUpdateByCodeParams } from 'models/operation/workOrder';
import { MqttTopics, sendMqtt } from './mqttUtil';
import Facility, { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import Amr from 'models/common/amr';
import { calculateDurationInSeconds } from './dateUtil';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { CallInfoForWms } from "./process/wmsCallInfo";
// export type WorkOrderStats = {
//   id: number;
//   code: string;
//   system?: string;
//   serial?: string;
//   name: string;
//   totalCreated: number;
//   totalCompleted: number;
//   averageDuration: number;
//   totalDuration: number;
// };

// export type DailyWorkOrderStats = {
//   Facility: Record<number, WorkOrderStats>;
//   Amr: Record<number, WorkOrderStats>;
// };

// const dailyWorkOrderStats: DailyWorkOrderStats = {
//   Facility: {},
//   Amr: {},
// };
type McsWorkOrderRequestType = {
  TX_ID: string;
  ZONE_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  EQP_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  TAG_ID: string;
  CALL_PRIORITY: string;
  CALL_TYPE: string; // 배터리 타입 PLC 맵에서 콜타입 이라 명명
  IS_MISSION_ORDER: string; // 작업 지시의 mission order 여부
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

    const targetKey = targetTagInfo.TAGGROUP
      ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
    // 필요한 태그 값들 가져오기
    // TODO: call_type 01~10 들어오는 값 확인 후 가공 필요
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
      callType01?.NODE_ID,
      callPriority?.NODE_ID,
      callCount?.NODE_ID,
      EQCode01?.NODE_ID,
      EQCode02?.NODE_ID
      // callRequestMulti1?.NODE_ID,
      // callRequestMulti2?.NODE_ID
    ].filter((nodeId): nodeId is string => nodeId !== undefined);
    const readDatas = await kepServerUtil.readTagsValue(needNodeIds);
    console.log("🚀 ~ testRegWorkOrder ~ readDatas:", readDatas)

    const needKeys = [
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

    const eqpCallId = await createEQPCallId(targetKey, callCountValue, multiValue);
    const eqpWcsInfo: EQP_WCS[] = eqpCallId?.map((callId) => ({
      EQP_ID: callId.toString().substring(0, 4),  // 앞의 4자리
      EQP_CALL_ID: callId // 작업지시코드
    })) || [];

    // todo0: 로그 저장
    console.log("🚀 ~ consteqpWcsInfo:EQP_WCS[]=eqpCallId?.map ~ eqpWcsInfo:", eqpWcsInfo)

    // facility.isMissionOrderCapable 값에 따라 missionJob / toJob 판단


    // todo1: 미션결정지인 경우 작업지시 바로 만들고 (mcs mqtt 바로 작성)


    // todo2: 창고로 바로 가는 작업인 경우 설비로부터 수신한 CALL 정보 저장
    //        (callMatchingInfo redis에 매칭한 값들 저장)
    const callInfoList = eqpWcsInfo.map((info) => ({
      CALL_ID: parseInt(info.EQP_CALL_ID.toString().slice(-4), 10).toString(),
      EQP_CALL_ID: info.EQP_CALL_ID,
      Call_Type: 'N0961',
      Caller: info.EQP_ID,
      Call_Quantity: 1,
      Call_Priority: callPriorityValue === 'true' ? '99' : '1',
    }));

    for (const callInfo of callInfoList) {
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, callInfo.Caller || '')
      const callInfoString = JSON.stringify(callInfo);

      if (facilityInfo?.isMissionOrderCapable) {
        // missionJob 생성
        const params: McsWorkOrderRequestType =
        {
          TYPE: 'MISSION',
          CALL_ID: callInfo.CALL_ID, // 작업지시코드 뒤 4자리
          EQP_ID: callInfo.Caller,
          EQP_CALL_ID: callInfo.EQP_CALL_ID,
          PORT_ID: callInfo.Caller,
          CALL_PRIORITY: callInfo.Call_Priority,
          CALL_TYPE: callInfo.Call_Type,
          IS_MISSION_ORDER: 'true',
          TAG_ID: "",
          TX_ID: "",
          ZONE_ID: ""
        }
        console.log('params123', params)
        sendMqtt('workorder', JSON.stringify(params));
      } else {
        // toJob 생성
        if (facilityInfo?.type === 'in') {
          await redisUtil.hset(RedisKeys.InfoInCallByCallId, callInfo.EQP_CALL_ID, callInfoString);
        } else {
          await redisUtil.hset(RedisKeys.InfoOutCallByCallId, callInfo.EQP_CALL_ID, callInfoString);
        }
        // TODO: call_info redis 삭제 시점 확인 필요
      }


    }

    // eqp-eqp / eqp-wms 를 콜 발생하는 설비에 다중으로 매핑해주는 방법은 어떤지...
    // eqpWcsInfo.EQP_CALL_ID로 ACS_info_facility_by_serial 로 조회해서 컬럼 값이 설비인지 
    // 1. EQP (LOAD_PORT 11 투입) to WMS - WMS입장에서 반출   call out api
    // 2. EQP (UNLOAD_PORT 12 회수) to WMS - WMS입장에서 반입 call in api
    // 3. EQP to EQP 

    console.log(`Call request sent to WCS. TYPE: ${callType01Value}, CallID: ${callCountValue}`);
  }
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
      console.log("🚀 ~ createEQPCallId ~ EQCode01:", EQCode01)
      console.log("🚀 ~ createEQPCallId ~ EQCode02:", EQCode02)
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
      const callTimeMonthDayStr = callTimeMonthDayValue.toString().padStart(4, '0');
      const callCountValueStr = callCountValue.toString().padStart(4, '0');

      const result = [];
      for (let i = 0; i < multiValue; i++) {
        const callId = EQCode01Value + EQCode02Value + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
        result.push(callId);
      }

      console.log("🚀 ~ createEQPCallId ~ result:", result)
      return result;
    } catch (error) {
      console.error("Error creating EQP Call ID:", error);
      return null;
    }
  };
  const checkCallSave = async () => {
    // TODO: 동일 EQP ID에 존재하는 레거시 콜들 전부 삭제
    // CallCancel();

    // 시리얼 기준 설비레디스 가져와서 
    const ackInCallList = await redisUtil.hgetAllObject<CallInfoForWms>(RedisKeys.InfoAckInCallByCallId) || [];
    for (let i = 0, length = ackInCallList.length; i < length; i++) {
      const ackInCallInfo = ackInCallList[i]
    }

    const ackOutCallList = await redisUtil.hgetAllObject<CallInfoForWms>(RedisKeys.InfoAckOutCallByCallId) || [];
    for (let i = 0, length = ackOutCallList.length; i < length; i++) {
      const ackOutCallInfo = ackOutCallList[i]
    }
    // const callResponseWriteResult = await kepServerUtil.writeTagsValue([
    //   {
    //     nodeId: callResponse?.NODE_ID,
    //     attributeId: AttributeIds.Value,
    //     value: {
    //       value: {
    //         dataType: callResponse?.DATA_TYPE,
    //         value: true
    //       }
    //     }
    //   }
    // ]);

    // const CallInfoForWmsList = await redisUtil.hgetAllObject<CallInfoForWms>(RedisKeys.CallInfoForWms) || [];

    // for (let i = 0, length = CallInfoForWmsList.length; i < length; i++) {
    //   const CallInfoForWmsInfo = { ...CallInfoForWmsList[i] }
    //   const systemName = CallInfoForWmsInfo.systemName || 'WMS';

    //   delete CallInfoForWmsInfo['systemName']

    //   // sendInCallInfoForWms(CallInfoForWmsInfo, systemName)
    // }
  }
  return { callRegister, checkCallSave };
};
