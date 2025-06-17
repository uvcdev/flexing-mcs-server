import { Op } from 'sequelize';
import {
  InsertedResult,
  SelectedListResult,
  // SelectedAllResult,
  // UpdatedResult,
  // DeletedResult,
  getOrderby,
  // DeletedResult,
} from '../../lib/resUtil';
import DetailLog, {
  DetailLogAttributes,
  DetailLogInsertParams,
  DetailLogSelectListParams,
  DetailLogSelectListQuery,
  DetailLogSelectInfoParams,
} from '../../models/timescale/detailLog';

const detailLogDao = {
  insert(params: DetailLogInsertParams): Promise<InsertedResult> | void {
    return new Promise((resolve, reject) => {
      DetailLog.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  countDetailLogRecords(params: DetailLogSelectListParams, level: string): Promise<{ [key: string]: number }> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: DetailLogSelectListQuery = {};
    // 1. where조건 세팅
    // tracking Log Id 검색
    if (params.trackingLogId) {
      setQuery.where = {
        ...setQuery.where,
        trackingLogId: params.trackingLogId
      }
    }
    // 기간 검색 - 등록일
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
      DetailLog.count({
        ...setQuery,
        where: {
          ...setQuery.where,
        },
        group: ['function'], // 'function' 컬럼을 기준으로 그룹화.
        // distinct: true,
      })
        .then((selectedList) => {
          resolve(selectedList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(params: DetailLogSelectListParams): Promise<SelectedListResult<DetailLogAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: DetailLogSelectListQuery = {};
    // 1. where조건 세팅
    // TrackingLog 검색
    if (params.trackingLogId) {
      setQuery.where = {
        ...setQuery.where,
        trackingLogId: params.trackingLogId
      }
    }
    // 기간 검색 - 등록일
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
      DetailLog.findAndCountAll({
        ...setQuery,
        where: {
          ...setQuery.where,
        },
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
  selectInfo(params: DetailLogSelectInfoParams): Promise<DetailLogAttributes | null> {
    return new Promise((resolve, reject) => {
      DetailLog.findByPk(params.id, {})
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { detailLogDao };
