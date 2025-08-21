import moment from 'moment-timezone';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();
import { logging, LogFormat, ActionLog } from '../../lib/logging';
import {
  responseCode as resCode,
  InsertedResult,
  SelectedListResult,
  UpdatedResult,
  DeletedResult,
  ErrorClass,
  SelectedAllResult,
  getBufferLength,
} from '../../lib/resUtil';
import { PayloadExt, verifyAccessToken } from '../../lib/tokenUtil';
import {
  TokenHistoryAttributes,
  TokenHistoryInsertParams,
  TokenHistorySelectListParams,
  TokenHistorySelectInfoParams,
  // TokenHistoryUpdateParams,
  // TokenHistoryDeleteParams,
  TokenHistorySelectAllUsersParams,
} from '../../models/common/tokenHistory';
import { dao as tokenHistoryDao } from '../../dao/common/tokenHistoryDao';

function fncLatestSeconds(fromDate: Date | null, toDate: Date | null): number {
  let lastestSeconds = 0;

  const fromTime = fromDate ? +new Date(fromDate) : 0;
  const toTime = toDate ? +new Date(toDate) : 0;
  lastestSeconds = toTime - fromTime;

  if (lastestSeconds > 0) {
    lastestSeconds = lastestSeconds / 1000;
  } else {
    lastestSeconds = 0;
  }

  return Math.floor(lastestSeconds);
}

