import logger from './logger';
import { v4 as uuidv4 } from 'uuid';
import { ResponseJson, responseCode, SelectedInfoResult } from './resUtil';
import requestIp from 'request-ip';
import { logDao } from '../dao/timescale/logDao';
import { itemLogDao } from '../dao/timescale/itemLogDao';
import { MqttTopics, sendMqtt } from './mqttUtil';
import { ItemLogInsertParams } from '../models/timescale/itemLog';
import fs from 'fs';
import path from 'path';
import colors from 'ansi-colors';

export interface LogHeader {
  traceId: string | null; // 외부에서 API를 호출했을때 사용 할 "외부용 추적 키 값" (보통 Front-end에서 생성함)
  spanId: string; // API가 호출되었을때 Request당 하나씩 만든다. "내부용 추적 키 값" (uuidv4로 생성함)
  clientIp: string; // 클라이언트 IP (request-ip를 이용해서 추출함)
  accessToken: string | null; // 접속자의 토큰 정보
}

export interface RequestLog {
  headers?: { [key: string]: unknown };
  method: string;
  hostname: string;
  baseUrl: string;
  originalUrl: string;
  params: unknown;
  query: unknown;
  body: unknown;
}

export interface ActionLog {
  filename: string | null;
  params: unknown;
  result: unknown;
  error: unknown;
}

export interface SystemLog {
  title: string | null;
  message: unknown;
  error?: unknown;
}

// (번외)테스트 출력용 로그 포맷
interface TestLogFormat {
  timestamp: string;
  testLog: unknown;
}

// MQTT 전용 로그
interface MqttLogFormat {
  title: string;
  topic?: string;
  message: unknown;
  error?: unknown;
}

interface RedisLogFormat {
  key: string;
  value: string;
  message: unknown;
  error?: unknown;
}

type WsLogFormat = {
  // WebSocket 로그에 필요한 필드들을 정의
  // 예시:
  message: string;
  error?: unknown;
  // 기타 필요한 필드 추가
};

type CacheLogFormat = {
  message: string;
  error?: unknown;
};

// kepware 전용 로그
type KepwareLogFormat = {
  action: 'TAG_READ' | 'TAG_WRITE' | 'TAG_SUBSCRIBE' | 'ERROR';
  tag: string | null; // 태그명
  value: string | null; // 태그 값
  // quality: string,    // 데이터 품질 (예: 'Good', 'Bad')
  // timestamp: string,  // 발생 시간
  message: string;
  error?: unknown;
};

// 최종 로그 포맷은 이러하다.
export interface LogFormat<T> {
  timestamp: string;
  logLevel: string;
  logPoint: string;
  traceId: LogHeader['traceId'];
  spanId: LogHeader['spanId'];
  accessToken: LogHeader['accessToken'];
  clientIp: LogHeader['clientIp'];
  requestLog: RequestLog;
  actionLog: ActionLog;
  responseLog: ResponseJson<T>;
  systemLog: SystemLog;
}

type PartDetail = {
  partcount: number; // '수량'은 숫자 데이터 타입으로 가정합니다.
  partno: string;
  parttype: string;
  partinfo: string;
};
type AcsDetail = {
  itemCode: string | null;
  facilityCode: string | null;
  facilityName: string | null;
  amrCode: string | null;
  amrName: string | null;
};
type RobotTransport = {
  id: string; // 'GUID'를 문자열로 가정합니다.
  start: string;
  dest: string;
  robot: string;
  detail: PartDetail;
  acsDetail: AcsDetail;
};

type PayloadDetail = {
  partid: string;
  partstatus: string;
  partcount: number; // '제품수량'은 숫자 데이터 타입으로 가정합니다.
};

type Payload = {
  code: string;
  floor: number; // '적재층 번호'를 숫자로 가정합니다.
  index: number; // '적재 공간 번호'를 숫자로 가정합니다.
  loadstate: string;
  detail: PayloadDetail;
};

type Location = {
  location: string;
  locationtype: string;
  payloadtype: string;
  payloads: Payload[];
};

type LocationsData = {
  acsDetail: AcsDetail;
  locations: Location[];
};

