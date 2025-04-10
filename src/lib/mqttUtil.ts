/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RequestLog, logging, makeLogFormat } from '../lib/logging';
import mqtt, { IClientOptions } from 'mqtt';
import * as dotenv from 'dotenv';
import { itemLogDao } from '../dao/timescale/itemLogDao';
import { ItemLogInsertParams } from '../models/timescale/itemLog';
dotenv.config();

import { service as workOrderService } from '../service/operation/workOrderService';
import { RequestParams } from 'nodemailer/lib/xoauth2';
import { WorkOrderAttributesDeep } from 'models/operation/workOrder';
import { useWorkOrderStatsUtil } from './workOrderUtil';
import { mqttSubscribeWmsTopics } from '../constant/mqttSubscribeTopic';
import { mqttSubscribeAcsTopics } from '../constant/mqttSubscribeTopic';
import { checkConnectionWmsHeartbeat } from './heartbeat/checkHeartbeat';
import { generateUUIDNode } from './hashUtil';
import { formatDetailedDateTime } from './usefullToolUtil';
import { wmsCall } from './wms/call';
import { wmsTransfer } from './wms/transfer';
import { wmsCarrier } from './wms/carrier';
import { wmsPort } from './wms/port';
import { wmsCrane } from './wms/crane';
import { wmsBranch } from './wms/branch';
import { wmsAlarm } from './wms/alarm';
import { acsPayloadState } from './acs/payloadState';
import { acsMissionState } from './acs/missionState';
import { acsAlarmState } from './acs/alarmState';
import { acsAckMissionCommand } from './acs/ackMissionCommand';

// mqtt접속 환경
type MqttConfig = {
  host: string;
  port: number;
  topic: string;
};

const mqttConfig: MqttConfig = {
  host: process.env.MQTT_HOST || '',
  port: Number(process.env.MQTT_PORT || '1883'),
  topic: process.env.MQTT_TOPIC || 'mcs',
};

type AcsDetail = {
  itemCode: string | null;
  facilityCode: string | null;
  facilityName: string | null;
  amrCode: string | null;
  amrName: string | null;
};

type MissionState =
  | 'MISSION_INITIATED'
  | 'AMR_ASSIGNED'
  | 'AMR_ARRIVED'
  | 'AMR_ACQUIRE_STARTED'
  | 'AMR_ACQUIRE_COMPLETED'
  | 'CARRIER_TRANSFERRING'
  | 'AMR_DEPOSIT_STARTED'
  | 'AMR_DEPOSIT_COMPLETED'
  | 'AMR_UNASSIGNED'
  | 'MISSION_COMPLETED'
  | 'MISSION_CANCELED'
  | 'MISSION_FAILED';

type MissionStateData = {
  mission: string;
  state: MissionState;
  assign: {
    robot: string;
    task: MissionState;
  };
  acsDetail: AcsDetail;
};

// mcs/acs/workorder
type McsWorkOrderRequestType = {
  TX_ID: string;
  ZONE_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  EQP_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  TAG_ID: string;
  CALL_PRIORITY: string;
  CALL_TYPE: string; // 배터리 타입 PLC 맵에서 콜타입 이라 명명
};

type McsCancelWorkOrderRequestType = {
  TX_ID: string;
  ZONE_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  EQP_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
};

export enum MqttTopics {
  WorkerStatus = 'feedback_worker_status',
  WorkHistory = 'work_history',
  Docking = 'docking',
  AlarmRegist = 'alarm/regist',
  AlarmClear = 'alarm/clear',
  IsAlive = 'is-alive',
  ItemLogging = 'item-logging',
  WorkOrderStats = 'work-order-stats',
  // MBS용
  KepwareStatus = 'kepware-status',
  ServerStatus = 'server-status'
}

export interface mbsMqttHeader {
  id: string;
  time: string;
  subject: string;
}

export interface mbsMqttBody {
  [key: string]: any;
}

export interface mbsMqttMesaage {
  header: mbsMqttHeader;
  body: mbsMqttBody;
}


