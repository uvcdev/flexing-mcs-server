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
  TrackingLogDeleteParams,
  TrackingLogInsertParams,
  TrackingLogSelectInfoParams,
  TrackingLogSelectListParams,
  TrackingLogUpdateParams,
  TrackingLogUpsertParams,
} from 'models/common/trackingLog';
import { trackingLogService } from '../../service/common/trackingLogService';

export const router = express.Router();

const TABLE_NAME = 'trackingLog'; // 이벤트 히스토리를 위한 테이블 명

// trackingLog 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, TrackingLogInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: TrackingLogInsertParams = {
      code: req.body.code,
      plcName: req.body.plcName,
      portName: req.body.portName,
      callId: req.body.callId,
      eqpCallId: req.body.eqpCallId,
      transferId: req.body.transferId,
      callType: req.body.callType,
      subject: req.body.subject,
      detail: req.body.detail,
      state: req.body.state,
      startFacility: req.body.startFacility,
      destFacility: req.body.destFacility,
      assignedRobot: req.body.assignedRobot,
      value: req.body.value,
      description: req.body.description,
      missionDestination: null,
      processState: null
    };
    logging.REQUEST_PARAM(logFormat);

    // 입력값 체크
    if (!params.code || !params.callId) {
      const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (name, code)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 비즈니스 로직 호출
    const result = await trackingLogService.reg(params, logFormat);

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

// trackingLog 등록
router.post('/upsert', async (req: Request<unknown, unknown, TrackingLogUpsertParams[], unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    logging.REQUEST_PARAM(logFormat);


    // 비즈니스 로직 호출
    const result = await trackingLogService.bulkInsert(req.body, logFormat);

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

// trackingLog 리스트 조회
router.get('/', isLoggedIn, async (req: Request<unknown, unknown, unknown, TrackingLogSelectListParams>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: TrackingLogSelectListParams = {
      ids: req.query.ids,
      code: req.query.code,
      callId: req.query.callId,
      callType: req.query.callType,
      startFacility: req.query.startFacility,
      destFacility: req.query.destFacility,
      assignedRobot: req.query.assignedRobot,
      state: req.query.state,
      createdAtFrom: req.query.createdAtFrom ? new Date(req.query.createdAtFrom) : null,
      createdAtTo: req.query.createdAtTo ? new Date(req.query.createdAtTo) : null,
      updatedAtFrom: req.query.updatedAtFrom ? new Date(req.query.updatedAtFrom) : null,
      updatedAtTo: req.query.updatedAtTo ? new Date(req.query.updatedAtTo) : null,
      limit: Number(req.query.limit || 'NaN'),
      offset: Number(req.query.offset || 'NaN'),
      order: req.query.order,
    };
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await trackingLogService.list(params, logFormat);

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

// trackingLog 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<TrackingLogSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: TrackingLogSelectInfoParams = {
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
      const result = await trackingLogService.info(params, logFormat);

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

// trackingLog 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<TrackingLogDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: TrackingLogDeleteParams = {
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
      const result = await trackingLogService.delete(params, logFormat);

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