type MissionState =
  | 'MISSION_INITIATED'
  | 'AMR_ASSIGNED'
  | 'AMR_UNASSIGNED'
  | 'AMR_ARRIVED'
  | 'AMR_ACQUIRE_STARTED'
  | 'AMR_ACQUIRE_COMPLETED'
  | 'CARRIER_TRANSFERRING'
  | 'AMR_DEPOSIT_STARTED'
  | 'AMR_DEPOSIT_COMPLETED'
  | 'AMR_UNASSIGNED'
  | 'MISSION_COMPLETED'
  | 'MISSION_CANCELED'
  | 'MISSION_FAILED'
  | 'MISSION_PAUSED'
  | 'MISSION_RESUMED'
  | 'CHARGING_MISSION_INITIATED'
  | 'CHARGING_STARTED'
  | 'CHARGING_MISSION_COMPLETED';

type MissionStateData = {
  mission: string;
  state: MissionState;
  assign: {
    robot: string;
    task: MissionState;
  };
  acsDetail: AcsDetail;
};

type WorkStatus = {
  EQP_ID: string;
  AMR_CODE: string;
  EQP_CALL_ID: string;
  WCS_CALL_ID: string;
  STATUS: keyof typeof workStatusObject;
  DATE_TIME: string;
};

const workStatusObject = {
  CALL_REQUEST: {
    description: 'EQP(설비) 콜 발생',
    missing_value: 'EQP(설비) 콜 미수신',
  },
  CALL_CHECK: {
    description: 'WCS(창고)에서 해당 콜 인지',
    missing_value: 'MCS, WCS(창고) 통신 불량',
  },
  CALL_RESPONSE: {
    description: 'EQP(설비)에 콜 응답 작성',
    missing_value: 'MCS, PLC 통신 불량',
  },
  WORK_CREATE: {
    description: '콜이 작업으로 생성됨',
    missing_value: 'WCS(창고) 포트 미배정 or WCS(창고) 통신 불량',
  },
  WORK_ASSIGNED: {
    description: '작업이 로봇에 할당됨',
    missing_value: '로봇 미할당 or MCS, ACS 통신 불량',
  },
  CALL_ROBOT: {
    description: '콜에 로봇 할당 값 Write',
    missing_value: 'MCS, PLC 통신 불량',
  },
  WCS_DOCKING_REQUEST: {
    description: 'WCS(창고)에 도킹 요청',
    missing_value: 'ACS에서 도킹 요청 신호 미수신 or MQTT 통신 불량',
  },
  WCS_DOCKING_RESPONSE: {
    description: 'WCS(창고) 도킹 허가 확인',
    missing_value: 'WCS(창고)에서 도킹 불가 처리',
  },
  WCS_DOCKING_COMPLETE: {
    description: 'WCS(창고) 도킹 완료',
    missing_value: 'ACS에서 도킹 완료 신호 미수신 or MQTT 통신 불량',
  },
  WCS_DOCKING_DETACH: {
    description: 'WCS(창고) 도킹 해제',
    missing_value: 'ACS에서 도킹 해제 신호 미수신 or MQTT 통신 불량',
  },
  EQP_DOCKING_REQUEST: {
    description: 'EQP(설비) 도킹 요청',
    missing_value: 'ACS에서 도킹 요청 신호 미수신 or MQTT 통신 불량',
  },
  EQP_DOCKING_RESPONSE: {
    description: 'EQP(설비)에 도킹 허가 확인',
    missing_value: 'EQP(설비)에서 도킹 허가 미수신 (설비 수동 or 도킹 불가 등..)',
  },
  EQP_DOCKING_FAILED: {
    description: 'EQP(설비)에서 도킹 불가 처리',
    missing_value: '정상 도킹 or MQTT 통신 불량',
  },
  EQP_DOCKING_COMPLETE: {
    description: 'EQP(설비) 도킹 완료',
    missing_value: 'ACS에서 도킹 완료 신호 미수신 or MQTT 통신 불량 or EQP 통신 불량',
  },
  EQP_DOCKING_DETACH: {
    description: 'EQP(설비) 도킹 해제',
    missing_value: 'ACS에서 도킹 해제 신호 미수신 or MQTT 통신 불량',
  },
};

