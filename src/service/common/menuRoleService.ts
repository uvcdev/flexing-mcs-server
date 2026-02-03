import { logging, LogFormat } from '../../lib/logging';
import { responseCode as resCode, SelectedListResult, BulkInsertedOrUpdatedResult } from '../../lib/resUtil';
import { dao as menuRoleDao } from '../../dao/common/menuRoleDao';
import { MenuRoleAttributes, MenuRoleInsertParams, MenuRoleSelectListParams } from 'models/common/menuRole';

const service = {
  // insert
  async bulkReg(
    paramList: Array<MenuRoleInsertParams>,
    logFormat: LogFormat<unknown>
  ): Promise<BulkInsertedOrUpdatedResult> {
    let result: BulkInsertedOrUpdatedResult;

    try {
      result = await menuRoleDao.bulkInsert(paramList);
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
  async list(
    params: MenuRoleSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<MenuRoleAttributes>> {
    let result: SelectedListResult<MenuRoleAttributes>;

    try {
      result = await menuRoleDao.selectList(params);
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
