import { Op } from 'sequelize';
import {
  InsertedResult,
  BulkInsertedOrUpdatedResult,
  SelectedListResult,
  UpdatedResult,
  DeletedResult,
  getOrderby,
} from '../../lib/resUtil';
import Faq, {
  FaqAttributes,
  FaqInsertParams,
  FaqSelectListParams,
  FaqSelectListQuery,
  FaqSelectInfoParams,
  FaqUpdateParams,
  FaqDeleteParams,
  FaqSelectOneParams,
} from '../../models/support/faq';
import User, { UserAttributesInclude } from '../../models/common/user';

const dao = {
  insert(params: FaqInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      Faq.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: FaqSelectListParams): Promise<SelectedListResult<FaqAttributes>> {
    // 공개 범위에 따라 검색할 권한 배열 리턴
    const getVisibleAuthArray = (target: FaqAttributes['visibleAuth']): FaqAttributes['visibleAuth'][] => {
      const authArray = ['viewer', 'staff', 'admin', 'system'] as const;
      const index = authArray.indexOf(target);
      if (index === -1) return [];

      return authArray.slice(0, index + 1);
    };

    // DB에 넘길 최종 쿼리 세팅
    const setQuery: FaqSelectListQuery = {};
    // 1. where 조건 세팅
    if (params.categories) {
      setQuery.where = {
        ...setQuery.where,
        category: params.categories, // 'in'검색
      };
    }
    if (params.subCategories) {
      setQuery.where = {
        ...setQuery.where,
        subCategory: params.subCategories, // 'in'검색
      };
    }
    if (params.userIds) {
      setQuery.where = {
        ...setQuery.where,
        userId: params.userIds, // 'in'검색
      };
    }
    if (params.visibleAuth) {
      setQuery.where = {
        ...setQuery.where,
        visibleAuth: getVisibleAuthArray(params.visibleAuth), // 'in'검색
      };
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    // setQuery.order = getOrderby(params.order);
    setQuery.order = [['orderby', 'ASC']];

    return new Promise((resolve, reject) => {
      Faq.findAndCountAll({
        ...setQuery,
        distinct: true,
        include: [
          {
            model: User,
            as: 'User',
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
  selectInfo(params: FaqSelectInfoParams): Promise<FaqAttributes | null> {
    return new Promise((resolve, reject) => {
      Faq.findByPk(params.id, {
        include: [
          {
            model: User,
            as: 'User',
            attributes: UserAttributesInclude,
          },
        ],
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectOne(params: FaqSelectOneParams): Promise<FaqAttributes | null> {
    return new Promise((resolve, reject) => {
      Faq.findOne({
        where: { syncId: params.syncId },
      })
        .then((selectedOne) => {
          resolve(selectedOne);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: FaqUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      Faq.update(params, {
        where: { id: params.id },
      })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  bulkUpdateOrderby(paramList: Array<FaqUpdateParams>): Promise<BulkInsertedOrUpdatedResult> {
    return new Promise((resolve, reject) => {
      Faq.bulkCreate(paramList, {
        updateOnDuplicate: ['name', 'orderby', 'level', 'masterCode'],
      })
        .then((insertedOrUpdatedList) => {
          const insertedOrUpdatedIds = insertedOrUpdatedList.map((row: unknown) => Number((row as { id?: number }).id));
          resolve({ insertedOrUpdatedIds });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: FaqDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      Faq.destroy({
        where: {
          id: params.id,
        },
        force: true, // syncId 유니크 제약조건 때문에 force 삭제
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
