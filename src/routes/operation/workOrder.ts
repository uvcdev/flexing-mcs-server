/* eslint-disable @typescript-eslint/no-misused-promises */
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
} from '../../lib/resUtil';
import { Payload } from '../../lib/tokenUtil';
import {
  WorkOrderInsertParams,
  WorkOrderSelectListParams,
  WorkOrderSelectInfoParams,
  WorkOrderUpdateParams,
  WorkOrderDeleteParams,
} from '../../models/operation/workOrder';
import { service as eventHistoryService } from '../../service/common/eventHistoryService';
import { service as workOrderService } from '../../service/operation/workOrderService';
import { useWorkOrderUtil } from '../../lib/workOrderUtil';

const router = express.Router();

const TABLE_NAME = 'workOrders'; // 이벤트 히스토리를 위한 테이블 명

// workOrder 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, WorkOrderInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: WorkOrderInsertParams = {
      fromFacilityId: req.body.fromFacilityId,
      toFacilityId: req.body.toFacilityId,
      code: req.body.code,
      fromAmrId: req.body.fromAmrId,
      itemId: req.body.itemId,
      level: req.body.level,
      state: req.body.state,
      isClosed: req.body.isClosed,
      cancelUserId: req.body.cancelUserId,
      cancelDate: req.body.cancelDate,
      description: req.body.description,
      type: req.body.type,
    };
    logging.REQUEST_PARAM(logFormat);

    // 입력값 체크
    if (!params.code) {
      const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (code)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 비즈니스 로직 호출
    const result = await workOrderService.reg(params, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기)
    void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Create', TABLE_NAME);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// workOrder 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, WorkOrderSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: WorkOrderSelectListParams = {
        ids: req.query.ids ? (req.query.ids as unknown as string).split(',').map((i) => Number(i)) : null,
        fromFacilityId: req.query.fromFacilityId,
        toFacilityId: req.query.toFacilityId,
        code: req.query.code,
        itemId: req.query.itemId,
        state: req.query.state,
        isCLosed: req.query.isCLosed,
        limit: Number(req.query.limit || 'NaN'),
        offset: Number(req.query.offset || 'NaN'),
        order: req.query.order,
      };
      logging.REQUEST_PARAM(logFormat);

      // 비즈니스 로직 호출
      const result = await workOrderService.list(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.LIST);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'SelectList', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// workOrder 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<WorkOrderSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: WorkOrderSelectInfoParams = {
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
      const result = await workOrderService.info(params, logFormat);

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
// workOrder stats 조회
router.get(
  '/daily-stats',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      logging.REQUEST_PARAM(logFormat);

      // 입력 값 체크

      // 비즈니스 로직 호출
      const result = useWorkOrderUtil().getStats()

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
// workOrder 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (req: Request<WorkOrderUpdateParams, unknown, WorkOrderUpdateParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: WorkOrderUpdateParams = {
        id: Number(req.params.id),
        fromFacilityId: req.body.fromFacilityId,
        toFacilityId: req.body.toFacilityId,
        code: req.body.code,
        itemId: req.body.itemId,
        level: req.body.level,
        state: req.body.state,
        isClosed: req.body.isClosed,
        description: req.body.description,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.toFacilityId || !params.code || !params.itemId) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (toFacilityId, code, itemId)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출

      const result = await workOrderService.edit(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Update', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// workOrder 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<WorkOrderDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: WorkOrderDeleteParams = {
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
      const result = await workOrderService.delete(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.DELETE);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
      void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Delete', TABLE_NAME);

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

export { router };