// broker에 접속될 클라이언트 아이디(unique필요)
const clientId = 'mcs_' + Math.random().toString(16).substr(2, 8);

const options: IClientOptions = {
  host: mqttConfig.host,
  port: mqttConfig.port,
  clientId: clientId,
};

const client = mqtt.connect(options);
const topic = mqttConfig.topic;
const wmsMqttTopic = process.env.MQTT_WMS_TOPIC || 'MCS'
const mqttSubscribeWmsTopicList: string[] = mqttSubscribeWmsTopics || []
const mqttSubscribeAcsTopicList: string[] = mqttSubscribeAcsTopics || []
const wmsList: string[] = process.env.WMS_LIST?.split(',') || []
const acsList: string[] = process.env.ACS_LIST?.split(',') || []

// 10초마다 서버 상태 acs로 보내기
if (mqttConfig.host !== '') {
  setInterval(() => {
    try {
      sendMqtt(`${MqttTopics.IsAlive}`, JSON.stringify(true));
    } catch (error) {
      console.log("🚀 ~ setInterval ~ error:", error)
    }
  }, 1000);
}

// mqtt 연결, 구독, 메세지 수신
export const receiveMqtt = (): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 구독한다.
    client.on('connect', () => {
      logging.MQTT_LOG({
        title: 'mqtt connect',
        topic,
        message: null,
      });

      // mqtt 구독
      client.subscribe(`${topic}/#`, (err) => {
        logging.MQTT_LOG({
          title: 'mqtt subscribe',
          topic,
          message: null,
        });

        if (err) {
          logging.MQTT_ERROR({
            title: 'mqtt subscribe error',
            topic,
            message: null,
            error: err,
          });
        }
      });

      // acs mqtt 구독
      client.subscribe(`acs/#`, (err) => {
        logging.MQTT_LOG({
          title: 'mqtt subscribe',
          topic,
          message: null,
        });

        if (err) {
          logging.MQTT_ERROR({
            title: 'mqtt subscribe error',
            topic,
            message: null,
            error: err,
          });
        }
      });

      // imcs mqtt 구독
      client.subscribe('imcs/#', (err) => {
        logging.MQTT_LOG({
          title: 'mqtt subscribe',
          topic,
          message: null,
        });

        if (err) {
          logging.MQTT_ERROR({
            title: 'mqtt subscribe error',
            topic,
            message: null,
            error: err,
          });
        }
      });

      // MBS WMS 구독
      for (let i = 0; i < wmsList.length; i++) {
        const wmsName = wmsList[i]
        for (let j = 0; j < mqttSubscribeWmsTopicList.length; j++) {
          const subscribeTopicName = mqttSubscribeWmsTopicList[j];
          client.subscribe(`${wmsName}${subscribeTopicName}`, (err) => {
            logging.MQTT_LOG({
              title: 'mqtt subscribe',
              topic,
              message: null,
            });

            if (err) {
              logging.MQTT_ERROR({
                title: 'mqtt subscribe error',
                topic,
                message: null,
                error: err,
              });
            }
          });
        }
      }

      // MBS ACS 구독
      for (let i = 0; i < acsList.length; i++) {
        const acsName = acsList[i]
        for (let j = 0; j < mqttSubscribeAcsTopicList.length; j++) {
          const subscribeTopicName = mqttSubscribeAcsTopicList[j];
          client.subscribe(`${acsName}${subscribeTopicName}`, (err) => {
            logging.MQTT_LOG({
              title: 'mqtt subscribe',
              topic,
              message: null,
            });

            if (err) {
              logging.MQTT_ERROR({
                title: 'mqtt subscribe error',
                topic,
                message: null,
                error: err,
              });
            }
          });
        }
      }

      // // 전체 구독
      // client.subscribe('#', (err) => {
      //   logging.MQTT_LOG({
      //     title: 'mqtt subscribe',
      //     topic,
      //     message: null,
      //   });

      //   if (err) {
      //     logging.MQTT_ERROR({
      //       title: 'mqtt subscribe error',
      //       topic,
      //       message: null,
      //       error: err,
      //     });
      //   }
      // });
    });

    // 메세지 수신
    client.on('message', async (messageTopic, messageOrg) => {
      try {
        const topicSplit = messageTopic.split('/');

        if (topicSplit) {
          const serverTopic = topicSplit[0];
          const logicTopic = topicSplit[1];
          const message = messageOrg.toString();
          // logging.MQTT_LOG({
          //   title: 'receive message',
          //   topic: messageTopic,
          //   message: messageOrg.toString(),
          // });

          // 1. imcs에서  메세지 처리
          if (serverTopic === 'imcs') {
            if (topicSplit.length === 3 && topicSplit[2] === 'workorder') {
              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'imcs workorder',
                topic: messageTopic,
                message: messageJson,
              });
              await workOrderService.regWorkOrder(messageJson);
              console.log('###4');
              sendMqtt('acs/workorder', message);
            }
            if (topicSplit.length === 3 && topicSplit[2] === 'recallworkorder') {
              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'imcs recallworkorder',
                topic: messageTopic,
                message: messageJson,
              });
              await workOrderService.regWorkOrder(messageJson);
              console.log('###5');
              sendMqtt('acs/recallworkorder', message);
            }
            if (topicSplit.length === 3 && topicSplit[2] === 'cancelworkorder') {
              const messageJson = JSON.parse(message) as McsCancelWorkOrderRequestType;
              logging.MQTT_LOG({
                title: 'imcs cancel workorder',
                topic: messageTopic,
                message: messageJson,
              });
              const result = await workOrderService.facilityCancel(
                { code: messageJson.EQP_CALL_ID },
                makeLogFormat({} as RequestLog)
              );
              console.log('###6');
              if (result.updatedCount > 0) sendMqtt('acs/cancelworkorder', message);
            }
            // 작업 로그
            if (topicSplit.length === 4 && topicSplit[3] === 'workinfo') {
              const messageJson = JSON.parse(message);
              logging.WORK_STATUS(messageJson);
            }
            // 미사용
            // if(logicTopic === 'notify'){
            //   const messageJson = JSON.parse(message);
            //   logging.MQTT_DEBUG({
            //     title: 'imcs message',
            //     topic: messageTopic,
            //     message: messageJson,
            //   });

            //   // void workOrderService.regWorkOrder(messageJson);
            // }
            // if(topicSplit.length>=3 && topicSplit[2] === 'error' ){
            //   const system =topicSplit[1]
            //   //알람 발생

            // }
            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'request') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'imcs docking request',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'complete') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'imcs docking complete',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'detach') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'imcs docking detach',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
          }

          // acs에서
          if (serverTopic === 'acs') {
            // item-logging 메세지 처리
            if (topicSplit.length === 3 && topicSplit[1] === 'item-logging') {
              const itemCode = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_DEBUG({
                title: 'imcs message',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }

            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'request') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'acs docking request',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'complete') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'acs docking complete',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'detach') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'acs docking detach',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('logging.ITEM_LOG', error);
              }
            }
            //작업지시 진행상황
            if (topicSplit[1] === 'work-order') {
              const messageJson = JSON.parse(message);
              // 작업지시 종결
              if (messageJson.isClosed === true) {
                await workOrderService.editByCode(messageJson, makeLogFormat({} as RequestLog));
              } else {
                const params = messageJson as WorkOrderAttributesDeep;
                await workOrderService.stateCheckAndEdit(params, makeLogFormat({} as RequestLog));
              }
            }
          }
        }
        // MBS
        const mbsTopicSplit = messageTopic.split('-')
        if (mbsTopicSplit) {
          const systemTopic = mbsTopicSplit[0];
          const subTopic = mbsTopicSplit[1];
          const message = messageOrg.toString();
          const messageJson = JSON.parse(message);
          if (mbsTopicSplit.length === 2) {
            // WMS HEARTBEAT 수집
            if (wmsList.includes(systemTopic) && subTopic === 'HEARTBEAT') {
              checkConnectionWmsHeartbeat(systemTopic, messageJson)

              logging.MQTT_LOG({
                title: 'wms heartbeat',
                topic: messageTopic,
                message: messageJson,
              });
            }
          } else if (mbsTopicSplit.length === 3) {
            const logicTopic = mbsTopicSplit[2];
            logging.MQTT_LOG({
              title: `${mbsTopicSplit} ${logicTopic}`,
              topic: messageTopic,
              message: messageJson,
            });
            // WMS
            if (wmsList.includes(systemTopic)) {
              if (logicTopic === 'CALL') {
                wmsCall(systemTopic, messageJson)
              } else if (logicTopic === 'TRANSFER') {
                wmsTransfer(systemTopic, messageJson)
              } else if (logicTopic === 'CARRIER') {
                wmsCarrier(systemTopic, messageJson)
              } else if (logicTopic === 'PORT') {
                wmsPort(systemTopic, messageJson)
              } else if (logicTopic === 'CRANE') {
                wmsCrane(systemTopic, messageJson)
              } else if (logicTopic === 'BRANCH') {
                wmsBranch(systemTopic, messageJson)
              } else if (logicTopic === 'ALARM') {
                wmsAlarm(systemTopic, messageJson)
              }
            }
            // ACS 
            else if (acsList.includes(systemTopic)) {
              if (logicTopic === 'PAYLOAD_STATE') {
                acsPayloadState(systemTopic, messageJson)
              } else if (logicTopic === 'MISSION_STATE') {
                acsMissionState(systemTopic, messageJson)
              } else if (logicTopic === 'ALARM_STATE') {
                acsAlarmState(systemTopic, messageJson)
              } else if (logicTopic === 'ACK_MISSION_COMMAND') {
                acsAckMissionCommand(systemTopic, messageJson)
              }
            }
          }
        }

      } catch (err) {
        logging.MQTT_ERROR({
          title: 'mqtt message error',
          topic: messageTopic,
          message: messageOrg.toString(),
          error: err,
        });
      }
    });

    client.on('error', (err) => {
      logging.MQTT_ERROR({
        title: 'mqtt error',
        message: null,
        error: err,
      });
    });
  }
};

