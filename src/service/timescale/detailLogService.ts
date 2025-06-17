import { logging, LogFormat } from '../../lib/logging';
import {
  responseCode as resCode,
  InsertedResult,
  SelectedListResult,
} from '../../lib/resUtil';
import {
  DetailLogAttributes,
  DetailLogInsertParams,
  DetailLogSelectInfoParams,
  DetailLogSelectListParams,
} from '../../models/timescale/detailLog';
import { detailLogDao } from '../../dao/timescale/detailLogDao';

const detailLogService = {
  // insert
  async reg(params: DetailLogInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      const tempResult = await detailLogDao.insert(params);
      if (!tempResult) {
        result = {} as InsertedResult;
      } else {
        result = tempResult;
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
  // selectList
  async list(
    params: DetailLogSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<DetailLogAttributes>> {
    let result: SelectedListResult<DetailLogAttributes>;

    try {
      result = await detailLogDao.selectList(params);
      // logging.METHOD_ACTION(logFormat, __filename, params, result);
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
  async info(params: DetailLogSelectInfoParams, logFormat: LogFormat<unknown>): Promise<DetailLogAttributes | null> {
    let result: DetailLogAttributes | null;

    try {
      result = await detailLogDao.selectInfo(params);
      // logging.METHOD_ACTION(logFormat, __filename, params, result);
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

export { detailLogService };
