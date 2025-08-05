import { WorkOrderAttributesDeep, WorkOrderUpdateByCodeParams } from 'models/operation/workOrder';
import { MqttTopics, sendMqtt } from './mqttUtil';
import Facility from 'models/operation/facility';
import Amr from 'models/common/amr';
import { calculateDurationInSeconds } from './dateUtil';
import { EqpCallStats } from './callRegisterUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { service as workOrderService } from '../service/operation/workOrderService';
import { logging } from './logging';
import { TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { editTrackingLogRedis } from './process/trackingLog';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
export type WorkOrderStats = {
  id: number;
  code: string;
  system?: string;
  serial?: string;
  name: string;
  totalCreated: number;
  totalCompleted: number;
  averageDuration: number;
  totalDuration: number;
};

export type DailyWorkOrderStats = {
  Facility: Record<number, WorkOrderStats>;
  Amr: Record<number, WorkOrderStats>;
};

const dailyWorkOrderStats: DailyWorkOrderStats = {
  Facility: {},
  Amr: {},
};

export type McsWorkOrderRequestType = {
  TX_ID: string;
  ZONE_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION' | 'DRYRUN'; // 반출 OUT, 반입 IN , 미션 MISSION
  EQP_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  TAG_ID: string;
  CALL_PRIORITY: string;
  CALL_TYPE: string; // 배터리 타입 PLC 맵에서 콜타입 이라 명명
  IS_MISSION_ORDER: string; // 작업 지시의 mission order 여부
  CALL_COUNT: number;
};

export type McsPendingWorkOrderRequestType = {
  callId: string;
  fromFacilityName: string;
  toFacilityName: string;
  eqpName: string;
  portName: string;
  type: 'IN' | 'OUT' | 'MISSION' | 'DRYRUN';
  typeofisMissionOrder: string;
  callPriority: string;
  callType: string;
  callCount: number;
};

export const useWorkOrderUtil = () => {
  const redisUtil = useRedisUtil();
  const createWorkOrder = async () => {
    try {
      const workOrderList = await redisUtil.hgetAllObject<McsPendingWorkOrderRequestType>(
        RedisKeys.InfoPendingWorkOrderByCallId
      );
      if (workOrderList) {
        // todo: 05/30 pended workorder doesn't need create
        for (const workOrder of workOrderList) {
          const params: McsWorkOrderRequestType = {
            TYPE: workOrder.type,
            CALL_ID: workOrder.callId,
            EQP_ID: workOrder.eqpName,
            EQP_CALL_ID: parseInt(workOrder.callId.toString().slice(-4), 10).toString(), // 작업지시코드 뒤 4자리
            PORT_ID: workOrder.type === 'MISSION' || workOrder.type === 'DRYRUN' ? '' : workOrder.portName,
            CALL_PRIORITY: workOrder.callPriority,
            CALL_TYPE: workOrder.callType,
            IS_MISSION_ORDER: workOrder.type === 'MISSION' ? 'true' : 'false',
            TAG_ID: '',
            TX_ID: '',
            ZONE_ID: process.env.FLOOR || '1F',
            CALL_COUNT: workOrder.callCount,
          };
          const message = JSON.stringify(params);
          const messageJson = JSON.parse(message);
          const messageTopic = 'acs/workorder';

          const existWorkOrder = await workOrderDao.selectInfoByCode({ code: params.CALL_ID });
          if (existWorkOrder) {
            continue;
          }
          await workOrderService.regWorkOrder(messageJson);
          const trackingLogSubject = 'WORK_ORDER_CREATED';
          const trackingLogDetail = 'WORK_ORDER_CREATED';
          const trackingLogState = 'PROCESSING';
          const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
            callId: workOrder.callId,
            subject: trackingLogSubject,
            detail: trackingLogDetail,
            state: trackingLogState,
            startFacility: workOrder.fromFacilityName,
            destFacility: workOrder.toFacilityName,
            assignedRobot: null,
            value: null,
            description: `CALL ID ${workOrder.callId} WorkOrder Created`,
            plcName: params.EQP_ID,
          };
          await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', 'MCS');

          try {
            sendMqtt(messageTopic, message);
          } catch (err) {
            logging.MQTT_ERROR({
              title: 'mqtt message error',
              topic: messageTopic,
              message: messageJson,
              error: err,
            });
          }

          redisUtil.hdel(RedisKeys.InfoPendingWorkOrderByCallId, params.CALL_ID);
          redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, params.EQP_ID);
          // todo: 250708 멀티콜 작업지시에서도 숫자 -1 해주기
          // redisUtil.hset(RedisKeys.MultiWorkOrderCountBySerial, params.CALL_ID);
        }
      }
    } catch (error) {
      throw error;
    }
  };
  const initializeWorkOrderStats = (id: number, code: string, system: string, name: string): WorkOrderStats => ({
    id,
    code,
    system,
    name,
    totalCreated: 0,
    totalCompleted: 0,
    averageDuration: 0,
    totalDuration: 0,
  });
  const getStats = () => dailyWorkOrderStats;
  const setStats = (
    target: 'Facility' | 'Amr',
    id: number,
    code: string,
    system: string,
    name: string,
    params: { created?: number; completed?: number; duration?: number }
  ) => {
    try {
      if (!dailyWorkOrderStats[target][id]) {
        dailyWorkOrderStats[target][id] = initializeWorkOrderStats(id, code, system, name);
      }
      const targetObject = dailyWorkOrderStats[target][id];
      if (params.created) targetObject.totalCreated += params.created;
      if (params.completed) targetObject.totalCompleted += params.completed;
      if (params.duration) {
        targetObject.totalDuration += params.duration;
        targetObject.averageDuration = targetObject.totalDuration / targetObject.totalCompleted;
      }
      sendStats();
    } catch (error) { }
  };
  const setInitStats = (workOrder: WorkOrderAttributesDeep) => {
    try {
      if (workOrder.FromFacility) {
        if (dailyWorkOrderStats.Facility[workOrder.FromFacility.id]) {
          dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCreated += 1;
          if (workOrder.fromStartDate && workOrder.fromEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.fromStartDate, workOrder.fromEndDate);
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCompleted += 1;
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalDuration += durationSec;
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].averageDuration =
              dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalDuration /
              dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCompleted;
          }
        } else {
          dailyWorkOrderStats.Facility[workOrder.FromFacility.id] = {
            id: workOrder.FromFacility.id,
            code: workOrder.FromFacility.code,
            system: workOrder.FromFacility.system,
            serial: workOrder.FromFacility.serial,
            name: workOrder.FromFacility.name,
            totalCreated: 0,
            totalCompleted: 0,
            averageDuration: 0,
            totalDuration: 0,
          } as WorkOrderStats;
          dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCreated += 1;
          if (workOrder.fromStartDate && workOrder.fromEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.fromStartDate, workOrder.fromEndDate);
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCompleted += 1;
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalDuration += durationSec;
            dailyWorkOrderStats.Facility[workOrder.FromFacility.id].averageDuration =
              dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalDuration /
              dailyWorkOrderStats.Facility[workOrder.FromFacility.id].totalCompleted;
          }
        }
      }
      if (workOrder.toStartDate) {
        if (dailyWorkOrderStats.Facility[workOrder.ToFacility.id]) {
          dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCreated += 1;
          if (workOrder.toStartDate && workOrder.toEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.toStartDate, workOrder.toEndDate);
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCompleted += 1;
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalDuration += durationSec;
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].averageDuration =
              dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalDuration /
              dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCompleted;
          }
        } else {
          dailyWorkOrderStats.Facility[workOrder.ToFacility.id] = {
            id: workOrder.ToFacility.id,
            code: workOrder.ToFacility.code,
            system: workOrder.ToFacility.system,
            serial: workOrder.ToFacility.serial,
            name: workOrder.ToFacility.name,
            totalCreated: 0,
            totalCompleted: 0,
            averageDuration: 0,
            totalDuration: 0,
          } as WorkOrderStats;
          dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCreated += 1;
          if (workOrder.toStartDate && workOrder.toEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.toStartDate, workOrder.toEndDate);
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCompleted += 1;
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalDuration += durationSec;
            dailyWorkOrderStats.Facility[workOrder.ToFacility.id].averageDuration =
              dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalDuration /
              dailyWorkOrderStats.Facility[workOrder.ToFacility.id].totalCompleted;
          }
        }
      }
      if (workOrder.Amr) {
        if (dailyWorkOrderStats.Amr[workOrder.Amr.id]) {
          dailyWorkOrderStats.Amr[workOrder.Amr.id].totalCreated += 1;
          if (workOrder.fromStartDate && workOrder.toEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.fromStartDate, workOrder.toEndDate);
            dailyWorkOrderStats.Amr[workOrder.Amr.id].totalCompleted += 1;
            dailyWorkOrderStats.Amr[workOrder.Amr.id].totalDuration += durationSec;
            dailyWorkOrderStats.Amr[workOrder.Amr.id].averageDuration =
              dailyWorkOrderStats.Amr[workOrder.Amr.id].totalDuration /
              dailyWorkOrderStats.Amr[workOrder.Amr.id].totalCompleted;
          }
        } else {
          dailyWorkOrderStats.Amr[workOrder.Amr.id] = {
            id: workOrder.Amr.id,
            code: workOrder.Amr.code,
            name: workOrder.Amr.name,
            totalCreated: 0,
            totalCompleted: 0,
            averageDuration: 0,
            totalDuration: 0,
          } as WorkOrderStats;
          dailyWorkOrderStats.Amr[workOrder.Amr.id].totalCreated += 1;
          if (workOrder.fromStartDate && workOrder.toEndDate) {
            const durationSec = calculateDurationInSeconds(workOrder.fromStartDate, workOrder.toEndDate);
            dailyWorkOrderStats.Amr[workOrder.Amr.id].totalCompleted += 1;
            dailyWorkOrderStats.Amr[workOrder.Amr.id].totalDuration += durationSec;
            dailyWorkOrderStats.Amr[workOrder.Amr.id].averageDuration =
              dailyWorkOrderStats.Amr[workOrder.Amr.id].totalDuration /
              dailyWorkOrderStats.Facility[workOrder.Amr.id].totalCompleted;
          }
        }
      }
    } catch (error) { }
  };
  const initStats = async () => {
    dailyWorkOrderStats.Facility = {};
    dailyWorkOrderStats.Amr = {};
  };
  const sendStats = () => {
    sendMqtt(MqttTopics.WorkOrderStats, JSON.stringify(getStats()));
  };

  return { createWorkOrder, getStats, setStats, setInitStats, initStats, sendStats };
};
