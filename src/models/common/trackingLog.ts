import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';

export interface TrackingLogAttributes {
  id: number;
  logId: string | null;
  code: string | null;
  callId: string | null;
  callType: string | null;
  subject: string | null;
  state: TrackingLogState;
  startFacility: string | null;
  destFacility: string | null;
  assignedRobot: string | null;
  type: TrackingLogType;
  value: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type TrackingLogType = 'CALL_ID' | 'CALL_REQUEST' | 'CALL_RESPONSE' | 'WORK_ORDER' | 'WMS_CALL_ID' | 'WMS_PORT_ID';

type TrackingLogState = 'PROCESS' | 'PUBLISHED'

class TrackingLog extends Model implements TrackingLogAttributes {
  public readonly id!: TrackingLogAttributes['id'];
  public logId!: TrackingLogAttributes['logId'];
  public code!: TrackingLogAttributes['code'];
  public callId!: TrackingLogAttributes['callId'];
  public callType!: TrackingLogAttributes['callType'];
  public subject!: TrackingLogAttributes['subject'];
  public state!: TrackingLogAttributes['state'];
  public startFacility!: TrackingLogAttributes['startFacility'];
  public destFacility!: TrackingLogAttributes['destFacility'];
  public assignedRobot!: TrackingLogAttributes['assignedRobot'];
  public type!: TrackingLogAttributes['type'];
  public value!: TrackingLogAttributes['value'];
  public description!: TrackingLogAttributes['description'];
  public readonly createdAt!: TrackingLogAttributes['createdAt'];
  public readonly updatedAt!: TrackingLogAttributes['updatedAt'];
  public readonly deletedAt!: TrackingLogAttributes['deletedAt'];
}

TrackingLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    logId: {
      type: DataTypes.STRING(50),
    },
    code: {
      type: DataTypes.STRING(20),
    },
    callId: {
      type: DataTypes.STRING(20),
    },
    callType: {
      type: DataTypes.STRING(20),
    },
    subject: {
      type: DataTypes.STRING(20),
    },
    state: {
      type: DataTypes.STRING(20),
    },
    startFacility: {
      type: DataTypes.STRING(20),
    },
    destFacility: {
      type: DataTypes.STRING(20),
    },
    assignedRobot: {
      type: DataTypes.STRING(20),
    },
    type: {
      type: DataTypes.STRING(50),
    },
    value: {
      type: DataTypes.STRING(50),
    },
    description: {
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

/* 인터페이스 정의 시작 */
// insert
export interface TrackingLogInsertParams {
  logId: number;
  code: string | null;
  callId: string | null;
  callType: string | null;
  subject: string | null;
  state: string | null;
  startFacility: string | null;
  destFacility: string | null;
  assignedRobot: string | null;
  type: string | null;
  value: string | null;
  description: string | null;
}

export interface TrackingLogUpsertParams {
  logId?: number;
  code?: string | null;
  callId?: string | null;
  callType?: string | null;
  subject?: string | null;
  state?: string | null;
  startFacility?: string | null;
  destFacility?: string | null;
  assignedRobot?: string | null;
  type?: string | null;
  value?: string | null;
  description?: string | null;
}


export interface TrackingLogSelectListParams {
  ids?: Array<number> | null;
  callType?: string;
  startFacility?: string;
  destFacility?: string;
  assignedRobot?: string;
  state?: TrackingLogAttributes['state'] | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  updatedAtFrom?: Date | null;
  updatedAtTo?: Date | null;
  limit?: number;
  offset?: number;
  attributes?: Array<string>;
  order?: string;
}

export interface TrackingLogSelectListQuery {
  where?: WhereOptions<TrackingLogAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
  attributes?: Array<string>;
}

// selectInfo
export interface TrackingLogSelectInfoParams {
  id?: number;
}

// selectCode
export interface TrackingLogSelectInfoByCodeParams {
  code?: string;
}

// selectCallId
export interface TrackingLogSelectInfoByCallIdParams {
  callId?: string;
}

// update
export interface TrackingLogUpdateParams {
  // 검색
  id?: TrackingLogAttributes['id'];
  code?: TrackingLogAttributes['code'];
  callId?: TrackingLogAttributes['callId'];
  // 업데이트 내용
  subject?: TrackingLogAttributes['subject'];
  state?: TrackingLogAttributes['state'] | null;
  startFacility?: TrackingLogAttributes['startFacility'];
  destFacility?: TrackingLogAttributes['destFacility'];
  assignedRobot?: TrackingLogAttributes['assignedRobot'];
  type?: TrackingLogAttributes['type'];
  value?: TrackingLogAttributes['value'];
  description?: TrackingLogAttributes['description'];
}

// delete
export interface TrackingLogDeleteParams {
  id?: TrackingLogAttributes['id'];
}

/* 인터페이스 정의 끝 */

export default TrackingLog;
