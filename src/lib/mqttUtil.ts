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
import { useWorkOrderUtil } from './workOrderUtil';
import { mqttSubscribeWmsTopics } from '../constant/mqttSubscribeTopic';
import { mqttSubscribeAcsTopics } from '../constant/mqttSubscribeTopic';
import { checkConnectionWmsHeartbeat } from './heartbeat/checkHeartbeat';
import { generateUUIDNode } from './hashUtil';
import { formatDetailedDateTime } from './usefullToolUtil';
import { wmsCall } from './wms/mqtt/call';
import { wmsTransfer } from './wms/mqtt/transfer';
import { wmsCarrier } from './wms/mqtt/carrier';
import { wmsPort } from './wms/mqtt/port';
import { wmsCrane } from './wms/mqtt/crane';
import { wmsBranch } from './wms/mqtt/branch';
import { wmsAlarm } from './wms/mqtt/alarm';
import { acsPayloadState } from './acs/payloadState';
import { acsMissionState } from './acs/missionState';
import { acsAlarmState } from './acs/alarmState';
import { acsAckMissionCommand } from './acs/ackMissionCommand';
import { wmsOnline } from './wms/mqtt/online';
import { MqttBranchInfoDataFromAcs, receiveBranchInfoFromACS } from './process/wmsBranch';
import { useDockingUtil } from './process/dockingUtil';
import { sendAcsHeartbeat } from './heartbeat/sendHeartbeat';
import { useKepServerUtil } from './kepServerUtil';
import { routeMissionOrderMqttMessage } from './process/commonUtils';
import { FacilityAttributes } from '../models/operation/facility';
import { RedisKeys, useRedisUtil } from './redisUtil';

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
  serial: string | null;
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
  // WorkerStatus = 'feedback_worker_status',
  // WorkHistory = 'work_history',
  // Docking = 'docking',
  // AlarmClear = 'alarm/clear',
  // ItemLogging = 'item_logging',
  AlarmRegist = 'alarm/regist',
  IsAlive = 'is_alive',
  WorkOrderStats = 'work_order_stats',
  InsertFacilityInfo = 'facility_info',
  // MBS용
  KepwareStatus = 'kepware_status',
  ServerStatus = 'server/status',
  ImcsEqpDockingRequest = 'imcs/docking/eqp/request',
  ImcsWcsDockingRequest = 'imcs/docking/wcs/request',
}

export interface MbsMqttHeader {
  id: string;
  time: string;
  subject: string;
}

export interface MbsMqttBody {
  Cmd_ID?: string;
  [key: string]: any;
}

export interface MbsMqttMesaage {
  header: MbsMqttHeader;
  body: MbsMqttBody;
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
  const kepServerUtil = useKepServerUtil()
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

          // imcs에서 오는 메세지 처리
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

