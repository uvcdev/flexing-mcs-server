import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';

export interface McsAlarmAttributes {
  id: number;
  code: string;
  errorFrom: ErrorFromType;
  errorCode: string;
  target: string | null;
  level: McsAlarmLevel;
  state: McsAlarmState;
  data: JSON | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type McsAlarmLevel = 'info' | 'warning' | 'error';

export type McsAlarmState = 'registered' | 'confirmed' | 'completed';

export type ErrorFromType =
  | 'WMS' // 창고 관련 에러
  | 'FAC' // 설비 관련 에러
  | 'MCS' // MCS 서버 관련 에러
  | 'ACS' // ACS 서버 관련 에러
  | 'ETC'; // 이외의 에러

class McsAlarm extends Model implements McsAlarmAttributes {
  public readonly id!: McsAlarmAttributes['id'];
  public code!: McsAlarmAttributes['code'];
  public errorFrom!: McsAlarmAttributes['errorFrom'];
  public errorCode!: McsAlarmAttributes['errorCode'];
  public target!: McsAlarmAttributes['target'];
  public level!: McsAlarmAttributes['level'];
  public state!: McsAlarmAttributes['state'];
  public data!: McsAlarmAttributes['data'];
  public readonly createdAt!: McsAlarmAttributes['createdAt'];
  public readonly updatedAt!: McsAlarmAttributes['updatedAt'];
  public readonly deletedAt!: McsAlarmAttributes['deletedAt'];
}

export const McsAlarmDefaultValue = {
  errorFrom: 'ETC',
  level: 'warning',
};

McsAlarm.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    errorFrom: {
      type: DataTypes.STRING(20),
      defaultValue: McsAlarmDefaultValue.errorFrom,
    },
    errorCode: {
      type: DataTypes.STRING(50),
    },
    target: {
      type: DataTypes.STRING(50),
    },
    level: {
      type: DataTypes.STRING(20),
      defaultValue: McsAlarmDefaultValue.level,
    },
    state: {
      type: DataTypes.STRING(10),
    },
    data: {
      type: DataTypes.JSONB,
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
export interface McsAlarmInsertParams {
  code: string;
  errorFrom: McsAlarmAttributes['errorFrom'];
  errorCode: string;
  target: string | null;
  level: McsAlarmAttributes['level'];
  state: McsAlarmAttributes['state'] | null;
  data: Record<string, any> | null;
}

export interface McsAlarmSelectListParams {
  ids?: Array<number> | null;
  code?: string;
  errorCode?: string;
  state?: McsAlarmAttributes['state'] | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  attributes?: Array<string>;
}

export interface McsAlarmSelectListQuery {
  where?: WhereOptions<McsAlarmAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
  attributes?: Array<string>;
}

// selectInfo
export interface McsAlarmSelectInfoParams {
  id?: number;
}

// selectInfoByCode
export interface McsAlarmSelectInfoByCodeParams {
  code?: string;
}

// update
export interface McsAlarmUpdateParams {
  id?: McsAlarmAttributes['id'];
  state?: McsAlarmAttributes['state'] | null;
  data?: Record<string, any> | null;
}

// updateStateByCode
export interface McsAlarmUpdateStateByCodeParams {
  code?: McsAlarmAttributes['code'];
  state?: McsAlarmAttributes['state'] | null;
  data?: Record<string, any> | null;
}

// delete
export interface McsAlarmDeleteParams {
  id?: McsAlarmAttributes['id'];
}

/* 인터페이스 정의 끝 */

export default McsAlarm;
