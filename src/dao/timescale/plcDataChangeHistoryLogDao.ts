import { Op } from 'sequelize';
import PlcDataChangeHistoryLog, {
  PlcDataChangeHistoryLogAttributes,
  PlcDataChangeHistoryLogInsertParams,
  PlcDataChangeHistoryLogSelectListParams,
  PlcDataChangeHistoryLogSelectListQuery,
  PlcDataChangeHistoryLogSelectInfoParams,
} from '../../models/timescale/plcDataChangeHistoryLog';
import { getOrderby, getOrderbyTs, SelectedListResult } from '../../lib/resUtil';

export interface InsertedResult {
  insertedTs: Date;
}
const plcDataChangeHistoryLogDao = {
  insert(params: PlcDataChangeHistoryLogInsertParams): Promise<InsertedResult> | void {
    return new Promise((resolve, reject) => {
      PlcDataChangeHistoryLog.create(params)
        .then((inserted) => {
          resolve({ insertedTs: inserted.ts });
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectList(
    params: PlcDataChangeHistoryLogSelectListParams
  ): Promise<SelectedListResult<PlcDataChangeHistoryLogAttributes>> {
    const setQuery: PlcDataChangeHistoryLogSelectListQuery = {};
    // 1. where 세팅
    if (params.facilityCode) {
      setQuery.where = {
        ...setQuery.where,
        facilityCode: { [Op.like]: `%${params.facilityCode}%` }, // 'like' 검색
      };
    }
    if (params.facilityName) {
      setQuery.where = {
        ...setQuery.where,
        facilityName: params.facilityName, // 'in' 검색
      };
    }
    if (params.facilityType) {
      setQuery.where = {
        ...setQuery.where,
        facilityType: { [Op.like]: `%${params.facilityType}%` }, // 'like' 검색
      };
    }
    if (params.isTriggered) {
      setQuery.where = {
        ...setQuery.where,
        isTriggered: params.isTriggered, // true/false 검색
      };
    }
    if (params.tagName) {
      setQuery.where = {
        ...setQuery.where,
        tagName: params.tagName, // 'in' 검색
      };
    }
    if (params.oldValue) {
      setQuery.where = {
        ...setQuery.where,
        oldValue: { [Op.like]: `%${params.oldValue}%` }, // 'like' 검색
      };
    }
    if (params.newValue) {
      setQuery.where = {
        ...setQuery.where,
        newValue: { [Op.like]: `%${params.newValue}%` }, // 'like' 검색
      };
    }
    if (params.valueType) {
      setQuery.where = {
        ...setQuery.where,
        valueType: { [Op.like]: `%${params.valueType}%` }, // 'like' 검색
      };
    }
    if (params.snapshotData) {
      setQuery.where = {
        ...setQuery.where,
        snapshotData: params.snapshotData, // 'json' 검색
      };
    }
    // 기간 검색 - 타임스탬프
    if (params.tsFrom || params.tsTo) {
      if (params.tsFrom && params.tsTo) {
        setQuery.where = {
          ...setQuery.where,
          ts: { [Op.between]: [params.tsFrom, params.tsTo] }, // 'between '검색
        };
      } else {
        if (params.tsFrom) {
          setQuery.where = {
            ...setQuery.where,
            ts: { [Op.gte]: params.tsFrom }, // '>=' 검색
          };
        }
        if (params.tsTo) {
          setQuery.where = {
            ...setQuery.where,
            ts: { [Op.lte]: params.tsTo }, // '<=' 검색
          };
        }
      }
    }
    // 기간 검색 - 생성일
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
    setQuery.order = getOrderbyTs(params.order);
    return new Promise((resolve, reject) => {
      PlcDataChangeHistoryLog.findAndCountAll({
        ...setQuery,
        // where: {
        //   ...setQuery.where,
        // },
        distinct: true,
        col: 'id',
      })
        .then((selectedList) => {
          resolve(selectedList);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  selectInfo(params: PlcDataChangeHistoryLogSelectInfoParams): Promise<PlcDataChangeHistoryLogAttributes | null> {
    return new Promise((resolve, reject) => {
      PlcDataChangeHistoryLog.findOne({
        where: {
          id: params.id,
        },
      })
        .then((selectedInfo) => {
          resolve(selectedInfo);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export { plcDataChangeHistoryLogDao };
