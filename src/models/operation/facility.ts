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
  linkedEqpIds: Array<number> | null;
  linkedWmsIds: Array<number> | null;
  cancelType: CancelType | null;
  mode: 'auto' | 'manual';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface FacilityAttributesDeep extends FacilityAttributes {
  Zone: ZoneAttributes;
  count?: number;
}

export type CancelType =
  | 'NON_CANCELLABLE' // 취소 로직을 실행하지 않는 설비
  | 'CANCEL_STOP_ONLY' // ACS에서 바로 멈춤 실행
  | 'AUTO_RETURN_CANCEL' // 자동 재반입 로직 실행
  | 'WMS_DEPENDENT_CANCEL' // WMS 응답 별 취소 로직 실행 ( CANCEL_STOP_ONLY | AUTO_RETURN_CANCEL )
  | 'CANCEL_WITH_DOCKING'; // 취소가 오더라도 도킹까지는 진행하고 도킹 불가 처리를 받고 취소 되는 경우 ( 사용 안 할 가능성 95% )

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
  public linkedEqpIds!: FacilityAttributes['linkedEqpIds'];
  public linkedWmsIds!: FacilityAttributes['linkedWmsIds'];
  public cancelType!: FacilityAttributes['cancelType'];
  public mode!: FacilityAttributes['mode'];
  public readonly createdAt!: FacilityAttributes['createdAt'];
  public readonly updatedAt!: FacilityAttributes['updatedAt'];
  public readonly deletedAt!: FacilityAttributes['deletedAt'];
}
export const FacilityDefaultValue = {
  linkedEqpIds: [],
  linkedWmsIds: [],
  cancelType: 'CANCEL_STOP_ONLY',
  mode: 'auto',
};

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
    linkedEqpIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: FacilityDefaultValue.linkedEqpIds,
    },
    linkedWmsIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: FacilityDefaultValue.linkedWmsIds,
    },
    cancelType: {
      type: DataTypes.STRING(30),
      defaultValue: FacilityDefaultValue.cancelType,
    },
    mode: {
      type: DataTypes.STRING(20),
      defaultValue: FacilityDefaultValue.mode,
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
  linkedEqpIds: Array<number>;
  linkedWmsIds: Array<number>;
  cancelType: FacilityAttributes['cancelType'] | null;
  mode: 'auto' | 'manual' | null;
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
  mode?: 'auto' | 'manual' | null;
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
  linkedEqpIds?: Array<number>;
  linkedWmsIds?: Array<number>;
  cancelType?: FacilityAttributes['cancelType'] | null;
  mode?: 'auto' | 'manual';
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
  'linkedEqpIds',
  'linkedWmsIds',
  'cancelType',
  'mode',
  'createdAt',
];

export default Facility;
