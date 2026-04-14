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
import { PlcWriteParams } from '../../models/common/plcConnector';
import { KepwareWriteParams } from '../../models/kepware/kepware';
import { service as kepwareService } from '../../service/kepware/kepwareService';
import { SendSmartConnectorMqttMessage, useSmartConnectorUtils } from '../../lib/smartConnectorUtils';
import { simulatePlcResponse } from '../../lib/virtualPlcSimulator';
const router = express.Router();

const TABLE_NAME = 'plcConnector'; // 이벤트 히스토리를 위한 테이블 명

// workOrder 등록
router.post(
  '/write',
  isLoggedIn,
  async (req: Request<unknown, unknown, Array<PlcWriteParams>, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      let result = null;
      const plcConnType = process.env.PLC_CONN_TYPE || '';
      if (plcConnType === 'KEP') {
        const paramsList: Array<KepwareWriteParams> = [];
        for (let i = 0, length = req.body.length; i < length; i++) {
          const params: KepwareWriteParams = {
            targetFacility: req.body[i].targetFacility,
            tagName: req.body[i].tagName,
            value: req.body[i].value,
          };
          if (!params.targetFacility || !params.tagName || !params.value) {
            const err = new ErrorClass(
              resCode.BAD_REQUEST_NULLORINVALID,
              'Null or invalid value (targetFacility, tagName, value)'
            );

            const resJson = resError(err);
            logging.RESPONSE_DATA(logFormat, resJson);

            return res.status(resJson.status).json(resJson);
          }

          console.log('🚀 ~ router.post ~ paramsList:', paramsList);
          paramsList.push(params);
        }
        logging.REQUEST_PARAM(logFormat);

        // 비즈니스 로직 호출
        result = await kepwareService.write(paramsList, logFormat);

        // 가상설비 PLC 응답
        for (const params of paramsList) {
          void simulatePlcResponse(params.targetFacility, [{ tagName: params.tagName, value: params.value }]);
        }
      } else if (plcConnType === 'CONNECTOR') {
        const paramsList: Array<SendSmartConnectorMqttMessage> = [];
        for (let i = 0, length = req.body.length; i < length; i++) {
          const params: SendSmartConnectorMqttMessage = {
            facilityName: req.body[i].targetFacility,
            tag: req.body[i].tagName,
            value: req.body[i].value,
          };
          if (!params.facilityName || !params.tag || !params.value) {
            const err = new ErrorClass(
              resCode.BAD_REQUEST_NULLORINVALID,
              'Null or invalid value (facilityName, tag, value)'
            );

            const resJson = resError(err);
            logging.RESPONSE_DATA(logFormat, resJson);

            return res.status(resJson.status).json(resJson);
          }

          console.log('🚀 ~ router.post ~ paramsList:', paramsList);
          paramsList.push(params);
        }
        logging.REQUEST_PARAM(logFormat);

        // 가상설비 PLC 응답(setTagDataArrayToSmartConnector가 value를 변환하므로 먼저 호출)
        for (const params of paramsList) {
          void simulatePlcResponse(params.facilityName, [{ tagName: params.tag, value: params.value }]);
        }

        // 비즈니스 로직 호출
        result = await useSmartConnectorUtils().setTagDataArrayToSmartConnector(paramsList);
      } else {
        const err = new ErrorClass(resCode.BAD_REQUEST_NULLORINVALID, 'PLC Connection Type is not valid');
        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);
        return res.status(resJson.status).json(resJson);
      }

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
  }
);

export { router };
