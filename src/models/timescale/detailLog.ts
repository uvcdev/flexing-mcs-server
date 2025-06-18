import { Model, DataTypes, WhereOptions, Order } from 'sequelize';
// import { DetailLogSequelize } from '../sequelize';
import { UserAttributes } from '../common/user';
import { logSequelize } from '../sequelize';

// 기본 interface
export interface DetailLogAttributes {
  id: number;
  topic: string | null;
  subject: DetailLogSubjectType;
  trackingLogId: number | null;
  // callId는 설비 콜 번호 & eqpCallId는 작업지시 콜 번호
  callId: string | null;
  eqpCallId: string | null;
  value: string | null;  // 각 로그에서 사용할 데이터
  state: string | null;  // 기존에 body에 있던 state
  location: string | null; // 발생 위치 창고 (WMS) , 설비 ( BS1O, BM1I ) , AMR ( AMR_01 )...
  message: string | null;
  resultStatus: ResultStatus | null;  // 상태값 정상, 오류 , 멈춤(해결가능) , 멈춤(단순멈춤)
  createdDateTime: string | null;  // 발생 시간. redis 조회 시 용이하게 사용하기 위해 추가
  createdAt: Date;
}

type DetailLogSubjectType =
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
  | 'ACK_MISSION_COMMAND';

type ResultStatus = 'SUCCESS' | 'ERROR' | 'ABORTED' | 'PAUSED';

class DetailLog extends Model implements DetailLogAttributes {
  public readonly id!: DetailLogAttributes['id'];
  public topic!: DetailLogAttributes['topic'];
  public subject!: DetailLogAttributes['subject'];
  public trackingLogId!: DetailLogAttributes['trackingLogId'];
  public callId!: DetailLogAttributes['callId'];
  public eqpCallId!: DetailLogAttributes['eqpCallId'];
  public value!: DetailLogAttributes['value'];
  public state!: DetailLogAttributes['state'];
  public location!: DetailLogAttributes['location'];
  public message!: DetailLogAttributes['message'];
  public resultStatus!: DetailLogAttributes['resultStatus'];
  public readonly createdDateTime!: DetailLogAttributes['createdDateTime'];
  public readonly createdAt!: DetailLogAttributes['createdAt'];
}

DetailLog.init(
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
    topic: {
      type: DataTypes.STRING(50),
    },
    subject: {
      type: DataTypes.STRING(50),
    },
    trackingLogId: {
      type: DataTypes.INTEGER,
    },
    callId: {
      type: DataTypes.STRING(50),
    },
    eqpCallId: {
      type: DataTypes.STRING(50),
    },
    value: {
      type: DataTypes.STRING(50),
    },
    state: {
      type: DataTypes.STRING(50),
    },
    location: {
      type: DataTypes.STRING(50),
    },
    message: {
      type: DataTypes.STRING(500),
    },
    resultStatus: {
      type: DataTypes.STRING(50),
    },
    createdDateTime: {
      type: DataTypes.DATE
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
export interface DetailLogInsertParams {
  topic: string;
  subject: DetailLogAttributes['subject'];
  trackingLogId: number | null;
  callId: string | null;
  eqpCallId?: string | null;
  value?: string | null;
  location?: string | null;
  message?: string | null;
  resultStatus: DetailLogAttributes['resultStatus'] | null;
}

// selectList
export interface DetailLogSelectListParams {
  trackingLogId?: number | null;
  createdAtFrom?: Date | null;
  createdAtTo?: Date | null;
  limit?: number;
  offset?: number;
  order?: string;
}
export interface DetailLogSelectListQuery {
  where?: WhereOptions<DetailLogAttributes>;
  limit?: number;
  offset?: number;
  order?: Order;
}
export interface DetailLogSelectListSubQueryUser {
  where?: WhereOptions<UserAttributes>;
}

// selectInfo
export interface DetailLogSelectInfoParams {
  id?: number;
}

export default DetailLog;
