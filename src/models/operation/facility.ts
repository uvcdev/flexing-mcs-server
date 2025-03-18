import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';
import { ZoneAttributes } from './zone';

// 기본 interface
export interface FacilityAttributes {
  id: number;
  facilityGroupId: number;
  code: string;
  name: string;
  system: 'WMS' | 'EQP';
  state: string | null;
  type: 'in' | 'out';
  serial: string | null;
  ip: number | null;
  port: number | null;
  floor: string | null;
  active: boolean | null;
  alwaysFill: boolean | null;
  description: string | null;
  isMissionOrderCapable: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface FacilityAttributesDeep extends FacilityAttributes {
  Zone: ZoneAttributes;
}

class Facility extends Model implements FacilityAttributes {
  public readonly id!: FacilityAttributes['id'];
  public facilityGroupId!: FacilityAttributes['facilityGroupId'];
  public code!: FacilityAttributes['code'];
  public name!: FacilityAttributes['name'];
  public system!: FacilityAttributes['system'];
  public state!: FacilityAttributes['state'];
  public type!: FacilityAttributes['type'];
  public serial!: FacilityAttributes['serial'];
  public ip!: FacilityAttributes['ip'];
  public port!: FacilityAttributes['port'];
  public floor!: FacilityAttributes['floor'];
  public active!: FacilityAttributes['active'];
  public alwaysFill!: FacilityAttributes['alwaysFill'];
  public description!: FacilityAttributes['description'];
  public isMissionOrderCapable!: FacilityAttributes['isMissionOrderCapable'];
  public readonly createdAt!: FacilityAttributes['createdAt'];
  public readonly updatedAt!: FacilityAttributes['updatedAt'];
  public readonly deletedAt!: FacilityAttributes['deletedAt'];
}

Facility.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    facilityGroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    system: {
      type: DataTypes.STRING(3),
    },
    state: {
      type: DataTypes.STRING(20),
    },
    type: {
      type: DataTypes.STRING(4),
    },
    serial: {
      type: DataTypes.STRING(255),
    },
    ip: {
      type: DataTypes.STRING(15),
    },
    port: {
      type: DataTypes.INTEGER,
    },
    floor: {
      type: DataTypes.STRING(10),
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    alwaysFill: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    description: {
      type: DataTypes.STRING(255),
    },
    isMissionOrderCapable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
export interface FacilityInsertParams {
  facilityGroupId: number;
  code: string;
  name: string;
  system: FacilityAttributes['system'] | null;
  state: string | null;
  type: FacilityAttributes['type'] | null;
  serial: string | null;
  ip: string | null;
  port: number | null;
  floor: string | null;
  active: boolean;
  alwaysFill: boolean;
  isMissionOrderCapable: boolean;
  description: string | null;
}

// selectList
export interface FacilitySelectListParams {
  ids?: Array<number> | null;
  facilityGroupIds?: Array<number> | null;
  code?: string | null;
  name?: string | null;
  uniqueName?: string | null;
  system?: FacilityAttributes['system'] | null;
  state?: string | null;
  type?: FacilityAttributes['type'] | null;
  serial?: string | null;
  ip?: string | null;
  port?: number | null;
  floor?: string | null;
  active?: boolean | null;
  alwaysFill?: boolean | null;
  limit?: number;
  offset?: number;
  order?: string;
}

export interface FacilitySelectListQuery {
  where?: WhereOptions<FacilityAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

// selectInfo
export interface FacilitySelectInfoParams {
  id?: number;
}

// selectOne
export interface FacilitySelectOneParams {
  id?: number;
}
// selectSerialFromFacility
export interface FacilitySelectSerialParams {
  serial?: string;
}
// selectOneFacility
export interface FacilitySelectOneCodeParams {
  code?: string;
}

// update
export interface FacilityUpdateParams {
  id?: number;
  facilityGroupId?: number;
  code?: string;
  name?: string;
  system?: FacilityAttributes['system'] | null;
  state?: string | null;
  type?: FacilityAttributes['type'] | null;
  serial?: string | null;
  ip?: string | null;
  port?: string | null;
  floor?: string | null;
  active?: boolean;
  alwaysFill?: boolean;
  description?: string | null;
  isMissionOrderCapable?: boolean;
}

// update state
export interface FacilityUpdateStateParams {
  id?: number;
  state?: FacilityAttributes['state'];
}

// delete
export interface FacilityDeleteParams {
  id?: number;
}

// include attributes
export const FacilityAttributesInclude = [
  'id',
  'facilityGroupId',
  'code',
  'name',
  'system',
  'state',
  'type',
  'serial',
  'ip',
  'port',
  'floor',
  'active',
  'alwaysFill',
  'description',
  'isMissionOrderCapable',
  'createdAt',
];

export default Facility;
