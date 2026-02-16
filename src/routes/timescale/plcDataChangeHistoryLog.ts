import * as express from 'express';
import { isLoggedIn } from '../../lib/middleware';
import { logging, makeLogFormat } from '../../lib/logging';
import { Request, Response } from 'express';
import { Payload } from '../../lib/tokenUtil';
import {
  ErrorClass,
  responseCode as resCode,
  responseType as resType,
  makeResponseSuccess as resSuccess,
  makeResponseError as resError,
} from '../../lib/resUtil';
import { plcDataChangeHistoryLogService } from '../../service/timescale/plcDataChangeHistoryLogService';
import {
  PlcDataChangeHistoryLogSelectInfoParams,
  PlcDataChangeHistoryLogSelectListParams,
} from '../../models/timescale/plcDataChangeHistoryLog';

const router = express.Router();

const TABLE_NAME = 'plcDataChangeHistoryLogs'; // 이벤트 히스토리를 위한 테이블 명

// log 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, PlcDataChangeHistoryLogSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: PlcDataChangeHistoryLogSelectListParams = {
        facilityCode: req.query.facilityCode,
        facilityName: req.query.facilityName
          ? (req.query.facilityName as unknown as string).split(',').map((i) => i)
          : undefined,
        facilityType: req.query.facilityType,
        isTriggered: req.query.isTriggered,
        tagName: req.query.tagName ? (req.query.tagName as unknown as string).split(',').map((i) => i) : undefined,
        oldValue: req.query.oldValue,
        newValue: req.query.newValue,
        valueType: req.query.valueType,
        snapshotData: req.query.snapshotData,
        tsFrom: req.query.tsFrom,
        tsTo: req.query.tsTo,
        createdAtFrom: req.query.createdAtFrom,
        createdAtTo: req.query.createdAtTo,
        limit: Number(req.query.limit || 'NaN'),
        offset: Number(req.query.offset || 'NaN'),
        order: req.query.order,
      };
      logging.REQUEST_PARAM(logFormat);

      // 비즈니스 로직 호출
      const result = await plcDataChangeHistoryLogService.list(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.LIST);

      logging.RESPONSE_DATA(logFormat, resJson);
      // 이벤트 로그 기록(비동기)

      return res.status(resJson.status).json(resJson);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

// log 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<PlcDataChangeHistoryLogSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: PlcDataChangeHistoryLogSelectInfoParams = {
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
      const result = await plcDataChangeHistoryLogService.info(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.INFO);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)
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
