import { logging, LogFormat } from '../../lib/logging';
import { responseCode as resCode, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import {
  PlcDataChangeHistoryLogAttributes,
  PlcDataChangeHistoryLogInsertParams,
  PlcDataChangeHistoryLogSelectInfoParams,
  PlcDataChangeHistoryLogSelectListParams,
} from '../../models/timescale/plcDataChangeHistoryLog';
import { plcDataChangeHistoryLogDao, InsertedResult } from '../../dao/timescale/plcDataChangeHistoryLogDao';

const plcDataChangeHistoryLogService = {
  // insert
  async reg(params: PlcDataChangeHistoryLogInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      const tempResult = await plcDataChangeHistoryLogDao.insert(params);
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
    params: PlcDataChangeHistoryLogSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<PlcDataChangeHistoryLogAttributes>> {
    let result: SelectedListResult<PlcDataChangeHistoryLogAttributes>;

    try {
      result = await plcDataChangeHistoryLogDao.selectList(params);
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
  async info(
    params: PlcDataChangeHistoryLogSelectInfoParams,
    logFormat: LogFormat<unknown>
  ): Promise<PlcDataChangeHistoryLogAttributes | null> {
    let result: PlcDataChangeHistoryLogAttributes | null;

    try {
      result = await plcDataChangeHistoryLogDao.selectInfo(params);
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

export { plcDataChangeHistoryLogService };
