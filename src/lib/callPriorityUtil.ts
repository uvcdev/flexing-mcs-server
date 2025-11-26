import { TagValue, useKepServerUtil } from './kepServerUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { logging, logToConsoleAndFile } from './logging';
import { MqttTopics, sendMqtt } from './mqttUtil';
import { opcuaUtil } from './opcuaUtil';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { FacilityAttributes } from '../models/operation/facility';
import { usePlcConnectUtil } from './plcConnectUtil';

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

      const callCount = (await plcConnectUtil.getTagValue(targetCode, 'Call_Count')) as number;
      if (!callCount) {
        logToConsoleAndFile(`callCount is 0 ${targetTagInfo.EQ_CODE}`, 'red');
        logging.ACTION_ERROR({
          filename: 'callPriorityUtil.ts - onCallPriority',
          error: `callCount is 0 ${targetTagInfo.EQ_CODE}`,
          params: null,
          result: false,
        });
        return;
      }
      console.log('callCount', callCount);

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
      const workOrderInfo = await workOrderDao.selectInfoByTriggerCallCount({
        triggerCallCount: callCount,
        fromFacilityId: facilityInfo.id,
      });

      if (workOrderInfo) {
        const onCallPriorityInfo: OnCallPriorityInfo = {
          EQP_ID: targetCode,
          EQP_CALL_ID: callCount.toString(),
          CALL_ID: workOrderInfo?.code || '',
          CALL_PRIORITY: true as boolean,
        };

        sendMqtt(MqttTopics.OnCallPriority, JSON.stringify(onCallPriorityInfo));
        await workOrderDao.update({
          id: workOrderInfo.id,
          callPriority: true as boolean,
        });
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
