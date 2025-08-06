import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { WorkOrderAttributes, WorkOrderAttributesDeep } from '../models/operation/workOrder';
import { service as workOrderService } from '../service/operation/workOrderService';
import { TagValue, useKepServerUtil } from './kepServerUtil';
import { logging, makeLogFormat, RequestLog } from './logging';
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
  const kepServerUtil = useKepServerUtil();
  const callReRegister = async (targetTagInfo: TagValue) => {
    try {
      const targetCode = targetTagInfo.EQ_CODE;
      if (!targetCode) return; // 코드 없으면 처리 불가

      // todo 250805 : 아래 로직을 mqttUtil 에서 처리하고 있다면 이동시킬 필요는 있어보임
      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, targetCode);

      const targetKey = kepServerUtil.getTargetKey(targetCode);

      await kepServerUtil.updateTagMapValues(
        targetKey,
        targetCode,
        ['Call_Request']
      );
      const callRequestValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`)?.value;
      // 콜 주체가 아닌 콜이 항상 켜져 있는 설비에 Call_Response 가 꺼진 경우
      // if (facilityInfo && callRequestValue === true && !facilityInfo?.linkedEqpIds) {
      //   // targetCode 해당 설비가 in 타입이면 to 설비니까 from 설비로 작업 생성
      //   if (facilityInfo.type.toUpperCase() === 'IN') {
      //     // 작업지시로 to_facility_id 조회해서 created_at 제일 느린거
      //     const result = await workOrderService.selectRecentList(
      //       { toFacilityId: facilityInfo.id },
      //       makeLogFormat({} as RequestLog)
      //     );
      //     const fromFacilityId = result.rows[0].fromFacilityId;
      //     await useRedisUtil().hset(
      //       RedisKeys.InfoCallRequestOnBySerial,
      //       String(fromFacilityId),
      //       JSON.stringify(targetTagInfo)
      //     );
      //   } else if (facilityInfo.type.toUpperCase() === 'OUT') {
      //     const result = await workOrderService.selectRecentList(
      //       { fromFacilityId: facilityInfo.id },
      //       makeLogFormat({} as RequestLog)
      //     );
      //     const toFacilityId = result.rows[0].toFacilityId;
      //     await useRedisUtil().hset(
      //       RedisKeys.InfoCallRequestOnBySerial,
      //       String(toFacilityId),
      //       JSON.stringify(targetTagInfo)
      //     );
      //   }
      //   return;
      // }
    } catch (error) {
      throw error;
    }
  };

  // 멀티콜 켜져있는 설비값 보고 작업지시 생성 여부 판단
  const decisionWorkOrder = async () => {
    try {
      const facilityInfoList = await redisUtil.hgetAllObject<FacilityAttributesDeep>(RedisKeys.InfoFacilityById);
      if (!facilityInfoList) {
        logging.ACTION_DEBUG({
          filename: 'callResponseUtil.ts',
          error: 'redis에 info_facility 데이터가 없습니다.',
          params: null,
          result: false,
        });
        return;
      }
      for (let i = 0, length = facilityInfoList.length; i < length; i++) {
        const facilityInfo = facilityInfoList[i];
        const facilityCode = facilityInfo.serial;
        if (facilityCode) {
          const targetKey = kepServerUtil.getTargetKey(facilityCode);
          await kepServerUtil.updateTagMapValues(
            targetKey,
            facilityCode,
            ['Call_Request_Multi_1', 'Call_Request_Multi_2']
          );

          const multiCallFirstValue = opcuaUtil.tagMap.get(`${facilityCode}.Call_Request_Multi_1`)?.value;
          const multiCallSecondValue = opcuaUtil.tagMap.get(`${facilityCode}.Call_Request_Multi_2`)?.value;
          if (!multiCallFirstValue) continue;

          const workOrderCount = await redisUtil.hget(RedisKeys.InfoWorkOrderCountBySerial, facilityCode || '');
          if (!workOrderCount) return;
          const workOrderCountNum = Number(workOrderCount);

          const multiCallStatus = [
            { value: multiCallFirstValue, tagName: 'Call_Request_Multi_1' },
            { value: multiCallSecondValue, tagName: 'Call_Request_Multi_2' },
          ];

          let maxAllowed = 0;

          // true	  true	3	2개 저장 (Multi_2, Multi_1)
          // true	  true	2	저장 안 함
          // true	  false	2	1개 저장 (Multi_1)
          // true	  false	3	저장 안 함
          // false	false	  아무 값	저장 안 함
          if (multiCallFirstValue && multiCallSecondValue) {
            if (workOrderCountNum <= 3) {
              maxAllowed = 2;
            }
          } else if (multiCallFirstValue && !multiCallSecondValue) {
            if (workOrderCountNum <= 2) {
              maxAllowed = 1;
            }
          }
          if (maxAllowed === 0) return;

          // 역순 처리: Multi_2 → Multi_1
          let savedCount = 0;
          for (let i = multiCallStatus.length - 1; i >= 0; i--) {
            if (savedCount >= maxAllowed) break;

            const { value, tagName } = multiCallStatus[i];

            if (value === true) {
              const tagInfo = useKepServerUtil().findTagInfo(facilityCode, tagName);

              const targetTagInfo: TagValue = {
                value: true,
                prevValue: '',
                timestamp: Date.now(),
                CHANNEL: tagInfo?.CHANNEL || '',
                DEVICE: facilityCode,
                TAGGROUP: '',
                TAG_NAME: tagName,
                DATA_TYPE: 'Boolean',
                INPUT_TYPE: 'Bool',
                NODE_ID: tagInfo?.NODE_ID || '',
                EQ_CODE: facilityCode,
                reRegister: 'multi',
              };
              await useRedisUtil().hset(
                RedisKeys.InfoMultiCallRequestOnBySerial,
                `${facilityCode}_${i + 1}`,
                JSON.stringify(targetTagInfo)
              );

              savedCount++;
            }
          }
        }
      }
    } catch (error) {
      throw error;
    }
  };
  return { useCallResponseUtil, callReRegister, decisionWorkOrder };
};
