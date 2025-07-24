/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RequestLog, logging, makeLogFormat } from '../logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
dotenv.config();
import { RequestParams } from 'nodemailer/lib/xoauth2';
import { sendAllHeartbeat } from '../heartbeat/sendHeartbeat';
import { checkSystemConnectionStatus } from '../heartbeat/checkHeartbeat';
import { checkReceivedAckCommand, checkRemainingAckCommand } from './wmsAck';
import { checkCallInfoForWms } from './wmsCallInfo';
import { checkAbortedCommandForRetry, checkCancelCall } from './wmsCommon';
import { useCallRegisterUtil } from "../callRegisterUtil";
import { useEqpCheckUtil } from '../eqpCheckUtil';
import { useWorkOrderUtil } from '../workOrderUtil';
import { checkMissionBranchInfoReqForWms, checkOutBranchInfoReqForWms } from './wmsBranch';
import { sendTrackingLogs } from './trackingLog';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from '../redisUtil';
import { DryrunSetting } from '../../models/common/setting';
import { sendCallInfoList, sendReqPortStateList } from './wmsSyncronization';

const heartbeatIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5
const heapUse = () => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

  console.log(`heap use: ${heapUsedMB} MB / ${heapTotalMB} MB`);
}
let counter = 0;
export const processMcs = async () => {
  try {
    counter++;

    if (counter % 2 === 0) heapUse()
    // setting 에서 설비기준 dryrun 인 경우 
    const dryrunSetting = await useRedisUtil().hgetObject<DryrunSetting>(RedisKeys.Setting, RedisSettingKeys.DryrunSetting);
    if (!dryrunSetting) {
      logging.ACTION_DEBUG({
        filename: 'index.ts',
        error: 'redis에 dryrunSetting 데이터가 없습니다.',
        params: null,
        result: false,
      });
      return;
    }
    const dryrunMode = dryrunSetting.data.mode || 'normal'
    // 정상 시나리오(창고 IF / PIO 포함 로직)
    if (dryrunMode === 'normal') {
      // WMS 관련 프로세스
      if (counter % 5 === 0) {
        sendAllHeartbeat();                 // wms heartbeat 전송 ( n초마다 실행 )
      }
      // 현재 진행 중인 물류 로그 전송
      await sendTrackingLogs()

      // 수집한 ack 데이터 처리 ( ACK )
      await checkReceivedAckCommand()

      // ACK 응답 여부 확인 ( ACK )
      await checkRemainingAckCommand()

      // Aborted 된 작업 재전송 여부 확인
      await checkAbortedCommandForRetry()

      // 콜 취소 요청 들어 왔을 때 처리 로직
      await checkCancelCall()

      // 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )
      // 1. 창고(반출) -> 설비(입고) - CALLINFO는 창고 기준 반출만 사용한다.  
      await checkCallInfoForWms()
      // 2. 창고(반입) -> 설비(반출) - BRANCH_INFO_REQ 는 창고 기준 반입만 사용한다. ( 창고 반입은 모두 미션 결정지 ) - 미션결정지 이동
      await checkMissionBranchInfoReqForWms()
      // 3. 창고(반입) -> 설비(반출) - 설비에서 창고로 바로 이동할 작업 지시 생성
      await checkOutBranchInfoReqForWms()

      // pending 된 작업 지시 생성
      await useWorkOrderUtil().createWorkOrder()

      // 설비-설비 간에 작업 미생성된 콜에 대해 재판단(Call_Response) 처리
      await useCallRegisterUtil().checkRemainEqpCall()

    } else if (dryrunMode === 'facility') {
      // 설비 기준 드라이런 시나리오(창고 IF / PIO 삭제 로직)
      // WMS 관련 프로세스
      if (counter % 5 === 0) {
        sendAllHeartbeat();                 // wms heartbeat 전송 ( n초마다 실행 )
      }
      // 현재 진행 중인 물류 로그 전송
      await sendTrackingLogs()

      // 수집한 ack 데이터 처리 ( ACK )
      await checkReceivedAckCommand()

      // ACK 응답 여부 확인 ( ACK )
      await checkRemainingAckCommand()

      // Aborted 된 작업 재전송 여부 확인
      await checkAbortedCommandForRetry()

      // 콜 취소 요청 들어 왔을 때 처리 로직
      await checkCancelCall()

      // 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )
      // 1. 창고(반출) -> 설비(입고) - CALLINFO는 창고 기준 반출만 사용한다.  
      // await checkCallInfoForWms()
      // 2. 창고(반입) -> 설비(반출) - BRANCH_INFO_REQ 는 창고 기준 반입만 사용한다. ( 창고 반입은 모두 미션 결정지 ) - 미션결정지 이동
      // await checkMissionBranchInfoReqForWms()
      // 3. 창고(반입) -> 설비(반출) - 설비에서 창고로 바로 이동할 작업 지시 생성
      // await checkOutBranchInfoReqForWms()

      // pending 된 작업 지시 생성
      await useWorkOrderUtil().createWorkOrder()

      // 설비-설비 간에 작업 미생성된 콜에 대해 재판단(Call_Response) 처리
      await useCallRegisterUtil().checkRemainEqpCall()

    }

  } catch (error) {
    console.error("Error in processMcs:", error);
    // 에러 로깅 또는 알림 처리
  } finally {
    // 다음 실행 예약
    setTimeout(() => {
      processMcs()
    }, 1000);
  }
}


// 동기화 함수
export const syncWithWms = () => {
  try {
    sendReqPortStateList()

    sendCallInfoList()
  } catch (error) {
    console.error("Error in syncWithWms:", error);
    // 에러 로깅 또는 알림 처리
  }
}