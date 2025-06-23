import { Op, Transaction } from 'sequelize';
import {
  InsertedResult,
  SelectedListResult,
  UpdatedResult,
  DeletedResult,
  getOrderby,
  BulkInsertedOrUpdatedResult,
  FindOrCreatedResult,
} from '../../lib/resUtil';
import TrackingLog, {
  TrackingLogAttributes,
  TrackingLogInsertParams,
  TrackingLogSelectListParams,
  TrackingLogSelectListQuery,
  TrackingLogSelectInfoParams,
  TrackingLogUpdateParams,
  TrackingLogDeleteParams,
  TrackingLogSelectInfoByCodeParams,
  TrackingLogSelectInfoByCallIdParams,
  TrackingLogUpsertParams,
  TrackingLogFindOrCreatedParams,
  TrackingLogSelectInfoByEqpCallIdParams,
} from '../../models/common/trackingLog';

const dao = {
  insert(params: TrackingLogInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  insertTransac(params: TrackingLogInsertParams, transaction: Transaction): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.create(params, {
        transaction,
      })
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  findOrCreate(params: TrackingLogFindOrCreatedParams): Promise<FindOrCreatedResult> {
    const splitEqpCallId = params.eqpCallId.split('$')[0];
    return new Promise((resolve, reject) => {
      TrackingLog.findOrCreate({
        where: {
          eqpCallId: splitEqpCallId
        },
        defaults: {
          ...params,
          eqpCallId: splitEqpCallId
        }
      })
        .then(([findOrCreated, isCreated]) => {
          resolve({ findOrCreatedId: findOrCreated.id, isCreated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: TrackingLogSelectListParams): Promise<SelectedListResult<TrackingLogAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: TrackingLogSelectListQuery = {};
    // 1. where조건 세팅
    if (params.ids) {
      setQuery.where = {
        ...setQuery.where,
        id: params.ids, // '=' 검색
      };
    }
    if (params.code) {
      setQuery.where = {
        ...setQuery.where,
        code: { [Op.like]: `%${params.code}%` }, // 'like' 검색
      };
    }
    if (params.callId) {
      setQuery.where = {
        ...setQuery.where,
        callId: { [Op.like]: `%${params.callId}%` }, // 'like' 검색
      };
    }
    if (params.eqpCallId) {
      setQuery.where = {
        ...setQuery.where,
        eqpCallId: { [Op.like]: `%${params.eqpCallId}%` }, // 'like' 검색
      };
    }
    if (params.caller) {
      setQuery.where = {
        ...setQuery.where,
        caller: params.caller, // '=' 검색
      };
    }
    if (params.fromFacility) {
      setQuery.where = {
        ...setQuery.where,
        fromFacility: params.fromFacility, // '=' 검색
      };
    }
    if (params.toFacility) {
      setQuery.where = {
        ...setQuery.where,
        toFacility: params.toFacility, // '=' 검색
      };
    }
    if (params.assignedRobot) {
      setQuery.where = {
        ...setQuery.where,
        assignedRobot: params.assignedRobot, // '=' 검색
      };
    }
    if (params.state) {
      setQuery.where = {
        ...setQuery.where,
        state: params.state, // '=' 검색
      };
    }
    if (params.createdAtFrom || params.createdAtTo) {
      if (params.createdAtFrom && params.createdAtTo) {
        setQuery.where = {
          ...setQuery.where,
          createdAt: { [Op.between]: [params.createdAtFrom, params.createdAtTo] }, // 'between '검색
        };
      } else {
        if (params.createdAtFrom) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.gte]: params.createdAtFrom }, // '>=' 검색
          };
        }
        if (params.createdAtTo) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.lte]: params.createdAtTo }, // '<=' 검색
          };
        }
      }
    }
    if (params.updatedAtFrom || params.updatedAtTo) {
      if (params.updatedAtFrom && params.updatedAtTo) {
        setQuery.where = {
          ...setQuery.where,
          createdAt: { [Op.between]: [params.updatedAtFrom, params.updatedAtTo] }, // 'between '검색
        };
      } else {
        if (params.updatedAtFrom) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.gte]: params.updatedAtFrom }, // '>=' 검색
          };
        }
        if (params.updatedAtTo) {
          setQuery.where = {
            ...setQuery.where,
            createdAt: { [Op.lte]: params.updatedAtTo }, // '<=' 검색
          };
        }
      }
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      TrackingLog.findAndCountAll({
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
  selectInfo(params: TrackingLogSelectInfoParams): Promise<TrackingLogAttributes | null> {
    return new Promise((resolve, reject) => {
      TrackingLog.findByPk(params.id, {
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfoByCode(params: TrackingLogSelectInfoByCodeParams): Promise<TrackingLogAttributes | null> {
    return new Promise((resolve, reject) => {
      TrackingLog.findOne({
        where: { code: params.code },
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfoByCallId(params: TrackingLogSelectInfoByCallIdParams): Promise<TrackingLogAttributes | null> {
    return new Promise((resolve, reject) => {
      TrackingLog.findOne({
        where: { callId: params.callId },
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfoByEqpCallId(params: TrackingLogSelectInfoByEqpCallIdParams): Promise<TrackingLogAttributes | null> {
    return new Promise((resolve, reject) => {
      TrackingLog.findOne({
        where: { eqpCallId: params.eqpCallId },
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: TrackingLogUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateByCode(params: TrackingLogUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.update(params, { where: { code: params.code } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateByCallId(params: TrackingLogUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.update(params, { where: { callId: params.callId } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: TrackingLogDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      TrackingLog.destroy({
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