          // acs에서 오는 메세지 처리
          if (serverTopic === 'acs') {
            // item-logging 메세지 처리
            if (topicSplit.length === 3 && topicSplit[1] === 'item-logging') {
              // const itemCode = topicSplit[2];
              const messageJson = JSON.parse(message);
              // 로봇할당 값 write
              if (messageJson.body.state === 'AMR_ARRIVED') {
                await kepServerUtil.writeSimpleTagValue({
                  targetFacility: messageJson.serial,
                  tagName: 'Call_Robot_Assigned',
                  value: true
                });
              }

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
                useDockingUtil().sendAcsDockingRequest(JSON.parse(message));
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
                useDockingUtil().sendAcsDockingComplete(JSON.parse(message));
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
                useDockingUtil().sendAcsDockingDetach(JSON.parse(message));
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
            // AMR 미션 결정지 도착
            if (topicSplit.length === 3 && topicSplit[1] === 'mission-order') {
              const messageJson = JSON.parse(message);
              logging.MQTT_DEBUG({
                title: 'imcs message - mission order',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                // void itemLogDao.insert(messageJson);
                // mission order 수집 구역
                const missionOrderType = await routeMissionOrderMqttMessage(messageJson as MqttBranchInfoDataFromAcs)
                if (missionOrderType === 'EQP') {
                  // 링크 된 설비에 콜 살아있는지 판별해서 들어가는 로직 
                  const missionFromfacilityInfo = messageJson
                  if (missionFromfacilityInfo?.linkedEqpIds && missionFromfacilityInfo?.linkedEqpIds.length > 0) {
                    const redisUtil = useRedisUtil();
                    for (let i = 0; i < missionFromfacilityInfo.linkedEqpIds.length; i++) {
                      const linkedEqpId = missionFromfacilityInfo.linkedEqpIds[i]
                      const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                        RedisKeys.InfoFacilityById,
                        linkedEqpId.toString() || ''
                      );
                      const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
                        RedisKeys.InfoPlcBySerial,
                        linkedFacilityInfo?.serial?.toString() || ''
                      );
                      const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo))

                      const missionOrderMqttMessage = {
                        EQP_CALL_ID: missionFromfacilityInfo.Call_ID,
                        TYPE: 'MISSION',
                        WORK_ORDER_ID: missionFromfacilityInfo.workOrderId,
                        EQP_ID: linkedFacilityInfo?.serial,
                        AMR_ID: missionFromfacilityInfo.AMRID,
                        AMR_DB_ID: Number(missionFromfacilityInfo.amrDbId) || 0,
                        CALL_TYPE: missionFromfacilityInfo.Call_Type,
                        CALL_ID: missionFromfacilityInfo.Call_ID,
                        IS_MISSION_ORDER: "TRUE",
                        TX_ID: "",
                        TAG_ID: "",
                        CALL_PRIORITY: missionFromfacilityInfo.callPriority,
                      }

                      if (plcInfoToJson.Call_Request && linkedFacilityInfo) {
                        // 링크된 설비 콜이 떠 있는 경우 작업 생성 
                        sendMqtt('acs/missionorder', JSON.stringify(missionOrderMqttMessage));

                        // 콜 기준 설비 call_response 작성
                        await useKepServerUtil().writeSimpleTagValue({
                          targetFacility: missionFromfacilityInfo.serial || '',
                          tagName: 'Call_Response',
                          value: true,
                        });
                        // call_response 작성
                        await useKepServerUtil().writeSimpleTagValue({
                          targetFacility: linkedFacilityInfo.serial || '',
                          tagName: 'Call_Response',
                          value: true,
                        });

                        break
                      } else if (!plcInfoToJson.Call_Request && linkedFacilityInfo) {
                        // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
                        redisUtil.hset(RedisKeys.InfoRemainCallById, missionFromfacilityInfo.CALL_ID, JSON.stringify({
                          ...missionOrderMqttMessage,
                          fromFacilityName: missionFromfacilityInfo.serial,
                          toFacilityName: linkedFacilityInfo.serial
                        }))
                      }
                    }
                  }
                } else if (missionOrderType === 'WMS') {
                  await receiveBranchInfoFromACS(messageJson as MqttBranchInfoDataFromAcs)
                }
              } catch (error) {
                console.log('logging.missionOrder', error);
              }
            }
            // acs heartbeat 수집
            if (topicSplit.length === 3 && topicSplit[1] === 'server' && topicSplit[2] === 'status') {
              const messageJson = JSON.parse(message);
              const receiveAt = formatDetailedDateTime(new Date());
              sendAcsHeartbeat(messageJson, receiveAt)
            }
          }

          // mcs에서 오는 메세지 처리
          if (serverTopic === 'mcs') {
            try {
              // item-logging 메세지 처리
              if (topicSplit.length === 2 && topicSplit[1] === 'workorder') {
                const messageJson = JSON.parse(message);
                console.log("🚀 ~ client.on ~ messageJson:", messageJson)
                logging.MQTT_LOG({
                  title: 'mcs workorder',
                  topic: messageTopic,
                  message: messageJson,
                });
                await workOrderService.regWorkOrder(messageJson);
                console.log('###4');
                sendMqtt('acs/workorder', message);
              }
            } catch (error) {
              console.log('왜 안되는지 알려줘야지')
              logging.MQTT_ERROR({
                title: 'mqtt message error from mcs/workorder',
                topic: messageTopic,
                message: messageOrg.toString(),
                error: error,
              });
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
            // WMS에서 오는 메세지 처리
            if (wmsList.includes(systemTopic)) {
              if (logicTopic === 'CALL') {
                await wmsCall(systemTopic, messageJson)
              } else if (logicTopic === 'TRANSFER') {
                await wmsTransfer(systemTopic, messageJson)
              } else if (logicTopic === 'CARRIER') {
                await wmsCarrier(systemTopic, messageJson)
              } else if (logicTopic === 'PORT') {
                await wmsPort(systemTopic, messageJson)
              } else if (logicTopic === 'CRANE') {
                await wmsCrane(systemTopic, messageJson)
              } else if (logicTopic === 'BRANCH') {
                await wmsBranch(systemTopic, messageJson)
              } else if (logicTopic === 'ALARM') {
                await wmsAlarm(systemTopic, messageJson)
              } else if (logicTopic === 'ONLINE') {
                await wmsOnline(systemTopic, messageJson)
              }
            }
            // ACS에서 오는 메세지 처리
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
export const sendMbsMqtt = (systemTopic: string, header: MbsMqttHeader, body: MbsMqttBody, systemName?: string | null): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 발송한다.
    let sendTopic = wmsMqttTopic;
    if (systemName) {
      sendTopic = sendTopic + '-' + systemName
    }
    sendTopic = sendTopic + '-' + systemTopic

    const sendMessageObj: MbsMqttMesaage = {
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

export const makeMbsMqttHeader = (subject: string): MbsMqttHeader => {
  const id = generateUUIDNode();
  const time = formatDetailedDateTime(new Date());

  return {
    id: id,
    time: time,
    subject: subject
  }
}

export const separateMqttMessage = (messageJson: MbsMqttMesaage) => {
  const messageId = messageJson.header.id;
  const subject = messageJson.header.subject;
  const messageBody = messageJson.body;

  return {
    messageId,
    subject,
    messageBody,
  }
}

// 도킹 관련 mqtt 메세지 발송
export const sendDockingMqtt = (topic: string, message: string): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 발송한다.
    try {
      client.publish(topic, message);
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
