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
import { service as eventHistoryService } from '../../service/common/eventHistoryService';
import { KepwareWriteParams } from '../../models/kepware/kepware';
import { service as kepwareService } from '../../service/kepware/kepwareService';
const router = express.Router();

const TABLE_NAME = 'kepware'; // 이벤트 히스토리를 위한 테이블 명

// workOrder 등록
router.post('/write', isLoggedIn, async (req: Request<unknown, unknown, Array<KepwareWriteParams>, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {

    // 요청 파라미터
    const paramsList: Array<KepwareWriteParams> = [];
    for (let i = 0, length = req.body.length; i < length; i++) {
      const params: KepwareWriteParams = {
        targetFacility: req.body[i].targetFacility,
        tagName: req.body[i].tagName,
        value: req.body[i].value,
      };
      if (!params.targetFacility || !params.tagName) {
        const err = new ErrorClass(
          resCode.BAD_REQUEST_NULLORINVALID,
          'Null or invalid value (targetFacility, tagName)'
        );

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      console.log("🚀 ~ router.post ~ paramsList:", paramsList)
      paramsList.push(params);
    }
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await kepwareService.write(paramsList, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.WRITE);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기)
    void eventHistoryService.reg(tokenUser as Payload, resJson, logFormat, 'Write', TABLE_NAME);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

export { router };