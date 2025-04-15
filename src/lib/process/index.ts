/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RequestLog, logging, makeLogFormat } from '../logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
dotenv.config();
import { RequestParams } from 'nodemailer/lib/xoauth2';
import { sendAllHeartbeat } from '../heartbeat/sendHeartbeat';
import { checkSystemConnectionStatus } from '../heartbeat/checkHeartbeat';
import { checkRemainingAckCommand } from './ack';
import { useEqpCheckUtil } from '../eqpCheckUtil';

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

    // await checkSystemConnectionStatus()   // System 연결 상태 확인 ( Heartbeat )
    // await checkRemainingAckCommand()      // ACK 응답 여부 확인 ( ACK )

    // MCS 관련 프로세스
    // todo: 서버 재시작 됐을 때 기존 콜 유지하는 로직 추가..?

    // PLC 데이터 수집
    // await collectPlcData()

    // PLC 데이터 전송
    // await sendPlcData()

    // 수집 데이터 처리
    // await checkplcData()

    //  () - 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )
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