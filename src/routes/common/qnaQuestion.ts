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
  QnaQuestionInsertParams,
  QnaQuestionSelectInfoParams,
  QnaQuestionSelectListParams,
  QnaQuestionUpdateParams,
  QnaQuestionDeleteParams,
} from '../../models/common/qnaQuestion';
import { service as qnaQuestionService } from '../../service/common/qnaQuestionService';

const router = express.Router();

// qnaQuestion 등록
router.post(
  '/',
  isLoggedIn,
  async (
    req: Request<
      unknown,
      unknown,
      { title: string; content?: string | null; type?: string | null; fileIds?: number[]; isNotice?: boolean },
      unknown
    >,
    res: Response
  ) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaQuestionInsertParams = {
        userId: tokenUser?.id ?? 0,
        title: req.body.title,
        content: req.body.content ?? null,
        type: req.body.type ?? null,
        isNotice: req.body.isNotice ?? false,
        fileIds: Array.isArray(req.body.fileIds) ? req.body.fileIds.map((v) => Number(v)) : null,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.userId) {
        const err = new ErrorClass(resCode.UNAUTHORIZED_ACCESSTOKEN, 'Invalid token (userId)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }
      if (!params.title) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (title)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await qnaQuestionService.reg(params, logFormat);

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
  }
);

// qnaQuestion 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, QnaQuestionSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaQuestionSelectListParams = {
        title: req.query.title,
        types: req.query.types ? (req.query.types as unknown as string).split(',').filter((type) => type !== '') : null,
        userId: req.query.userId ? Number(req.query.userId) : null,
        createdAtFrom: req.query.createdAtFrom ? new Date(req.query.createdAtFrom) : null,
        createdAtTo: req.query.createdAtTo ? new Date(req.query.createdAtTo) : null,
        limit: Number(req.query.limit || 'NaN'),
        offset: Number(req.query.offset || 'NaN'),
        order: req.query.order,
      };
      logging.REQUEST_PARAM(logFormat);

      // 비즈니스 로직 호출
      const result = await qnaQuestionService.list(params, logFormat);

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
  }
);

// qnaQuestion 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<QnaQuestionSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaQuestionSelectInfoParams = {
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
      const result = await qnaQuestionService.info(params, logFormat);

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

// qnaQuestion 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (
    req: Request<
      QnaQuestionUpdateParams,
      unknown,
      { title?: string; content?: string | null; type?: string | null; fileIds?: number[] | null; isNotice?: boolean },
      unknown
    >,
    res: Response
  ) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaQuestionUpdateParams = {
        id: Number(req.params.id),
        title: req.body.title,
        content: req.body.content,
        type: req.body.type,
        isNotice: req.body.isNotice,
        fileIds:
          req.body.fileIds === undefined
            ? undefined
            : req.body.fileIds === null
              ? null
              : req.body.fileIds.map((v) => Number(v)),
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
      const result = await qnaQuestionService.edit(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
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

// qnaQuestion 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<QnaQuestionDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaQuestionDeleteParams = {
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
      const result = await qnaQuestionService.delete(params, logFormat);

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

export { router };
