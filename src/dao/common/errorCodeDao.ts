import { Op } from 'sequelize';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import ErrorCode, {
  ErrorCodeInsertParams,
  ErrorCodeSelectListParams,
  ErrorCodeSelectListQuery,
  ErrorCodeUpdateParams,
  ErrorCodeDeleteParams,
  ErrorCodeAttributes,
  ErrorCodeSelectInfoParams,
  ErrorCodeSelectInfoByCodeParams,
  ErrorCodeSelectInfoByLocationAndCodeParams,
  LocationType,
} from '../../models/common/errorCode';

const dao = {
  insert(params: ErrorCodeInsertParams): Promise<InsertedResult> {
    return new Promise((resolve, reject) => {
      ErrorCode.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: ErrorCodeSelectListParams): Promise<SelectedListResult<ErrorCodeAttributes>> {
    const setQuery: ErrorCodeSelectListQuery = {};

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
    if (params.location) {
      setQuery.where = {
        ...setQuery.where,
        location: params.location, // 'in'검색,
      };
    }
    if (params.errorLevel) {
      setQuery.where = {
        ...setQuery.where,
        errorLevel: params.errorLevel, // 'in'검색,
      };
    }

    return new Promise((resolve, reject) => {
      ErrorCode.findAndCountAll({
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
  // 데이터들의 Location 목록 추출
  selectLocations(): Promise<LocationType[]> {
    return new Promise((resolve, reject) => {
      ErrorCode.findAll({
        attributes: ['location'],  // location 컬럼만 선택
        group: ['location'],       // location별로 그룹화 (중복 제거)
        raw: true                  // 순수 객체로 반환
      })
        .then((locations) => {
          const locationList = locations.map(item => item.location as LocationType);
          resolve(locationList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfo(params: ErrorCodeSelectInfoParams): Promise<ErrorCodeAttributes | null> {
    return new Promise((resolve, reject) => {
      ErrorCode.findByPk(params.id)
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfoByCode(params: ErrorCodeSelectInfoByCodeParams): Promise<ErrorCodeAttributes | null> {
    return new Promise((resolve, reject) => {
      ErrorCode.findOne({
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
  selectInfoByLocationAndCode(params: ErrorCodeSelectInfoByLocationAndCodeParams): Promise<ErrorCodeAttributes | null> {
    return new Promise((resolve, reject) => {
      ErrorCode.findOne({
        where: {
          location: params.location,
          code: params.code,
          deletedAt: null
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
  update(params: ErrorCodeUpdateParams): Promise<UpdatedResult> {
    return new Promise((resolve, reject) => {
      ErrorCode.update(params, { where: { id: params.id } })
        .then(([updated]) => {
          resolve({ updatedCount: updated });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  delete(params: ErrorCodeDeleteParams): Promise<DeletedResult> {
    return new Promise((resolve, reject) => {
      ErrorCode.destroy({
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
