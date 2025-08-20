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
  UserDefaults,
  UserInsertParams,
  UserSelectInfoParams,
  UserSelectListParams,
  UserUpdateParams,
  UserUpdatePasswordParams,
  UserDeleteParams,
} from '../../models/common/user';
import { service as userService } from '../../service/common/userService';
import { checkPasswordValidator } from '../../lib/hashUtil';

const router = express.Router();

const TABLE_NAME = 'users'; // 이벤트 히스토리를 위한 테이블 명

// user 등록
router.post('/', isLoggedIn, async (req: Request<unknown, unknown, UserInsertParams, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: UserInsertParams = {
      userid: req.body.userid,
      password: req.body.password,
      auth: req.body.auth || 'staff',
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      active: req.body.active || UserDefaults.active,
    };
    logging.REQUEST_PARAM(logFormat);

    // 입력값 체크
    if (!params.userid || !params.password || !params.name) {
      const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (userid, password, name)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 입력 값 체크 - 패스워드 정책
    if (!checkPasswordValidator(params.password)) {
      const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (password)');

      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }

    // 비즈니스 로직 호출
    const result = await userService.reg(params, logFormat);

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.REG);
    logging.RESPONSE_DATA(logFormat, resJson);

    // 이벤트 로그 기록(비동기)

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    // 에러 응답 값 세팅
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

// user 리스트 조회
router.get('/', isLoggedIn, async (req: Request<unknown, unknown, unknown, UserSelectListParams>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: UserSelectListParams = {
      ids: req.query.ids ? (req.query.ids as unknown as string).split(',').map((i) => Number(i)) : null,
      userid: req.query.userid,
      name: req.query.name,
      active: req.query.active,
      limit: Number(req.query.limit || 'NaN'),
      offset: Number(req.query.offset || 'NaN'),
      order: req.query.order,
    };
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await userService.list(params, logFormat);

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
});

// user 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<UserSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserSelectInfoParams = {
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
      const result = await userService.info(params, logFormat);

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

// user 나의 정보 조회
router.get('/me', isLoggedIn, async (req: Request<UserSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터는 없고 id를 token에서 추출 한다.
    const params: UserSelectInfoParams = {
      id: tokenUser && tokenUser.id ? tokenUser.id : 0,
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
    const result = await userService.info(params, logFormat);

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
});

// user 정보 수정
router.put(
  '/id/:id',
  isLoggedIn,
  async (req: Request<UserUpdateParams, unknown, UserUpdateParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserUpdateParams = {
        id: Number(req.params.id),
        auth: req.body.auth,
        name: req.body.name,
        email: req.body.email,
        mobile: req.body.mobile,
        active: req.body.active || UserDefaults.active,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력 값 체크
      if (!params.id || isNaN(params.id)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (id: number)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }
      if (!params.name) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (name)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await userService.edit(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
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

// user 나의 정보 수정
router.put(
  '/me',
  isLoggedIn,
  async (req: Request<UserUpdateParams, unknown, UserUpdateParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserUpdateParams = {
        id: tokenUser && tokenUser.id ? tokenUser.id : 0,
        name: req.body.name,
        email: req.body.email,
        mobile: req.body.mobile,
        // active: req.body.active || UserDefaults.active, // 내정보에서는 active를 수정할 수 없음
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력 값 체크
      if (!params.id || isNaN(params.id)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (id: number)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }
      if (!params.name) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NOTNULL, 'Not allowed null (name)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await userService.edit(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
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

// my password 정보 수정
router.put(
  '/password/me',
  isLoggedIn,
  async (req: Request<UserUpdatePasswordParams, unknown, UserUpdatePasswordParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserUpdatePasswordParams = {
        id: tokenUser?.id || 0,
        password: '',
        oldPassword: req.body.oldPassword,
        newPassword: req.body.newPassword,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.id || !params.oldPassword || !params.newPassword) {
        const err = new ErrorClass(
          resCode.BAD_REQUEST_NULLORINVALID,
          'Null or invalid value (userId, oldPassword, newPassword)'
        );

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 입력 값 체크 - 패스워드 정책
      if (!params.newPassword || !checkPasswordValidator(params.newPassword)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (newPassword)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await userService.editPassword(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
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

// user password 강제 수정
router.put(
  '/password/id/:id',
  isLoggedIn,
  async (req: Request<UserUpdatePasswordParams, unknown, UserUpdatePasswordParams, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserUpdatePasswordParams = {
        id: Number(req.params.id),
        password: '',
        newPassword: req.body.newPassword,
      };
      logging.REQUEST_PARAM(logFormat);

      // 입력값 체크
      if (!params.id || !params.newPassword) {
        const err = new ErrorClass(resCode.BAD_REQUEST_NULLORINVALID, 'Null or invalid value (userId, newPassword)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 입력 값 체크 - 패스워드 정책
      if (!params.newPassword || !checkPasswordValidator(params.newPassword)) {
        const err = new ErrorClass(resCode.BAD_REQUEST_INVALID, 'Invalid value (newPassword)');

        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);

        return res.status(resJson.status).json(resJson);
      }

      // 비즈니스 로직 호출
      const result = await userService.editPassword(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.EDIT);
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

// user 삭제
router.delete(
  '/id/:id',
  isLoggedIn,
  async (req: Request<UserDeleteParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: UserDeleteParams = {
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
      const result = await userService.delete(params, logFormat);

      // 최종 응답 값 세팅
      const resJson = resSuccess(result, resType.DELETE);
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
