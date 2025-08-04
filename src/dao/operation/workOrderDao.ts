import { Op, Transaction } from 'sequelize';
import {
  InsertedResult,
  SelectedListResult,
  SelectedAllResult,
  UpdatedResult,
  DeletedResult,
  getOrderby,
} from '../../lib/resUtil';
import WorkOrder, {
  WorkOrderAttributes,
  WorkOrderInsertParams,
  WorkOrderSelectListParams,
  WorkOrderSelectListQuery,
  // WorkOrderSelectAllParams,
  // WorkOrderSelectAllQuery,
  WorkOrderSelectInfoParams,
  WorkOrderSelectOneParams,
  WorkOrderUpdateParams,
  // WorkOrderUpdateLiveStateParams,
  // WorkOrderUpdateRunningStateParams,
  WorkOrderDeleteParams,
  WorkOrderSelectInfoByCodeParams,
} from '../../models/operation/workOrder';
import CommonCode, { CommonCodeAttributesInclude } from '../../models/common/commonCode';
import User, { UserAttributesInclude } from '../../models/common/user';
import Item, { ItemAttributesInclude } from '../../models/operation/item';
import Facility, { FacilityAttributesInclude } from '../../models/operation/facility';
import Amr, { AmrAttributesInclude } from '../../models/common/amr';
// import WorkOrderInterrupt, { WorkOrderInterruptAttributesInclude } from '../../models/operation/workOrderInterrupt';
// import WorkOrderMaintenance, { WorkOrderMaintenanceAttributesInclude } from '../../models/operation/workOrderMaintenance';
// import WorkOrderMaintenanceHistory, {
//   WorkOrderMaintenanceHistoryAttributesInclude,
// } from '../../models/operation/workOrderMaintenanceHistory';

const dao = {
  insert(params: WorkOrderInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      WorkOrder.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  insertTransac(params: WorkOrderInsertParams, transaction: Transaction): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      WorkOrder.create(params, {
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
  selectList(params: WorkOrderSelectListParams): Promise<SelectedListResult<WorkOrderAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: WorkOrderSelectListQuery = {};
    // 1. where조건 세팅
    if (params.ids) {
      setQuery.where = {
        ...setQuery.where,
        id: params.ids, // '=' 검색
      };
    }
    if (params.fromFacilityId) {
      setQuery.where = {
        ...setQuery.where,
        fromFacilityId: params.fromFacilityId, // '=' 검색
      };
    }
    if (params.toFacilityId) {
      setQuery.where = {
        ...setQuery.where,
        toFacilityId: params.toFacilityId, // '=' 검색
      };
    }
    if (params.code) {
      setQuery.where = {
        ...setQuery.where,
        code: params.code, // '=' 검색
      };
    }
    if (params.itemId) {
      setQuery.where = {
        ...setQuery.where,
        itemId: params.itemId, // '=' 검색
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
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      WorkOrder.findAndCountAll({
        ...setQuery,
        distinct: true,
        include: [
          {
            model: Facility,
            as: 'FromFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Facility,
            as: 'ToFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Item,
            as: 'Item',
            attributes: ItemAttributesInclude,
          },
          {
            model: Amr,
            as: 'Amr',
            attributes: AmrAttributesInclude,
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
  selectRecentList(params: WorkOrderSelectListParams): Promise<SelectedListResult<WorkOrderAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: WorkOrderSelectListQuery = {};
    // 1. where조건 세팅
    if (params.fromFacilityId) {
      setQuery.where = {
        ...setQuery.where,
        fromFacilityId: params.fromFacilityId, // '=' 검색
      };
    }
    if (params.toFacilityId) {
      setQuery.where = {
        ...setQuery.where,
        toFacilityId: params.toFacilityId, // '=' 검색
      };
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.code);

    return new Promise((resolve, reject) => {
      WorkOrder.findAndCountAll({
        ...setQuery,
        distinct: true,
        include: [
          {
            model: Facility,
            as: 'FromFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Facility,
            as: 'ToFacility',
            attributes: FacilityAttributesInclude,
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
  selectListCount(params: WorkOrderSelectListParams): Promise<SelectedListResult<WorkOrderAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: WorkOrderSelectListQuery = {};
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
    if (params.itemId) {
      setQuery.where = {
        ...setQuery.where,
        itemId: params.itemId, // in 검색
      };
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      WorkOrder.findAndCountAll({
        ...setQuery,
        attributes: ['id', 'code'],
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
  // selectAll(params: WorkOrderSelectAllParams): Promise<SelectedAllResult<WorkOrderAttributes>> {
  //   // DB에 넘길 최종 쿼리 세팅
  //   const setQuery: WorkOrderSelectAllQuery = {};
  //   // 1. where조건 세팅
  //   if (params.companyIds) {
  //     setQuery.where = {
  //       ...setQuery.where,
  //       companyId: params.companyIds, // 'in' 검색
  //     };
  //   }

  //   return new Promise((resolve, reject) => {
  //     WorkOrder.findAll({
  //       ...setQuery,
  //       order: [['code', 'ASC']],
  //     })
  //       .then((selectedAll) => {
  //         resolve(selectedAll);
  //       })
  //       .catch((err) => {
  //         reject(err);
  //       });
  //   });
  // },
  selectInfo(params: WorkOrderSelectInfoParams): Promise<WorkOrderAttributes | null> {
    return new Promise((resolve, reject) => {
      WorkOrder.findByPk(params.id, {
        include: [
          {
            model: Facility,
            as: 'FromFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Facility,
            as: 'ToFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Item,
            as: 'Item',
            attributes: ItemAttributesInclude,
          },
          {
            model: Amr,
            as: 'Amr',
            attributes: AmrAttributesInclude,
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
  selectInfoByCode(params: WorkOrderSelectInfoByCodeParams): Promise<WorkOrderAttributes | null> {
    return new Promise((resolve, reject) => {
      WorkOrder.findOne({
        where: { code: params.code },
        include: [
          {
            model: Facility,
            as: 'FromFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Facility,
            as: 'ToFacility',
            attributes: FacilityAttributesInclude,
          },
          {
            model: Item,
            as: 'Item',
            attributes: ItemAttributesInclude,
          },
          {
            model: Amr,
            as: 'Amr',
            attributes: AmrAttributesInclude,
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
  selectOne(params: WorkOrderSelectOneParams): Promise<WorkOrderAttributes | null> {
    return new Promise((resolve, reject) => {
      WorkOrder.findOne({
        where: { id: params.id },
      })
        .then((selectedOne) => {
          resolve(selectedOne);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: WorkOrderUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      WorkOrder.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateByCode(params: WorkOrderUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      WorkOrder.update(params, { where: { code: params.code } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: WorkOrderDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      WorkOrder.destroy({
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
