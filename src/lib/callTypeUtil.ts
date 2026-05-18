import { AttributeIds } from 'node-opcua-client';
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, parseAsciiToDecWord, TagValue, useKepServerUtil } from './kepServerUtil';
import { logging } from './logging';
import opcuaUtil from './opcuaUtil';
import { EQP_WCS } from './eqpCheckUtil';
import { formatToDateCode } from './usefullToolUtil';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { editTrackingLogRedis, initTrackingLogRedis } from './process/trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { DryrunSetting } from '../models/common/setting';
import { usePlcConnectUtil } from './plcConnectUtil';
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

export const useCallTypeUtil = () => {
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  const callTypeResponse = async (targetCode: string) => {
    try {
      if (!targetCode) return;

      const readCallTypeNames = Array.from({ length: 10 }, (_, idx) => {
        const i = idx + 1;
        const suffix = i < 10 ? `0${i}` : `${i}`;
        return `Call_Type_${suffix}`;
      });

      const byTag = await plcConnectUtil.batchGetTagValue(targetCode, readCallTypeNames);
      console.log('[callTypeResponse] batchRead', { targetCode, keys: readCallTypeNames.length });

      const plcConnType = process.env.PLC_CONN_TYPE || '';
      const tagInfo: { tagName: string; value: boolean | string | number }[] = [];

      for (let i = 0; i < readCallTypeNames.length; i++) {
        const readCallType = readCallTypeNames[i];
        const suffix = i + 1 < 10 ? `0${i + 1}` : `${i + 1}`;
        const writeCallType = `Call_Type_Response_${suffix}`;

        const callTypeValue = byTag[readCallType] as string | null;
        if (typeof callTypeValue === 'string') {
          const setCallType = callTypeValue.trimEnd();
          let callType: string;
          if (plcConnType === 'KEP') {
            callType = parseAsciiToDecWord(setCallType).toString();
          } else {
            callType = setCallType;
          }
          tagInfo.push({ tagName: writeCallType, value: callType });
        }
      }

      if (tagInfo.length > 0) {
        console.log('[callTypeResponse] batchWrite', { targetCode, count: tagInfo.length, plcConnType });
        await plcConnectUtil.writeTagValue({
          targetFacility: targetCode,
          tagInfo,
        });
      } else {
        console.log('[callTypeResponse] skipWrite', { targetCode, reason: 'no string Call_Type values' });
      }
    } catch (error) {
      throw error;
    }
  };

  const callTypeResponseReset = async (targetCode: string) => {
    try {
      if (!targetCode) return;
      let value = '0';
      if (process.env.PLC_CONN_TYPE === 'CONNECTOR') {
        value = '';
      }
      await plcConnectUtil.writeTagValue({
        targetFacility: targetCode,
        tagInfo: [
          { tagName: 'Call_Type_Response_01', value: value },
          { tagName: 'Call_Type_Response_02', value: value },
          { tagName: 'Call_Type_Response_03', value: value },
          { tagName: 'Call_Type_Response_04', value: value },
          { tagName: 'Call_Type_Response_05', value: value },
          { tagName: 'Call_Type_Response_06', value: value },
          { tagName: 'Call_Type_Response_07', value: value },
          { tagName: 'Call_Type_Response_08', value: value },
          { tagName: 'Call_Type_Response_09', value: value },
          { tagName: 'Call_Type_Response_10', value: value },
        ],
      });
    } catch (error) {
      throw error;
    }
  };
  return { callTypeResponse, callTypeResponseReset };
};
