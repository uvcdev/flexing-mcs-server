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
  FacilityInsertParams,
  FacilitySelectListParams,
  FacilitySelectInfoParams,
  FacilityUpdateParams,
  FacilityDeleteParams,
} from '../../models/operation/facility';
import { service as eventHistoryService } from '../../service/common/eventHistoryService';
import { service as facilityService } from '../../service/operation/facilityService';

const router = express.Router();

const TABLE_NAME = 'facilities'; // 이벤트 히스토리를 위한 테이블 명

// facility 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, FacilityInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: FacilityInsertParams = {
      facilityGroupId: req.body.facilityGroupId,
      code: req.body.code,
      name: req.body.name,
      system: req.body.system,
      state: req.body.state,
      type: req.body.type,
      serial: req.body.serial,
      ip: req.body.ip,
      port: req.body.port,
      floor: req.body.floor,
      active: req.body.active,
      isCheckCallType: req.body.isCheckCallType,
      alwaysFill: req.body.alwaysFill,
      description: req.body.description,
      isMissionOrderCapable: req.body.isMissionOrderCapable,
      linkedEqpIds: req.body.linkedEqpIds || [],
      linkedWmsIds: [],
      cancelType: req.body.cancelType,
      cancelLinkedEqpIds: req.body.cancelLinkedEqpIds || [],
      mode: req.body.mode || 'auto',
      generatedCallCount: req.body.generatedCallCount,
      isActiveCallTrigger: req.body.isActiveCallTrigger,
      priority: req.body.priority,
      isWmsPort: req.body.isWmsPort,
    };
    logging.REQUEST_PARAM(logFormat);

    // 입력값 체크
    if (!(typeof params.facilityGroupId === 'number' && params.facilityGroupId > 0) || !params.code || !params.name) {
      const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (facilityGroupId, code, name)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 비즈니스 로직 호출
    const result = await facilityService.reg(params, logFormat);

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

// facility 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, FacilitySelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: FacilitySelectListParams = {
        ids: req.query.ids ? (req.query.ids as unknown as string).split(',').map((i) => Number(i)) : null,
        facilityGroupIds: req.query.facilityGroupIds
          ? (req.query.facilityGroupIds as unknown as string).split(',').map((i) => Number(i))
          : null,
        code: req.query.code,
        name: req.query.name,
        uniqueName: req.query.uniqueName,
        system: req.query.system,
        state: req.query.state,
        type: req.query.type,
        serial: req.query.serial,
        ip: req.query.ip,
        port: req.query.port,
        floor: req.query.floor,
        active: req.query.active,
        isCheckCallType: req.query.isCheckCallType,
        alwaysFill: req.query.alwaysFill,
        mode: req.query.mode,
        limit: Number(req.query.limit || 'NaN'),
        offset: Number(req.query.offset || 'NaN'),
        order: req.query.order,
      };
      logging.REQUEST_PARAM(logFormat);

      // 비즈니스 로직 호출
      const result = await facilityService.list(params, logFormat);

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

// facility 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<FacilitySelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: FacilitySelectInfoParams = {
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
      const result = await facilityService.info(params, logFormat);

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

// facility 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (req: Request<FacilityUpdateParams, unknown, FacilityUpdateParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: FacilityUpdateParams = {
        id: Number(req.params.id),
        facilityGroupId: req.body.facilityGroupId,
        code: req.body.code,
        name: req.body.name,
        system: req.body.system,
        state: req.body.state,
        type: req.body.type,
        serial: req.body.serial,
        ip: req.body.ip,
        port: req.body.port,
        floor: req.body.floor,
        active: req.body.active,
        isCheckCallType: req.body.isCheckCallType,
        alwaysFill: req.body.alwaysFill,
        description: req.body.description,
        isMissionOrderCapable: req.body.isMissionOrderCapable,
        linkedEqpIds: req.body.linkedEqpIds || [],
        cancelType: req.body.cancelType,
        cancelLinkedEqpIds: req.body.cancelLinkedEqpIds || [],
        mode: req.body.mode,
        generatedCallCount: req.body.generatedCallCount,
        isActiveCallTrigger: req.body.isActiveCallTrigger,
        priority: req.body.priority,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.code || !params.name) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (code, name)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출

      const result = await facilityService.edit(params, logFormat);

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

// facility 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<FacilityDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: FacilityDeleteParams = {
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
      const result = await facilityService.delete(params, logFormat);

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
