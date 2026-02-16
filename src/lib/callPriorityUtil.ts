import { TagValue, useKepServerUtil } from './kepServerUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { logging, logToConsoleAndFile } from './logging';
import { MqttTopics, sendMqtt } from './mqttUtil';
import { opcuaUtil } from './opcuaUtil';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { FacilityAttributes } from '../models/operation/facility';
import { usePlcConnectUtil } from './plcConnectUtil';
import { RecentWorkOrderListByFacilitySerialAttributes } from '../models/operation/workOrder';

export interface OnCallPriorityInfo {
  EQP_ID: string; // 설비 이름 : SC11
  EQP_CALL_ID: string; // 설비 call_count : 1234
  CALL_ID: string; // 작업지시코드 : SC11202508111234
  CALL_PRIORITY: boolean; // 우선순위 : true
}

export const useCallPriorityUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  const onCallPriority = async (targetTagInfo: TagValue) => {
    try {
      if (!targetTagInfo.value) {
        logging.KEPWARE_DEBUG({
          action: 'TAG_READ',
          tag: targetTagInfo.TAG_NAME,
          value: JSON.parse(JSON.stringify(targetTagInfo)),
          message: `tag value is false`,
        });
        return;
      }

      const targetCode = targetTagInfo.EQ_CODE;

      const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, targetCode);
      // 해당 작지 찾기
      if (!facilityInfo) {
        logging.ACTION_ERROR({
          filename: 'callPriorityUtil.ts - onCallPriority',
          error: `No facility info ${targetCode}`,
          params: null,
          result: false,
        });
        return;
      }

      const workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        targetCode
      );
      if (!workOrderListInfo) {
        logging.KEPWARE_DEBUG({
          action: 'TAG_READ',
          tag: targetTagInfo.TAG_NAME,
          value: JSON.parse(JSON.stringify(targetTagInfo)),
          message: `No work order list info`,
        });
        return;
      }

      // workOrderListInfo.sorkOrderList가 객체배열인데, 그 중에서 state가 'workOrder'인 항목들만 필터링
      const workOrderList =
        workOrderListInfo?.workOrderList.filter((workOrder) => workOrder.state === 'workOrder') || [];

      if (workOrderList.length > 0) {
        for (const workOrder of workOrderList) {
          const onCallPriorityInfo: OnCallPriorityInfo = {
            EQP_ID: targetCode,
            EQP_CALL_ID: workOrder.callId.slice(-1, 4),
            CALL_ID: workOrder.callId || '',
            CALL_PRIORITY: true as boolean,
          };

          sendMqtt(MqttTopics.OnCallPriority, JSON.stringify(onCallPriorityInfo));
          await workOrderDao.updateByCode({
            code: workOrder.callId,
            callPriority: true as boolean,
          });
        }
      } else {
        logging.KEPWARE_DEBUG({
          action: 'TAG_READ',
          tag: targetTagInfo.TAG_NAME,
          value: JSON.parse(JSON.stringify(targetTagInfo)),
          message: `No work order info`,
        });
        return;
      }
    } catch (error) {
      console.error('CallPriority error:', error);
    }
  };

  return {
    onCallPriority,
  };
};
