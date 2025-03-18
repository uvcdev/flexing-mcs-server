/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RequestLog, logging, makeLogFormat } from '../logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
dotenv.config();

import { RequestParams } from 'nodemailer/lib/xoauth2';
import { WorkOrderAttributesDeep } from 'models/operation/workOrder';


export const processMcs = () => {
  console.log('TEST')
  
  // 작업지시 생성함수

  // Call 처리 함수

  setTimeout(() => {
    processMcs()
  }, 1000);
}