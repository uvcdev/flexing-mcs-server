/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from "./kepServerUtil";
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

export const useCallResponseUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callReRegister = async (targetTagInfo: TagValue) => {
    try {
      // Call_Request 켜져 있고 Call_Response 꺼질 때
      const targetCode = targetTagInfo.EQ_CODE;
      if (!targetCode) return; // 코드 없으면 처리 불가

      const callRequestValue = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`)?.value;

      if (callRequestValue === true) {
        redisUtil.hset(RedisKeys.InfoFacilityReRegisterBySerial, targetCode, JSON.stringify(targetTagInfo))
        return
      }
    } catch (error) {
      throw error
    }
  };
  return { useCallResponseUtil, callReRegister };
};