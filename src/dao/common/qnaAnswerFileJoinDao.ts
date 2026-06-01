import { Transaction } from 'sequelize';
import { BulkInsertedOrUpdatedResult, DeletedResult } from '../../lib/resUtil';
import QnaAnswerFileJoin, {
  QnaAnswerFileJoinInsertParams,
  QnaAnswerFileJoinDeleteParams,
} from '../../models/common/qnaAnswerFileJoin';

const dao = {
  bulkInsert(
    paramList: Array<QnaAnswerFileJoinInsertParams>,
    transaction: Transaction | undefined = undefined
  ): Promise<BulkInsertedOrUpdatedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswerFileJoin.bulkCreate(paramList, { transaction: transaction })
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
    params: QnaAnswerFileJoinDeleteParams,
    transaction: Transaction | undefined = undefined
  ): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswerFileJoin.destroy({
        where: { answerId: params.answerId },
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
