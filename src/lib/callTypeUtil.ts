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
      // const targetCode = targetTagInfo.EQ_CODE;

      for (let i = 1; i <= 10; i++) {
        const suffix = i < 10 ? `0${i}` : `${i}`;
        const readCallType = `Call_Type_${suffix}`;
        const writeCallType = `Call_Type_Response_${suffix}`;

        // 값 읽기
        const callTypeValue = (await plcConnectUtil.getTagValue(targetCode, readCallType)) as string;
        if (typeof callTypeValue === 'string') {
          const setCallType = callTypeValue.replace(/[\s]/g, '');
          let callType = '';
          if (process.env.PLC_CONN_TYPE === 'KEP') {
            console.log(`setCallType`, setCallType);
            callType = parseAsciiToDecWord(setCallType).toString();
            console.log(`callType`, callType);
            console.log(`callType type`, typeof callType);
          } else {
            callType = setCallType;
            console.log(`callType`, callType);
            console.log(`callType type`, typeof callType);
          }
          // 값 쓰기
          await plcConnectUtil.writeTagValue({
            targetFacility: targetCode,
            tagInfo: [{ tagName: writeCallType, value: callType }],
          });
        }
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
          { tagName: 'Call_Type_Response_02', value: value },
          { tagName: 'Call_Type_Response_03', value: value },
          { tagName: 'Call_Type_Response_01', value: value },
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
