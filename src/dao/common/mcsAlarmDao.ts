import { Op } from 'sequelize';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import McsAlarm, {
  McsAlarmInsertParams,
  McsAlarmSelectListParams,
  McsAlarmSelectListQuery,
  McsAlarmUpdateParams,
  McsAlarmDeleteParams,
  McsAlarmAttributes,
  McsAlarmSelectInfoParams,
  McsAlarmSelectInfoByCodeParams,
} from '../../models/common/mcsAlarm';
import Facility, { FacilityAttributesInclude } from '../../models/operation/facility';

const dao = {
  insert(params: McsAlarmInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      McsAlarm.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: McsAlarmSelectListParams): Promise<SelectedListResult<McsAlarmAttributes>> {
    const setQuery: McsAlarmSelectListQuery = {};

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
    if (params.code) {
      setQuery.where = {
        ...setQuery.where,
        code: { [Op.like]: `%${params.code}%` }, // 'like' 검색
      };
    }
    if (params.state) {
      setQuery.where = {
        ...setQuery.where,
        state: params.state, // 'in'검색,
      };
    }

    return new Promise((resolve, reject) => {
      McsAlarm.findAndCountAll({
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
  selectInfo(params: McsAlarmSelectInfoParams): Promise<McsAlarmAttributes | null> {
    return new Promise((resolve, reject) => {
      McsAlarm.findByPk(params.id, {
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfoByCode(params: McsAlarmSelectInfoByCodeParams): Promise<McsAlarmAttributes | null> {
    return new Promise((resolve, reject) => {
      McsAlarm.findOne({
        where: {
          code: params.code
        }
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: McsAlarmUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      McsAlarm.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: McsAlarmDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      McsAlarm.destroy({
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
