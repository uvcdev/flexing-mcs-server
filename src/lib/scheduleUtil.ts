import * as schedule from 'node-schedule';
import { Request } from 'express';
import { RequestLog, logging, makeLogFormat } from './logging';
import { service as workOrderService } from '../service/operation/workOrderService';
import { useServerUtil } from './serverUtil';

const req: RequestLog = {
  method: '',
  hostname: '',
  baseUrl: '',
  originalUrl: '',
  params: '',
  query: '',
  body: '',
};
const logFormat = makeLogFormat(req);

// 서버상태 전송 인터벌
export const makeSendServerStatusInterval = (params: { second: number }): void => {
  // void useServerUtil().getRAMUsage();
  // void useServerUtil().getCPUUsage();
  void useServerUtil().sendStatus();
  setInterval(() => {
    void useServerUtil().sendStatus();
  }, params.second * 1000);
};

// 디스크 사용률 갱신 인터벌 (상태 전송 주기와 분리 — df 프로세스 fork 낭비 방지)
export const makeUpdateDiskUsageInterval = (params: { second: number }): void => {
  void useServerUtil().updateDiskUsage();
  setInterval(() => {
    void useServerUtil().updateDiskUsage();
  }, params.second * 1000);
};

export const makeinitDailyWorkOrderstatsScheduleSet = (params: {
  hour: number;
  minute: number;
  second: number;
}): void => {
  const rule = new schedule.RecurrenceRule();
  rule.tz = 'Europe/Madrid';
  rule.hour = params.hour;
  rule.minute = params.minute;
  rule.second = params.second;
  // 현재 일자 기준 어제 일자 구하기

  // 스케줄  설정
  console.log('금일 작업지시 상태 스케줄러 생성한다!');
  workOrderService.initDailyWorkOrderstats();
  schedule.scheduleJob(rule, async function () {
    try {
      console.log('금일 작업지시 상태 스케줄러 시작한다!');
      workOrderService.initDailyWorkOrderstats();
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'scheduleUtil.ts',
        error: error,
        params: null,
        result: false,
      });
    }
  });
};
