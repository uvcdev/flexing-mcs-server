import { Op, Transaction } from 'sequelize';
import {
  InsertedResult,
  SelectedListResult,
  SelectedAllResult,
  UpdatedResult,
  DeletedResult,
  getOrderby,
} from '../../lib/resUtil';
import Facility, {
  FacilityAttributes,
  FacilityInsertParams,
  FacilitySelectListParams,
  FacilitySelectListQuery,
  // FacilitySelectAllParams,
  // FacilitySelectAllQuery,
  FacilitySelectInfoParams,
  FacilitySelectOneParams,
  FacilitySelectOneCodeParams,
  FacilityUpdateParams,
  FacilityUpdateStateParams,
  // FacilityUpdateLiveStateParams,
  // FacilityUpdateRunningStateParams,
  FacilityDeleteParams,
  FacilitySelectSerialParams,
} from '../../models/operation/facility';
import CommonCode, { CommonCodeAttributesInclude } from '../../models/common/commonCode';
import User, { UserAttributesInclude } from '../../models/common/user';
import FacilityGroup, { FacilityGroupAttributesInclude } from '../../models/operation/facilityGroup';
// import FacilityInterrupt, { FacilityInterruptAttributesInclude } from '../../models/operation/facilityInterrupt';
// import FacilityMaintenance, { FacilityMaintenanceAttributesInclude } from '../../models/operation/facilityMaintenance';
// import FacilityMaintenanceHistory, {
//   FacilityMaintenanceHistoryAttributesInclude,
// } from '../../models/operation/facilityMaintenanceHistory';

