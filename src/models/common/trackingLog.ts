import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';
import { ItemLogAttributes, ItemLogInsertParams } from '../timescale/itemLog';
import { LeadTimeExcludeInfo, LeadTimeInfo, SectionLeadTime, SectionLeadTimeDetail } from '../operation/facility';

export interface TrackingLogAttributes {
  id: number;
  code: string | null; // log code - uuid 사용 예정
  plcName: string | null; // caller
  portName: string | null; // 응답 PLC 위치
  callId: string | null; // mcs call id
  callType: string | null; // 출발 설비 기준 call type
  eqpCallId: string | null; // 출발 설비 기준 call 번호
  transferId: string | null; // 창고에서 사용하는 물류 로그 ( transfer initated 단계에서 생성됨 )
  subject: TrackingLogSubjectType | null | string; // 물류 로그 subject 정보 ex ) LOAD_COMMAND , MISSION_STATE ...
  detail: string | null; // subject의 detail 정보 ex ) subject : MISSION_STATE , detail : AMR_ASSIGNED
  state: TrackingLogState | null; // 물류 로그 진행 상태
  startFacility: string | null; // 출발 설비 명
  destFacility: string | null; // 도착 설비 명 - 창고 쪽 포트도 도착 설비 명임
  assignedRobot: string | null; // 작업 할당 된 AMR 명
  value: string | null; // 사용 데이터 값
  description: string | null;
  // 컬럼 추가
  missionDestination: string | null; // 미션결정지 도착 위치 명
  processState: TrackingLogProcessState | null; // 물류 로그 동작 상태
  leadTime?: number | null; // 리드 타임 (초 단위)
  leadTimeInfo?: Record<string, any> | null;
  sectionLeadTime?: Record<string, any> | null; // 구간별 리드 타임 (예: { A: 100, B: 200 })
  subjectTimeLog?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Subject 내용은 물류 로그 작성 하면서 추가 예정
export type TrackingLogSubjectType =
  | 'CALL_CREATED' // 콜 발생
  | 'CALL_INFO' // 콜 INFO 호출
  | 'CALL_RESPONSE' // 콜에 대한 호출 응답
  | 'ACK_CALL_INFO' // ACK_CALL_INFO - 창고로부터 받은 응답
  | 'TRANSFER_INITIATED' // Transfer 시작 -> transfer Id 생성 시점
  | 'ACK_TRANSFER_INITIATED' // MCS -> WMS 응답
  | 'CRANE_ACTIVE' // Crane 시작
  | 'ACK_CRANE_ACTIVE' // MCS -> WMS 응답
  | 'CARRIER_TRANSFERRING' // Carrier 이동 시작
  | 'ACK_CARRIER_TRANSFERRING' // Carrier Transferring 응답
  | 'TRANSFER_COMPLETED' // Transfer 완료
  | 'CARRIER_WAITOUT'
  | 'ACK_CARRIER_WAITOUT'
  | 'PORT_ASSIGNED' // 포트 배정 완료
  | 'ACK_PORT_PRESENCE_STATUS'
  | 'WORK_ORDER_CREATED' // 작업지시 생성
  | 'CALL_ID'
  | 'CALL_REQUEST'
  | 'CALL_RESPONSE'
  | 'WORK_ORDER'
  | 'WMS_CALL_ID'
  | 'WMS_PORT_ID'
  | 'FROM_DOCKING_REQ'
  | 'FROM_DOCKING_PERMIT'
  | 'FROM_DOCKING_COMPLETED'
  | 'TO_DOCKING_REQ'
  | 'TO_DOCKING_PERMIT'
  | 'TO_DOCKING_COMPLETED'
  | 'FROM_START'
  | 'FROM_COMPLETED'
  | 'MISSION_DECIDED'
  | 'MISSION_START'
  | 'MISSION_CANCELED'
  | 'MISSION_COMPLETED'
  | 'TO_START'
  | 'TO_COMPLETED'
  | 'AMR_ASSIGNED'
  | 'BRANCH_INFO_REQ'
  | 'BRANCH_INFO_REP'
  | 'MISSION_ORDER_ASSIGNED'
  | 'MISSION_ORDER_COMPLETED'
  | 'AMR_UNASSIGNED'
  | 'AMR_DEPOSIT_COMPLETED'
  | 'AMR_DEPOSIT_STARTED'
  | 'CARRIER_TRANSFERRING'
  | 'AMR_ACQUIRE_COMPLETED'
  | 'AMR_ACQUIRE_STARTED'
  | 'MISSION_INITIATED'
  // Out 관련 내용 추가
  | 'AMR_ACQUIRE_OUT_REQ'
  | 'AMR_ACQUIRE_OUT_PERMIT'
  | 'AMR_ACQUIRE_OUT_COMPLETED'
  | 'AMR_DEPOSIT_OUT_REQ'
  | 'AMR_DEPOSIT_OUT_PERMIT'
  | 'AMR_DEPOSIT_OUT_COMPLETED';

// 진행 상태 추가 필요시 추가 적용 예정
export type TrackingLogState =
  | 'PUBLISHED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'ABORTED'
  | 'CANCELED'
  | 'PAUSED'
  | 'ERROR'
  | 'WORK-ORDER-CANCELED'
  | 'FMS-CANCELED'; // 시작 전 , 진행 중 , 완료 , 중단 , 취소, 정지, 에러

// NG는 창고에서 NG 케이스 응답을 준 경우 - 보통 콜 타입 미스매칭
export type TrackingLogProcessState = 'NORMAL' | 'CANCELED' | 'ABORTED' | 'OUT_OF_STOCK' | 'NG';

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
  public missionDestination!: TrackingLogAttributes['missionDestination'];
  public processState!: TrackingLogAttributes['processState'];
  public leadTime!: TrackingLogAttributes['leadTime'];
  public leadTimeInfo!: TrackingLogAttributes['leadTimeInfo'];
  public sectionLeadTime!: TrackingLogAttributes['sectionLeadTime'];
  public subjectTimeLog!: TrackingLogAttributes['subjectTimeLog'];
  public readonly createdAt!: TrackingLogAttributes['createdAt'];
  public readonly updatedAt!: TrackingLogAttributes['updatedAt'];
  public readonly deletedAt!: TrackingLogAttributes['deletedAt'];
}

