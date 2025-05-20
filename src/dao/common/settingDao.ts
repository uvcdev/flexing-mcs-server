import { Transaction } from 'sequelize';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import Setting, {
  SettingInsertParams,
  SettingSelectListParams,
  SettingSelectListQuery,
  SettingUpdateParams,
  SettingDeleteParams,
  SettingAttributes,
  SettingSelectInfoParams,
} from '../../models/common/setting';

const dao = {
  insert(params: SettingInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      Setting.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: SettingSelectListParams): Promise<SelectedListResult<SettingAttributes>> {
    const setQuery: SettingSelectListQuery = {};

    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    setQuery.order = [['id', 'DESC']];
    setQuery.attributes = params.attributes;

    if (params.ids) {
      setQuery.where = {
        ...setQuery.where,
        id: params.ids, // 'in'검색,
      };
    }
    if (params.system) {
      setQuery.where = {
        ...setQuery.where,
        system: params.system, // '=' 검색
      };
    }
    if (params.type) {
      setQuery.where = {
        ...setQuery.where,
        type: params.type, // '=' 검색
      };
    }

    return new Promise((resolve, reject) => {
      Setting.findAndCountAll({
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
  selectInfo(params: SettingSelectInfoParams): Promise<SettingAttributes | null> {
    return new Promise((resolve, reject) => {
      Setting.findByPk(params.id, {
        include: [
          // {
          //   model: SettingGroup,
          //   as: 'SettingGroup',
          //   attributes: SettingGroupAttributesInclude,
          // },
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
  update(params: SettingUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      Setting.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: SettingDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      Setting.destroy({
        where: { id: params.id },
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
