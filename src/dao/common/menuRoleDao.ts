import {
  SelectedListResult,
  // SelectedAllResult,
  // DeletedResult,
  getOrderby,
  BulkInsertedOrUpdatedResult,
} from '../../lib/resUtil';
import MenuRole, {
  MenuRoleAttributes,
  MenuRoleInsertParams,
  MenuRoleSelectListParams,
  MenuRoleSelectListQuery,
} from '../../models/common/menuRole';

const dao = {
  bulkInsert(paramList: Array<MenuRoleInsertParams>): Promise<BulkInsertedOrUpdatedResult> {
    return new Promise((resolve, reject) => {
      MenuRole.bulkCreate(paramList, {
        updateOnDuplicate: ['name', 'authMenu', 'authCreate', 'authUpdate', 'authDelete'],
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

  selectList(params: MenuRoleSelectListParams): Promise<SelectedListResult<MenuRoleAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: MenuRoleSelectListQuery = {};
    // 1. where조건 세팅
    if (params.auth) {
      setQuery.where = {
        ...setQuery.where,
        auth: params.auth, // 'in' 검색
      };
    }

    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      MenuRole.findAndCountAll({
        ...setQuery,
        distinct: true,
      })
        .then((selectedList) => {
          resolve(selectedList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { dao };
