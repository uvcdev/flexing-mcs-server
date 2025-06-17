import {
  TrackingLogAttributes,
  TrackingLogDeleteParams,
  TrackingLogInsertParams,
  TrackingLogSelectInfoParams,
  TrackingLogSelectListParams,
  TrackingLogUpdateParams,
  TrackingLogUpsertParams,
} from '../../models/common/trackingLog';
import { dao as trackingLogDao } from '../../dao/common/trackingLogDao';
import { LogFormat, logging } from '../../lib/logging';
import {
  BulkInsertedOrUpdatedResult,
  DeletedResult,
  InsertedResult,
  SelectedListResult,
  UpdatedResult,
  ErrorClass,
  responseCode,
} from '../../lib/resUtil';
import { RedisKeys, useRedisUtil } from '../../lib/redisUtil';

const redisUtil = useRedisUtil();

export const trackingLogService = {
  // insert
  async reg(params: TrackingLogInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;

    try {
      result = await trackingLogDao.insert(params);

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
  // selectList
  async list(params: TrackingLogSelectListParams, logFormat: LogFormat<unknown>): Promise<SelectedListResult<TrackingLogAttributes>> {
    let result: SelectedListResult<TrackingLogAttributes>;

    try {
      result = await trackingLogDao.selectList(params);

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
  async info(params: TrackingLogSelectInfoParams, logFormat: LogFormat<unknown>): Promise<TrackingLogAttributes | null> {
    let result: TrackingLogAttributes | null;

    try {
      result = await trackingLogDao.selectInfo(params);

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
  async edit(params: TrackingLogUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    // 1. trackingLog 정보 수정
    try {
      result = await trackingLogDao.update(params);

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
  // delete
  async delete(params: TrackingLogDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      result = await trackingLogDao.delete(params);

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
