import * as express from 'express';
import { Request, Response } from 'express';
import { isLoggedIn } from '../../lib/middleware';
import { logging, makeLogFormat } from '../../lib/logging';
import {
  responseCode as resCode,
  makeResponseSuccess as resSuccess,
  responseType as resType,
  makeResponseError as resError,
  ErrorClass,
  SelectedListResult,
  DeletedResult,
} from '../../lib/resUtil';
import {
  ErrorCodeDeleteParams,
  ErrorCodeInsertParams,
  ErrorCodeSelectListParams,
  ErrorCodeSelectInfoParams,
  ErrorCodeUpdateParams,
  ErrorCodeSelectInfoByCodeParams,
} from '../../models/common/errorCode';
import { errorCodeService } from './../../service/common/errorCodeService';
import { service as eventHistoryService } from '../../service/common/eventHistoryService';
import { Payload } from '../../lib/tokenUtil';

const router = express.Router();

const TABLE_NAME = 'error_code'; // 이벤트 히스토리를 위한 테이블 명

// 에러 코드 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, ErrorCodeInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;
  try {
    const params: ErrorCodeInsertParams = {
      code: req.body.code,
      location: req.body.location || 'ETC',
      messageKo: req.body.messageKo,
      messageEn: req.body.messageEn,
      messageEs: req.body.messageEs,
      errorLevel: req.body.errorLevel || 'error',
    };
    logging.REQUEST_PARAM(logFormat);
    // 입력값 체크
    if (!params.code || !params.location) {
      throw new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (code , location)');
    }

    // 비즈니스 로직 호출
    const result = await errorCodeService.reg(params, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기)
    void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Create', TABLE_NAME);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);
    return res.status(resJson.status).json(resJson);
  }
});

// ErrorCode 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, ErrorCodeSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;
    try {
      const params: ErrorCodeSelectListParams = {
        ids: req.query.ids ? (req.query.ids as unknown as string).split(',').map((i) => Number(i)) : null,
        code: req.query.code,
        location: req.query.location,
        errorLevel: req.query.errorLevel,
        limit: Number(req.query.limit),
        offset: Number(req.query.offset),
      };
      logging.REQUEST_PARAM(logFormat);
      // 비즈니스 로직 호출
      const result = await errorCodeService.list(params, logFormat);
      // 최종 응답값 세팅
      // front test 필요
      const resJson = resSuccess(result, resType.LIST);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'SelectList', TABLE_NAME);
      return res.status(resJson.status).json(resJson);
    } catch (err) {
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);
      return res.status(resJson.status).json(resJson);
    }
  }
);

// ErrorCode Location 리스트 조회
router.get(
  '/locations',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;
    try {
      logging.REQUEST_PARAM(logFormat);
      // 비즈니스 로직 호출
      const result = await errorCodeService.locationList(logFormat);
      // 최종 응답값 세팅
      // front test 필요
      const resJson = resSuccess(result, resType.LIST);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'SelectList', TABLE_NAME);
      return res.status(resJson.status).json(resJson);
    } catch (err) {
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);
      return res.status(resJson.status).json(resJson);
    }
  }
);

// errorCode 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<ErrorCodeSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: ErrorCodeSelectInfoParams = {
        id: Number(req.params.id),
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력 값 체크
      if (!params.id || isNaN(params.id)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (id: number)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await errorCodeService.info(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.INFO);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'SelectInfo', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// errorCode 상세정보 조회
router.get(
  '/code/:code',
  isLoggedIn,
  async (req: Request<ErrorCodeSelectInfoByCodeParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: ErrorCodeSelectInfoByCodeParams = {
        code: req.params.code,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력 값 체크
      if (!params.code) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not Null value (code)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await errorCodeService.infoByCode(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.INFO);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'SelectInfo', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// ErrorCode 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (req: Request<ErrorCodeUpdateParams, unknown, ErrorCodeUpdateParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;
    try {
      const params: ErrorCodeUpdateParams = {
        id: Number(req.params.id),
        code: req.body.code,
        location: req.body.location,
        messageKo: req.body.messageKo,
        messageEn: req.body.messageEn,
        messageEs: req.body.messageEs,
        errorLevel: req.body.errorLevel,
      };
      logging.REQUEST_PARAM(logFormat);
      // 입력 값 체크
      if (!params.id) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Not allowed null (id)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await errorCodeService.edit(params, logFormat);

      // 최종 응답값 세팅
      const resJson = resSuccess(result, resType.EDIT);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Update', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);
      return res.status(resJson.status).json(resJson);
    }
  }
);

// ErrorCode 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<ErrorCodeDeleteParams, unknown, ErrorCodeDeleteParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;
    try {
      // 요청 파라미터
      const params: ErrorCodeDeleteParams = {
        id: Number(req.params.id),
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.id || isNaN(params.id)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (id: number)');
        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result: DeletedResult = await errorCodeService.delete(params, logFormat);

      // 최종 응답값 세팅
      const resJson = resSuccess(result, resType.DELETE);
      logging.RESPONSE_DATA(logFormat, resJson);
      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Delete', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      const resJson = resError(err);
      return res.status(resJson.status).json(resJson);
    }
  }
);

export { router };
