import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';
import { ItemLogAttributes } from '../timescale/itemLog';

export interface TrackingLogAttributes {
  id: number;
  code: string | null;           // log code - uuid 사용 예정
  callId: string | null;         // mcs call id
  callType: string | null;       // 출발 설비 기준 call type 
  eqpCallId: string | null;      // 출발 설비 기준 call 번호
  subject: TrackingLogSubjectType | null;        // 물류 로그 subject 정보 ex ) LOAD_COMMAND , MISSION_STATE ... 
  detail: string | null;         // subject의 detail 정보 ex ) subject : MISSION_STATE , detail : AMR_ASSIGNED
  state: TrackingLogState | null;       // 물류 로그 진행 상태
  startFacility: string | null;  // 출발 설비 명 
  destFacility: string | null;   // 도착 설비 명 - 창고 쪽 포트도 도착 설비 명임
  assignedRobot: string | null;  // 작업 할당 된 AMR 명 
  value: string | null;          // 사용 데이터 값 
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null
}

// Subject 내용은 물류 로그 작성 하면서 추가 예정
type TrackingLogSubjectType =
  'CALL_ID' |
  'CALL_REQUEST' |
  'CALL_RESPONSE' |
  'WORK_ORDER' |
  'WMS_CALL_ID' |
  'WMS_PORT_ID';

// 진행 상태 추가 필요시 추가 적용 예정
type TrackingLogState = 'PUBLISHED' | 'PROCESSING' | 'COMPLETED' | 'ABORTED';   // 시작 전 , 진행 중 , 완료 , 중단

class TrackingLog extends Model implements TrackingLogAttributes {
  public readonly id!: TrackingLogAttributes['id'];
  public code!: TrackingLogAttributes['code'];
  public callId!: TrackingLogAttributes['callId'];
  public callType!: TrackingLogAttributes['callType'];
  public eqpCallId!: TrackingLogAttributes['eqpCallId'];
  public subject!: TrackingLogAttributes['subject'];
  public detail!: TrackingLogAttributes['detail'];
  public state!: TrackingLogAttributes['state'];
  public startFacility!: TrackingLogAttributes['startFacility'];
  public destFacility!: TrackingLogAttributes['destFacility'];
  public assignedRobot!: TrackingLogAttributes['assignedRobot'];
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
    code: {
      type: DataTypes.STRING(50),
    },
    callId: {
      type: DataTypes.STRING(30),
    },
    callType: {
      type: DataTypes.STRING(20),
    },
    eqpCallId: {
      type: DataTypes.STRING(10),
    },
    subject: {
      type: DataTypes.STRING(20),
    },
    detail: {
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
    value: {
      type: DataTypes.STRING(255),
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
  code: string | null;
  callId: string | null;
  callType: string | null;
  eqpCallId: string | null;
  subject: string | null;
  detail: string | null;
  state: TrackingLogState | null;
  startFacility: string | null;
  destFacility: string | null;
  assignedRobot: string | null;
  value: string | null;
  description: string | null;
}

export interface TrackingLogUpsertParams {
  code?: string | null;
  callId?: string | null;
  callType?: string | null;
  eqpCallId?: string | null;
  subject?: TrackingLogSubjectType | null;
  detail?: string | null;
  state?: TrackingLogState | null;
  startFacility?: string | null;
  destFacility?: string | null;
  assignedRobot?: string | null;
  value?: string | null;
  description?: string | null;
}


export interface TrackingLogSelectListParams {
  ids?: Array<number> | null;
  code?: string;
  callId?: string;
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
  callType?: TrackingLogAttributes['callType'];
  subject?: TrackingLogAttributes['subject'];
  detail?: TrackingLogAttributes['detail'];
  state?: TrackingLogAttributes['state'];
  startFacility?: TrackingLogAttributes['startFacility'];
  destFacility?: TrackingLogAttributes['destFacility'];
  assignedRobot?: TrackingLogAttributes['assignedRobot'];
  value?: TrackingLogAttributes['value'];
  description?: TrackingLogAttributes['description'];
}

// delete
export interface TrackingLogDeleteParams {
  id?: TrackingLogAttributes['id'];
}

export interface TrackingLogRedisAttributes extends TrackingLogAttributes {
  itemLogList: Array<ItemLogAttributes>
}

/* 인터페이스 정의 끝 */

export default TrackingLog;
