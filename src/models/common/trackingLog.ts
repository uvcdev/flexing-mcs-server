import { Model, DataTypes, WhereOptions, Order, JSON } from 'sequelize';
import { sequelize } from '../sequelize';
import { ItemLogAttributes, ItemLogInsertParams } from '../timescale/itemLog';

export interface TrackingLogAttributes {
  id: number;
  code: string | null;           // log code - uuid 사용 예정
  caller: string | null;         // Call 발생 설비명
  eqpCallId: string | null;      // mcs call id -> 작업 지시 코드
  callId: string | null;         // Caller 기준 call 번호
  itemCode: string | null;       // Item 코드
  subject: TrackingLogSubjectType | null | any;        // 물류 로그 subject 정보 ex ) LOAD_COMMAND , MISSION_STATE ... 
  detail: string | null;         // subject의 detail 정보 ex ) subject : MISSION_STATE , detail : AMR_ASSIGNED
  state: TrackingLogState | null;       // 물류 로그 진행 상태
  fromFacility: string | null;  // 출발 설비 명 
  toFacility: string | null;   // 도착 설비 명 - 창고 쪽 포트도 도착 설비 명임
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
  'CALL_REQUEST' |  // 콜 요청 ( 창고 요청 )
  'CALL_CHECK' |     // 창고 응답
  'CALL_RESPONSE' |  // 콜에 대한 호출 응답
  'PORT_ASSIGNED' |  // 포트 배정 완료
  'WORK_ORDER_CREATED' |    // 작업지시 생성 
  'AMR_ASSIGNED' |    // AMR 할당 
  'FROM_START' |      // FROM 작업 시작
  'FROM_DOCKING_REQ' |  // FROM 작업 도킹 요청 
  'FROM_DOCKING_PERMIT' | // FROM 작업 도킹 허가
  'FROM_DOCKING_COMPLETED' | // FROM 작업 도킹 완료
  'FROM_PIO' | // FROM PIO 완료
  'FROM_COMPLETED' |   // FROM 작업 완료
  'TO_START' |     // TO 작업 시작
  'TO_DOCKING_REQ' |  // TO 작업 도킹 요청
  'TO_DOCKING_PERMIT' |  // TO 작업 도킹 허가 
  'TO_DOCKING_COMPLETED' |  // TO 작업 도킹 완료
  'TO_PIO' |  // TO PIO 완료
  'TO_COMPLETED' |    // TO 작업 완료
  'MISSION_START' |   // 미션 작업 시작
  'MISSION_COMPLETED' |  // 미션 작업 완료
  'CALL_ID' |
  'WORK_ORDER' |
  'WMS_CALL_ID' |
  'WMS_PORT_ID'
  ;

// 진행 상태 추가 필요시 추가 적용 예정
export type TrackingLogState = 'PUBLISHED' | 'PROCESSING' | 'COMPLETED' | 'ABORTED' | 'CANCELED' | 'PAUSED' | 'ERROR';   // 시작 전 , 진행 중 , 완료 , 중단 , 취소, 정지, 에러

class TrackingLog extends Model implements TrackingLogAttributes {
  public readonly id!: TrackingLogAttributes['id'];
  public code!: TrackingLogAttributes['code'];
  public caller!: TrackingLogAttributes['caller'];
  public eqpCallId!: TrackingLogAttributes['eqpCallId'];
  public callId!: TrackingLogAttributes['callId'];
  public itemCode!: TrackingLogAttributes['itemCode'];
  public subject!: TrackingLogAttributes['subject'];
  public detail!: TrackingLogAttributes['detail'];
  public state!: TrackingLogAttributes['state'];
  public fromFacility!: TrackingLogAttributes['fromFacility'];
  public toFacility!: TrackingLogAttributes['toFacility'];
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
    caller: {
      type: DataTypes.STRING(50),
    },
    eqpCallId: {
      type: DataTypes.STRING(50),
    },
    callId: {
      type: DataTypes.STRING(20),
    },
    itemCode: {
      type: DataTypes.STRING(20),
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
    fromFacility: {
      type: DataTypes.STRING(20),
    },
    toFacility: {
      type: DataTypes.STRING(20),
    },
    assignedRobot: {
      type: DataTypes.STRING(50),
    },
    value: {
      type: DataTypes.STRING(50),
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
  caller: string | null;
  eqpCallId: string | null;
  callId: string | null;
  itemCode: string | null;
  subject: string | null;
  detail: string | null;
  state: TrackingLogState | null;
  fromFacility: string | null;
  toFacility: string | null;
  assignedRobot: string | null;
  value: string | null;
  description: string | null;
}

export interface TrackingLogFindOrCreatedParams {
  eqpCallId: string;
}

export interface TrackingLogUpsertParams {
  code?: string | null;
  caller?: string | null;
  eqpCallId?: string | null;
  callId?: string | null;
  itemCode?: string | null;
  subject?: TrackingLogSubjectType | null;
  detail?: string | null;
  state?: TrackingLogState | null;
  fromFacility?: string | null;
  toFacility?: string | null;
  assignedRobot?: string | null;
  value?: string | null;
  description?: string | null;
}


export interface TrackingLogSelectListParams {
  ids?: Array<number> | null;
  code?: string;
  caller?: string;
  eqpCallId?: string;
  callId?: string;
  itemCode?: string;
  fromFacility?: string;
  toFacility?: string;
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
  caller?: TrackingLogAttributes['caller'];
  callId?: TrackingLogAttributes['callId'];
  // 업데이트 내용
  eqpCallId?: TrackingLogAttributes['eqpCallId'];
  itemCode?: TrackingLogAttributes['itemCode'];
  subject?: TrackingLogAttributes['subject'];
  detail?: TrackingLogAttributes['detail'];
  state?: TrackingLogAttributes['state'];
  fromFacility?: TrackingLogAttributes['fromFacility'];
  toFacility?: TrackingLogAttributes['toFacility'];
  assignedRobot?: TrackingLogAttributes['assignedRobot'];
  value?: TrackingLogAttributes['value'];
  description?: TrackingLogAttributes['description'];
}

// delete
export interface TrackingLogDeleteParams {
  id?: TrackingLogAttributes['id'];
}

// export interface TrackingLogRedisAttributes extends Omit<TrackingLogAttributes, 'createdAt' | 'updatedAt' | 'deletedAt'> {
//   // itemLogList: Array<ItemLogAttributes>;
//   itemLogList: Array<ItemLogInsertParams>;
//   createdDateTime: string;
//   updatedDateTime: string;
// }

export interface TrackingLogRedisUpdateParams {
  code?: TrackingLogAttributes['code']
  caller?: TrackingLogAttributes['caller'];
  eqpCallId?: TrackingLogAttributes['eqpCallId'];
  callId?: TrackingLogAttributes['callId'];
  itemCode?: TrackingLogAttributes['itemCode'];
  subject?: TrackingLogAttributes['subject'];
  detail?: TrackingLogAttributes['detail'];
  state?: TrackingLogAttributes['state'];
  fromFacility?: TrackingLogAttributes['fromFacility'];
  toFacility?: TrackingLogAttributes['toFacility'];
  assignedRobot?: TrackingLogAttributes['assignedRobot'];
  value?: TrackingLogAttributes['value'];
  description?: TrackingLogAttributes['description'];
  location?: string;
}
/* 인터페이스 정의 끝 */

export default TrackingLog;
