import { RequestLog, logging, makeLogFormat } from '../logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
dotenv.config();
import { RequestParams } from 'nodemailer/lib/xoauth2';
import { sendAllHeartbeat } from '../heartbeat/sendHeartbeat';
import { checkSystemConnectionStatus } from '../heartbeat/checkHeartbeat';
import { checkIntervalRemainingAckCommand, checkReceivedAckCommand, checkRemainingAckCommand } from './wmsAck';
import { checkCallInfoForWms, checkCallInfoOnPortTimeout } from './wmsCallInfo';
import { checkAbortedCommandForRetry, checkCancelCall } from './wmsCommon';
import { useCallRegisterUtil } from '../callRegisterUtil';
import { useEqpCheckUtil } from '../eqpCheckUtil';
import { useWorkOrderUtil } from '../workOrderUtil';
import { checkMissionBranchInfoReqForWms, checkOutBranchInfoReqForWms } from './wmsBranch';
import { sendTrackingLogs } from './trackingLog';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from '../redisUtil';
import { DryrunSetting } from '../../models/common/setting';
import { useMultiCallRegisterUtil } from '../multiCallRegisterUtil';
import { useCallResponseUtil } from '../callResponseUtil';
import { sendCallInfoList, sendReqPortStateList } from './wmsSyncronization';
import { checkMissionOrder } from '../missionOrderUtil';
import { checkCallCreate, checkCallRequestCreate } from '../callCheckUtil';
import { fixEqpData, fixMultiCallFacilityStatusList, sendMqttWorkOrderList } from './commonUtils';

const heartbeatIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5;
const heapUse = () => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

  // console.log(`heap use: ${heapUsedMB} MB / ${heapTotalMB} MB`);
};

const formatTimeWithMs = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

// heartbeat 전용 함수
export const startHeartbeat = () => {
  setInterval(() => {
    try {
      // console.log('sendAllHeartBeat');
      sendAllHeartbeat();
    } catch (error) {
      console.error('Error in heartbeat:', error);
    }
  }, 5000); // 정확히 5초마다
};

