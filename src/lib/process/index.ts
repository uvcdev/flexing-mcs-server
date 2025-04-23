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
import { checkAbortedCommandForRetry } from './wmsCommon';
import { useCallRegisterUtil } from "../callRegisterUtil";
import { useEqpCheckUtil } from '../eqpCheckUtil';
import { useWorkOrderUtil } from '../workOrderUtil';
import { checkBranchInfoReqForWms } from './wmsBranch';

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

    // WMS 관련 프로세스
    if (counter % 5 === 0) {
      // sendAllHeartbeat();                 // wms heartbeat 전송 ( n초마다 실행 )
    }

    // 수집한 ack 데이터 처리 ( ACK )
    await checkReceivedAckCommand()

    // ACK 응답 여부 확인 ( ACK )
    await checkRemainingAckCommand()

    // Aborted 된 작업 재전송 여부 확인
    await checkAbortedCommandForRetry()

    // 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )
    // 1. 창고(반출) -> 설비(입고) - CALLINFO는 창고 기준 반출만 사용한다.  
    await checkCallInfoForWms()
    // 2. 창고(반입) -> 설비(반출) - BRANCH_INFO_REQ 는 창고 기준 반입만 사용한다. ( 창고 반입은 모두 미션 결정지 )
    await checkBranchInfoReqForWms()

    // ACK_CALL_INFO 판단해서 콜 정보 저장과 EQP에 응답 데이터 Write
    await useCallRegisterUtil().checkCallSave()
    // todo4: 창고로부터 ACK 오면 EQP_Call_Save 함수와 같은 기능 실행
    await useWorkOrderUtil().createWorkOrder()
    // Call 처리 함수 ( runningWorkOderCalls )

    //  () - Call 처리 함수 ( runningWorkOderCalls )
    //  () - To 작업 처리 함수
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