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
  MenuRoleBulkInsertParams,
  MenuRoleInsertParams,
  MenuRoleSelectListParams,
  // MenuRoleSelectInfoParams,
  // MenuRoleUpdateParams,
  // MenuRoleDeleteParams,
} from '../../models/common/menuRole';
import { service as menuRoleService } from '../../service/common/menuRoleService';

const router = express.Router();

const TABLE_NAME = 'menu_roles'; // 이벤트 히스토리를 위한 테이블 명

// menuRole 등록(수정도 같이 처리)
router.post(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, MenuRoleBulkInsertParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: MenuRoleBulkInsertParams = {
        menuRoleList: req.body.menuRoleList,
      };
      logging.REQUEST_PARAM(logFormat);

      const paramList = params.menuRoleList;

      // 비즈니스 로직 호출
      const result = await menuRoleService.bulkReg(paramList, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.BULKREGUPDATE);
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

// menuRole 리스트 조회
router.get(
  '/',
  isLoggedIn,
  async (req: Request<unknown, unknown, unknown, MenuRoleSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: MenuRoleSelectListParams = {
        auth: req.query.auth,
      };
      logging.REQUEST_PARAM(logFormat);

      // 비즈니스 로직 호출
      const result = await menuRoleService.list(params, logFormat);

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

export { router };