let counter = 0;
export const processMcs = async () => {
  const cycleStart = Date.now();
  const timings: Record<string, number> = {};

  try {
    counter++;

    if (counter % 2 === 0) heapUse();
    // setting 에서 설비기준 dryrun 인 경우
    // const dryrunSetting = await useRedisUtil().hgetObject<DryrunSetting>(
    //   RedisKeys.Setting,
    //   RedisSettingKeys.DryrunSetting
    // );
    // if (!dryrunSetting) {
    //   logging.ACTION_DEBUG({
    //     filename: 'index.ts',
    //     error: 'redis에 dryrunSetting 데이터가 없습니다.',
    //     params: null,
    //     result: false,
    //   });
    //   return;
    // }
    // const dryrunMode = dryrunSetting.data.mode || 'normal';

    // if (counter % 5 === 0) {
    //   sendAllHeartbeat(); // wms heartbeat 전송 ( n초마다 실행 )
    // }
    // 현재 진행 중인 물류 로그 전송
    let stepStart = Date.now();
    await sendTrackingLogs();
    timings.sendTrackingLogs = Date.now() - stepStart;

    // WMS 관련 프로세스
    // 수집한 ack 데이터 처리 ( ACK )
    stepStart = Date.now();
    await checkReceivedAckCommand();
    timings.checkReceivedAckCommand = Date.now() - stepStart;

    // ACK 응답 여부 확인 ( ACK )
    stepStart = Date.now();
    await checkRemainingAckCommand();
    timings.checkRemainingAckCommand = Date.now() - stepStart;

    // ACK Interval 처리 ( ACK )
    stepStart = Date.now();
    await checkIntervalRemainingAckCommand();
    timings.checkIntervalRemainingAckCommand = Date.now() - stepStart;

    // Aborted 된 작업 재전송 여부 확인
    stepStart = Date.now();
    await checkAbortedCommandForRetry();
    timings.checkAbortedCommandForRetry = Date.now() - stepStart;

    // checkCallInfoOnPortTimeout : ACK_CALL_INFO를 받았지만, PORT 배정이 오래동안 안되면 재요청
    stepStart = Date.now();
    await checkCallInfoOnPortTimeout();
    timings.checkCallInfoOnPortTimeout = Date.now() - stepStart;

    // 콜 취소 요청 들어 왔을 때 처리 로직
    // cancel call 재정의
    // await checkCancelCall();

    // 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )
    // 1. 창고(반출) -> 설비(입고) - CALLINFO는 창고 기준 반출만 사용한다.
    stepStart = Date.now();
    await checkCallInfoForWms();
    timings.checkCallInfoForWms = Date.now() - stepStart;
    // 2. 창고(반입) -> 설비(반출) - BRANCH_INFO_REQ 는 창고 기준 반입만 사용한다. ( 창고 반입은 모두 미션 결정지 ) - 미션결정지 이동
    stepStart = Date.now();
    await checkMissionBranchInfoReqForWms();
    timings.checkMissionBranchInfoReqForWms = Date.now() - stepStart;
    // 3. 창고(반입) -> 설비(반출) - 설비에서 창고로 바로 이동할 작업 지시 생성
    stepStart = Date.now();
    await checkOutBranchInfoReqForWms();
    timings.checkOutBranchInfoReqForWms = Date.now() - stepStart;
    // WMS 관련 프로세스 끝

    // Call_Request ON 인 경우 실시간 조회해서 작업 생성
    stepStart = Date.now();
    await useCallRegisterUtil().callRegister(); //3
    timings.callRegister = Date.now() - stepStart;
    stepStart = Date.now();
    await checkCallRequestCreate(); // 1
    timings.checkCallRequestCreate = Date.now() - stepStart;
    stepStart = Date.now();
    await checkCallCreate(); // 2
    timings.checkCallCreate = Date.now() - stepStart;
    // 모든 설비에서 조회해서 Call_Request 켜져있으면 RedisKeys.InfoCallRequestOnBySerial 에 등록

    // pending 된 작업 지시 생성
    stepStart = Date.now();
    await useWorkOrderUtil().createWorkOrder();
    timings.createWorkOrder = Date.now() - stepStart;

    // 데이터 보정
    if (counter % 3 === 0) {
      stepStart = Date.now();
      await fixEqpData();
      timings.fixEqpData = Date.now() - stepStart;

      // 해당 내용은 수동 작업을 무의미한 상태로 바꿀 수 있기 때문에 주석 처리 ( 미사용 )
      // await fixMultiCallFacilityStatusList();
    }

    // 작업 현황 데이터 전송 ( MCS -> MQTT )
    stepStart = Date.now();
    await sendMqttWorkOrderList();
    timings.sendMqttWorkOrderList = Date.now() - stepStart;

    // 설비-설비 간에 작업 미생성된 콜에 대해 재판단(Call_Response) 처리
    // 250916 remove remain
    // await useCallRegisterUtil().checkRemainEqpCall();

    // 설비 수동모드인 경우 등록해놓은 redis 조회해서 작업지시 생성
    // await useCallRegisterUtil().createFacilityModeWorkOrder();

    // 멀티콜 판단로직
    // await useCallResponseUtil().decisionWorkOrder();

    // 멀티콜 작업을 pending 처리
    // await useMultiCallRegisterUtil().multiCallRegister();

    // 미션 결정지에 있는 AMR 이동
    stepStart = Date.now();
    await checkMissionOrder();
    timings.checkMissionOrder = Date.now() - stepStart;
  } catch (error) {
    console.error('Error in processMcs:', error);
    // 에러 로깅 또는 알림 처리
  } finally {
    const cycleEnd = Date.now();
    const cycleMs = cycleEnd - cycleStart;
    console.log(
      `[processMcs.cycle] counter=${counter} start=${formatTimeWithMs(cycleStart)} | end=${formatTimeWithMs(
        cycleEnd
      )} | cycle=${cycleMs}ms | ${Object.entries(timings)
        .map(([k, v]) => `${k}=${v}ms`)
        .join(' | ')}`
    );
    // 다음 실행 예약
    setTimeout(() => {
      processMcs();
    }, 500);
  }
};

// 동기화 함수
export const syncWithWms = () => {
  try {
    sendReqPortStateList();

    // sendCallInfoList();
  } catch (error) {
    console.error('Error in syncWithWms:', error);
    // 에러 로깅 또는 알림 처리
  }
};
