import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';
import { RequestLog } from '../../lib/logging';
import { ResponseJson } from '../../lib/resUtil';
import { UserAttributes } from './user';

// 기본 interface
export interface EventHistoryAttributes {
  id: number;
  userId: number;
  action: 'Create' | 'BulkCreate' | 'SelectList' | 'SelectInfo' | 'Update' | 'Delete' | 'Write';
  tableName: string;
  tablePks: Array<number> | null;
  requestLog: JSON;
  responseLog: JSON;
  clientIp: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class EventHistory extends Model implements EventHistoryAttributes {
  public id!: EventHistoryAttributes['id'];
  public userId!: EventHistoryAttributes['userId'];
  public action!: EventHistoryAttributes['action'];
  public tableName!: EventHistoryAttributes['tableName'];
  public tablePks!: EventHistoryAttributes['tablePks'];
  public requestLog!: EventHistoryAttributes['requestLog'];
  public responseLog!: EventHistoryAttributes['responseLog'];
  public clientIp!: EventHistoryAttributes['clientIp'];
  public createdAt!: EventHistoryAttributes['createdAt'];
  public updatedAt!: EventHistoryAttributes['updatedAt'];
  public deletedAt!: EventHistoryAttributes['deletedAt'];
}

EventHistory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
    },
    action: {
      type: DataTypes.STRING(30),
    },
    tableName: {
      type: DataTypes.STRING(100),
    },
    tablePks: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
    },
    requestLog: {
      type: DataTypes.JSONB,
    },
    responseLog: {
      type: DataTypes.JSONB,
    },
    clientIp: {
      type: DataTypes.STRING(255),
    },
  },
  {
    sequelize,
    // tableName: 'tableName', // table명을 수동으로 생성 함
    // freezeTableName: true, // true: table명의 복수형 변환을 막음
    underscored: true, // true: underscored, false: camelCase
    timestamps: true, // createAt, updatedAt
    paranoid: true, // deletedAt
  }
);

// insert
export interface EventHistoryInsertParams {
  userId: number;
  action: EventHistoryAttributes['action'];
  tableName: string;
  tablePks: Array<number> | null;
  requestLog: RequestLog;
  responseLog: ResponseJson<unknown>;
  clientIp: string;
}

// selectList
export interface EventHistorySelectListParams {
  companyIds?: Array<number> | null;
  userIds?: Array<number> | null;
  action?: EventHistoryAttributes['action'];
  tableName?: string | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}
export interface EventHistorySelectListQuery {
  where?: WhereOptions<EventHistoryAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}
export interface EventHistorySelectListSubQueryUser {
  where?: WhereOptions<UserAttributes>;
}

// selectInfo
export interface EventHistorySelectInfoParams {
  id?: number;
}

// 사용자별 처음/마지막 사용시간 출력
export interface EventHistorySelectAllMinMaxDateParams {
  companyIds?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}
export interface EventHistorySelectedMinMaxDate {
  userId: number;
  minDay: Date | null;
  maxDay: Date | null;
}

// 사용이력 최근 X개 출력
export interface EventHistorySelectAllLatestParams {
  companyIds?: string;
  rowCount?: number;
  page?: number;
}

export default EventHistory;
