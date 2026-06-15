import { Transaction } from 'sequelize';
import { sequelize } from '../../models';
import { LogFormat, logging } from '../../lib/logging';
import { DeletedResult, InsertedResult, UpdatedResult } from '../../lib/resUtil';
import { QnaAnswerInsertParams, QnaAnswerUpdateParams, QnaAnswerDeleteParams } from '../../models/common/qnaAnswer';
import { dao as qnaAnswerDao } from '../../dao/common/qnaAnswerDao';
import { dao as qnaAnswerFileJoinDao } from '../../dao/common/qnaAnswerFileJoinDao';
import { QnaAnswerFileJoinInsertParams } from '../../models/common/qnaAnswerFileJoin';

const service = {
  // insert (답변 + 첨부파일 조인)
  async reg(params: QnaAnswerInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      result = await qnaAnswerDao.insert(params, transaction);

      if (params.fileIds && params.fileIds.length > 0) {
        const joinParams: QnaAnswerFileJoinInsertParams[] = params.fileIds.map((fileId) => ({
          answerId: result.insertedId,
          fileId,
        }));
        await qnaAnswerFileJoinDao.bulkInsert(joinParams, transaction);
      }

      await transaction.commit();
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      await transaction.rollback();
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // update (답변 + 첨부파일 조인 갱신)
  async edit(params: QnaAnswerUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      result = await qnaAnswerDao.update(params, transaction);

      // fileIds가 명시적으로 전달된 경우에만 조인 갱신
      if (params.fileIds !== undefined && params.fileIds !== null) {
        const answerId = params.id || 0;
        await qnaAnswerFileJoinDao.deleteForce({ answerId }, transaction);

        if (params.fileIds.length > 0) {
          const joinParams: QnaAnswerFileJoinInsertParams[] = params.fileIds.map((fileId) => ({
            answerId,
            fileId,
          }));
          await qnaAnswerFileJoinDao.bulkInsert(joinParams, transaction);
        }
      }

      await transaction.commit();
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      await transaction.rollback();
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // delete (답변 + 첨부파일 조인 hard delete + 답변 soft delete)
  async delete(params: QnaAnswerDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      const answerId = params.id || 0;

      // 1. 답변 파일 조인 hard delete
      await qnaAnswerFileJoinDao.deleteForce({ answerId }, transaction);

      // 2. 답변 soft delete
      result = await qnaAnswerDao.delete(params, transaction);

      await transaction.commit();
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      await transaction.rollback();
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
