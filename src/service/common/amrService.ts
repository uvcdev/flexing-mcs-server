import {
  AmrAttributes,
  AmrDeleteParams,
  AmrInsertParams,
  AmrSelectInfoParams,
  AmrSelectListParams,
  AmrUpdateParams,
  AmrUpsertParams,
} from '../../models/common/amr';
import { dao as amrDao } from '../../dao/common/amrDao';
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

export const amrService = {
  // insert
  async reg(params: AmrInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;

    try {
      result = await amrDao.insert(params);

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
  // bulkInsert from websocket
  async bulkInsert(
    paramList: Array<AmrUpsertParams>,
    logFormat: LogFormat<unknown>
  ): Promise<BulkInsertedOrUpdatedResult> {
    let result: BulkInsertedOrUpdatedResult;
    try {
      result = await amrDao.bulkInsert(paramList);

      if (result.insertedOrUpdatedIds && result.insertedOrUpdatedIds.length > 0) {
        for (const id of result.insertedOrUpdatedIds) {
          void this.writeSingleRedis(id);
        }
      }

      logging.METHOD_ACTION(logFormat, __filename, paramList, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, paramList, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectList
  async list(params: AmrSelectListParams, logFormat: LogFormat<unknown>): Promise<SelectedListResult<AmrAttributes>> {
    let result: SelectedListResult<AmrAttributes>;

    try {
      result = await amrDao.selectList(params);

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
  async info(params: AmrSelectInfoParams, logFormat: LogFormat<unknown>): Promise<AmrAttributes | null> {
    let result: AmrAttributes | null;

    try {
      result = await amrDao.selectInfo(params);

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
  async edit(params: AmrUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    // 1. amr 정보 수정
    try {
      result = await amrDao.update(params);

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
  async delete(params: AmrDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      result = await amrDao.delete(params);

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

  async writeAllRedis(): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      redisUtil.del(RedisKeys.InfoAmr);
      redisUtil.del(RedisKeys.InfoAmrById);
      const amrList = await amrDao.selectList({});
      amrList.rows.forEach((amr) => {
        const amrInfo = amr as AmrAttributes;
        const amrString = JSON.stringify(amrInfo);
        if (amrInfo?.active === true) {
          redisUtil.hset(RedisKeys.InfoAmr, amrInfo.code.toString(), amrString);
          redisUtil.hset(RedisKeys.InfoAmrById, amrInfo.id.toString(), amrString);
        } else if (amrInfo?.active === false) {
          redisUtil.hdel(RedisKeys.InfoAmr, amrInfo.code.toString());
          redisUtil.hdel(RedisKeys.InfoAmrById, amrInfo.id.toString());
        }
      });

      logging.ACTION_DEBUG({
        filename: 'amrService.ts',
        error: null,
        params: null,
        result: 'amr writeAllRedis success',
      });

      return { insertedId: amrList.rows.length }

    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'amrService.ts',
        error: 'redis acs amr info값 초기화 실패',
        params: null,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },

  // redis init
  async writeSingleRedis(amrId: number): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      const amrInfo = await amrDao.selectInfo({ id: amrId });
      const amrInfoRedisString = JSON.stringify(amrInfo);

      if (amrInfo?.active === true) {
        redisUtil.hset(RedisKeys.InfoAmr, amrInfo.code.toString(), amrInfoRedisString);
        redisUtil.hset(RedisKeys.InfoAmrById, amrInfo.id.toString(), amrInfoRedisString);
      } else if (amrInfo?.active === false) {
        redisUtil.hdel(RedisKeys.InfoAmr, amrInfo.code.toString());
        redisUtil.hdel(RedisKeys.InfoAmrById, amrInfo.id.toString());
      }

      logging.ACTION_DEBUG({
        filename: 'amrService.ts',
        error: null,
        params: null,
        result: 'amr writeSingleRedis success',
      });

      return { insertedId: amrId }
    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'amrService.ts',
        error: 'redis acs amr info값 초기화 실패',
        params: null,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },
};