// 기본 로그 포맷 만들어 주기
export function makeLogFormat(req: RequestLog): LogFormat<unknown> {
  return {
    timestamp: '',
    logLevel: '',
    logPoint: '',
    traceId: req.headers && req.headers['trace-id'] ? (req.headers['trace-id'] as string) : null,
    spanId: uuidv4(),
    accessToken: req.headers && req.headers['access-token'] ? (req.headers['access-token'] as string) : null,
    clientIp: requestIp.getClientIp(req as unknown as requestIp.Request)?.toString() as string,
    requestLog: {
      method: req.method,
      hostname: req.hostname,
      baseUrl: req.baseUrl,
      originalUrl: req.originalUrl,
      params: req.params,
      query: req.query,
      body: req.body,
    },
    actionLog: { filename: null, params: null, result: null, error: null },
    responseLog: responseCode.DEFAULT,
    systemLog: { title: null, message: null },
  };
}

// 각 프로세스별 로깅 처리
export const logging = {
  TEST_LOG(testLog: unknown): void {
    // 용도: 개발 시 디버깅용 로그(실 운영시 사용 금지!)
    const logLevel = 'debug';
    try {
      const logFormat: TestLogFormat = {
        timestamp: new Date().toISOString(),
        testLog,
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'TEST_LOG',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.ERROR_METHOD', error);
    }
  },
  SYSTEM_LOG(systemLog: SystemLog): void {
    // 용도: 시스템용 로그(시스템에서 동작 시 로깅처리)
    const logLevel = 'info';
    try {
      const logFormat: LogFormat<unknown> = {
        timestamp: new Date().toISOString(),
        logLevel,
        logPoint: 'SYSTEM_LOG',
        traceId: '',
        spanId: '',
        accessToken: null,
        clientIp: '',
        requestLog: {
          method: '',
          hostname: '',
          baseUrl: '',
          originalUrl: '',
          params: {},
          query: {},
          body: {},
        },
        actionLog: {
          filename: '',
          params: null,
          result: null,
          error: null,
        },
        responseLog: {
          status: 0,
          code: '',
          message: null,
          data: null,
          remark: null,
        },
        systemLog,
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'SYSTEM_LOG',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.ERROR_METHOD', error);
    }
  },
  SYSTEM_ERROR(systemLog: SystemLog, err: Error): void {
    // 용도: 시스템용 에러 로그(시스템에서 동작 시 로깅처리)
    const logLevel = 'error';

    try {
      const error = {
        message: err instanceof Error ? err.message : '',
        stack: err instanceof Error ? err.stack : '',
      };

      const logFormat: LogFormat<unknown> = {
        timestamp: new Date().toISOString(),
        logLevel,
        logPoint: 'SYSTEM_ERROR',
        traceId: '',
        spanId: '',
        accessToken: null,
        clientIp: '',
        requestLog: {
          method: '',
          hostname: '',
          baseUrl: '',
          originalUrl: '',
          params: {},
          query: {},
          body: {},
        },
        actionLog: {
          filename: '',
          params: null,
          result: null,
          error: null,
        },
        responseLog: {
          status: 0,
          code: '',
          message: null,
          data: null,
          remark: null,
        },
        systemLog: {
          ...systemLog,
          error,
        },
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'SYSTEM_ERROR',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.ERROR_METHOD', error);
    }
  },
  REQUEST_PARAM(logFormat: LogFormat<unknown>): void {
    // 용도: API 요청(request)시 로깅 처리
    const logLevel = 'info';

    // 요청값 안에 password가 있으면 '******'로 치환 한다.
    try {
      if (logFormat.requestLog.body && 'password' in (logFormat.requestLog.body as { password?: string })) {
        logFormat = {
          ...logFormat,
          requestLog: {
            ...logFormat.requestLog,
            body: {
              ...(logFormat.requestLog.body as { password?: string }),
              password: '******',
            },
          },
        };
      }

      const logPrint = {
        ...logFormat,
        timestamp: new Date().toISOString(),
        logLevel,
        logPoint: 'REQUEST_PARAM',
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'REQUEST_PARAM',
        data: logPrint,
      });
    } catch (error) {
      console.log('logging.REQUEST_PARAM', error);
    }
  },
  METHOD_ACTION(logFormat: LogFormat<unknown>, filename: string, params: unknown, result: unknown): void {
    // 용도: 메소드 동작시 로깅 처리
    const logLevel = 'debug';

    // 요청값 안에 password가 있으면 '******'로 치환 한다.
    try {
      if (logFormat.requestLog.body && 'password' in (logFormat.requestLog.body as { password?: string })) {
        logFormat = {
          ...logFormat,
          requestLog: {
            ...logFormat.requestLog,
            body: {
              ...(logFormat.requestLog.body as { password?: string }),
              password: '******',
            },
          },
        };
      }

      // actionLog.params안에 password가 있으면 '******'로 치환 한다.
      if (params && 'password' in (params as { password?: string })) {
        params = {
          ...(params as { password?: string }),
          password: '******',
        };
      }

      const logPrint = {
        ...logFormat,
        timestamp: new Date().toISOString(),
        logLevel,
        logPoint: 'METHOD_ACTION',
        actionLog: {
          filename,
          params,
          result,
          error: null,
        },
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'METHOD_ACTION',
        data: logPrint,
      });
    } catch (error) {
      console.log('logging.ERROR_METHOD', error);
    }
  },
  ERROR_METHOD(logFormat: LogFormat<unknown>, filename: string, params: unknown, error: unknown): void {
    // 용도: 예외처리 발생 시 로깅 처리
    const logLevel = 'error';

    // 요청값 안에 password가 있으면 '******'로 치환 한다.
    try {
      if (logFormat.requestLog.body && 'password' in (logFormat.requestLog.body as { password?: string })) {
        logFormat = {
          ...logFormat,
          requestLog: {
            ...logFormat.requestLog,
            body: {
              ...(logFormat.requestLog.body as { password?: string }),
              password: '******',
            },
          },
        };
      }

      let actionError = null;
      if (error instanceof Error) {
        actionError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        actionError = error;
      }

      const logPrint = {
        ...logFormat,
        timestamp: new Date().toISOString(),
        logLevel,
        logPoint: 'ERROR_METHOD',
        actionLog: {
          filename,
          params,
          result: null,
          error: actionError,
        },
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'ERROR_METHOD',
        data: logPrint,
      });
    } catch (error) {
      console.log('logging.ERROR_METHOD', error);
    }
    // logger[logLevel](JSON.stringify(logPrint));
  },
  RESPONSE_DATA(logFormat: LogFormat<unknown>, responseLog: ResponseJson<unknown>): void {
    try {
      // 용도: 최종 응답에 대한 로깅 처리
      const logLevel = 'info';

      // 요청값 안에 password가 있으면 '******'로 치환 한다.
      if (logFormat.requestLog.body && 'password' in (logFormat.requestLog.body as { password?: string })) {
        logFormat = {
          ...logFormat,
          requestLog: {
            ...logFormat.requestLog,
            body: {
              ...(logFormat.requestLog.body as { password?: string }),
              password: '******',
            },
          },
        };
      }

      // 응답값 안에 리스트가 있으면 id(pk)값만 추출해 준다. (데이터 절약을 위해)
      // case 1. 'list'를 이용한 검색 리스트 출력 로그('SelectedListResult<T>'인 경우)
      if (responseLog.data && 'rows' in responseLog.data) {
        if (responseLog.data.rows && Array.isArray(responseLog.data.rows)) {
          responseLog = {
            ...responseLog,
            data: {
              ...responseLog.data,
              rows: [responseLog.data.rows.length],
            },
          };
        }
      } else if (typeof responseLog.data === 'object') {
        responseLog = {
          ...responseLog,
          data: {
            id: (responseLog.data as { id?: number })?.id || 0,
          },
          // data: responseLog.data.map((row: unknown) => (row as SelectedInfoResult).id), // --> 왜 이렇게 했는지 기억이 안난다. (id가 없는 List도 있는데)
          // data: responseLog.data,
        };
      }

      // case 2. 'listAll'을 이용한 전체 리스트 출력('SelectedAllResult<T>'인 경우)
      if (Array.isArray(responseLog.data)) {
        responseLog = {
          ...responseLog,
          data: [`length: ${responseLog.data.length}`],
          // data: responseLog.data.map((row: unknown) => (row as SelectedInfoResult).id), // --> 왜 이렇게 했는지 기억이 안난다. (id가 없는 List도 있는데)
          // data: responseLog.data,
        };
      }

      const logPrint = {
        ...logFormat,
        responseLog,
      };
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'RESPONSE_DATA',
        data: logPrint,
      });
    } catch (error) {
      console.log('logging.RESPONSE_DATA', error);
    }
  },
  MQTT_LOG(mqttLog: MqttLogFormat): void {
    try {
      const logLevel = 'info';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'MQTT_LOG',
        data: mqttLog,
      });
    } catch (error) {
      console.log('logging.MQTT_LOG', error);
    }
  },
  MQTT_DEBUG(mqttLog: MqttLogFormat): void {
    try {
      const logLevel = 'debug';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'MQTT_DEBUG',
        data: mqttLog,
      });
    } catch (error) {
      console.log('logging.MQTT_DEBUG', error);
    }
  },
  MQTT_ERROR(mqttLog: MqttLogFormat): void {
    try {
      const logLevel = 'error';

      const logFormat = {
        mqttLog: {
          ...mqttLog,
          error: {
            message: mqttLog.error instanceof Error ? mqttLog.error.message : '',
            stack: mqttLog.error instanceof Error ? mqttLog.error.stack : '',
          },
        },
      };

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'MQTT_ERROR',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.MQTT_ERROR', error);
    }
  },
  WS_LOG(wsLog: WsLogFormat): void {
    try {
      const logLevel = 'info';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'WS_LOG',
        data: wsLog,
      });
    } catch (error) {
      console.log('logging.WS_LOG', error);
    }
  },
  WS_DEBUG(wsLog: WsLogFormat): void {
    try {
      const logLevel = 'debug';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'WS_DEBUG',
        data: wsLog,
      });
    } catch (error) {
      console.log('logging.WS_DEBUG', error);
    }
  },
  WS_ERROR(wsLog: WsLogFormat): void {
    try {
      const logLevel = 'error';

      const logFormat = {
        wsLog: {
          ...wsLog,
          error: {
            message: wsLog.error instanceof Error ? wsLog.error.message : '',
            stack: wsLog.error instanceof Error ? wsLog.error.stack : '',
          },
        },
      };

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'WS_ERROR',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.MQTT_LOG', error);
    }
  },
  ACTION_INFO(actionLog: ActionLog): void {
    try {
      // 용도: 일반 액션 로그(REQUEST/RESPONSE가 아닌 경우에 대한 로그)
      const logLevel = 'info';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'ACTION_INFO',
        data: actionLog,
      });
    } catch (error) {
      console.log('logging.ACTION_INFO', error);
    }
  },
  ACTION_DEBUG(actionLog: ActionLog): void {
    try {
      // 용도: 일반 액션 디버그 로그(REQUEST/RESPONSE가 아닌 경우에 대한 로그)
      const logLevel = 'debug';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'ACTION_DEBUG',
        data: actionLog,
      });
    } catch (error) {
      console.log('logging.ACTION_DEBUG', error);
    }
  },
  ACTION_ERROR(actionLog: ActionLog): void {
    try {
      // console.log('🚀 ~ ACTION_ERROR ~ actionLog:', actionLog);
      // 용도: 일반 액션 디버그 로그(REQUEST/RESPONSE가 아닌 경우에 대한 로그)
      const logLevel = 'error';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'ACTION_ERROR',
        data: actionLog,
      });
    } catch (error) {
      console.log('logging.ACTION_ERROR', error);
    }
  },
  CACHE_ERROR(cacheLog: CacheLogFormat): void {
    try {
      const logLevel = 'error';

      const logFormat = {
        cacheLog: {
          ...cacheLog,
          error: {
            message: cacheLog.error instanceof Error ? cacheLog.error.message : '',
            stack: cacheLog.error instanceof Error ? cacheLog.error.stack : '',
          },
        },
      };

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'CACHE_ERROR',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.CACHE_ERROR', error);
    }
  },
  WORK_STATUS(data: WorkStatus): void {
    try {
      const { EQP_ID, AMR_CODE, DATE_TIME, STATUS, ...newData } = data;
      const workStatusInfo = workStatusObject[STATUS];
      if (!workStatusInfo) return;

      const logData = { info: workStatusInfo.description, ...newData };

      const logLevel = 'info';
      void logDao.insert({
        facilityCode: EQP_ID || null,
        facilityName: null,
        amrCode: AMR_CODE || null,
        amrName: null,
        logLevel: logLevel,
        function: 'WORK_STATUS',
        data: logData,
      });
    } catch (error) {
      console.log('logging.ITEM_LOG.TRaNSPORT_COMMAND_LOG', error);
    }
  },
  ITEM_LOG: {
    TRANSPORT_COMMAND_LOG(data: RobotTransport): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-MISSION_COMMAND`,
          subject: 'TRANSPORT_COMMAND',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.TRaNSPORT_COMMAND_LOG', error);
      }
    },
    LOAD_COMMAND_LOG(data: RobotTransport): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-MISSION_COMMAND`,
          subject: 'LOAD_COMMAND',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.LOAD_COMMAND_LOG', error);
      }
    },
    UNLOAD_COMMAND(data: RobotTransport): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-MISSION_COMMAND`,
          subject: 'UNLOAD_COMMAND',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.UNLOAD_COMMAND', error);
      }
    },
    CANCEL_MISSION_COMMAND(data: { id: string; mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-MISSION_COMMAND`,
          subject: 'CANCEL_MISSION_COMMAND',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.CANCEL_MISSION_COMMAND', error);
      }
    },
    ACK_MISSION_COMPLETED(data: { mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-ACK_MISSION_STATE`,
          subject: 'ACK_MISSION_COMPLETED',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.ACK_MISSION_COMPLETED', error);
      }
    },
    ACK_MISSION_FAILED(data: { mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-ACK_MISSION_STATE`,
          subject: 'ACK_MISSION_FAILED',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.ACK_MISSION_FAILED', error);
      }
    },
    ACK_MISSION_STATE(data: { mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${process.env.MQTT_WMS_TOPIC || 'MS01'}-${acsDetail.amrCode || ''}-ACK_MISSION_STATE`,
          subject: 'ACK_MISSION_STATE',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.ACK_MISSION_STATE', error);
      }
    },
    PAYLOAD_STATE(data: LocationsData): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-PAYLOAD_STATE`,
          subject: 'PAYLOAD_STATE',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.PAYLOAD_STATE', error);
      }
    },
    MISSION_STATE(data: MissionStateData): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-MISSION_STATE`,
          subject: 'MISSION_STATE',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.MISSION_STATE', error);
      }
    },
    MISSION_COMPLETED(data: { mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-MISSION_STATE`,
          subject: 'MISSION_COMPLETED',
          body: { mission: data.mission, robot: acsDetail.amrCode },
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.MISSION_COMPLETED', error);
      }
    },
    MISSION_FAILED(data: { mission: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-MISSION_STATE`,
          subject: 'MISSION_FAILED',
          body: { mission: data.mission },
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.MISSION_FAILED', error);
      }
    },
    ALARM_REPORT(data: { id: string; code: string; source: string; data: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-ALARM_STATE`,
          subject: 'ALARM_REPORT',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.ALARM_REPORT', error);
      }
    },
    ALARM_CLEAR(data: { id: string; code: string; source: string; data: string; acsDetail: AcsDetail }): void {
      try {
        const logLevel = 'info';
        const { acsDetail, ...body } = data;
        const insertParams: ItemLogInsertParams = {
          itemCode: acsDetail.itemCode,
          facilityCode: acsDetail.facilityCode,
          facilityName: acsDetail.facilityName,
          amrCode: acsDetail.amrCode,
          amrName: acsDetail.amrName,
          topic: `${acsDetail.amrCode || ''}-${process.env.MQTT_WMS_TOPIC || 'MS01'}-ALARM_STATE`,
          subject: 'ALARM_CLEAR',
          body: body,
        };
        void itemLogDao.insert(insertParams);
      } catch (error) {
        console.log('logging.ITEM_LOG.ALARM_CLEAR', error);
      }
    },
  },
  KEPWARE_LOG(kepwareLog: KepwareLogFormat): void {
    try {
      const logLevel = 'info';
      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'KEPWARE_LOG',
        data: kepwareLog,
      });
    } catch (error) {
      console.log('logging.KEPWARE_LOG', error);
    }
  },
  KEPWARE_DEBUG(kepwareLog: KepwareLogFormat): void {
    try {
      const logLevel = 'debug';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'KEPWARE_DEBUG',
        data: kepwareLog,
      });
    } catch (error) {
      console.log('logging.KEPWARE_DEBUG', error);
    }
  },
  KEPWARE_ERROR(kepwareLog: KepwareLogFormat): void {
    try {
      const logLevel = 'error';
      const newData = {
        message: JSON.parse(JSON.stringify(kepwareLog.message)),
        error: kepwareLog.error,
      };

      const logFormat = {
        kepwareLog: {
          ...newData,
          error: {
            message: kepwareLog.error instanceof Error ? kepwareLog.error.message : '',
            stack: kepwareLog.error instanceof Error ? kepwareLog.error.stack : '',
          },
        },
      };

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'KEPWARE_ERROR',
        data: logFormat,
      });
    } catch (error) {
      console.log('logging.KEPWARE_ERROR', error);
    }
  },
  REDIS_LOG(redisLog: RedisLogFormat): void {
    try {
      const logLevel = 'info';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'REDIS_LOG',
        data: redisLog,
      });
    } catch (error) {
      console.log('logging.REDIS_LOG', error);
    }
  },
  REDIS_DEBUG(redisLog: RedisLogFormat): void {
    try {
      const logLevel = 'debug';

      void logDao.insert({
        facilityCode: null,
        facilityName: null,
        amrCode: null,
        amrName: null,
        logLevel: logLevel,
        function: 'REDIS_DEBUG',
        data: redisLog,
      });
    } catch (error) {
      console.log('logging.REDIS_DEBUG', error);
    }
  },
};

