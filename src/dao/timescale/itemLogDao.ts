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
import ItemLog, {
  ItemLogAttributes,
  ItemLogInsertParams,
  ItemLogSelectListParams,
  ItemLogSelectListQuery,
  ItemLogSelectInfoParams,
} from '../../models/timescale/itemLog';

const itemLogDao = {
  insert(params: ItemLogInsertParams): Promise<InsertedResult> | void {
    return new Promise((resolve, reject) => {
      ItemLog.create(params)
        .then((inserted) => {
          resolve({ insertedId: inserted.id });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  countItemLogRecords(params: ItemLogSelectListParams, level: string): Promise<{ [key: string]: number }> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: ItemLogSelectListQuery = {};
    // 1. where조건 세팅
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
      ItemLog.count({
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
  selectList(params: ItemLogSelectListParams): Promise<SelectedListResult<ItemLogAttributes>> {
    // DB에 넘길 최종 쿼리 세팅
    const setQuery: ItemLogSelectListQuery = {};
    // 1. where조건 세팅
    // if (params.trackingLogId) {
    //   setQuery.where = {
    //     ...setQuery.where,
    //     trackingLogId: params.trackingLogId, // '=' 검색
    //   }
    // }
    if (params.itemCode) {
      setQuery.where = {
        ...setQuery.where,
        itemCode: { [Op.like]: `%${params.itemCode}%` }, // 'like' 검색
      };
    }
    if (params.facilityCode) {
      setQuery.where = {
        ...setQuery.where,
        facilityCode: { [Op.like]: `%${params.facilityCode}%` }, // 'like' 검색
      };
    }
    if (params.facilityName) {
      setQuery.where = {
        ...setQuery.where,
        facilityName: { [Op.like]: `%${params.facilityName}%` }, // 'like' 검색
      };
    }
    if (params.amrCode) {
      setQuery.where = {
        ...setQuery.where,
        amrCode: { [Op.like]: `%${params.amrCode}%` }, // 'like' 검색
      };
    }
    if (params.amrName) {
      setQuery.where = {
        ...setQuery.where,
        amrName: { [Op.like]: `%${params.amrName}%` }, // 'like' 검색
      };
    }
    if (params.floor) {
      setQuery.where = {
        ...setQuery.where,
        floor: { [Op.like]: `%${params.floor}%` }, // 'like' 검색
      };
    }
    if (params.subject) {
      setQuery.where = {
        ...setQuery.where,
        subject: { [Op.like]: `%${params.subject}%` }, // 'like' 검색
      };
    }
    if (params.topic) {
      setQuery.where = {
        ...setQuery.where,
        topic: { [Op.like]: `%${params.topic}%` }, // 'like' 검색
      };
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
      ItemLog.findAndCountAll({
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
  selectInfo(params: ItemLogSelectInfoParams): Promise<ItemLogAttributes | null> {
    return new Promise((resolve, reject) => {
      ItemLog.findByPk(params.id, {})
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { itemLogDao };
