import { logging, LogFormat } from '../../lib/logging';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import {
  McsAlarmInsertParams,
  McsAlarmSelectListParams,
  McsAlarmSelectInfoParams,
  McsAlarmUpdateParams,
  McsAlarmDeleteParams,
  McsAlarmAttributes,
  McsAlarmSelectInfoByCodeParams,
} from '../../models/common/mcsAlarm';
import { dao as mcsAlarmDao } from '../../dao/common/mcsAlarmDao';
import { dao as alarmEmailDao } from '../../dao/common/alarmEmailDao';
import { sendMail } from '../../lib/mailUtil';
import { UserAttributes } from '../../models/common/user';
import { MqttTopics, sendMqtt } from '../../lib/mqttUtil';
import { RedisKeys, useRedisUtil } from '../../lib/redisUtil';
import { FacilityAttributesDeep } from '../../models/operation/facility';

const redisUtil = useRedisUtil();

const service = {
  async reg(params: McsAlarmInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      result = await mcsAlarmDao.insert(params);
      // 알람 부분 변경될 가능성 있음
      // sendMqtt(`${MqttTopics.AlarmRegist}/${result.insertedId}`, JSON.stringify(params));
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
    return new Promise((resolve) => {
      resolve(result);
    });
  },
  async list(
    params: McsAlarmSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<McsAlarmAttributes>> {
    let result: SelectedListResult<McsAlarmAttributes>;
    try {
      result = await mcsAlarmDao.selectList(params);

      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectInfo
  async info(params: McsAlarmSelectInfoParams, logFormat: LogFormat<unknown>): Promise<McsAlarmAttributes | null> {
    let result: McsAlarmAttributes | null;

    try {
      result = await mcsAlarmDao.selectInfo(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectInfoByCode
  async infoByCode(params: McsAlarmSelectInfoByCodeParams, logFormat: LogFormat<unknown>): Promise<McsAlarmAttributes | null> {
    let result: McsAlarmAttributes | null;

    try {
      result = await mcsAlarmDao.selectInfoByCode(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  async edit(params: McsAlarmUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;
    try {
      result = await mcsAlarmDao.update(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
    return new Promise((resolve) => {
      resolve(result);
    });
  },
  async delete(params: McsAlarmDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;
    try {
      result = await mcsAlarmDao.delete(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
    return new Promise((resolve) => {
      resolve(result);
    });
  },
};

export { service };
