/* eslint-disable @typescript-eslint/no-misused-promises */
import * as express from 'express';
import { Request, Response } from 'express';
import { logging, makeLogFormat } from '../../lib/logging';
import { isLoggedIn } from '../../lib/middleware';
import { Payload } from '../../lib/tokenUtil';
import {
  ErrorClass,
  makeResponseError as resError,
  makeResponseSuccess as resSuccess,
  responseCode as resCode,
  responseType as resType,
} from '../../lib/resUtil';

import {
  AmrDeleteParams,
  AmrInsertParams,
  AmrSelectInfoParams,
  AmrSelectListParams,
  AmrUpdateParams,
  AmrUpsertParams,
} from 'models/common/amr';
import { amrService } from '../../service/common/amrService';

export const router = express.Router();

// amr 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, AmrInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: AmrInsertParams = {
      code: req.body.code,
      name: req.body.name,
      serial: req.body.serial,
      state: req.body.state,
      active: req.body.active,
      mode: req.body.mode,
      description: req.body.description,
    };
    logging.REQUEST_PARAM(logFormat);

    // 입력값 체크
    if (!params.name || !params.code) {
      const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (name, code)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 비즈니스 로직 호출
    const result = await amrService.reg(params, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// amr 등록
router.post('/upsert', async (req: Request<unknown, unknown, AmrUpsertParams[], unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    logging.REQUEST_PARAM(logFormat);


    // 비즈니스 로직 호출
    const result = await amrService.bulkInsert(req.body, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// amr 리스트 조회
router.get('/', isLoggedIn, async (req: Request<unknown, unknown, unknown, AmrSelectListParams>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: AmrSelectListParams = {
      code: req.query.code,
      name: req.query.name,
      serial: req.query.serial,
      state: req.query.state,
      active: req.query.active,
      mode: req.query.mode,
      createdAtFrom: req.query.createdAtFrom ? new Date(req.query.createdAtFrom) : null,
      createdAtTo: req.query.createdAtTo ? new Date(req.query.createdAtTo) : null,
      limit: Number(req.query.limit || 'NaN'),
      offset: Number(req.query.offset || 'NaN'),
      order: req.query.order,
    };
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await amrService.list(params, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.LIST);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// amr 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<AmrSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: AmrSelectInfoParams = {
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
      const result = await amrService.info(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.INFO);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// amr 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<AmrDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: AmrDeleteParams = {
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
      const result = await amrService.delete(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.DELETE);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);