// KEPWARE 로깅

// 로그 파일 경로 설정
const logFilePath = path.resolve(__dirname, '../logs/output.txt');

// 로그 디렉토리 경로 추출
const logDirPath = path.dirname(logFilePath);

// 디렉토리 존재 여부 확인 및 생성 함수
function ensureDirectoryExistence(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    return true;
  }

  // 상위 디렉토리 재귀적으로 생성
  ensureDirectoryExistence(path.dirname(dirPath));

  // 디렉토리 생성
  fs.mkdirSync(dirPath);
  console.log(`디렉토리 생성됨: ${dirPath}`);
  return true;
}

// 로그 파일 및 디렉토리 생성 확인
try {
  // 디렉토리 확인 및 생성
  ensureDirectoryExistence(logDirPath);

  // 파일이 존재하지 않으면 빈 파일 생성
  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '');
    console.log(`로그 파일 생성됨: ${logFilePath}`);
  }

  // 여기에 로그 파일을 사용하는 나머지 코드 작성...
} catch (err: any) {
  console.error(`로그 파일 생성 중 오류 발생: ${err.message}`);
}

// 콘솔 및 파일 출력 함수
export function logToConsoleAndFile(data: string, color?: 'important' | 'green' | 'blue' | 'red' | 'yellow') {
  if (color === 'green') {
    console.log(colors.green(data), formatWithMilliseconds(new Date()));
  } else if (color === 'blue') {
    console.log(colors.blue(data), formatWithMilliseconds(new Date()));
  } else if (color === 'red') {
    console.log(colors.red(data), formatWithMilliseconds(new Date()));
  } else if (color === 'yellow') {
    console.log(colors.yellow(data), formatWithMilliseconds(new Date()));
  } else if (color === 'important') {
    console.log(colors.bgMagenta(data), formatWithMilliseconds(new Date()));
  } else {
    console.log(data, formatWithMilliseconds(new Date()));
  }

  // 로그 파일에 데이터 쓰기
  fs.appendFileSync(logFilePath, data + formatWithMilliseconds(new Date()) + '\n', { encoding: 'utf8' });
}

// 시간 포맷 함수
export const formatWithMilliseconds = (date: Date) => {
  return `${date.toDateString()} ${date.toTimeString().split(' ')[0]}.${date.getMilliseconds().toString().padStart(3, '0')} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
};