// mqtt 메세지 발송
export const sendMqtt = (subTopic: string, message: string): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 발송한다.
    let sendTopic = topic;
    if (subTopic) {
      sendTopic = topic + '/' + subTopic;
    }

    try {
      client.publish(sendTopic, message);
    } catch (err) {
      logging.MQTT_ERROR({
        title: 'mqtt send error',
        topic: topic,
        message: message,
        error: err,
      });
    }
  }
};

// wms mqtt 메세지 발송
export const sendMbsMqtt = (systemTopic: string, header: mbsMqttHeader, body: mbsMqttBody, systemName?: string | null): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 발송한다.
    let sendTopic = wmsMqttTopic;
    if (systemName) {
      sendTopic = sendTopic + '-' + systemName
    }
    sendTopic = sendTopic + '-' + systemTopic

    const sendMessageObj: mbsMqttMesaage = {
      header: header,
      body: body
    }
    const sendMessage = JSON.stringify(sendMessageObj)

    try {
      client.publish(sendTopic, sendMessage);
    } catch (err) {
      logging.MQTT_ERROR({
        title: 'mqtt send to wms error',
        topic: topic,
        message: sendMessage,
        error: err,
      });
    }
  }
};

export const makeMbsMqttHeader = (subject: string): mbsMqttHeader => {
  const id = generateUUIDNode();
  const time = formatDetailedDateTime(new Date());

  return {
    id: id,
    time: time,
    subject: subject
  }
}

export const separateMqttMessage = (messageJson: mbsMqttMesaage) => {
  const messageId = messageJson.header.id;
  const subject = messageJson.header.subject;
  const messageBody = messageJson.body;

  return {
    messageId,
    subject,
    messageBody,
  }
}