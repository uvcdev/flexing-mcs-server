/**
 * [DEMO] 로봇허브 시연 — 콜 찌꺼기 점검·정리 (ACS → MCS)
 *
 *   GET  /external/rh-demo/calls         남은 찌꺼기를 보여 준다 (지우지 않는다)
 *   POST /external/rh-demo/calls/reset   지운다
 *
 * 왜 필요한가
 *   콜이 짝을 짓기 전에 내려가거나(시뮬레이터 재시작 등) 작업이 도중에 사라지면 Redis 에
 *   "콜 켜짐"(InfoCallRequestOnBySerial)·"설비별 작업 수"(RecentWorkOrderListByFacilitySerial)·
 *   "진행 중 트래킹로그"(InfoTrackingLogByCallId) 가 남는다. MCS 는 이것을 계속 다시 발행해서
 *     - ACS 대시보드(개요) 작업 목록에 어제 콜이 "진행 중·시작 전" 으로 남고
 *     - 지도의 설비 이름 앞 작업 수가 ① 로 떠 있고
 *     - 같은 설비가 다음에 콜을 올리면 남아 있던 **어제 콜 번호를 재사용**한다
 *
 * ★ 시연 전용이다. `.env` 의 RH_DEMO_API=true 일 때만 동작한다 (납품 사이트에서 켜지 않는다).
 * ★ 안전장치 — 설비 중 하나라도 Call_Request 가 켜져 있으면 지우지 않는다 (409).
 *   ACS 쪽 진행 중 작업지시 확인은 호출하는 ACS 가 먼저 한다 (MCS 는 ACS 작업지시를 모른다).
 * ★ 완료·취소된 트래킹로그와 DB 표(물류현황표 이력)는 건드리지 않는다. Redis 의 "진행 중 복사본" 만 지운다.
 */
import * as express from 'express';
import { Request, Response } from 'express';
import { logging, makeLogFormat } from '../../lib/logging';
import {
  ErrorClass,
  responseCode as resCode,
  makeResponseSuccess as resSuccess,
  responseType as resType,
  makeResponseError as resError,
} from '../../lib/resUtil';
import { RedisKeys, useRedisUtil } from '../../lib/redisUtil';

const router = express.Router();
const redisUtil = useRedisUtil();

const DONE_TRACKING_STATES = new Set(['COMPLETED', 'CANCELED']);

interface CallLeftovers {
  /** 콜이 켜진 설비 — 하나라도 있으면 정리하지 않는다 */
  litFacilities: string[];
  callOnSerials: string[];
  pendingCallIds: string[];
  facilityCounts: { serial: string; count: number }[];
  openTracking: { callId: string; state: string; subject: string; createdDateTime: string | null }[];
}

const enabled = (): boolean => process.env.RH_DEMO_API === 'true';

const parse = <T>(v: string | null | undefined): T | null => {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch (e) {
    return null;
  }
};

/** Redis 에서 남은 찌꺼기를 모은다 */
const collect = async (): Promise<CallLeftovers> => {
  const serials = await redisUtil.hkeys(RedisKeys.InfoFacilityBySerial);
  const litFacilities: string[] = [];
  for (const serial of serials) {
    const v = await redisUtil.hGetPlcTag(`${RedisKeys.PlcRealtimeData}:${serial}`, 'Call_Request');
    if (String(v) === 'true') litFacilities.push(serial);
  }

  const callOn = await redisUtil.hgetAll(RedisKeys.InfoCallRequestOnBySerial);
  const pending = await redisUtil.hgetAll(RedisKeys.InfoPendingWorkOrderByCallId);
  const recent = await redisUtil.hgetAll(RedisKeys.RecentWorkOrderListByFacilitySerial);
  const tracking = await redisUtil.hgetAll(RedisKeys.InfoTrackingLogByCallId);

  const facilityCounts = Object.entries(recent)
    .map(([serial, v]) => {
      const j = parse<{ count?: number; workOrderList?: unknown[] }>(v);
      return { serial, count: Math.max(j?.count || 0, (j?.workOrderList || []).length) };
    })
    .filter((x) => x.count > 0);

  const openTracking = Object.entries(tracking)
    .map(([callId, v]) => {
      const j = parse<{ state?: string; subject?: string; createdDateTime?: string }>(v);
      return { callId, state: j?.state || '', subject: j?.subject || '', createdDateTime: j?.createdDateTime || null };
    })
    .filter((x) => !DONE_TRACKING_STATES.has(x.state));

  return {
    litFacilities,
    callOnSerials: Object.keys(callOn),
    pendingCallIds: Object.keys(pending),
    facilityCounts,
    openTracking,
  };
};

router.get('/calls', async (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);
  try {
    if (!enabled()) throw new ErrorClass(resCode.ERROR, 'RH_DEMO_API 가 꺼져 있다 (시연 전용 기능)');
    const resJson = resSuccess(await collect(), resType.INFO);
    return res.status(resJson.status).json(resJson);
  } catch (err) {
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);
    return res.status(resJson.status).json(resJson);
  }
});

router.post('/calls/reset', async (req: Request, res: Response) => {
  const logFormat = makeLogFormat(req);
  try {
    if (!enabled()) throw new ErrorClass(resCode.ERROR, 'RH_DEMO_API 가 꺼져 있다 (시연 전용 기능)');

    const before = await collect();
    if (before.litFacilities.length) {
      return res.status(409).json({
        status: 409,
        code: 'CALL_ACTIVE',
        message: `콜이 켜진 설비가 있어 정리하지 않는다: ${before.litFacilities.join(', ')}`,
        data: before,
      });
    }

    for (const serial of before.callOnSerials) await redisUtil.hdelAsync(RedisKeys.InfoCallRequestOnBySerial, serial);
    for (const callId of before.pendingCallIds) await redisUtil.hdelAsync(RedisKeys.InfoPendingWorkOrderByCallId, callId);
    for (const { serial } of before.facilityCounts) {
      const cur = parse<Record<string, unknown>>(await redisUtil.hget(RedisKeys.RecentWorkOrderListByFacilitySerial, serial));
      await redisUtil.hsetAsync(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        serial,
        JSON.stringify({ ...(cur || {}), count: 0, workOrderList: [] })
      );
    }
    for (const { callId } of before.openTracking) await redisUtil.hdelAsync(RedisKeys.InfoTrackingLogByCallId, callId);

    logging.ACTION_INFO({
      filename: 'rhDemoCalls.ts - reset',
      error: `[DEMO] 콜 찌꺼기 정리 — 콜켜짐 ${before.callOnSerials.length} · 대기 ${before.pendingCallIds.length} · 작업수 ${before.facilityCounts.length} · 트래킹 ${before.openTracking.length}`,
      params: null,
      result: true,
    });
    const resJson = resSuccess({ removed: before, after: await collect() }, resType.EDIT);
    return res.status(resJson.status).json(resJson);
  } catch (err) {
    const resJson = resError(err);
    logging.RESPONSE_DATA(logFormat, resJson);
    return res.status(resJson.status).json(resJson);
  }
});

export { router };
