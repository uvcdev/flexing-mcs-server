import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
// import { ItemLogSequelize } from '../sequelize';
import { UserAttributes } from '../common/user';
import { logSequelize } from '../sequelize';
import { TrackingLogSubjectType } from '../common/trackingLog';

// 기본 interface
export interface ItemLogAttributes {
  id: number;
  itemCode: string | null;
  facilityCode: string | null;
  facilityName: string | null;
  amrCode: string | null;
  amrName: string | null;
  floor: string | null;
  topic: string | null;
  subject: ItemLogSubjectType | null;
  body: Record<string, any> | null;
  // MBS 추가본
  trackingLogId: number | null;
  state: string | null;  // 기존에 body에 있던 state
  location: string | null; // 발생 위치 창고 (WMS, MW01) , 설비 ( SP11, SP12 ) , AMR ( AMR_01 )...
  message: string | null;
  createdAt: Date;
}

type ItemLogSubjectType =
  | 'TRANSPORT_COMMAND'
  | 'LOAD_COMMAND'
  | 'UNLOAD_COMMAND'
  | 'CANCEL_MISSION_COMMAND'
  | 'REQUEST_ALL'
  | 'REQUEST_PAYLOAD_STATE'
  | 'REQUEST_MISSION_STATE'
  | 'ACK_MISSION_COMPLETED'
  | 'ACK_MISSION_FAILED'
  | 'ACK_MISSION_STATE'
  | 'PAYLOAD_STATE'
  | 'MISSION_STATE'
  | 'ALL_MISSION_STATE'
  | 'MISSION_COMPLETED'
  | 'MISSION_FAILED'
  | 'ALARM_REPORT'
  | 'ALARM_CLEAR'
  | 'ACK_MISSION_COMMAND'
  // MBS 추가
  | TrackingLogSubjectType
  ;

class ItemLog extends Model implements ItemLogAttributes {
  public readonly id!: ItemLogAttributes['id'];
  // public trackingLogId!: ItemLogAttributes['trackingLogId'];
  public itemCode!: ItemLogAttributes['itemCode'];
  public facilityCode!: ItemLogAttributes['facilityCode'];
  public facilityName!: ItemLogAttributes['facilityName'];
  public amrCode!: ItemLogAttributes['amrCode'];
  public amrName!: ItemLogAttributes['amrName'];
  public floor!: ItemLogAttributes['floor'];
  public topic!: ItemLogAttributes['topic'];
  public subject!: ItemLogAttributes['subject'];
  public body!: ItemLogAttributes['body'];
  public trackingLogId!: ItemLogAttributes['trackingLogId'];
  public state!: ItemLogAttributes['state'];
  public location!: ItemLogAttributes['location'];
  public message!: ItemLogAttributes['message'];
  public readonly createdAt!: ItemLogAttributes['createdAt'];
}

ItemLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      primaryKey: true,
    },
    itemCode: {
      type: DataTypes.STRING(500),
    },
    facilityCode: {
      type: DataTypes.STRING(50),
    },
    facilityName: {
      type: DataTypes.STRING(50),
    },
    amrCode: {
      type: DataTypes.STRING(50),
    },
    amrName: {
      type: DataTypes.STRING(50),
    },
    topic: {
      type: DataTypes.STRING(50),
    },
    subject: {
      type: DataTypes.STRING(50),
    },
    body: {
      type: DataTypes.JSONB,
    },
    floor: {
      type: DataTypes.STRING(10),
    },
    // MBS 추가본
    trackingLogId: {
      type: DataTypes.INTEGER,
    },
    state: {
      type: DataTypes.STRING(50),
    },
    location: {
      type: DataTypes.STRING(50),
    },
    message: {
      type: DataTypes.TEXT,
    }
  },
  {
    sequelize: logSequelize,
    // tableName: 'tableName', // table명을 수동으로 생성 함
    // freezeTableName: true, // true: table명의 복수형 변환을 막음
    underscored: true, // true: underscored, false: camelCase
    timestamps: true,
    createdAt: true, // createAt
    updatedAt: false,
    paranoid: false, // deletedAt
  }
);

// insert
export interface ItemLogInsertParams {
  // trackingLogId?: number | null;
  itemCode?: string | null;
  facilityCode: string | null;
  facilityName: string | null;
  amrCode: string | null;
  amrName: string | null;
  floor?: string | null;
  topic: string | null;
  subject: ItemLogAttributes['subject'] | null;
  body: Record<string, any> | null;
  trackingLogId?: number | null;
  state?: string | null;
  location?: string | null;
  message?: string | null;
}

// selectList
export interface ItemLogSelectListParams {
  // trackingLogId?: number | null;
  itemCode?: string | null;
  facilityCode?: string | null;
  facilityName?: string | null;
  amrCode?: string | null;
  amrName?: string | null;
  floor?: string | null;
  topic?: string | null;
  subject?: string | null;
  body?: string | null;
  trackingLogId?: string | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}
export interface ItemLogSelectListQuery {
  where?: WhereOptions<ItemLogAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}
export interface ItemLogSelectListSubQueryUser {
  where?: WhereOptions<UserAttributes>;
}

// selectInfo
export interface ItemLogSelectInfoParams {
  id?: number;
}

export default ItemLog;
