import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';

export interface SettingAttributes {
  id: number;
  system: string;
  type: string;
  data: JSON | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class Setting extends Model implements SettingAttributes {
  public readonly id!: SettingAttributes['id'];
  public system!: SettingAttributes['system'];
  public type!: SettingAttributes['type'];
  public data!: SettingAttributes['data'];
  public readonly createdAt!: SettingAttributes['createdAt'];
  public readonly updatedAt!: SettingAttributes['updatedAt'];
  public readonly deletedAt!: SettingAttributes['deletedAt'];
}

export const SystemDefaults = {
  system: 'WCS',
};

Setting.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    system: {
      type: DataTypes.STRING(5),
      defaultValue: SystemDefaults.system,
    },
    type: {
      type: DataTypes.STRING(20),
      unique: true,
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
export interface SettingInsertParams {
  system: string;
  type: string;
  data: string | null;
}

export interface SettingSelectListParams {
  ids?: Array<number> | null;
  system?: string;
  type?: string;
  limit?: number;
  offset?: number;
  attributes?: Array<string>;
}

export interface SettingSelectListQuery {
  where?: WhereOptions<SettingAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
  attributes?: Array<string>;
}

// selectInfo
export interface SettingSelectInfoParams {
  id?: number;
}

// update
export interface SettingUpdateParams {
  id?: SettingAttributes['id'];
  system?: string;
  type?: string;
  data?: JSON | null;
}

// delete
export interface SettingDeleteParams {
  id?: SettingAttributes['id'];
}

export type HeartBeatSetting = {
  system: string;
  type: string;
  data: {
    intervalTimeSeconds: number; // 초, defalut: 5
    timeoutTimeSeconds: number; //  초, defalut: 30
    retryCount: number; // 횟수, defalut: 3
  };
};

/* 인터페이스 정의 끝 */

export default Setting;
