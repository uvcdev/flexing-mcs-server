import { Transaction } from 'sequelize';
import { sequelize } from '../../models';
import { LogFormat, logging } from '../../lib/logging';
import { DeletedResult, InsertedResult, SelectedListResult, UpdatedResult } from '../../lib/resUtil';
import {
  QnaQuestionAttributes,
  QnaQuestionInsertParams,
  QnaQuestionSelectInfoParams,
  QnaQuestionSelectListParams,
  QnaQuestionUpdateParams,
  QnaQuestionDeleteParams,
} from '../../models/common/qnaQuestion';
import { dao as qnaQuestionDao } from '../../dao/common/qnaQuestionDao';
import { dao as qnaQuestionFileJoinDao } from '../../dao/common/qnaQuestionFileJoinDao';
import { dao as qnaAnswerFileJoinDao } from '../../dao/common/qnaAnswerFileJoinDao';
import { QnaQuestionFileJoinInsertParams } from '../../models/common/qnaQuestionFileJoin';

const service = {
  // insert (질문 + 첨부파일 조인)
  async reg(params: QnaQuestionInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      result = await qnaQuestionDao.insert(params, transaction);

      if (params.fileIds && params.fileIds.length > 0) {
        const joinParams: QnaQuestionFileJoinInsertParams[] = params.fileIds.map((fileId) => ({
          questionId: result.insertedId,
          fileId,
        }));
        await qnaQuestionFileJoinDao.bulkInsert(joinParams, transaction);
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
  // selectList
  async list(
    params: QnaQuestionSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<QnaQuestionAttributes>> {
    let result: SelectedListResult<QnaQuestionAttributes>;

    try {
      result = await qnaQuestionDao.selectList(params);
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
  // selectInfo (답변/첨부파일 함께)
  async info(
    params: QnaQuestionSelectInfoParams,
    logFormat: LogFormat<unknown>
  ): Promise<QnaQuestionAttributes | null> {
    let result: QnaQuestionAttributes | null;

    try {
      result = await qnaQuestionDao.selectInfo(params);
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
  // update (질문 + 첨부파일 조인 갱신)
  async edit(params: QnaQuestionUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      // 메타 속성(isNotice/type)만 변경하는 경우 updatedAt 갱신을 막기 위해 silent 적용
      // (분류성 변경이라 작성자 콘텐츠가 바뀐 게 아니므로 "수정됨"으로 표시하지 않음)
      const isMetaOnly =
        params.title === undefined &&
        params.content === undefined &&
        params.fileIds === undefined &&
        (params.isNotice !== undefined || params.type !== undefined);

      result = await qnaQuestionDao.update(params, transaction, isMetaOnly);

      // fileIds가 명시적으로 전달된 경우에만 조인 갱신 (undefined면 변경 의도 없음, []이면 전체 제거)
      if (params.fileIds !== undefined && params.fileIds !== null) {
        const questionId = params.id || 0;
        await qnaQuestionFileJoinDao.deleteForce({ questionId }, transaction);

        if (params.fileIds.length > 0) {
          const joinParams: QnaQuestionFileJoinInsertParams[] = params.fileIds.map((fileId) => ({
            questionId,
            fileId,
          }));
          await qnaQuestionFileJoinDao.bulkInsert(joinParams, transaction);
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
  // delete (질문 + 답변 + 모든 조인 soft delete)
  async delete(params: QnaQuestionDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      const questionId = params.id || 0;

      // 1. 해당 질문에 속한 답변 id들 조회 (답변 파일 조인 삭제용)
      const answerIds = await qnaQuestionDao.selectAnswerIdsByQuestionId(questionId, transaction);

      // 2. 답변 파일 조인 hard delete (각 answerId별로 deleteForce 호출)
      for (const answerId of answerIds) {
        await qnaAnswerFileJoinDao.deleteForce({ answerId }, transaction);
      }

      // 3. 답변 soft delete
      await qnaQuestionDao.deleteAnswersByQuestionId(questionId, transaction);

      // 4. 질문 파일 조인 hard delete
      await qnaQuestionFileJoinDao.deleteForce({ questionId }, transaction);

      // 5. 질문 soft delete
      result = await qnaQuestionDao.delete(params, transaction);

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
