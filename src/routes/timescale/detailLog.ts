/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { DetailLogSelectInfoParams, DetailLogSelectListParams } from '../../models/timescale/detailLog';
import { detailLogService } from '../../service/timescale/detailLogService';
import { Pool } from 'pg';
import { to as copyTo } from 'pg-copy-streams';
import * as dotenv from 'dotenv';
dotenv.config();

const makeSelectListLogQuery = (params: DetailLogSelectListParams): string => {
  let whereQuery = '';
  let limitQuery = '';
  let offsetQuery = '';
  if (params.createdAtFrom || params.createdAtTo) {
    if (params.createdAtFrom && params.createdAtTo) {
      whereQuery += ` "DetailLog"."created_at" BETWEEN '${(params.createdAtFrom as unknown) as string}' AND '${(params.createdAtTo as unknown) as string
        }'`;
    } else {
      if (params.createdAtFrom) {
        whereQuery += ` "DetailLog"."created_at" >= '${(params.createdAtFrom as unknown) as string}'`;
      }
      if (params.createdAtTo) {
        whereQuery += ` "DetailLog"."created_at" <= '${(params.createdAtTo as unknown) as string}'`;
      }
    }
  }
  if (params.trackingLogId) {
    whereQuery += ` AND "DetailLog"."tracking_log_id" = '${params.trackingLogId}' `;
  }
  if (params.limit) {
    limitQuery += ` LIMIT ${params.limit}`;
  }

  if (params.offset) {
    offsetQuery += ` OFFSET ${params.offset}`;
  }

  const query =
    `SELECT "id", 
    "created_at" AT TIME ZONE 'Asia/Seoul' AS "createdAt", "topic", "subject", "tracking_log_id" AS "trackingLogId",
    "call_id" AS "callId", "eqp_call_id" AS "eqpCallId", "value", "state", "location", "message",  
    "result_status" AS "resultStatus", "created_date_time" AT TIME ZONE 'Asia/Seoul' AS "createdDateTime"
    "body" FROM "detail_logs" AS "DetailLog" ` +
    (whereQuery ? `WHERE ${whereQuery}` : '') +
    `ORDER BY "DetailLog"."created_at" DESC ${limitQuery} ${offsetQuery}`;

  // const query =
  //   `SELECT A.id,
  //   A.company_id as "companyId",
  //   A.storage_id as "storageId",
  //   A.item_id as "itemId",
  //   A.count,
  //   A.additional_count1 as "additionalCount1",
  //   A.additional_count2 as "additionalCount2",
  //   A.created_at as "createdAt",
  //   A.updated_at as "updatedAt",
  //   i.code AS "itemCode",
  //   i.name AS "itemName",
  //   i.size as "itemSize",
  //   i.partner_id as "itemPartnerId",
  //   i.unit_price AS "unitPrice",
  //   i.cc_id_item_group AS "ccIdItemGroup",
  //   i.cc_id_item_type AS "ccIdItemType",
  //   i.cc_id_item_unit AS "ccIdItemUnit",
  //   i.cc_id_tax_type AS "ccIdTaxType",
  //   s.name AS "storageName",
  //   s.full_path AS "storageFullPath"
  //   FROM inventories A
  //   inner join items i on i.id=A.item_id
  //   inner join storages s on s.id=A.storage_id
  //   WHERE (A.storage_id, A.updated_at) IN (
  //     SELECT A.storage_id, MAX(A.updated_at)
  //     FROM inventories A
  //     WHERE A.count != 0
  //     GROUP BY storage_id
  //   ) ` + whereQuery;
  return query;
};
const router = express.Router();

const TABLE_NAME = 'detailLogs'; // 이벤트 히스토리를 위한 테이블 명

