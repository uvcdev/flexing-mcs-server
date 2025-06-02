/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, parseAsciiToWord, TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { formatToDateCode } from "./usefullToolUtil";
import { RedisKeys, RedisSettingKeys, useRedisUtil } from "./redisUtil";
import { editTrackingLogRedis, initTrackingLogRedis } from "./process/trackingLog";
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from "../models/common/trackingLog";
import { DryrunSetting } from "../models/common/setting";
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

export const useCallTypeUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callTypeResponse = async (targetTagInfo: TagValue) => {
    try {
      const targetCode = targetTagInfo.EQ_CODE;

      for (let i = 1; i <= 10; i++) {
        const suffix = i < 10 ? `0${i}` : `${i}`;
        const readCallType = `${targetCode}.Call_Type_${suffix}`;
        const writeCallType = `Call_Type_Response_${suffix}`;

        // 값 읽기
        const callTypeValue = await opcuaUtil.tagMap.get(readCallType);
        if (typeof callTypeValue?.value === 'string') {
          const setCallType = callTypeValue.value.replace(/[\s]/g, '');

          const callType = parseAsciiToWord(setCallType);
          // 값 쓰기
          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: targetCode || '',
            tagName: writeCallType,
            value: callType.toString(),
          });
        }
      }
    } catch (error) {
      throw error
    }
  };
  return { callTypeResponse };
};