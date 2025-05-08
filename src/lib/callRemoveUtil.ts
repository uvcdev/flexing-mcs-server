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

export const useCallRemoveUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callRemove = async (targetTagInfo: TagValue) => {
    try {
      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const targetCode = targetTagInfo.EQ_CODE;

      // 필요한 태그 값들 가져오기    
      const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
      const callType01 = opcuaUtil.tagMap.get(`${targetCode}.Call_Type_01`);
      const callPriority = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`);

      const needNodeIds = [
        callCount?.NODE_ID,
        callType01?.NODE_ID,
        callPriority?.NODE_ID,
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [
        callCount?.TAG_NAME,
        callType01?.TAG_NAME,
        callPriority?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }

      const callCountValue = callCount?.value?.toString() || "0";
      const callType01Value = callType01?.value?.toString() || "0";
      const callPriorityValue = callPriority?.value?.toString() || "false";
      const callCountPrevValue = callCount?.prevValue?.toString() || "0";

      if (callCountValue === '0' && callPriorityValue === 'false') {
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
      }
    } catch (error) {
      console.error("Error in callRemove:", error);
    }
  };

  // callRequestMulti1Value와 callRequestMulti2Value의 값을 기반으로 multiValue 결정
  // const determineMultiValue = (callRequestMulti1Value: string, callRequestMulti2Value: string): number => {
  //   if (callRequestMulti1Value === "true" && callRequestMulti2Value === "true") {
  //     return 3;
  //   } else if (callRequestMulti1Value === "true") {
  //     return 2;
  //   } else {
  //     return 1;
  //   }
  // };
  // const createEQPCallId = async (targetKey: string, callCountValue: string, multiValue: number): Promise<string[] | null> => {
  //   // targetKey 형식: STACK01.SC11 || SC.11
  //   // targetCode 형식: SC11
  //   const targetCode = kepServerUtil.getTagCode(targetKey);

  //   try {
  //     // 설비코드 1 + 설비코드 2 + 콜 ID 시간1(년도) + 콜 ID시간2(월,일) + 콜ID(0~9999)
  //     // const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
  //     // const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
  //     // const callTimeYear = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_Year`);
  //     // const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_MonthDay`);

  //     // const EQCode01 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_01`);
  //     // const EQCode02 = opcuaUtil.tagMap.get(`${targetCode}.EQ_Code_02`);
  //     const callTimeYear = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_Year`);
  //     const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetCode}.Call_Time_MonthDay`);


  //     // 필요한 모든 nodeId들을 배열로 모음
  //     const needNodeIds = [
  //       // EQCode01?.NODE_ID,
  //       // EQCode02?.NODE_ID,
  //       callTimeYear?.NODE_ID,
  //       callTimeMonthDay?.NODE_ID,
  //     ].filter((nodeId): nodeId is string => nodeId !== undefined);

  //     const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

  //     const needKeys = [
  //       // EQCode01?.TAG_NAME,
  //       // EQCode02?.TAG_NAME,
  //       callTimeYear?.TAG_NAME,
  //       callTimeMonthDay?.TAG_NAME,
  //     ].filter((tagName): tagName is string => tagName !== undefined);

  //     for (let i = 0; i < needKeys.length; i++) {
  //       kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
  //     }


  //     // const EQCode01Value = EQCode01?.value.toString() || "0";
  //     // const EQCode02Value = EQCode02?.value.toString() || "0";
  //     const callTimeYearValue = callTimeYear?.value.toString() || "0";
  //     const callTimeMonthDayValue = callTimeMonthDay?.value.toString() || "0";

  //     // callTimeMonthDay 값을 4자릿수로 변환
  //     const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString()
  //     const callCountValueStr = callCountValue.toString().padStart(4, '0');

  //     const result = [];
  //     for (let i = 0; i < multiValue; i++) {
  //       const callId = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
  //       result.push(callId);
  //     }

  //     return result;
  //   } catch (error) {
  //     console.error("Error creating EQP Call ID:", error);
  //     return null;
  //   }
  // };
  // const checkRemainEqpCall = async () => {
  //   const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
  //   if (remainCallList) {
  //     for (const remainCall of remainCallList) {
  //       const reqCallInfo = await redisUtil.hgetObject<FacilityAttributes>(
  //         RedisKeys.InfoPlcBySerial,
  //         remainCall?.fromFacilityName?.toString() || ''
  //       );
  //       const resCallInfo = await redisUtil.hgetObject<FacilityAttributes>(
  //         RedisKeys.InfoPlcBySerial,
  //         remainCall?.toFacilityName?.toString() || ''
  //       );

  //       const reqCallInfoJson = JSON.parse(JSON.stringify(reqCallInfo))
  //       const resCallInfoJson = JSON.parse(JSON.stringify(resCallInfo))

  //       if (reqCallInfoJson.Call_Request && resCallInfoJson.Call_Request) {
  //         // 콜 기준 설비 call_response 작성
  //         await useKepServerUtil().writeSimpleTagValue({
  //           targetFacility: remainCall.fromFacilityName || '',
  //           tagName: 'Call_Response',
  //           value: true,
  //         });
  //         // call_response 작성
  //         await useKepServerUtil().writeSimpleTagValue({
  //           targetFacility: remainCall.toFacilityName || '',
  //           tagName: 'Call_Response',
  //           value: true,
  //         });
  //         redisUtil.hdel(RedisKeys.InfoRemainCallById, remainCall.callId || '');
  //       }
  //     }
  //   }
  // };
  return { callRemove };
};