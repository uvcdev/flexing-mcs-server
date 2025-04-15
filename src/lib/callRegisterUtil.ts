/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { WorkOrderAttributesDeep, WorkOrderUpdateByCodeParams } from 'models/operation/workOrder';
import { MqttTopics, sendMqtt } from './mqttUtil';
import Facility from 'models/operation/facility';
import Amr from 'models/common/amr';
import { calculateDurationInSeconds } from './dateUtil';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
export type WorkOrderStats = {
  id: number;
  code: string;
  system?: string;
  serial?: string;
  name: string;
  totalCreated: number;
  totalCompleted: number;
  averageDuration: number;
  totalDuration: number;
};

export type DailyWorkOrderStats = {
  Facility: Record<number, WorkOrderStats>;
  Amr: Record<number, WorkOrderStats>;
};

const dailyWorkOrderStats: DailyWorkOrderStats = {
  Facility: {},
  Amr: {},
};

export const useCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil()
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
      console.log(`callTypeValue가 0이거나 callCountValue가 0
                  callType: ${callType01Value}, 
                  callCount: ${callCountValue}
                  `);

      logging.SYSTEM_LOG({
        title: "얘네가 다 0이 아니어야 되는데 0이 들어옴.",
        message: `callType: ${callType01Value}, callCount: ${callCountValue}
                  ` });

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

    // TODO: 멀티콜 로직 추가시 값 제거 (현재는 단일콜)
    const multiValue = 1
    // const multiValue = determineMultiValue(callRequestMulti1Value, callRequestMulti2Value);

    const eqpCallId = await createEQPCallId(targetKey, callCountValue, multiValue);
    const eqpWcsInfo: EQP_WCS[] = eqpCallId?.map((eqpCallId) => ({
      EQP_ID: eqpCallId.toString().substring(0, 4),  // 앞의 4자리
      EQP_CALL_ID: eqpCallId
    })) || [];

    // callMatchingInfo redis에 매칭한 값들 저장
    // todo0: 로그 저장
    console.log("🚀 ~ consteqpWcsInfo:EQP_WCS[]=eqpCallId?.map ~ eqpWcsInfo:", eqpWcsInfo)
    // todo1: 설비로부터 수신한 CALL 정보 저장
    // {
    //   Cmd_ID: ,
    //   Call_ID: eqpWcsInfo.EQP_CALL_ID,
    //   Call_Type: callType01Value,
    //   Caller: eqpWcsInfo.EQP_ID,
    //   Call_Quantity: 1,
    //   Call_Priority: callPriorityValue === 'true' ? '99' : '50'
    // }

    // todo2: facility.isMissionOrderCapable 값에 따른 toJob / missionJob 판단 필요
    // 1. EQP (LOAD_PORT 11 투입) to WMS - WMS입장에서 반출   call out api
    // 2. EQP (UNLOAD_PORT 12 회수) to WMS - WMS입장에서 반입 call in api
    // 3. EQP to EQP 

    console.log(`Call request sent to WCS. TYPE: ${callType01Value}, CallID: ${callCountValue}`);

    // todo4: 창고로부터 ACK 오면 EQP_Call_Save 함수 실행
    const callResponse = opcuaUtil.tagMap.get(`${targetKey}.Call_Response`);
    const callResponseWriteResult = await kepServerUtil.writeTagsValue([
      {
        nodeId: callResponse?.NODE_ID,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: callResponse?.DATA_TYPE,
            value: true
          }
        }
      }
    ]);
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

      const result = [];
      for (let i = 0; i < multiValue; i++) {
        const callId = EQCode01Value + EQCode02Value + callTimeYearValue + callTimeMonthDayStr + callCountValue + ((i >= 1) ? "_" + i.toString() : "");
        result.push(callId);
      }

      console.log("🚀 ~ createEQPCallId ~ result:", result)
      return result;
    } catch (error) {
      console.error("Error creating EQP Call ID:", error);
      return null;
    }
  };
  return { callRegister };
};
