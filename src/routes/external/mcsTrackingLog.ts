import * as express from 'express';
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { logging, makeLogFormat } from '../../lib/logging';
import {
  ErrorClass,
  responseCode as resCode,
  makeResponseSuccess as resSuccess,
  responseType as resType,
  makeResponseError as resError,
} from '../../lib/resUtil';
import { trackingLogService } from '../../service/common/trackingLogService';
import { TrackingLogAttributes, TrackingLogSelectListParams } from '../../models/common/trackingLog';
import ItemLog, { ItemLogAttributes } from '../../models/timescale/itemLog';

const router = express.Router();

const TABLE_NAME = 'mcsTrackingLog'; // 이벤트 히스토리를 위한 테이블 명

// 쿼리스트링 타입 (Express는 query 값을 string으로 받음)
interface TrackingLogQueryString {
  ids?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  limit?: string;
  offset?: string;
  order?: string;
}

// Sequelize 모델 인스턴스 → plain 객체 변환을 위한 보조 타입
type TrackingLogRow = TrackingLogAttributes & {
  get?: (opts: { plain: boolean }) => TrackingLogAttributes;
};

// ACS -> MCS: trackingLog 리스트 + itemLog 묶어서 응답
router.get('/', async (req: Request<unknown, unknown, unknown, TrackingLogQueryString>, res: Response) => {
  const logFormat = makeLogFormat(req);

  try {
    // 요청 파라미터
    const params: TrackingLogSelectListParams = {
      ids: req.query.ids ? (req.query.ids as unknown as string).split(',').map((i) => Number(i)) : null,
      createdAtFrom: req.query.createdAtFrom ? new Date(req.query.createdAtFrom) : null,
      createdAtTo: req.query.createdAtTo ? new Date(req.query.createdAtTo) : null,
      updatedAtFrom: req.query.updatedAtFrom ? new Date(req.query.updatedAtFrom) : null,
      updatedAtTo: req.query.updatedAtTo ? new Date(req.query.updatedAtTo) : null,
      limit: Number(req.query.limit || 'NaN'),
      offset: Number(req.query.offset || 'NaN'),
      order: req.query.order,
    };
    logging.REQUEST_PARAM(logFormat);

    // 검색 기간 필수 - createdAt 또는 updatedAt 짝 중 하나는 반드시 있어야 함 (전체 풀스캔 방지)
    const hasCreatedRange = !!(params.createdAtFrom && params.createdAtTo);
    const hasUpdatedRange = !!(params.updatedAtFrom && params.updatedAtTo);
    if (!hasCreatedRange && !hasUpdatedRange) {
      const err = new ErrorClass(
        resCode.BAD_REQUEST_NOTNULL,
        'Period required (createdAtFrom+createdAtTo or updatedAtFrom+updatedAtTo)'
      );
      const resJson = resError(err);
      logging.RESPONSE_DATA(logFormat, resJson);
      return res.status(resJson.status).json(resJson);
    }

    // 1. trackingLog 리스트 조회
    const trackingResult = await trackingLogService.list(params, logFormat);

    // console.log('trackingResult', trackingResult);
    // const trackingLogs: TrackingLogAttributes[] = ((trackingResult.rows ?? []) as TrackingLogRow[]).map((tl) =>
    //   tl.get ? tl.get({ plain: true }) : tl
    // );

    // // 2. itemLog를 trackingLogId IN 쿼리 한 번으로 조회 (1+N 방지)
    // const trackingLogIds = trackingLogs.map((tl) => tl.id);
    // const itemLogs: ItemLogAttributes[] =
    //   trackingLogIds.length > 0
    //     ? ((await ItemLog.findAll({
    //         where: { trackingLogId: { [Op.in]: trackingLogIds } },
    //         order: [['createdAt', 'ASC']],
    //         raw: true,
    //       })) as unknown as ItemLogAttributes[])
    //     : [];

    // // 3. trackingLogId 기준으로 group by 후 trackingLog에 합치기
    // const itemLogMap = new Map<number, ItemLogAttributes[]>();
    // for (const item of itemLogs) {
    //   if (item.trackingLogId == null) continue;
    //   const list = itemLogMap.get(item.trackingLogId) ?? [];
    //   list.push(item);
    //   itemLogMap.set(item.trackingLogId, list);
    // }

    // const rows = trackingLogs.map((tl) => ({
    //   ...tl,
    //   itemLogs: itemLogMap.get(tl.id) ?? [],
    // }));

    // const result = {
    //   ...trackingResult,
    //   rows,
    // };

    // itemLog 정보 없이 tracking 로그만 전달
    const rows = ((trackingResult.rows ?? []) as TrackingLogRow[]).map((tl) => (tl.get ? tl.get({ plain: true }) : tl));

    const result = {
      ...trackingResult,
      rows,
    };

    // 최종 응답 값 세팅
    const resJson = resSuccess(result, resType.LIST);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  } catch (err) {
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);

    return res.status(resJson.status).json(resJson);
  }
});

export { router };
