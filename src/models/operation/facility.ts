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
  cancelLinkedEqpIds: Array<number> | null;
  linkedWmsIds: Array<number> | null;
  cancelType: CancelType | null;
  mode: 'auto' | 'manual';
  generatedCallCount: number | null;
  isActiveCallTrigger: boolean | null;
  priority: number;
  isWmsPort: boolean | null; // MBS 는 EQP | WMS
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface FacilityAttributesDeep extends FacilityAttributes {
  Zone: ZoneAttributes;
}

export type CancelType =
  // 취소로직 비활성화 설비
  | 'NON_CANCELLABLE' // (불가)

  // 설비 to 설비 미션O
  | 'EQP_TO_EQP_MISSION' // (후속작업)

  // 설비 to 설비 미션X
  | 'EQP_TO_EQP_NO_MISSION' // (일반)

  // 설비 to 창고
  | 'EQP_TO_WMS'; // (창고)

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
  public cancelLinkedEqpIds!: FacilityAttributes['cancelLinkedEqpIds'];
  public linkedWmsIds!: FacilityAttributes['linkedWmsIds'];
  public cancelType!: FacilityAttributes['cancelType'];
  public mode!: FacilityAttributes['mode'];
  public generatedCallCount!: FacilityAttributes['generatedCallCount'];
  public isActiveCallTrigger!: FacilityAttributes['isActiveCallTrigger'];
  public priority!: FacilityAttributes['priority'];
  public isWmsPort!: FacilityAttributes['isWmsPort'];
  public readonly createdAt!: FacilityAttributes['createdAt'];
  public readonly updatedAt!: FacilityAttributes['updatedAt'];
  public readonly deletedAt!: FacilityAttributes['deletedAt'];
}
export const FacilityDefaultValue = {
  linkedEqpIds: [],
  cancelLinkedEqpIds: [],
  linkedWmsIds: [],
  cancelType: 'NON_CANCELLABLE',
  mode: 'auto',
  priority: 50,
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
    cancelLinkedEqpIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: FacilityDefaultValue.cancelLinkedEqpIds,
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
    generatedCallCount: {
      type: DataTypes.INTEGER,
    },
    isActiveCallTrigger: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: FacilityDefaultValue.priority,
    },
    isWmsPort: {
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
  linkedEqpIds: Array<number>;
  linkedWmsIds: Array<number>;
  cancelType: FacilityAttributes['cancelType'] | null;
  cancelLinkedEqpIds: Array<number>;
  mode: 'auto' | 'manual' | null;
  description: string | null;
  generatedCallCount: number | null;
  isActiveCallTrigger: boolean;
  priority: number | null;
  isWmsPort: string | null; // EQP | WMS
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
  cancelLinkedEqpIds?: Array<number>;
  mode?: 'auto' | 'manual';
  generatedCallCount?: number;
  isActiveCallTrigger?: boolean;
  priority?: number;
  isWmsPort?: string | null; // EQP | WMS
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

// update operation mode
export interface OperationModeUpdateParams {
  SERIAL: string;
  OPERATION_MODE: number; // 0: None(normal), 1: Load(supply), 2: Unload(retrieve), 3: Load & Unload(normal)
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
  'generatedCallCount',
  'isActiveCallTrigger',
  'priority',
  'isWmsPort',
  'createdAt',
];

export default Facility;
