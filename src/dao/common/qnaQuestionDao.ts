import { Op, Order, Transaction, literal } from 'sequelize';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult, getOrderby } from '../../lib/resUtil';
import QnaQuestion, {
  QnaQuestionAttributes,
  QnaQuestionInsertParams,
  QnaQuestionSelectListParams,
  QnaQuestionSelectListQuery,
  QnaQuestionSelectInfoParams,
  QnaQuestionUpdateParams,
  QnaQuestionDeleteParams,
  QnaQuestionAttributesInclude,
} from '../../models/common/qnaQuestion';
import QnaAnswer, { QnaAnswerAttributesInclude } from '../../models/common/qnaAnswer';
import User, { UserAttributesInclude } from '../../models/common/user';
import File, { FileAttributesInclude } from '../../models/common/file';

const dao = {
  insert(params: QnaQuestionInsertParams, transaction: Transaction | undefined = undefined): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      QnaQuestion.create(
        {
          userId: params.userId,
          title: params.title,
          content: params.content,
          type: params.type ?? null,
          isNotice: params.isNotice ?? false,
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
  selectList(params: QnaQuestionSelectListParams): Promise<SelectedListResult<QnaQuestionAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: QnaQuestionSelectListQuery = {};
    // 1. where조건 세팅
    if (params.title) {
      setQuery.where = {
        ...setQuery.where,
        title: { [Op.like]: `%${params.title}%` }, // 'like' 검색
      };
    }
    if (params.types && params.types.length > 0) {
      setQuery.where = {
        ...setQuery.where,
        type: { [Op.in]: params.types }, // 'in' 검색 (멀티셀렉트)
      };
    }
    if (params.userId) {
      setQuery.where = {
        ...setQuery.where,
        userId: params.userId, // '=' 검색
      };
    }
    // 기간 검색 - 등록일
    if (params.createdAtFrom || params.createdAtTo) {
      if (params.createdAtFrom && params.createdAtTo) {
        setQuery.where = {
          ...setQuery.where,
          createdAt: { [Op.between]: [params.createdAtFrom, params.createdAtTo] },
        };
      } else {
        if (params.createdAtFrom) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.gte]: params.createdAtFrom },
          };
        }
        if (params.createdAtTo) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.lte]: params.createdAtTo },
          };
        }
      }
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅 (공지 우선 정렬을 항상 prepend)
    const baseOrder = getOrderby(params.order);
    setQuery.order = [['isNotice', 'DESC'], ...baseOrder] as Order;

    return new Promise((resolve, reject) => {
      QnaQuestion.findAndCountAll({
        ...setQuery,
        attributes: {
          include: [
            // 답변 수(answerCount) - 서브쿼리 (paranoid: deletedAt이 null인 행만 카운트)
            [
              literal(
                `(SELECT COUNT(*) FROM "qna_answers" AS "qna_answers" WHERE "qna_answers"."question_id" = "QnaQuestion"."id" AND "qna_answers"."deleted_at" IS NULL)`
              ),
              'answerCount',
            ],
          ],
        },
        distinct: true,
        include: [
          {
            model: User,
            attributes: UserAttributesInclude,
          },
        ],
      })
        .then((selectedList) => {
          resolve(selectedList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfo(params: QnaQuestionSelectInfoParams): Promise<QnaQuestionAttributes | null> {
    return new Promise((resolve, reject) => {
      QnaQuestion.findByPk(params.id, {
        attributes: QnaQuestionAttributesInclude,
        include: [
          {
            model: User,
            attributes: UserAttributesInclude,
          },
          {
            model: File,
            as: 'Files',
            attributes: FileAttributesInclude,
            through: { attributes: [] },
          },
          {
            model: QnaAnswer,
            as: 'Answers',
            attributes: QnaAnswerAttributesInclude,
            include: [
              {
                model: User,
                attributes: UserAttributesInclude,
              },
              {
                model: File,
                as: 'Files',
                attributes: FileAttributesInclude,
                through: { attributes: [] },
              },
            ],
          },
        ],
        order: [[{ model: QnaAnswer, as: 'Answers' }, 'id', 'ASC']],
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(
    params: QnaQuestionUpdateParams,
    transaction: Transaction | undefined = undefined,
    silent = false
  ): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      QnaQuestion.update(params, { where: { id: params.id }, transaction, silent })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: QnaQuestionDeleteParams, transaction: Transaction | undefined = undefined): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      QnaQuestion.destroy({
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
  // 질문에 속한 답변 id 목록 조회 (삭제 시 답변 파일 조인 cascade를 위해 사용)
  selectAnswerIdsByQuestionId(
    questionId: number,
    transaction: Transaction | undefined = undefined
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      QnaAnswer.findAll({
        where: { questionId },
        attributes: ['id'],
        transaction,
      })
        .then((rows) => {
          resolve(rows.map((row) => ((row as unknown) as { id: number }).id));
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  // 질문 삭제 시 해당 질문에 속한 답변들을 일괄 soft delete
  deleteAnswersByQuestionId(
    questionId: number,
    transaction: Transaction | undefined = undefined
  ): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      QnaAnswer.destroy({
        where: { questionId },
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
