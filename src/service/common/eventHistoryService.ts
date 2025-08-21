import moment from 'moment-timezone';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();
import { logging, LogFormat, ActionLog } from '../../lib/logging';
import {
  SelectedInfoResult,
  responseCode as resCode,
  InsertedResult,
  SelectedListResult,
  SelectedAllResult,
  UpdatedResult,
  DeletedResult,
  ErrorClass,
  BulkInsertedOrUpdatedResult,
  getBufferLength,
} from '../../lib/resUtil';
import {
  EventHistoryAttributes,
  EventHistoryInsertParams,
  EventHistorySelectListParams,
  EventHistorySelectInfoParams,
  EventHistorySelectAllMinMaxDateParams,
  EventHistorySelectedMinMaxDate,
  EventHistorySelectAllLatestParams,
} from '../../models/common/eventHistory';
import { dao as eventHistoryDao } from '../../dao/common/eventHistoryDao';
import { Payload } from '../../lib/tokenUtil';

const service = {
  // insert
  reg(
    decodedUser: Payload,
    resJson: EventHistoryInsertParams['responseLog'],
    logFormat: LogFormat<unknown>,
    action: EventHistoryInsertParams['action'],
    tableName: EventHistoryInsertParams['tableName']
  ): void {
    let requestLog = { ...logFormat.requestLog };
    let responseLog = { ...resJson };

    try {
      // 요청값 안에 password가 있으면 '******'로 치환 한다.
      if (requestLog.body && 'password' in (requestLog.body as { password?: string })) {
        requestLog = {
          ...requestLog,
          body: {
            ...(requestLog.body as { password?: string }),
            password: '******',
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
              rows: responseLog.data.rows.map((row: unknown) => (row as SelectedInfoResult).id),
            },
          };
        }
      }
      // case 2. 'listAll'을 이용한 전체 리스트 출력('SelectedAllResult<T>'인 경우)
      if (Array.isArray(responseLog.data)) {
        responseLog = {
          ...responseLog,
          data: responseLog.data.map((row: unknown) => (row as SelectedInfoResult).id),
        };
      }

      let tablePks: Array<number> = [];
      // 액션에 따라 tablePks값 추출하기
      if (action === 'Create') {
        if (responseLog.data && 'insertedId' in responseLog.data) {
          tablePks.push(Number(responseLog.data.insertedId));
        }
      } else if (action === 'BulkCreate') {
        if (responseLog.data && 'insertedIds' in responseLog.data) {
          tablePks = responseLog.data.insertedIds as Array<number>;
        }
      } else if (action === 'SelectList') {
        if (responseLog.data && 'rows' in responseLog.data) {
          tablePks = responseLog.data.rows as Array<number>;
        }
      } else if (action === 'SelectInfo') {
        if (responseLog.data && 'id' in responseLog.data) {
          tablePks.push(responseLog.data.id);
        }
      } else if (action === 'Update') {
        // 업데이트가 정확히 된 것만 pk값 추출
        if (responseLog.data && 'updatedCount' in responseLog.data) {
          if ((responseLog.data.updatedCount as number) > 0) {
            // pk를 request에서 추출 한다.(얘는 response에 updatedCount값만 가지고 있음)
            if (requestLog.params && 'id' in (requestLog.params as { id?: string })) {
              tablePks.push(Number((requestLog.params as { id?: string }).id));
            }
          }
        }
      } else if (action === 'Delete') {
        // 삭제가 정확히 된 것만 pk값 추출
        if (responseLog.data && 'deletedCount' in responseLog.data) {
          if ((responseLog.data.deletedCount as number) > 0) {
            // pk를 request에서 추출 한다.(얘는 response에 deletedCount값만 가지고 있음)
            if (requestLog.params && 'id' in (requestLog.params as { id?: string })) {
              tablePks.push(Number((requestLog.params as { id?: string }).id));
            }
          }
        }
      }

      // 이벤트 히스토리용 파라미터 생성
      const eventHistoryParams: EventHistoryInsertParams = {
        userId: Number((decodedUser as { id?: Payload['id'] }).id),
        action,
        tableName,
        tablePks: tablePks.length > 0 ? tablePks : null,
        requestLog,
        responseLog,
        clientIp: logFormat.clientIp,
      };

      // 이벤트 히스토리 기록에서 제외할 계정을 확인 한다.
      const excludeEventHistory = process.env.EXCLUDE_EVENT_HISTORY;
      let isExcludeUser = false;
      if (excludeEventHistory) {
        const excludeUserids = excludeEventHistory.split(',');
        const decodedUserid = decodedUser.userid || '';

        if (excludeUserids.indexOf(decodedUserid) >= 0) {
          isExcludeUser = true;
        }
      }

      // 이벤트 히스토리 기록
      if (isExcludeUser === false) {
        // 제외할 계정이 아니면 로그를 기록 한다.
        void eventHistoryDao.insert(eventHistoryParams);
      }

      // 스마트 공장 관리 시스템 로그 전송(http://pms.smart-factory.kr/)
      const pmsUrl = process.env.PMS_API_URL;
      const pmsKey = process.env.PMS_API_KEY;

      if (pmsUrl && pmsKey) {
        const pmsLogParams = {
          crtfcKey: pmsKey, // 인증키
          logDt: moment().tz('Europe/Madrid').format('YYYY-MM-DD HH:mm:ss.SSS'), // 로그일시(한국시간)
          useSe: eventHistoryParams.action, // 사용 구분
          sysUser: eventHistoryParams.userId.toString(), // 사용자 식별값
          conectIp: eventHistoryParams.clientIp, // 접속IP
          dataUsgqty: getBufferLength(JSON.stringify(eventHistoryParams.responseLog)), // 데이터 크기
        };

        const actionLog: ActionLog = {
          filename: __filename,
          params: null,
          result: null,
          error: null,
        };

        axios
          .post(pmsUrl, null, { params: pmsLogParams })
          .then((response) => {
            logging.ACTION_DEBUG({ ...actionLog, params: pmsLogParams, result: response.data });
          })
          .catch((err) => {
            logging.ACTION_ERROR({ ...actionLog, params: pmsLogParams, error: err });
          });
      }
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, null, err);
    }
  },
  // selectList
  async list(
    params: EventHistorySelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<EventHistoryAttributes>> {
    let result: SelectedListResult<EventHistoryAttributes>;

    try {
      result = await eventHistoryDao.selectList(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectInfo
  async info(
    params: EventHistorySelectInfoParams,
    logFormat: LogFormat<unknown>
  ): Promise<EventHistoryAttributes | null> {
    let result: EventHistoryAttributes | null;

    try {
      result = await eventHistoryDao.selectInfo(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectAll
  async listAllMinMaxDate(
    params: EventHistorySelectAllMinMaxDateParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedAllResult<EventHistorySelectedMinMaxDate>> {
    let result: SelectedAllResult<EventHistorySelectedMinMaxDate>;

    try {
      result = await eventHistoryDao.selectAllMinMaxDate(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectAll
  async listAllLatest(
    params: EventHistorySelectAllLatestParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedAllResult<EventHistoryAttributes>> {
    let result: SelectedAllResult<EventHistoryAttributes>;

    try {
      result = await eventHistoryDao.selectAllLatest(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
};

export { service };
