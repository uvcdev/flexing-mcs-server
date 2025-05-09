/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AttributeIds } from "node-opcua-client";
import { PendingWorkOrderAttributes } from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { TagValue, useKepServerUtil } from "./kepServerUtil";
import { logging, makeLogFormat, RequestLog } from './logging';
import opcuaUtil from "./opcuaUtil";
import { EQP_WCS } from "./eqpCheckUtil";
import { formatToDateCode } from "./usefullToolUtil";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { initTrackingLogRedis } from "./process/trackingLog";
import { TrackingLogRedisAttributes } from "../models/common/trackingLog";
import { sendMqtt } from "./mqttUtil";
import { service as workOrderService } from '../service/operation/workOrderService';
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

export interface CancelWorkOrderRequestType {
  ZONE_ID: string;
  EQP_ID: string;
  EQP_CALL_ID: string;
  CALL_ID: string;
}

export const useCallCancelUtil = () => {
  const kepServerUtil = useKepServerUtil()
  const redisUtil = useRedisUtil();
  const callCancel = async (targetTagInfo: TagValue) => {
    try {
      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const targetCode = targetTagInfo.EQ_CODE;

      // 필요한 태그 값들 가져오기    
      const callRequest = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`);
      const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
      const callType01 = opcuaUtil.tagMap.get(`${targetCode}.Call_Type_01`);
      const callPriority = opcuaUtil.tagMap.get(`${targetCode}.Call_Priority`);
      const callResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Response`);
      const callResponseCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Response_Count`);
      const callRobotAssigned = opcuaUtil.tagMap.get(`${targetCode}.Call_Robot_Assigned`);

      const needNodeIds = [
        callRequest?.NODE_ID,
        callCount?.NODE_ID,
        callType01?.NODE_ID,
        callPriority?.NODE_ID,
        callResponse?.NODE_ID,
        callResponseCount?.NODE_ID,
        callRobotAssigned?.NODE_ID,
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await kepServerUtil.readTagsValue(needNodeIds);

      const needKeys = [
        callRequest?.TAG_NAME,
        callCount?.TAG_NAME,
        callType01?.TAG_NAME,
        callPriority?.TAG_NAME,
        callResponse?.TAG_NAME,
        callResponseCount?.TAG_NAME,
        callRobotAssigned?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        kepServerUtil.updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }

      const callRequestValue = callRequest?.value || false;
      const callCountValue = callCount?.value || 0;
      const callType01Value = callType01?.value?.toString() || "0";
      const callPriorityValue = callPriority?.value || false;
      const callCountPrevValue = callCount?.prevValue?.toString() || "0";

      const callResponseValue = callResponse?.value || false;
      const callResponseCountValue = callResponseCount?.value || 0;
      const callRobotAssignedValue = callRobotAssigned?.value || false;

      // 로봇 미할당시 취소 (콜 취소 완료 요청)
      if (callCountValue !== 0 && callPriorityValue === true && callRequestValue === true
        && callResponseValue === true && callResponseCountValue !== 0 && callRobotAssignedValue === false) {
        // todo: 콜타입 조건 적용
        // && Number(callType01Value) != 0) {
        await kepServerUtil.writeSimpleTagValue({
          targetFacility: targetCode,
          tagName: 'Call_Cancel_Response',
          value: true,
        });
        const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, targetCode);
        const infoCancelCall: EqpCallStats = {
          CALL_ID: infoTrackingLogByFacilityCode?.callId || '',
          Call_Quantity: 1,
          EQP_CALL_ID: "",
          Call_Type: "",
          Caller: "",
          Call_Priority: ""
        }

        // 창고 콜 취소 전달
        redisUtil.hset(RedisKeys.InfoCancelCallByCallId, infoCancelCall.CALL_ID, JSON.stringify(infoCancelCall))


        // acs 작업지시 취소 요청
        const params: CancelWorkOrderRequestType =
        {
          ZONE_ID: process.env.FLOOR || '1F',
          EQP_ID: targetCode,
          EQP_CALL_ID: infoTrackingLogByFacilityCode?.eqpCallId || '',
          CALL_ID: infoTrackingLogByFacilityCode?.callId || ''
        }
        const result = await workOrderService.facilityCancel(
          { code: params.CALL_ID },
          makeLogFormat({} as RequestLog)
        );

        if (result.updatedCount > 0) {
          const messageTopic = 'acs/cancelworkorder'
          try {
            logging.MQTT_LOG({
              title: 'callRemoveUtil cancel workorder',
              topic: messageTopic,
              message: params,
            });
            sendMqtt(messageTopic, JSON.stringify(params));
          } catch (err) {
            logging.MQTT_ERROR({
              title: 'mqtt message error',
              topic: messageTopic,
              message: params,
              error: err,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error in callRemove:", error);
    }
  };
  return { callCancel };
};