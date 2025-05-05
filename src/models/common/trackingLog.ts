import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';
import { ItemLogAttributes, ItemLogInsertParams } from '../timescale/itemLog';

export interface TrackingLogAttributes {
  id: number;
  code: string | null;           // log code - uuid 사용 예정
  plcName: string | null;        // caller
  portName: string | null;       // 응답 PLC 위치
  callId: string | null;         // mcs call id
  callType: string | null;       // 출발 설비 기준 call type 
  eqpCallId: string | null;      // 출발 설비 기준 call 번호
  transferId: string | null;     // 창고에서 사용하는 물류 로그 ( transfer initated 단계에서 생성됨 )
  subject: TrackingLogSubjectType | null | any;        // 물류 로그 subject 정보 ex ) LOAD_COMMAND , MISSION_STATE ... 
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
export type TrackingLogSubjectType =
  'CALL_CREATED' |  // 콜 발생
  'CALL_INFO' |     // 콜 INFO 호출 
  'CALL_RESPONSE' |  // 콜에 대한 호출 응답
  'ACK_CALL_INFO' |  // ACK_CALL_INFO - 창고로부터 받은 응답
  'TRANSFER_INITIATED' |  // Transfer 시작 -> transfer Id 생성 시점
  'ACK_TRANSFER_INITIATED' | // MCS -> WMS 응답
  'CRANE_ACTIVE' | // Crane 시작
  'ACK_CRANE_ACTIVE' |  // MCS -> WMS 응답
  'CARRIER_TRANSFERRING' | // Carrier 이동 시작
  'ACK_CARRIER_TRANSFERRING' |  // Carrier Transferring 응답
  'TRANSFER_COMPLETED' |  // Transfer 완료
  'CARRIER_WAITOUT' |
  'ACK_CARRIER_WAITOUT' |
  'PORT_ASSIGNED' |  // 포트 배정 완료
  'ACK_PORT_PRESENCE_STATUS' |
  'WORK_ORDER_CREATED' |    // 작업지시 생성 
  'CALL_ID' |
  'CALL_REQUEST' |
  'CALL_RESPONSE' |
  'WORK_ORDER' |
  'WMS_CALL_ID' |
  'WMS_PORT_ID' |
  'FROM_DOCKING_REQ' |
  'FROM_DOCKING_PERMIT' |
  'FROM_DOCKING_COMPLETED' |
  'TO_DOCKING_REQ' |
  'TO_DOCKING_PERMIT' |
  'TO_DOCKING_COMPLETED' |
  'FROM_START' |
  'FROM_COMPLETED' |
  'MISSION_START' |
  'MISSION_COMPLETED' |
  'TO_START' |
  'TO_COMPLETED' |
  'AMR_ASSIGNED' |
  'BRANCH_INFO_REQ' |
  'BRANCH_INFO_REP';

// 진행 상태 추가 필요시 추가 적용 예정
export type TrackingLogState = 'PUBLISHED' | 'PROCESSING' | 'COMPLETED' | 'ABORTED' | 'PAUSED' | 'ERROR';   // 시작 전 , 진행 중 , 완료 , 중단

class TrackingLog extends Model implements TrackingLogAttributes {
  public readonly id!: TrackingLogAttributes['id'];
  public code!: TrackingLogAttributes['code'];
  public plcName!: TrackingLogAttributes['plcName'];
  public portName!: TrackingLogAttributes['portName'];
  public callId!: TrackingLogAttributes['callId'];
  public callType!: TrackingLogAttributes['callType'];
  public eqpCallId!: TrackingLogAttributes['eqpCallId'];
  public transferId!: TrackingLogAttributes['transferId'];
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
    plcName: {
      type: DataTypes.STRING(20),
    },
    portName: {
      type: DataTypes.STRING(20),
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
    transferId: {
      type: DataTypes.STRING(50),
    },
    subject: {
      type: DataTypes.STRING(50),
    },
    detail: {
      type: DataTypes.STRING(50),
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
  plcName: string | null;
  portName: string | null;
  callId: string | null;
  callType: string | null;
  eqpCallId: string | null;
  transferId: string | null;
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
  plcName?: string | null;
  portName?: string | null;
  callId?: string | null;
  callType?: string | null;
  eqpCallId?: string | null;
  transferId?: string | null;
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
  id: TrackingLogAttributes['id'];
  code?: TrackingLogAttributes['code'];
  callId?: TrackingLogAttributes['callId'];
  // 업데이트 내용
  plcName?: TrackingLogAttributes['plcName'];
  portName?: TrackingLogAttributes['portName'];
  callType?: TrackingLogAttributes['callType'];
  eqpCallId?: TrackingLogAttributes['eqpCallId'];
  transferId?: TrackingLogAttributes['transferId'];
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

export interface TrackingLogRedisAttributes extends Omit<TrackingLogAttributes, 'createdAt' | 'updatedAt' | 'deletedAt'> {
  // itemLogList: Array<ItemLogAttributes>;
  itemLogList: Array<ItemLogInsertParams>;
  createdDateTime: string;
  updatedDateTime: string;
}

export interface TrackingLogRedisUpdateParams {
  plcName?: TrackingLogAttributes['plcName'];
  portName?: TrackingLogAttributes['portName'];
  callId?: TrackingLogAttributes['callId'];
  subject?: TrackingLogAttributes['subject'];
  transferId?: TrackingLogAttributes['transferId'];
  detail?: TrackingLogAttributes['detail'];
  state?: TrackingLogAttributes['state'];
  startFacility?: TrackingLogAttributes['startFacility'];
  destFacility?: TrackingLogAttributes['destFacility'];
  assignedRobot?: TrackingLogAttributes['assignedRobot'];
  value?: TrackingLogAttributes['value'];
  description?: TrackingLogAttributes['description'];
  location?: string;
}
/* 인터페이스 정의 끝 */

export default TrackingLog;