const dao = {
  insert(params: FacilityInsertParams, transaction: Transaction | undefined = undefined): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      Facility.create(params, { transaction: transaction })
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: FacilitySelectListParams): Promise<SelectedListResult<FacilityAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: FacilitySelectListQuery = {};
    // 1. where조건 세팅
    if (params.ids) {
      setQuery.where = {
        ...setQuery.where,
        id: params.ids, // 'in' 검색
      };
    }
    if (params.code) {
      setQuery.where = {
        ...setQuery.where,
        code: { [Op.like]: `%${params.code}%` }, // 'like' 검색
      };
    }
    if (params.name) {
      setQuery.where = {
        ...setQuery.where,
        name: { [Op.like]: `%${params.name}%` }, // 'like' 검색
      };
    }
    if (params.uniqueName) {
      setQuery.where = {
        ...setQuery.where,
        name: params.uniqueName, // '=' 검색
      };
    }
    if (params.state) {
      setQuery.where = {
        ...setQuery.where,
        state: params.state, // '=' 검색
      };
    }
    if (params.facilityGroupIds) {
      setQuery.where = {
        ...setQuery.where,
        facilityGroupId: params.facilityGroupIds, // 'in' 검색
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
    if (params.floor) {
      setQuery.where = {
        ...setQuery.where,
        floor: params.floor, // '=' 검색
      };
    }
    if (params.active) {
      setQuery.where = {
        ...setQuery.where,
        active: params.active, // '=' 검색
      };
    }
    if (params.mode) {
      setQuery.where = {
        ...setQuery.where,
        mode: params.mode, // '=' 검색
      };
    }
    // 2. limit, offset 세팅
    if (params.limit && params.limit > 0) setQuery.limit = params.limit;
    if (params.offset && params.offset > 0) setQuery.offset = params.offset;
    // 3. orderby 세팅
    setQuery.order = getOrderby(params.order);

    return new Promise((resolve, reject) => {
      Facility.findAndCountAll({
        ...setQuery,
        attributes: { exclude: ['description'] }, // 해당 필드 제외
        distinct: true,
        include: [
          {
            model: FacilityGroup,
            as: 'FacilityGroup',
            attributes: FacilityGroupAttributesInclude,
          },
          // {
          //   model: Zone,
          //   as: 'Zone',
          //   attributes: ZoneAttributesInclude,
          // },
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
  // selectAll(params: FacilitySelectAllParams): Promise<SelectedAllResult<FacilityAttributes>> {
  //   // DB에 넘길 최종 쿼리 세팅
  //   const setQuery: FacilitySelectAllQuery = {};
  //   // 1. where조건 세팅
  //   if (params.companyIds) {
  //     setQuery.where = {
  //       ...setQuery.where,
  //       companyId: params.companyIds, // 'in' 검색
  //     };
  //   }

  //   return new Promise((resolve, reject) => {
  //     Facility.findAll({
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
  selectInfo(params: FacilitySelectInfoParams): Promise<FacilityAttributes | null> {
    return new Promise((resolve, reject) => {
      Facility.findByPk(params.id, {
        include: [
          {
            model: FacilityGroup,
            as: 'FacilityGroup',
            attributes: FacilityGroupAttributesInclude,
          },
          // {
          //   model: Zone,
          //   as: 'Zone',
          //   attributes: ZoneAttributesInclude,
          // },
          // {
          //   model: User,
          //   as: 'User',
          //   attributes: UserAttributesInclude,
          // },
          // {
          //   model: User,
          //   as: 'Workers',
          //   attributes: UserAttributesInclude,
          //   through: {
          //     attributes: [],
          //   },
          //   include: [
          //     {
          //       model: Department,
          //       as: 'Departments',
          //       attributes: DepartmentAttributesInclude,
          //       through: {
          //         attributes: [],
          //       },
          //     },
          //   ],
          // },
          // 히스토리가 많이 쌓이므로 페이징 처리 하기위해 별도로 호출 한다.
          // {
          //   model: FacilityInterrupt,
          //   as: 'FacilityInterrupts',
          //   attributes: FacilityInterruptAttributesInclude,
          //   include: [
          //     {
          //       model: User,
          //       as: 'User',
          //       attributes: UserAttributesInclude,
          //     },
          //     {
          //       model: User,
          //       as: 'ConfirmUser',
          //       attributes: UserAttributesInclude,
          //     },
          //   ],
          // },
          // 히스토리가 많이 쌓이므로 페이징 처리 하기위해 별도로 호출 한다.
          // {
          //   model: FacilityMaintenance,
          //   as: 'FacilityMaintenances',
          //   attributes: FacilityMaintenanceAttributesInclude,
          //   include: [
          //     {
          //       model: FacilityMaintenanceHistory,
          //       as: 'FacilityMaintenanceHistories',
          //       attributes: FacilityMaintenanceHistoryAttributesInclude,
          //     },
          //   ],
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
  selectOne(params: FacilitySelectOneParams): Promise<FacilityAttributes | null> {
    return new Promise((resolve, reject) => {
      Facility.findOne({
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
  async selectSerial(params: FacilitySelectSerialParams): Promise<FacilityAttributes | null> {
    if (!params.serial) {
      // serial이 없으면 null 반환 또는 throw new Error("...") 처리 가능
      return null;
    }

    try {
      const selectedOne = await Facility.findOne({
        where: { serial: params.serial },
      });
      return selectedOne;
    } catch (err) {
      // 에러 로깅도 추가 가능
      throw err;
    }
  },
  selectOneCode(params: FacilitySelectOneCodeParams): Promise<FacilityAttributes | null> {
    return new Promise((resolve, reject) => {
      Facility.findOne({
        where: { code: params.code },
        attributes: { exclude: ['description'] }, // 해당 필드 제외
      })
        .then((selectedOne) => {
          resolve(selectedOne);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectAllTags(): Promise<SelectedAllResult<FacilityAttributes>> {
    return new Promise((resolve, reject) => {
      Facility.findAll({
        where: {
          tags: { [Op.not]: null },
        },
        attributes: ['id', 'tags'],
      })
        .then((selectedAll) => {
          resolve(selectedAll);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  update(params: FacilityUpdateParams, transaction: Transaction | undefined = undefined): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      Facility.update(params, { where: { id: params.id }, transaction: transaction })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  updateState(params: FacilityUpdateStateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      Facility.update(params, {
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
  updateStateTransac(params: FacilityUpdateStateParams, transaction: Transaction): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      Facility.update(params, {
        where: { id: params.id },
        transaction,
      })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: FacilityDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      Facility.destroy({
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
