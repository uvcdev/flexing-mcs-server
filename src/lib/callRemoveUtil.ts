/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import opcuaUtil from "./opcuaUtil";
import { useRedisUtil } from "./redisUtil";
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
      const callCancelResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Cancel_Response`);

      const needNodeIds = [
        callCount?.NODE_ID,
        callType01?.NODE_ID,
        callPriority?.NODE_ID,
        callCancelResponse?.NODE_ID
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [
        callCount?.TAG_NAME,
        callType01?.TAG_NAME,
        callPriority?.TAG_NAME,
        callCancelResponse?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }

      const callCountValue = callCount?.value || 0;
      const callType01Value = callType01?.value?.toString() || "0";
      const callPriorityValue = callPriority?.value || false;
      const callCountPrevValue = callCount?.prevValue?.toString() || "0";
      const callCancelResponseValue = callCancelResponse?.value || false;

      if (callCountValue === 0 && callPriorityValue === false) {
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

      // 로봇 할당 되어 있는 경우 콜 취소 응답이 켜져 있는 상태에서
      // 콜이 내려간다면 콜 취소 응답 내리기
      if (callCancelResponseValue === true) {
        await kepServerUtil.writeSimpleTagValue({
          targetFacility: targetCode,
          tagName: 'Call_Cancel_Response',
          value: false,
        });
      }
    } catch (error) {
      console.error("Error in callRemove:", error);
    }
  };

  return { callRemove };
};