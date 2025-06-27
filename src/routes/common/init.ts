/* eslint-disable @typescript-eslint/no-misused-promises */
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import { logging, makeLogFormat } from '../../lib/logging';
import {
  responseCode as resCode,
  makeResponseSuccess as resSuccess,
  responseType as resType,
  makeResponseError as resError,
  ErrorClass,
} from '../../lib/resUtil';
import { isActionKey } from '../../lib/middleware';
import { logSequelize, sequelize } from '../../models';
import { service as userService } from '../../service/common/userService';
import { service as commonCodeService } from '../../service/common/commonCodeService';
import { initUser, initCommonCodes } from '../../config/initData';

const router = express.Router();

// 테이블 생성
router.post('/tables', isActionKey, (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);

  try {
    logging.REQUEST_PARAM(logFormat);

    // table 생성
    sequelize
      .sync({
        force: false,
      })
      .then(() => {
        // 최종 응답 값 세팅
        const resJson = resSuccess(
          {
            result: {
              action: 'created tables',
              DB: {
                DB_HOST: process.env.DB_HOST,
                DB_PORT: process.env.DB_PORT,
                DB_DATABASE: process.env.DB_DATABASE,
                DB_ID: process.env.DB_ID,
                DB_DIALECT: process.env.DB_DIALECT,
              },
            },
          },
          resType.FREESTYLE
        );
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      })
      .catch((err) => {
        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      });
  } catch (err) {
    // 에러 응답값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// 로그 테이블 생성
router.post('/log-tables', isActionKey, (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);

  try {
    // logging.REQUEST_PARAM(logFormat);

    // table 생성
    logSequelize
      .sync({
        force: false,
      })
      .then(async () => {
        // try {
        //   await logSequelize.query(`SELECT create_hypertable('logs', 'created_at');`);
        // } catch (error) {
        //   console.log('Error creating hypertable for logs, but continuing:', error);
        //   await logSequelize.query(`SELECT create_hypertable('item_logs', 'created_at');`);
        // }

        // 두 번째 쿼리 실행
        // try {
        //   await logSequelize.query(`SELECT create_hypertable('item_logs', 'created_at');`);
        // } catch (error) {
        //   console.log('Error creating hypertable for item_logs, but continuing:', error);
        // }
        // 최종 응답 값 세팅
        const resJson = resSuccess(
          {
            result: {
              action: 'created tables',
              DB: {
                LOG_DB_HOST: process.env.LOG_DB_HOST,
                LOG_DB_PORT: process.env.LOG_DB_PORT,
                LOG_DB_DATABASE: process.env.LOG_DB_DATABASE,
                LOG_DB_ID: process.env.LOG_DB_ID,
                LOG_DB_DIALECT: process.env.LOG_DB_DIALECT,
              },
            },
          },
          resType.FREESTYLE
        );
        // logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      })
      .catch((err) => {
        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      });
  } catch (err) {
    // 에러 응답값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// 시스템 관리자 생성
router.post('/users', isActionKey, async (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);
  // const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    const params = initUser; // 초기화를 위한 입력 값
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await userService.reg(params, logFormat);

    // 최종 응답값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기) - 여기서는 사용 못함 (userId가 없음)

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// 공통 코드 생성
router.post('/common-codes', isActionKey, async (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);
  // const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    const paramList = initCommonCodes; // 초기화를 위한 입력 값
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await commonCodeService.bulkReg(paramList, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.BULKREGUPDATE);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기) - 여기서는 사용 못함 (userId가 없음)

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

export { router };