const TrackingLogDefaultValue = {
  processState: 'NORMAL',
  leadTime: 0,
};

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
      type: DataTypes.STRING(50),
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
      type: DataTypes.STRING(50),
    },
    value: {
      type: DataTypes.STRING(255),
    },
    description: {
      type: DataTypes.STRING(255),
    },
    missionDestination: {
      type: DataTypes.STRING(50),
    },
    processState: {
      type: DataTypes.STRING(20),
      defaultValue: TrackingLogDefaultValue.processState,
    },
    leadTime: {
      type: DataTypes.INTEGER,
      defaultValue: TrackingLogDefaultValue.leadTime,
    },
    leadTimeInfo: {
      type: DataTypes.JSONB,
    },
    sectionLeadTime: {
      type: DataTypes.JSONB,
    },
    subjectTimeLog: {
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
  missionDestination: string | null;
  processState: TrackingLogProcessState | null;
  leadTime?: number | null;
  leadTimeInfo?: Record<string, any> | null;
  sectionLeadTime?: Record<string, any> | null;
  subjectTimeLog?: Record<string, any> | null;
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
  missionDestination?: string | null;
  processState?: string | null;
  leadTime?: number | null;
  leadTimeInfo?: Record<string, any> | null;
  sectionLeadTime?: Record<string, any> | null;
  subjectTimeLog?: Record<string, any> | null;
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
  processState?: TrackingLogAttributes['processState'] | null;
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
  missionDestination?: TrackingLogAttributes['missionDestination'];
  processState?: TrackingLogAttributes['processState'];
  leadTime?: TrackingLogAttributes['leadTime'];
  leadTimeInfo?: TrackingLogAttributes['leadTimeInfo'];
  sectionLeadTime?: TrackingLogAttributes['sectionLeadTime'];
  subjectTimeLog?: TrackingLogAttributes['subjectTimeLog'];
}

