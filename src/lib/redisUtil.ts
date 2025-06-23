/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import redis, { RedisClient } from 'redis';
import { promisify } from 'util';
import { logging } from '../lib/logging';
import * as dotenv from 'dotenv';
// import { ChargerAttributes } from '../models/common/chargerModel';
dotenv.config();

// redis 접속 환경
type RedisConfig = {
  host: string;
  port: number;
  header: string;
};

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || '',
  port: Number(process.env.REDIS_PORT || 6379),
  header: process.env.REDIS_HEADER || 'ACS',
};

// export const RedisKeys = {
//   keys: {
//     workerStatus: 'feedback_worker_status',
//     instructions: 'res_get_task',
//     composeJobs: 'req_compose_job',
//     infoAmr: 'info_amr',
//     infoAmrById: 'info_amr_by_id',
//     infoChargerById: 'info_charger_by_id',
//     infoChargerByResource: 'info_charger_by_resource',
//     amrRecentTask: 'amr_recent_task',
//     amrRecentTaskById: 'amr_recent_task_by_id',
//     amrCurrentCharger: 'amr_current_charger',
//     alarmBattery: 'alarm_battery',
//     alarmStatusToggle: 'alarm_status_toggle',
//     workOrderById: 'work_order_by_id',
//     setting: {
//       name: 'setting',
//       keys: {
//         amrSetting: {
//           name: 'amrSetting',
//           settings: {
//             newTaskMinBattery: 'newTaskMinBattery',
//             chargingTaskMinBattery: 'chargingTaskMinBattery',
//           },
//         },
//         logRetentionPeriod: 'logRetentionPeriod',
//         assignmentPriority: 'assignmentPrioriry',
//         workPriorityBoost: 'workPriorityBoost',
//         dailyStartEndSchedule: 'dailyStartEndSchedule',
//         nightlyStartEndSchedule: 'nightlyStartEndSchedule',
//       },
//     },
//   },
// };

export enum RedisKeys {
  WorkerStatus = 'feedback_worker_status',
  Instructions = 'res_get_task',
  ComposeJobs = 'req_compose_job',
  InfoAmr = 'info_amr',
  InfoAmrById = 'info_amr_by_id',
  InfoChargerById = 'info_charger_by_id',
  InfoChargerByResource = 'info_charger_by_resource',
  AmrRecentTask = 'amr_recent_task',
  AmrRecentTaskById = 'amr_recent_task_by_id',
  AmrCurrentCharger = 'amr_current_charger',
  AlarmBattery = 'alarm_battery',
  AlarmStatusToggle = 'alarm_status_toggle',
  WorkOrderById = 'work_order_by_id',
  OrdersByFacilityId = 'orders_by_facility_id',
  Setting = 'setting',
  InfoFacility = 'info_facility',
  InfoFacilityById = 'info_facility_by_id',
  // 신규 추가
  InfoTrackingLogByEqpCallId = 'info_tracking_log_by_eqp_call_id', // [ Key : (설비명) + (콜 번호) ] -> EX) BS100001
}
export enum RedisSettingKeys {
  AmrSetting = 'amrSetting', // amr(로봇) 충전 관련 설정
  LogRetentionPeriod = `logRetentionPeriod`, // 로그 저장 기간, mcslog, acslog
  AssignmentPrioriry = 'assignmentPrioriry', // 작업-로봇 할당 우선 순위 설정 (작업레벨 우선: workLevel(1), 배터리 우선: batteryLevel(2), 거리 우선: distance(3))
  WorkPriorityBoost = `workPriorityBoost`, //작업 우선 순위 상향 설정 (기준시간: priorityBoostTimeLimit)
  DailyStartEndSchedule = `dailyStartEndSchedule`, // 주간 시업/종업
  NightlyStartEndSchedule = `nightlyStartEndSchedule`, // 야간 시업/종업
  LogDisplayDuration = 'logDisplayDuration'  // Tracking Log 중 취소된 작업이 남아있을 수 있는 최대 시간 ( 분 )
}

// export type AmrCurrentChargerTypes = {
//   id: number;
//   chargerId: number;
//   amrId: number;
//   chargerState: ChargerAttributes['state'];
//   startBattery: number | null;
//   endBattery: number | null;
//   startDate: Date | null;
//   endDate: Date | null;
// };

let redisClient: RedisClient | null = null;
export const useRedisUtil = () => {
  if (redisConfig.host && !redisClient) {
    redisClient = redis.createClient(redisConfig.port, redisConfig.host);
    redisClient.on('error', (error) => {
      logging.SYSTEM_ERROR(
        {
          title: 'redis error',
          message: null,
        },
        error
      );
    });
  }

  const makeKey = (key: string): string => {
    return `${redisConfig.header}_${key}`;
  };

  const keys = async (pattern: string): Promise<string[]> => {
    if (!redisClient) return [];
    const asyncKeys = promisify(redisClient.keys).bind(redisClient);
    return asyncKeys(makeKey(pattern));
  };

  const hkeys = async (key: string): Promise<string[]> => {
    if (!redisClient) return [];
    const asyncHkeys = promisify(redisClient.hkeys).bind(redisClient);
    return asyncHkeys(makeKey(key));
  };

  const set = (key: string, value: string): void => {
    if (redisClient) redisClient.set(makeKey(key), value);
  };

  const get = async (key: string): Promise<string | null> => {
    if (!redisClient) return null;
    const asyncGet = promisify(redisClient.get).bind(redisClient);
    return asyncGet(makeKey(key));
  };

  const hset = (key: string, field: string, value: string): void => {
    if (redisClient) {
      const result = redisClient.hset(makeKey(key), field, value);
    }
  };

  const hget = async (key: string, field: string): Promise<string | null> => {
    if (!redisClient) return null;
    const asyncHget = promisify(redisClient.hget).bind(redisClient);
    return asyncHget(makeKey(key), field);
  };
  const hgetObject = async <T>(key: string, field: string): Promise<T | null> => {
    const stringValue = await hget(key, field);
    if (!stringValue) {
      // 에러 로깅 또는 추가적인 처리
      return null;
    }
    try {
      const objectValue: T = JSON.parse(stringValue);
      return objectValue;
    } catch (error) {
      console.error('JSON parsing error:', error);
      return null;
    }
  };
  const hgetAll = async (key: string): Promise<{ [key: string]: string }> => {
    if (!redisClient) return {};

    // 모든 키 가져오기
    const fields = await hkeys(key);
    const asyncHget = promisify(redisClient.hget).bind(redisClient);

    const results: { [key: string]: string } = {};
    for (const field of fields) {
      const value = await asyncHget(makeKey(key), field);
      results[field] = value;
    }

    return results;
  };

  const hgetAllObject = async <T>(key: string): Promise<T[] | null> => {
    if (!redisClient) return [];

    // 모든 키 가져오기
    const fields = await hkeys(key);
    const asyncHget = promisify(redisClient.hget).bind(redisClient);

    const results = [] as T[];
    for (const field of fields) {
      const value = await asyncHget(makeKey(key), field);
      results.push(JSON.parse(value));
    }

    return results;
  };
  const flushall = (): void => {
    if (redisClient) redisClient.flushall();
  };

  const del = (key: string): void => {
    if (redisClient) redisClient.del(makeKey(key));
  };

  const hdel = (key: string, field: string): void => {
    if (redisClient) redisClient.hdel(makeKey(key), field);
  };

  return {
    keys,
    hkeys,
    set,
    hset,
    get,
    hget,
    hgetObject,
    hgetAll,
    hgetAllObject,
    flushall,
    del,
    hdel,
  };
};
