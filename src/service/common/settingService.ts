import { Transaction } from 'sequelize';
import { logging, LogFormat } from '../../lib/logging';
import {
  responseCode as resCode,
  makeResponseSuccess as resSuccess,
  responseType as resType,
  makeResponseError as resError,
  ErrorClass,
  InsertedResult,
  UpdatedResult,
  DeletedResult,
  SelectedListResult,
} from '../../lib/resUtil';
import {
  SettingInsertParams,
  SettingSelectListParams,
  SettingSelectInfoParams,
  SettingUpdateParams,
  SettingDeleteParams,
  SettingAttributes,
} from '../../models/common/setting';
import { dao as settingDao } from '../../dao/common/settingDao';
import superagent from 'superagent';
import { logSequelize, sequelize } from '../../models';
import { RedisKeys, useRedisUtil, RedisSettingKeys } from '../../lib/redisUtil';
import { useTimescaleUtil } from '../../lib/timescaleUtil';
const redisUtil = useRedisUtil();
const timescaleUtil = useTimescaleUtil();

const service = {
  async reg(params: SettingInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;

    try {
      result = await settingDao.insert(params);
      void this.redisInit();
      if (params.type === 'logSetting') {
        try {
          const logPeriod = params.data as unknown as { mcsLog: number };
          try {
            const remove = await logSequelize.query(`SELECT remove_retention_policy('logs');`);
            const removeItemLog = await logSequelize.query(`SELECT remove_retention_policy('item_logs');`);
          } catch (err) {
            const add = await logSequelize.query(
              `SELECT add_retention_policy('logs', INTERVAL '${logPeriod.mcsLog} days');`
            );
            const addItemLog = await logSequelize.query(
              `SELECT add_retention_policy('item_logs', INTERVAL '${logPeriod.mcsLog} days');`
            );
          }
          const add = await logSequelize.query(
            `SELECT add_retention_policy('logs', INTERVAL '${logPeriod.mcsLog} days');`
          );
          const addItemLog = await logSequelize.query(
            `SELECT add_retention_policy('item_logs', INTERVAL '${logPeriod.mcsLog} days');`
          );
        } catch (err) {
          // 에러 응답값 세팅
          const resJson = resError(err);
          logging.RESPONSE_DATA(logFormat, resJson);
        }
      }

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
    params: SettingSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<SettingAttributes>> {
    let result: SelectedListResult<SettingAttributes>;
    try {
      result = await settingDao.selectList(params);

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
  async info(params: SettingSelectInfoParams, logFormat: LogFormat<unknown>): Promise<SettingAttributes | null> {
    let result: SettingAttributes | null;

    try {
      result = await settingDao.selectInfo(params);
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
  // update
  async edit(params: SettingUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;
    try {
      result = await settingDao.update(params);
      void this.redisInit();
      if (params.type === 'logSetting') {
        try {
          const logPeriod = params.data as unknown as { mcsLog: number };
          try {
            const remove = await logSequelize.query(`SELECT remove_retention_policy('logs');`);
            const removeItemLog = await logSequelize.query(`SELECT remove_retention_policy('item_logs');`);
            const removePlcDataChangeHistoryLog = await logSequelize.query(
              `SELECT remove_retention_policy('plc_data_change_history_logs');`
            );
          } catch (err) {
            const add = await logSequelize.query(
              `SELECT add_retention_policy('logs', INTERVAL '${logPeriod.mcsLog} days');`
            );
            const addItemLog = await logSequelize.query(
              `SELECT add_retention_policy('item_logs', INTERVAL '${logPeriod.mcsLog} days');`
            );
          }
          const add = await logSequelize.query(
            `SELECT add_retention_policy('logs', INTERVAL '${logPeriod.mcsLog} days');`
          );

          const addItemLog = await logSequelize.query(
            `SELECT add_retention_policy('item_logs', INTERVAL '${logPeriod.mcsLog} days');`
          );
          const addPlcDataChangeHistoryLog = await logSequelize.query(
            `SELECT add_retention_policy('plc_data_change_history_logs', INTERVAL '${logPeriod.mcsLog} days');`
          );
        } catch (err) {
          // 에러 응답값 세팅
          const resJson = resError(err);
          logging.RESPONSE_DATA(logFormat, resJson);
        }
      }

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
  async delete(params: SettingDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;
    try {
      result = await settingDao.delete(params);
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
  // redis init
  async redisInit(): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      redisUtil.del(RedisKeys.Setting);
      const settingList = await settingDao.selectList({});
      settingList.rows.forEach((setting) => {
        redisUtil.hset(RedisKeys.Setting, setting?.type || '', JSON.stringify(setting));
      });

      logging.ACTION_DEBUG({ filename: 'settingService.ts', error: null, params: null, result: true });

      return { insertedId: settingList.rows.length };
    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'settingService.ts',
        error: 'redis mcs setting값 초기화 실패',
        params: null,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },
};

export { service };
