import { Transaction } from 'sequelize';
import { InsertedResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import QnaAnswer, {
  QnaAnswerInsertParams,
  QnaAnswerUpdateParams,
  QnaAnswerDeleteParams,
} from '../../models/common/qnaAnswer';

const dao = {
  insert(params: QnaAnswerInsertParams, transaction: Transaction | undefined = undefined): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswer.create(
        {
          questionId: params.questionId,
          userId: params.userId,
          content: params.content,
        },
        { transaction }
      )
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: QnaAnswerUpdateParams, transaction: Transaction | undefined = undefined): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswer.update(params, { where: { id: params.id }, transaction })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: QnaAnswerDeleteParams, transaction: Transaction | undefined = undefined): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswer.destroy({
        where: {
          id: params.id,
        },
        transaction,
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
