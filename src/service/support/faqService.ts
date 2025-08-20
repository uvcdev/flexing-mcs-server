import { logging, LogFormat, ActionLog } from '../../lib/logging';
import {
  responseCode as resCode,
  InsertedResult,
  SelectedListResult,
  UpdatedResult,
  DeletedResult,
  ErrorClass,
} from '../../lib/resUtil';
import {
  FaqAttributes,
  FaqInsertParams,
  FaqSelectListParams,
  FaqSelectInfoParams,
  FaqUpdateParams,
  FaqDeleteParams,
} from '../../models/support/faq';
import { dao as faqDao } from '../../dao/support/faqDao';
import { v4 as uuidv4 } from 'uuid';
import { sendMqtt } from '../../lib/mqttUtil';

const service = {
  async syncFAQ(params: {
    operation: string;
    data: FaqInsertParams | FaqUpdateParams;
  }): Promise<InsertedResult | UpdatedResult | DeletedResult> {
    let result: InsertedResult | UpdatedResult | DeletedResult;

    try {
      switch (params.operation) {
        case 'REG': {
          const { id, ...regParams } = params.data as FaqInsertParams & { id?: number };

          // 중복 등록 방지
          let existingData: FaqAttributes | null = null;
          if (regParams.syncId) {
            existingData = await faqDao.selectOne({ syncId: regParams.syncId });
          }

          if (regParams.syncId && !existingData) {
            result = await faqDao.insert(regParams);
          }

          break;
        }
        case 'EDIT': {
          const { id, ...editParams }: FaqUpdateParams = params.data as FaqUpdateParams;

          // 수정한 FAQ가 있다면 수정, 없다면 새로 등록
          let existingData: FaqAttributes | null = null;
          if (editParams.syncId) {
            existingData = await faqDao.selectOne({ syncId: editParams.syncId });
          }

          if (existingData) {
            result = await faqDao.update({ ...editParams, id: existingData.id });
          } else {
            result = await faqDao.insert(editParams as FaqInsertParams);
          }
          break;
        }
        case 'DELETE': {
          const { id, ...deleteParams }: FaqUpdateParams = params.data as FaqDeleteParams;

          // 삭제할 FAQ가 있다면 삭제
          let existingData: FaqAttributes | null = null;
          if (deleteParams.syncId) {
            existingData = await faqDao.selectOne({ syncId: deleteParams.syncId });
          }

          if (existingData) {
            result = await faqDao.delete({ id: existingData.id });
          }
        }
      }
    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'faqService.ts',
        error: 'syncFAQ 실패',
        params,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // insert
  async reg(params: FaqInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;

    try {
      const uuid = uuidv4();
      params.syncId = uuid;
      result = await faqDao.insert(params);
      sendMqtt('faq', JSON.stringify({ operation: 'REG', data: params }));
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
  async list(params: FaqSelectListParams, logFormat: LogFormat<unknown>): Promise<SelectedListResult<FaqAttributes>> {
    let result: SelectedListResult<FaqAttributes>;

    try {
      result = await faqDao.selectList(params);
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
  async info(params: FaqSelectInfoParams, logFormat: LogFormat<unknown>): Promise<FaqAttributes | null> {
    let result: FaqAttributes | null;

    try {
      result = await faqDao.selectInfo(params);
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
  async edit(params: FaqUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    try {
      result = await faqDao.update(params);
      const updatedFaq = await faqDao.selectInfo({ id: params.id });
      params.syncId = updatedFaq?.syncId;
      if (updatedFaq?.syncId) {
        sendMqtt('faq', JSON.stringify({ operation: 'EDIT', data: params }));
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
  // delete
  async delete(params: FaqDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      const deletedFaq = await faqDao.selectInfo({ id: params.id });
      result = await faqDao.delete(params);
      sendMqtt('faq', JSON.stringify({ operation: 'DELETE', data: { syncId: deletedFaq?.syncId } }));
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
