/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { TrackingLogRedisAttributes } from "../models/common/trackingLog";
import { CancelWorkOrderRequestType } from "./callCancelUtil";
import { makeCallType, TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging, makeLogFormat, RequestLog } from "./logging";
import { sendMqtt } from "./mqttUtil";
import opcuaUtil from "./opcuaUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { service as workOrderService } from '../service/operation/workOrderService';
import { dao as facilityDao } from '../dao/operation/facilityDao';
import { FacilityAttributes } from "../models/operation/facility";
import { useMultiCallRegisterUtil } from "./multiCallRegisterUtil";
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
      const targetCode = targetTagInfo.EQ_CODE;

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
      await kepServerUtil.writeSimpleTagValue({
        targetFacility: targetCode,
        tagName: 'Dock_Request',
        value: false,
      });
      await useMultiCallRegisterUtil().hsetWithDecrementCount(RedisKeys.InfoWorkOrderCountBySerial, targetCode);
      // 250916 remove remain
      // redisUtil.hdel(RedisKeys.InfoRemainCallById, targetCode);
      redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);

    } catch (error) {
      console.error("Error in callRemove:", error);
    }
  };

  return { callRemove };
};