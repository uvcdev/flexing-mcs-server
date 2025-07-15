import {
  ErrorCodeAttributes,
  ErrorCodeDeleteParams,
  ErrorCodeInsertParams,
  ErrorCodeSelectInfoByCodeParams,
  ErrorCodeSelectInfoByLocationAndCodeParams,
  ErrorCodeSelectInfoParams,
  ErrorCodeSelectListParams,
  ErrorCodeUpdateParams,
  LocationType,
} from '../../models/common/errorCode';
import { dao as errorCodeDao } from '../../dao/common/errorCodeDao';
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

export const errorCodeService = {
  // insert
  async reg(params: ErrorCodeInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      result = await errorCodeDao.insert(params);
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
  async list(params: ErrorCodeSelectListParams, logFormat: LogFormat<unknown>): Promise<SelectedListResult<ErrorCodeAttributes>> {
    let result: SelectedListResult<ErrorCodeAttributes>;

    try {
      result = await errorCodeDao.selectList(params);

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
  // selectLocations
  async locationList(logFormat: LogFormat<unknown>): Promise<LocationType[]> {
    let result: LocationType[];  // ✅ 타입 수정

    try {
      result = await errorCodeDao.selectLocations();

      logging.METHOD_ACTION(logFormat, __filename, {}, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, {}, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectInfo
  async info(params: ErrorCodeSelectInfoParams, logFormat: LogFormat<unknown>): Promise<ErrorCodeAttributes | null> {
    let result: ErrorCodeAttributes | null;

    try {
      result = await errorCodeDao.selectInfo(params);

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
  async infoByCode(params: ErrorCodeSelectInfoByCodeParams, logFormat: LogFormat<unknown>): Promise<ErrorCodeAttributes | null> {
    let result: ErrorCodeAttributes | null;

    try {
      result = await errorCodeDao.selectInfoByCode(params);

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
  // selectInfoByLocationAndCode
  async infoByLocationByCode(params: ErrorCodeSelectInfoByLocationAndCodeParams, logFormat: LogFormat<unknown>): Promise<ErrorCodeAttributes | null> {
    let result: ErrorCodeAttributes | null;

    try {
      result = await errorCodeDao.selectInfoByLocationAndCode(params);
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
  async edit(params: ErrorCodeUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    // 1. errorCode 정보 수정
    try {
      result = await errorCodeDao.update(params);

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
  async delete(params: ErrorCodeDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      result = await errorCodeDao.delete(params);

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