const service = {
  // insert 로그인 정보
  regCreated(params: TokenHistoryInsertParams, logFormat: LogFormat<unknown>): void {
    const decodedToken = verifyAccessToken(params.accessToken) as PayloadExt;

    // 토큰 만료일 세팅
    if (decodedToken && decodedToken.exp) {
      const timestamp = decodedToken.exp * 1000;
      params.accessExpire = new Date(timestamp);
    }

    try {
      // 토큰 히스토리 기록
      void tokenHistoryDao.insert(params);

      // 스마트 공장 관리 시스템 로그 전송(http://pms.smart-factory.kr/)
      const pmsUrl = process.env.PMS_API_URL;
      const pmsKey = process.env.PMS_API_KEY;

      if (pmsUrl && pmsKey) {
        const pmsLogParams = {
          crtfcKey: pmsKey, // 인증키
          logDt: moment().tz('Europe/Madrid').format('YYYY-MM-DD HH:mm:ss.SSS'), // 로그일시(한국시간)
          useSe: 'Login', // 사용 구분
          sysUser: params.userId?.toString(), // 사용자 식별값
          conectIp: params.clientIp, // 접속IP
          dataUsgqty: getBufferLength(JSON.stringify(params.accessToken)), // 데이터 크기
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
      logging.ERROR_METHOD(logFormat, __filename, params, err);
    }
  },
  // insert 로그아웃 정보
  regDestroyed(params: TokenHistoryInsertParams, logFormat: LogFormat<unknown>): void {
    const decodedToken = verifyAccessToken(params.accessToken) as PayloadExt;

    // 토큰 만료일 세팅
    if (decodedToken && decodedToken.id && decodedToken.exp) {
      const timestamp = decodedToken.exp * 1000;
      params.accessExpire = new Date(timestamp);
    }

    try {
      // 토큰 히스토리 기록
      void tokenHistoryDao.insert(params);

      // 스마트 공장 관리 시스템 로그 전송(http://pms.smart-factory.kr/)
      const pmsUrl = process.env.PMS_API_URL;
      const pmsKey = process.env.PMS_API_KEY;

      if (pmsUrl && pmsKey) {
        const pmsLogParams = {
          crtfcKey: pmsKey, // 인증키
          logDt: moment().tz('Europe/Madrid').format('YYYY-MM-DD HH:mm:ss.SSS'), // 로그일시(한국시간)
          useSe: 'Logout', // 사용 구분
          sysUser: params.userId?.toString(), // 사용자 식별값
          conectIp: params.clientIp, // 접속IP
          dataUsgqty: getBufferLength(JSON.stringify(params.accessToken)), // 데이터 크기
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
      logging.ERROR_METHOD(logFormat, __filename, params, err);
    }
  },
  // selectList
  async list(
    params: TokenHistorySelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<TokenHistoryAttributes>> {
    let result: SelectedListResult<TokenHistoryAttributes>;

    try {
      result = await tokenHistoryDao.selectList(params);
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
    params: TokenHistorySelectInfoParams,
    logFormat: LogFormat<unknown>
  ): Promise<TokenHistoryAttributes | null> {
    let result: TokenHistoryAttributes | null;

    try {
      result = await tokenHistoryDao.selectInfo(params);
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
  async listTokenUsers(params: TokenHistorySelectAllUsersParams, logFormat: LogFormat<unknown>): Promise<unknown> {
    let result: Array<unknown> = [];

    // 1. tokenHistory조회
    interface TokenHistoryAttributesExt extends TokenHistoryAttributes {
      User?: {
        id: number;
        userid: string;
        name: string;
      };
    }
    const tokenHistoryParams = {
      companyIds: params.companyIds,
      createdAtFrom: params.createdAtFrom,
      createdAtTo: params.createdAtTo,
    };
    let selectedTokenHistory: SelectedListResult<TokenHistoryAttributesExt>;
    let tokenHistoryList: Array<TokenHistoryAttributesExt>;
    try {
      selectedTokenHistory = await tokenHistoryDao.selectList(tokenHistoryParams);
      tokenHistoryList = selectedTokenHistory.rows;
      logging.METHOD_ACTION(logFormat, __filename, tokenHistoryParams, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, tokenHistoryParams, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    // 2. 사용자PK 추출
    const userIds: Array<number> = [];
    if (tokenHistoryList) {
      const userList = [];
      for (let i = 0; i < tokenHistoryList.length; i += 1) {
        userList.push(tokenHistoryList[i].userId);
      }

      // 중복 제거
      const dupUserList = Array.from(new Set(userList));
      for (let i = 0; i < dupUserList.length; i += 1) {
        userIds.push(dupUserList[i] || 0);
      }
    }

    // 최종 아웃풋 설정
    interface LoginUserInfo {
      userId: number;
      userid: string;
      name: string;
      loginCount: number;
      logoutCount: number;
      latestSeconds: number;
      lastLoginDate: Date | null;
      lastLogoutDate: Date | null;
    }
    const loginUserInfoList: Array<LoginUserInfo> = [];

    // 사용자별 로그인/로그아웃 횟수 기록
    for (let i = 0; i < userIds.length; i += 1) {
      const userId = userIds[i];
      let userid = '';
      let name = '';
      let loginCount = 0;
      let logoutCount = 0;
      let lastLoginDate = null;
      let lastLogoutDate = null;

      for (let i = 0; i < tokenHistoryList.length; i += 1) {
        const tokenHistory = tokenHistoryList[i];

        if (userId === tokenHistory.userId) {
          userid = tokenHistory.User?.userid || '';
          name = tokenHistory.User?.name || '';

          if (tokenHistory.action === 'Created' || tokenHistory.action === 'CreatedPin') {
            loginCount = loginCount + 1;
            if (lastLoginDate === null) {
              lastLoginDate = tokenHistory.createdAt; // 제일 위에 있는(가장 마지막의) 로그인 정보를 넣는다.
            }
          }
          if (tokenHistory.action === 'Destroyed') {
            logoutCount = logoutCount + 1;
            if (lastLogoutDate === null) {
              lastLogoutDate = tokenHistory.createdAt; // 제일 위에 있는(가장 마지막의) 로그아웃 정보를 넣는다.
            }
          }
        }
      }

      loginUserInfoList.push({
        userId: userId,
        userid: userid,
        name: name,
        loginCount: loginCount,
        logoutCount: logoutCount,
        latestSeconds: fncLatestSeconds(lastLoginDate, lastLogoutDate),
        lastLoginDate: lastLoginDate,
        lastLogoutDate: lastLogoutDate,
      });
    }

    result = loginUserInfoList;

    return new Promise((resolve) => {
      resolve(result);
    });
  },
};

export { service };