// delete
export interface TrackingLogDeleteParams {
  id?: TrackingLogAttributes['id'];
}

export interface TrackingLogRedisAttributes
  extends Omit<TrackingLogAttributes, 'createdAt' | 'updatedAt' | 'deletedAt'> {
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
  missionDestination?: TrackingLogAttributes['missionDestination'];
  processState?: TrackingLogAttributes['processState'];
  location?: string;
  // 26.04.04
  callType?: TrackingLogAttributes['callType'];
  // 26.05.16
  leadTime?: TrackingLogAttributes['leadTime'];
  leadTimeInfo?: TrackingLogAttributes['leadTimeInfo'];
  sectionLeadTime?: TrackingLogAttributes['sectionLeadTime'];
  subjectTimeLog?: TrackingLogAttributes['subjectTimeLog'];
}
/* 인터페이스 정의 끝 */

// 리드타임 제외 구간 추가
export interface TrackingLogLeadTimeExcludeInfo extends LeadTimeExcludeInfo {
  fromAt: string | null;
  toAt: string | null;
  excludedDurationSec: number | null;
}

// lead 타임 관련 추가
export interface TrackingLogLeadTimeInfo extends LeadTimeInfo {
  fromAt: string | null;
  toAt: string | null;
  durationSec: number | null;
  excludedDurationSec: number | null;
  exclude?: TrackingLogLeadTimeExcludeInfo[] | null;
}

// 각 구간이 동적으로 사용할 수 있어야 함
// from to (예시) CALL_Request
export interface TrackingLogSectionLeadTimeDetail extends SectionLeadTimeDetail {
  fromAt: string | null;
  toAt: string | null;
  durationSec: number; // 초 단위
}

export interface TrackingLogSectionLeadTime {
  sectionLeadTime: TrackingLogSectionLeadTimeDetail[] | null;
}

export interface SubjectTimeEntry {
  st: string | null;
  ed: string | null;
}

export type SubjectTimeLog = {
  [key in TrackingLogSubjectType]?: SubjectTimeEntry;
};

const trackingLogSubjectTypes: TrackingLogSubjectType[] = [
  'CALL_CREATED',
  'CALL_INFO',
  'CALL_RESPONSE',
  'ACK_CALL_INFO',
  'CRANE_ACTIVE',
  'TRANSFER_COMPLETED',
  'PORT_ASSIGNED',
  'WORK_ORDER_CREATED',
  'CALL_REQUEST',
  'AMR_ACQUIRE_OUT_REQ',
  'AMR_ACQUIRE_OUT_PERMIT',
  'AMR_ACQUIRE_OUT_COMPLETED',
  'FROM_DOCKING_REQ',
  'FROM_DOCKING_PERMIT',
  'FROM_DOCKING_COMPLETED',
  'AMR_DEPOSIT_OUT_REQ',
  'AMR_DEPOSIT_OUT_PERMIT',
  'AMR_DEPOSIT_OUT_COMPLETED',
  'TO_DOCKING_REQ',
  'TO_DOCKING_PERMIT',
  'TO_DOCKING_COMPLETED',
  'FROM_START',
  'FROM_COMPLETED',
  'MISSION_DECIDED',
  'MISSION_START',
  'MISSION_CANCELED',
  'MISSION_COMPLETED',
  'TO_START',
  'TO_COMPLETED',
  'AMR_ASSIGNED',
  'MISSION_ORDER_ASSIGNED',
  'MISSION_ORDER_COMPLETED',
  'MISSION_CANCELED',
  'AMR_UNASSIGNED',
  'AMR_DEPOSIT_COMPLETED',
  'AMR_UNASSIGNED',
  'AMR_DEPOSIT_STARTED',
  'AMR_DEPOSIT_COMPLETED',
  'AMR_ACQUIRE_STARTED',
  'AMR_DEPOSIT_COMPLETED',
  'CARRIER_TRANSFERRING',
];

export const defaultSubjectTimeLog: SubjectTimeLog = Object.fromEntries(
  trackingLogSubjectTypes.map((key) => [key, { st: null, ed: null }])
) as SubjectTimeLog;

export default TrackingLog;
