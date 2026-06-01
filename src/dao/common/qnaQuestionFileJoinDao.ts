import { Transaction } from 'sequelize';
import { BulkInsertedOrUpdatedResult, DeletedResult } from '../../lib/resUtil';
import QnaQuestionFileJoin, {
  QnaQuestionFileJoinInsertParams,
  QnaQuestionFileJoinDeleteParams,
} from '../../models/common/qnaQuestionFileJoin';

const dao = {
  bulkInsert(
    paramList: Array<QnaQuestionFileJoinInsertParams>,
    transaction: Transaction | undefined = undefined
  ): Promise<BulkInsertedOrUpdatedResult> {
    return new Promise((resolve, reject) => {
      QnaQuestionFileJoin.bulkCreate(paramList, { transaction: transaction })
        .then((insertedOrUpdatedList) => {
          const insertedOrUpdatedIds = insertedOrUpdatedList.map((row: unknown) => Number((row as { id?: number }).id));
          resolve({ insertedOrUpdatedIds });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  deleteForce(
    params: QnaQuestionFileJoinDeleteParams,
    transaction: Transaction | undefined = undefined
  ): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      QnaQuestionFileJoin.destroy({
        where: { questionId: params.questionId },
        force: true,
        transaction: transaction,
      })
        .then((deleted) => {
          resolve({ deletedCount: deleted });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { dao };
