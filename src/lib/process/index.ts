/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RequestLog, logging, makeLogFormat } from '../logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
dotenv.config();
import { RequestParams } from 'nodemailer/lib/xoauth2';
import { sendAllHeartbeat } from '../heartbeat/sendHeartbeat';
import { checkSystemConnectionStatus } from '../heartbeat/checkHeartbeat';
import { checkRemainingAckCommand } from './ack';

const heartbeatIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5

let counter = 0;
export const processMcs = async () => {
  try {
    counter++;
    // wms heartbeat 전송 ( n초마다 실행 )
    if (counter % 5 === 0) {
      sendAllHeartbeat();
    }
    // System 연결 상태 확인 ( Heartbeat )
    await checkSystemConnectionStatus()

    // ACK 응답 여부 확인 ( ACK )
    await checkRemainingAckCommand()

    // 작업지시 생성함수 ( beforeCreatedWorkOrderCalls )

    // Call 처리 함수 ( runningWorkOderCalls )

    // To 작업 처리 함수
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