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
  callId: string | null;  // 추적을 위한 CALL ID
  value: string | null;  // 각 로그에서 사용할 데이터
  state: string | null;  // 기존에 body에 있던 state
  location: string | null; // 발생 위치 창고 (WMS, MW01) , 설비 ( SP11, SP12 ) , AMR ( AMR_01 )...
  message: string | null;
  resultStatus: ResultStatus | null;  // 상태값 정상, 오류 , 멈춤(해결가능) , 멈춤(단순멈춤)
  createdDateTime: string | null;  // 발생 시간. redis 조회 시 용이하게 사용하기 위해 추가
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

type ResultStatus = 'SUCCESS' | 'ERROR' | 'ABORTED' | 'PAUSED';

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
  public callId!: ItemLogAttributes['callId'];
  public value!: ItemLogAttributes['value'];
  public state!: ItemLogAttributes['state'];
  public location!: ItemLogAttributes['location'];
  public message!: ItemLogAttributes['message'];
  public resultStatus!: ItemLogAttributes['resultStatus'];
  public createdDateTime!: ItemLogAttributes['createdDateTime'];
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
    },
    callId: {
      type: DataTypes.STRING(50),
    },
    value: {
      type: DataTypes.STRING(50),
    },
    resultStatus: {
      type: DataTypes.STRING(20),
    },
    createdDateTime: {
      type: DataTypes.STRING(50),
    },
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
  callId?: string | null;
  value?: string | null;
  state?: string | null;
  location?: string | null;
  message?: string | null;
  resultStatus?: string | null;
  createdDateTime?: string | null;
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
  trackingLogId?: number | null;
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
