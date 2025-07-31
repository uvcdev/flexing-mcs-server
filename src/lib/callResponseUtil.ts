import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { WorkOrderAttributes, WorkOrderAttributesDeep } from '../models/operation/workOrder';
import { TagValue } from './kepServerUtil';
import opcuaUtil from './opcuaUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
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

export const useCallResponseUtil = () => {
  const redisUtil = useRedisUtil();
  const callReRegister = async (targetTagInfo: TagValue) => {
    try {
      // Call_Request 켜져 있고 Call_Response 꺼질 때
      const targetCode = targetTagInfo.EQ_CODE;
      if (!targetCode) return; // 코드 없으면 처리 불가

      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, targetCode);
      const callRequestValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`)?.value;
      // 콜 주체가 되는 설비의 Call_Response 가 꺼진 경우
      // if (callRequestValue === true && facilityInfo?.linkedEqpIds && facilityInfo.linkedEqpIds.length > 0) {
      //   // redisUtil.hset(RedisKeys.InfoFacilityReRegisterBySerial, targetCode, JSON.stringify(targetTagInfo))
      //   targetTagInfo.reRegister = '_R';
      //   await useRedisUtil().hset(
      //     RedisKeys.InfoCallRequestOnBySerial,
      //     targetTagInfo.EQ_CODE,
      //     JSON.stringify(targetTagInfo)
      //   );
      //   return;
      // }
      // else if (callRequestValue === true) {
      //   // 콜 주체가 아닌 콜이 항상 켜져 있는 설비에 Call_Response 가 꺼진 경우
      //   // 항상 켜져 있는 설비를 linked 로 등록되어 있는 설비를 찾아서 그 설비 Call_Request 가 켜져 있으면
      //   // 그 설비로 hest ??
      //   targetTagInfo.reRegister = '_R';
      //   await useRedisUtil().hset(
      //     RedisKeys.InfoCallRequestOnBySerial,
      //     targetTagInfo.EQ_CODE,
      //     JSON.stringify(targetTagInfo)
      //   );
      //   return;
      // }
    } catch (error) {
      throw error;
    }
  };

  // 작업 완료된 이후 멀티콜 값 보고 작업지시 생성 여부 판단
  const decisionWorkOrder = async (targetTagInfo: TagValue) => {
    try {
      const targetCode = targetTagInfo.EQ_CODE;
      if (!targetCode) return;

      const multiCallFirstValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_1`)?.value;
      const multiCallSecondValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request_Multi_2`)?.value;

      const workOrderCount = await redisUtil.hget(RedisKeys.InfoWorkOrderCountBySerial, targetCode);
      if (!workOrderCount) return;
      const workOrderCountNum = Number(workOrderCount);

      // 멀티콜 2개 켜져 있는 경우
      if (workOrderCountNum && multiCallFirstValue === true && multiCallSecondValue === true) {
        // 현재 진행중인 작업지시 갯수 판단해서 작업지시 만들기
        if (workOrderCountNum <= 2) {
          await useRedisUtil().hset(
            RedisKeys.InfoMultiCallRequestOnBySerial,
            `${targetTagInfo.EQ_CODE}_2`,
            JSON.stringify(targetTagInfo)
          );
        }
      }
      // 멀티콜 1개 켜져 있는 경우
      if (workOrderCountNum && multiCallFirstValue === true) {
        // 현재 진행중인 작업지시 갯수 판단해서 작업지시 만들기
        if (workOrderCountNum <= 1) {
          await useRedisUtil().hset(
            RedisKeys.InfoMultiCallRequestOnBySerial,
            `${targetTagInfo.EQ_CODE}_1`,
            JSON.stringify(targetTagInfo)
          );
          return;
        }
      }
    } catch (error) {
      throw error;
    }
  };
  return { useCallResponseUtil, callReRegister, decisionWorkOrder };
};
