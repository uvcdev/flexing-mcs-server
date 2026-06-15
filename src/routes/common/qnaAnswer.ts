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
import { QnaAnswerInsertParams, QnaAnswerUpdateParams, QnaAnswerDeleteParams } from '../../models/common/qnaAnswer';
import { service as qnaAnswerService } from '../../service/common/qnaAnswerService';

const router = express.Router();

// qnaAnswer 등록
router.post(
  '/',
  isLoggedIn,
  async (
    req: Request<unknown, unknown, { questionId: number; content?: string | null; fileIds?: number[] }, unknown>,
    res: Response
  ) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaAnswerInsertParams = {
        questionId: Number(req.body.questionId),
        userId: tokenUser?.id ?? 0,
        content: req.body.content ?? null,
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
      if (!params.questionId || isNaN(params.questionId)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (questionId: number)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await qnaAnswerService.reg(params, logFormat);

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

// qnaAnswer 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (
    req: Request<QnaAnswerUpdateParams, unknown, { content?: string | null; fileIds?: number[] | null }, unknown>,
    res: Response
  ) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaAnswerUpdateParams = {
        id: Number(req.params.id),
        content: req.body.content,
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
      const result = await qnaAnswerService.edit(params, logFormat);

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

// qnaAnswer 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<QnaAnswerDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: QnaAnswerDeleteParams = {
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
      const result = await qnaAnswerService.delete(params, logFormat);

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
