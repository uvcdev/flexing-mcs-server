import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
import { sequelize } from '../sequelize';
import { FacilityAttributesDeep } from './facility';
import { ItemAttributes } from './item';
import { AmrAttributes } from '../../models/common/amr';

// 기본 interface
export interface WorkOrderAttributes {
  id: number;
  fromFacilityId: number | null;
  toFacilityId: number | null;
  code: string;
  fromAmrId: number | null;
  itemId: number | null;
  level: number | null;
  state:
  | 'registered'
  | 'preReregistered'
  | 'reregistered'
  | 'pending1'
  | 'pending2'
  | 'assigned1'
  | 'assigned2'
  | 'working1'
  | 'working2'
  | 'docking1'
  | 'docking2'
  | 'lift1'
  | 'lift2'
  | 'canceled1'
  | 'canceled2'
  | 'aborted1'
  | 'aborted2'
  | 'failed1'
  | 'failed2'
  | 'completed1'
  | 'completed2'
  | 'dryrunCanceled'
  | 'userCanceled'
  | 'forceCanceled'
  | 'facilityCanceled';
  isClosed: boolean;
  fromStartDate: Date | null;
  fromEndDate: Date | null;
  missionStartDate: Date | null;
  missionEndDate: Date | null;
  toStartDate: Date | null;
  toEndDate: Date | null;
  cancelUserId: number | null;
  cancelDate: Date | null;
  description: string | null;
  type: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  isMissionOrder: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface WorkOrderAttributesDeep extends WorkOrderAttributes {
  FromFacility: FacilityAttributesDeep;
  ToFacility: FacilityAttributesDeep;
  Item: ItemAttributes;
  Amr: AmrAttributes;
}
class WorkOrder extends Model implements WorkOrderAttributes {
  public readonly id!: WorkOrderAttributes['id'];
  public fromFacilityId!: WorkOrderAttributes['fromFacilityId'];
  public toFacilityId!: WorkOrderAttributes['toFacilityId'];
  public code!: WorkOrderAttributes['code'];
  public fromAmrId!: WorkOrderAttributes['fromAmrId'];
  public itemId!: WorkOrderAttributes['itemId'];
  public level!: WorkOrderAttributes['level'];
  public state!: WorkOrderAttributes['state'];
  public isClosed!: WorkOrderAttributes['isClosed'];
  public fromStartDate!: WorkOrderAttributes['fromStartDate'];
  public fromEndDate!: WorkOrderAttributes['fromEndDate'];
  public missionStartDate!: WorkOrderAttributes['missionStartDate'];
  public missionEndDate!: WorkOrderAttributes['missionEndDate'];
  public toStartDate!: WorkOrderAttributes['toStartDate'];
  public toEndDate!: WorkOrderAttributes['toEndDate'];
  public cancelUserId!: WorkOrderAttributes['cancelUserId'];
  public cancelDate!: WorkOrderAttributes['cancelDate'];
  public description!: WorkOrderAttributes['description'];
  public type!: WorkOrderAttributes['type'];
  public isMissionOrder!: WorkOrderAttributes['isMissionOrder'];
  public readonly createdAt!: WorkOrderAttributes['createdAt'];
  public readonly updatedAt!: WorkOrderAttributes['updatedAt'];
  public readonly deletedAt!: WorkOrderAttributes['deletedAt'];
}

WorkOrder.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    fromFacilityId: {
      type: DataTypes.INTEGER,
    },
    toFacilityId: {
      type: DataTypes.INTEGER,
    },
    code: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    fromAmrId: {
      type: DataTypes.INTEGER,
    },
    itemId: {
      type: DataTypes.INTEGER,
    },
    level: {
      type: DataTypes.INTEGER,
    },
    state: {
      type: DataTypes.STRING(20),
      defaultValue: 'registered',
    },
    isClosed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    fromStartDate: {
      type: DataTypes.DATE,
    },
    fromEndDate: {
      type: DataTypes.DATE,
    },
    missionStartDate: {
      type: DataTypes.DATE,
    },
    missionEndDate: {
      type: DataTypes.DATE,
    },
    toStartDate: {
      type: DataTypes.DATE,
    },
    toEndDate: {
      type: DataTypes.DATE,
    },
    cancelUserId: {
      type: DataTypes.INTEGER,
    },
    cancelDate: {
      type: DataTypes.DATE,
    },
    description: {
      type: DataTypes.STRING(255),
    },
    type: {
      type: DataTypes.STRING(10),
    },
    isMissionOrder: {
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
export interface WorkOrderInsertParams {
  id?: number | null;
  fromFacilityId: number | null;
  toFacilityId: number | null;
  code: string;
  fromAmrId: number | null;
  itemId: number | null;
  itemCode?: string | null;
  level: number | null;
  state: WorkOrderAttributes['state'];
  isClosed: boolean;
  cancelUserId: number | null;
  cancelDate: Date | null;
  description: string | null;
  type: WorkOrderAttributes['type'];
  isMissionOrder?: boolean;
}
export interface ImcsWorkOrderInsertParams {
  newItemId?: number | null;
  CALL_ID: string; // 품목코드
  TX_ID: string;
  EQP_CALL_ID: string; // 작업지시코드
  TAG_ID: string;
  EQP_ID: string; // EQP설비코드
  PORT_ID: string; // WCS포트코드
  TYPE: WorkOrderAttributes['type']; // 타입
  CALL_PRIORITY: number; // 우선순위
  CALL_TYPE: string;
}

export interface WorkOrderCancelByCodeParams {
  code: string;
}
export interface WorkOrderSelectInfoByCodeParams {
  code: string;
}

// selectList
export interface WorkOrderSelectListParams {
  ids?: Array<number> | null;
  fromFacilityId?: number | null;
  toFacilityId?: number | null;
  code?: string | null;
  fromAmrId?: number | null;
  itemId?: number | null;
  state?: string | null;
  isCLosed?: boolean | string | null;
  cancelUserId?: number | null;
  cancelDate?: Date | null;
  type?: string | null;
  isMissionOrder?: boolean | string | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}

export interface WorkOrderSelectListQuery {
  where?: WhereOptions<WorkOrderAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}

// selectInfo
export interface WorkOrderSelectInfoParams {
  id?: number;
}

// selectOne
export interface WorkOrderSelectOneParams {
  id?: number;
}

// selectOneWorkOrder
export interface WorkOrderSelectOneCodeParams {
  code?: string;
}

// update
export interface WorkOrderUpdateParams {
  id?: number;
  fromFacilityId?: number | null;
  toFacilityId?: number | null;
  code?: string;
  fromAmrId?: number | null;
  itemId?: number | null;
  level?: number | null;
  state?: WorkOrderAttributes['state'];
  isClosed?: boolean;
  fromStartDate?: Date | null;
  fromEndDate?: Date | null;
  missionStartDate?: Date | null;
  missionEndDate?: Date | null;
  toStartDate?: Date | null;
  toEndDate?: Date | null;
  cancelUserId?: number | null;
  cancelDate?: Date | null;
  isMissionOrder?: boolean;
  description?: string | null;
  type?: string | null;
}

export interface WorkOrderUpdateByCodeParams {
  code?: string;
  fromFacilityId?: number | null;
  toFacilityId?: number | null;
  fromAmrId?: number | null;
  itemId?: number | null;
  level?: number | null;
  state?: WorkOrderAttributes['state'];
  isClosed?: boolean;
  fromStartDate?: Date | null;
  fromEndDate?: Date | null;
  missionStartDate?: Date | null;
  missionEndDate?: Date | null;
  toStartDate?: Date | null;
  toEndDate?: Date | null;
  cancelUserId?: number | null;
  cancelDate?: Date | null;
  isMissionOrder?: boolean;
  description?: string | null;
  type?: string | null;
}

// delete
export interface WorkOrderDeleteParams {
  id?: number;
}

export interface PendingWorkOrderAttributes {
  callId?: string;
  fromFacilityName?: string;
  toFacilityName?: string;
  itemName?: string;
  type: 'IN' | 'OUT' | 'MISSION';
  isMissionOrder?: boolean;
  callPriority?: string;
  callType?: string;
}

// include attributes
export const WorkOrderAttributesInclude = [
  'id',
  'fromFacilityId',
  'toFacilityId',
  'code',
  'fromAmrId',
  'itemId',
  'level',
  'state',
  'isClosed',
  'fromStartDate',
  'fromEndDate',
  'missionStartDate',
  'missionEndDate',
  'toStartDate',
  'toEndDate',
  'cancelUserId',
  'cancelDate',
  'description',
  'type',
  'isMissionOrder',
  'createdAt',
];

export default WorkOrder;