// log 리스트 조회
router.get('/', isLoggedIn, async (req: Request<unknown, unknown, unknown, DetailLogSelectListParams>, res: Response) => {
  const logFormat = makeLogFormat(req);
  const tokenUser = (req as { decoded?: Payload }).decoded;

  try {
    // 요청 파라미터
    const params: DetailLogSelectListParams = {
      trackingLogId: req.query.trackingLogId,
      createdAtFrom: req.query.createdAtFrom,
      createdAtTo: req.query.createdAtTo,
      limit: Number(req.query.limit || 'NaN'),
      offset: Number(req.query.offset || 'NaN'),
      order: req.query.order,
    };
    logging.REQUEST_PARAM(logFormat);

    // 비즈니스 로직 호출
    const result = await detailLogService.list(params, logFormat);

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

// log 상세정보 조회
router.get(
  '/id/:id',
  isLoggedIn,
  async (req: Request<DetailLogSelectInfoParams, unknown, unknown, unknown>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // 요청 파라미터
      const params: DetailLogSelectInfoParams = {
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
      const result = await detailLogService.info(params, logFormat);

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

// log 리스트 다운로드
router.get(
  '/download',
  // isLoggedIn,
  async (req: Request<unknown, unknown, unknown, DetailLogSelectListParams>, res: Response) => {
    const logFormat = makeLogFormat(req);
    const tokenUser = (req as { decoded?: Payload }).decoded;

    try {
      // // 요청 파라미터
      const params: DetailLogSelectListParams = {
        trackingLogId: req.query.trackingLogId,
        createdAtFrom: req.query.createdAtFrom,
        createdAtTo: req.query.createdAtTo,
        limit: Number(req.query.limit || 'NaN'),
        offset: Number(req.query.offset || 'NaN'),
        order: req.query.order,
      };
      logging.REQUEST_PARAM(logFormat);

      // PostgreSQL 연결 정보 설정
      const pool = new Pool({
        user: process.env.LOG_DB_ID,
        host: process.env.LOG_DB_HOST,
        database: process.env.LOG_DB_DATABASE,
        password: process.env.LOG_DB_PASS,
        port: Number(process.env.LOG_DB_PORT),
      });
      const client = await pool.connect();
      // copyToCSV 함수 정의
      const copyToCSV = function copyToCSV(query: string): string {
        return `COPY (${query}) TO STDOUT WITH CSV HEADER ENCODING 'UTF-8'`;
      };
      // PostgreSQL 쿼리 설정
      // const query = `SELECT * FROM logs ORDER BY "logs"."created_at" DESC`;
      // makeSelectListLogQuery로 쿼리 생성
      const query = makeSelectListLogQuery(params);
      console.log('🚀 ~ query:', query);
      // 쿼리 결과를 스트림으로 받아 CSV 파일에 쓰기
      const stream = client.query(copyTo(copyToCSV(query)));
      // 스트림 형식으로 데이터를 클라이언트에게 전송
      res.setHeader('Content-Type', 'text/csv');
      if (params.createdAtFrom || params.createdAtTo) {
        if (params.createdAtFrom && params.createdAtTo) {
          const createdAtFromDate = new Date(params.createdAtFrom);
          const createdAtToDate = new Date(params.createdAtTo);
          res.setHeader(
            'Content-Disposition',
            `attachment; filename=detailLogs-${createdAtFromDate.toLocaleDateString()}_${createdAtFromDate.toLocaleTimeString('it-IT')}~${createdAtToDate.toLocaleDateString()}_${createdAtToDate.toLocaleTimeString('it-IT')}.txt`
          );
        } else {
          if (params.createdAtFrom) {
            const createdAtFromDate = new Date(params.createdAtFrom);
            res.setHeader(
              'Content-Disposition',
              `attachment; filename=detailLogs-${createdAtFromDate.toLocaleDateString()}_${createdAtFromDate.toLocaleTimeString('it-IT')}~${new Date().toLocaleDateString()}_${new Date().toLocaleTimeString('it-IT')}.txt`
            );
          }
          if (params.createdAtTo) {
            const createdAtToDate = new Date(params.createdAtTo);
            res.setHeader(
              'Content-Disposition',
              `attachment; filename=detailLogs-'unspecified'~${createdAtToDate.toLocaleDateString()}_${createdAtToDate.toLocaleTimeString('it-IT')}.txt`
            );
          }
        }
      } else {
        res.setHeader('Content-Disposition', `attachment; filename=detailLogs-total.txt`);
      }

      // 스트림 데이터를 응답에 직접 파이핑
      stream.pipe(res);

      // 스트림 종료시 이벤트 처리
      stream.on('end', () => {
        console.log('download completed.');
        return res.status(resJson.status).end();
        client.release();
      });
      // 스트림 에러시 이벤트 처리
      stream.on('error', (err) => {
        console.error(`Downloading detailLogs - unexpected error occurred. ${err.message}`);
        stream.destroy();
        // 에러 응답 값 세팅
        const resJson = resError(err);
        logging.RESPONSE_DATA(logFormat, resJson);
        return res.status(resJson.status).json(resJson);
      });
      // 최종 응답 값 세팅
      const resJson = resSuccess({ result: true }, resType.DOWNLOAD);
      logging.RESPONSE_DATA(logFormat, resJson);

      // 이벤트 로그 기록(비동기)

      return res.status(resJson.status);
    } catch (err) {
      // 에러 응답 값 세팅
      const resJson = resError(err);
      console.log('🚀 ~ err:', err);
      logging.RESPONSE_DATA(logFormat, resJson);

      return res.status(resJson.status).json(resJson);
    }
  }
);

export { router };
