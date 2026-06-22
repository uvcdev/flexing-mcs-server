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
import { AcsChargerDockingCanceledType, useDockingUtil } from './process/dockingUtil';
import { sendAcsHeartbeat } from './heartbeat/sendHeartbeat';
import { resetAmrName, TagValue, useKepServerUtil, writeAmrName } from './kepServerUtil';
import { acsWorkOrderCancel, checkCallSignalResetWorkOrder, checkSpBsWorkType } from './process/commonUtils';
import { FacilityAttributes } from '../models/operation/facility';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { service as facilityService } from '../service/operation/facilityService';
import { opcuaUtil } from './opcuaUtil';
import { useMultiCallRegisterUtil } from './multiCallRegisterUtil';
import { useCallCancelUtil } from './callCancelUtil';
import { timestampToDate } from '../lib/usefullToolUtil';
import { initSmartConnectorMqtt } from './smartConnectorMqttUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { useCallTypeUtil } from './callTypeUtil';
import { checkPortPresenceStatusMatch } from './process/wmsCommon';

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
  AlarmClear = 'alarm/clear',
  IsAlive = 'is_alive',
  WorkOrderStats = 'work_order_stats',
  InsertFacilityInfo = 'facility_info',
  // MBS용
  PLCStatus = 'plc_status',
  ServerStatus = 'server/status',
  ImcsEqpDockingRequest = 'imcs/docking/eqp/request',
  ImcsEqpDockingOutRequest = 'imcs/docking/eqp/out_request',
  ImcsWcsDockingRequest = 'imcs/docking/wcs/request',
  EditFacility = 'edit-facility',
  OnCallPriority = 'acs/on_call_priority',
  FacilityStatus = 'facility_status',
  RecentWorkOrderList = 'recent_work_order_list',
  EqOperationMode = 'acs/eq_operation_mode',
  EqMode = 'acs/eq_mode',
  DockDisable = 'acs/dock_disable',
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

export interface MbsMqttMessage {
  header: MbsMqttHeader;
  body: MbsMqttBody;
}

// acs/wms/check-lift
export type CheckPortPresenceRequestType = {
  ZONE_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  EXC_CLS: 'AUTO' | 'MANUAL';
  WORKER_ID: string;
  REPORT_ID: string;
  INSTRUCTION_ID: string;
};

// mcs/wms/check-lift
export type CheckPortPresenceResponseType = {
  ZONE_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  EXC_CLS: 'AUTO' | 'MANUAL';
  WORKER_ID: string;
  REPORT_ID: string;
  INSTRUCTION_ID: string;
  RESULT: 'True' | 'False'; // "True" 또는 "False" 값을 가질 수 있음
  RESULT_MESSAGE: string;
};

// broker에 접속될 클라이언트 아이디(unique필요)
const clientId = 'mcs_' + Math.random().toString(16).substr(2, 8);

const options: IClientOptions = {
  host: mqttConfig.host,
  port: mqttConfig.port,
  clientId: clientId,
};

const client = mqtt.connect(options);
const topic = mqttConfig.topic;
const wmsMqttTopic = process.env.MQTT_MCS_TOPIC || 'MCS';
const mqttSubscribeWmsTopicList: string[] = mqttSubscribeWmsTopics || [];
const mqttSubscribeAcsTopicList: string[] = mqttSubscribeAcsTopics || [];
const wmsList: string[] = process.env.WMS_LIST?.split(',') || [];
const acsList: string[] = process.env.ACS_LIST?.split(',') || [];

// 10초마다 서버 상태 acs로 보내기
if (mqttConfig.host !== '') {
  setInterval(() => {
    try {
      sendMqtt(`${MqttTopics.IsAlive}`, JSON.stringify(true));
    } catch (error) {
      console.log('🚀 ~ setInterval ~ error:', error);
    }
  }, 1000);
}

// mqtt 연결, 구독, 메세지 수신
export const receiveMqtt = (): void => {
  const kepServerUtil = useKepServerUtil();
  const plcConnectUtil = usePlcConnectUtil();
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
        const wmsName = wmsList[i];
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
        const acsName = acsList[i];
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

      if (process.env.PLC_CONN_TYPE === 'CONNECTOR') {
        // Smart Connector MQTT 구독
        initSmartConnectorMqtt(client);
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
                { code: messageJson.EQP_CALL_ID, linkedEqpId: '' },
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
              const state = messageJson.body.state;
              const workOrderMode = messageJson.mode;
              const targetFacility = messageJson.facilityName.substring(0, 4);

              if (state === 'AMR_ARRIVED') {
                const assignedAmrName = messageJson?.amrName || '';

                await plcConnectUtil.writeTagValue({
                  targetFacility: messageJson.facilitySerial,
                  tagInfo: [
                    { tagName: 'Call_Robot_Assigned', value: true },
                    // { tagName: 'Call_Response', value: true },
                  ],
                });

                // 2026-06-11
                // await writeAmrName(messageJson.facilitySerial, assignedAmrName);
              }

              // 작업 완료
              if (state === 'MISSION_COMPLETED') {
                // todo 250723: workOrder mode 보고 수동이면 패스
                if (workOrderMode === 'manual') return;
                // await useMultiCallRegisterUtil().hsetWithDecrementCount(
                //   RedisKeys.InfoWorkOrderCountBySerial,
                //   targetFacility
                // );
              }

              // 작업 취소, 작업 실패 => move to work-order-cancel
              // if (state === 'MISSION_CANCELED' || state === 'MISSION_FAILED') {
              //   const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
              //     RedisKeys.InfoFacilityById,
              //     messageJson.fromSerial
              //   );
              //   let alwaysOnFacility = messageJson.fromSerial;
              //   let triggerFacility = messageJson.toSerial;

              //   if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
              //     alwaysOnFacility = messageJson.toSerial;
              //     triggerFacility = messageJson.fromSerial;
              //   }
              // await plcConnectUtil.writeTagValue({
              //   targetFacility: alwaysOnFacility,
              //   tagInfo: [
              //     { tagName: 'Call_Response', value: false },
              //     { tagName: 'Call_Robot_Assigned', value: false },
              //     { tagName: 'Call_Response_Count', value: '0' },
              //     { tagName: 'Dock_Request', value: false },
              //   ],
              // });

              // await plcConnectUtil.writeTagValue({
              //   targetFacility: triggerFacility,
              //   tagInfo: [
              //     { tagName: 'Call_Response', value: false },
              //     { tagName: 'Call_Robot_Assigned', value: false },
              //     { tagName: 'Call_Response_Count', value: '0' },
              //     { tagName: 'Dock_Request', value: false },
              //   ],
              // });

              //   if (workOrderMode !== 'manual') {
              //     await useMultiCallRegisterUtil().hsetWithDecrementCount(
              //       RedisKeys.InfoWorkOrderCountBySerial,
              //       targetFacility
              //     );

              //     const triggerFacilityTargetKey = kepServerUtil.getTargetKey(triggerFacility);
              //     const alwaysOnFacilityTargetKey = kepServerUtil.getTargetKey(alwaysOnFacility);
              //     await kepServerUtil.updateTagMapValues(
              //       triggerFacilityTargetKey,
              //       triggerFacility,
              //       ['Call_Request']
              //     );
              //     await kepServerUtil.updateTagMapValues(
              //       alwaysOnFacilityTargetKey,
              //       alwaysOnFacility,
              //       ['Call_Request']
              //     );

              //     // todo 250805 : ACS에서 취소된 작업 다시 만들 때 멀티콜 판단해서 작업지시 만들어야 하나?
              //     // 멀티콜일 때 acs 작업 취소하면 어떻게 되야 하는지 문의 필요
              //     const triggerCallRequestValue = opcuaUtil.tagMap.get(`${triggerFacility}.Call_Request`)?.value;
              //     const alwaysCallRequestValue = opcuaUtil.tagMap.get(`${alwaysOnFacility}.Call_Request`)?.value;
              //     if (triggerCallRequestValue === false || alwaysCallRequestValue === false) return;

              //     const tagInfo = useKepServerUtil().findTagInfo(triggerFacility, 'Call_Request');
              //     const targetTagInfo: TagValue = {
              //       value: true,
              //       prevValue: '',
              //       timestamp: Date.now(),
              //       CHANNEL: tagInfo?.CHANNEL || '',
              //       DEVICE: triggerFacility,
              //       TAGGROUP: '',
              //       TAG_NAME: 'Call_Request',
              //       DATA_TYPE: 'Boolean',
              //       INPUT_TYPE: 'Bool',
              //       NODE_ID: tagInfo?.NODE_ID || '',
              //       EQ_CODE: triggerFacility,
              //       reRegister: 'cancel',
              //     };

              //     await useRedisUtil().hset(
              //       RedisKeys.InfoCallRequestOnBySerial,
              //       triggerFacility,
              //       JSON.stringify(targetTagInfo)
              //     );
              //   }
              // }

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

            if (topicSplit.length === 4 && topicSplit[1] === 'docking' && topicSplit[3] === 'out_request') {
              const targetSystem = topicSplit[2];

              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: 'acs docking out_request',
                topic: messageTopic,
                message: messageJson,
              });

              try {
                void itemLogDao.insert(messageJson);
                useDockingUtil().sendAcsDockingOutRequest(JSON.parse(message));
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
                throw error;
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
            //작업지시 cancel 상황
            if (topicSplit[1] === 'work-order-cancel') {
              const messageJson = JSON.parse(message);
              // await acsWorkOrderCancel(messageJson);
              // const workOrderMode = messageJson.mode;
              // const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
              //   RedisKeys.InfoFacilityById,
              //   messageJson.FromFacility.serial
              // );
              // let alwaysOnFacility = messageJson.FromFacility.serial;
              // let triggerFacility = messageJson.ToFacility.serial;

              // if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
              //   alwaysOnFacility = messageJson.ToFacility.serial;
              //   triggerFacility = messageJson.FromFacility.serial;
              // }

              // await plcConnectUtil.writeTagValue({
              //   targetFacility: alwaysOnFacility,
              //   tagInfo: [
              //     { tagName: 'Call_Response', value: false },
              //     { tagName: 'Call_Robot_Assigned', value: false },
              //     { tagName: 'Call_Response_Count', value: '0' },
              //     { tagName: 'Dock_Request', value: false },
              //     { tagName: 'Call_Response_Multi_1', value: false },
              //     { tagName: 'Call_Response_Multi_2', value: false },
              //     { tagName: 'Call_Cancel_Response', value: false },
              //   ],
              // });
              // await useCallTypeUtil().callTypeResponseReset(alwaysOnFacility);
              // await plcConnectUtil.writeTagValue({
              //   targetFacility: triggerFacility,
              //   tagInfo: [
              //     { tagName: 'Call_Response', value: false },
              //     { tagName: 'Call_Robot_Assigned', value: false },
              //     { tagName: 'Call_Response_Count', value: '0' },
              //     { tagName: 'Dock_Request', value: false },
              //     { tagName: 'Call_Response_Multi_1', value: false },
              //     { tagName: 'Call_Response_Multi_2', value: false },
              //     { tagName: 'Call_Cancel_Response', value: false },
              //   ],
              // });
              // await useCallTypeUtil().callTypeResponseReset(triggerFacility);
              // if (workOrderMode !== 'manual') {
              //   await useMultiCallRegisterUtil().hsetWithDecrementCount(
              //     RedisKeys.InfoWorkOrderCountBySerial,
              //     triggerFacility
              //   );

              //   // todo 250805 : ACS에서 취소된 작업 다시 만들 때 멀티콜 판단해서 작업지시 만들어야 하나?
              //   // 멀티콜일 때 acs 작업 취소하면 어떻게 되야 하는지 문의 필요
              //   const triggerCallRequestValue = (await plcConnectUtil.getTagValue(
              //     triggerFacility,
              //     'Call_Request'
              //   )) as boolean;
              //   const triggerEQAutoValue = (await plcConnectUtil.getTagValue(triggerFacility, 'EQ_Auto')) as boolean;
              //   const alwaysCallRequestValue = (await plcConnectUtil.getTagValue(
              //     alwaysOnFacility,
              //     'Call_Request'
              //   )) as boolean;
              //   const alwaysEQAutoValue = (await plcConnectUtil.getTagValue(alwaysOnFacility, 'EQ_Auto')) as boolean;
              //   if (
              //     triggerCallRequestValue === true &&
              //     alwaysCallRequestValue === true &&
              //     triggerEQAutoValue === true &&
              //     alwaysEQAutoValue === true
              //   ) {
              //     const tagInfo = useKepServerUtil().findTagInfo(triggerFacility, 'Call_Request');
              //     const timezoneValue = process.env.TIME_ZONE || '';
              //     const targetTagInfo: TagValue = {
              //       value: true,
              //       prevValue: '',
              //       timestamp: Date.now(),
              //       createTime: timestampToDate(timezoneValue),
              //       CHANNEL: tagInfo?.CHANNEL || '',
              //       DEVICE: triggerFacility,
              //       TAGGROUP: '',
              //       TAG_NAME: 'Call_Request',
              //       DATA_TYPE: 'Boolean',
              //       INPUT_TYPE: 'Bool',
              //       NODE_ID: tagInfo?.NODE_ID || '',
              //       EQ_CODE: triggerFacility,
              //       reRegister: 'cancel',
              //     };

              //     // await useRedisUtil().hset(
              //     //   RedisKeys.InfoCallRequestOnBySerial,
              //     //   triggerFacility,
              //     //   JSON.stringify(targetTagInfo)
              //     // );
              //   }
              // }

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
                const workOrderCode = messageJson.workOrderCode;
                const redisUtil = useRedisUtil();
                redisUtil.hset(
                  RedisKeys.InfoMissionOrderByWorkOrderCode,
                  workOrderCode.toString(),
                  JSON.stringify({ ...messageJson, createdAt: Date.now() })
                );

                // const missionOrderType = await routeMissionOrderMqttMessage(messageJson as MqttBranchInfoDataFromAcs)
                // if (missionOrderType?.state === 'EQP') {
                //   // 링크 된 설비에 콜 살아있는지 판별해서 들어가는 로직
                //   const missionFromfacilityInfo = missionOrderType.facilityInfo
                //   if (missionFromfacilityInfo?.linkedEqpIds && missionFromfacilityInfo?.linkedEqpIds.length > 0) {
                //     const redisUtil = useRedisUtil();
                //     for (let i = 0; i < missionFromfacilityInfo.linkedEqpIds.length; i++) {
                //       const linkedEqpId = missionFromfacilityInfo.linkedEqpIds[i]
                //       const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                //         RedisKeys.InfoFacilityById,
                //         linkedEqpId.toString() || ''
                //       );
                //       const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
                //         RedisKeys.InfoPlcBySerial,
                //         linkedFacilityInfo?.serial?.toString() || ''
                //       );
                //       const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo))

                //       const missionOrderMqttMessage = {
                //         EQP_CALL_ID: (messageJson.missionOrderCode).slice(-4),
                //         TYPE: 'MISSION',
                //         WORK_ORDER_ID: messageJson.workOrderId,
                //         EQP_ID: linkedFacilityInfo?.serial,
                //         AMR_ID: messageJson.amrName,
                //         AMR_DB_ID: Number(messageJson.amrId) || 0,
                //         CALL_TYPE: messageJson.callType,
                //         CALL_ID: messageJson.missionOrderCode,
                //         IS_MISSION_ORDER: "TRUE",
                //         TX_ID: "",
                //         TAG_ID: "",
                //         CALL_PRIORITY: messageJson.callPriority,
                //       }

                //       if (plcInfoToJson.Call_Request && linkedFacilityInfo) {
                //         // 링크된 설비 콜이 떠 있는 경우 작업 생성
                //         sendMqtt('acs/missionorder', JSON.stringify(missionOrderMqttMessage));

                //         // 콜 기준 설비 call_response 작성
                // await plcConnectUtil.writeTagValue({
                //   targetFacility: missionFromfacilityInfo.serial || '',
                //   tagInfo: [{ tagName: 'Call_Response', value: true }],
                // });
                // await plcConnectUtil.writeTagValue({
                //   targetFacility: linkedFacilityInfo.serial || '',
                //   tagInfo: [{ tagName: 'Call_Response', value: true }],
                // });

                //         break
                //       } else if (!plcInfoToJson.Call_Request && linkedFacilityInfo) {
                //         // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
                //         redisUtil.hset(RedisKeys.InfoRemainCallById, messageJson.missionOrderCode, JSON.stringify({
                //           ...missionOrderMqttMessage,
                //           fromFacilityName: missionFromfacilityInfo.serial,
                //           toFacilityName: linkedFacilityInfo.serial
                //         }))
                //       }
                //     }
                //   }
                // } else if (missionOrderType?.state === 'WMS') {
                //   await receiveBranchInfoFromACS(messageJson as MqttBranchInfoDataFromAcs)
                // }
              } catch (error) {
                console.log('logging.missionOrder', error);
              }
            }
            // acs heartbeat 수집
            if (topicSplit.length === 2 && topicSplit[1] === 'is_alive') {
              const isAlive = message === 'true';
              const receiveAt = formatDetailedDateTime(new Date());
              sendAcsHeartbeat(isAlive, receiveAt);
            }
            // in/out 포트 동일시 회수 작업 생성시 공급 데이터 내리고 회수 데이터 올리기기
            if (topicSplit[1] === 'same_pio') {
              const messageJson = JSON.parse(message);
              try {
                // BS11 값 write
                await plcConnectUtil.writeTagValue({
                  targetFacility: messageJson.IN_SERIAL,
                  tagInfo: [
                    { tagName: 'Dock_Request', value: false },
                    // { tagName: 'Dock_Out_Request', value: true },
                    { tagName: 'Dock_AMR_Status', value: false },
                    { tagName: 'Dock_Signal_Reset', value: true },
                  ],
                });
                setTimeout(() => {
                  plcConnectUtil.writeTagValue({
                    targetFacility: messageJson.IN_SERIAL,
                    tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
                  });
                }, 500);
                // await plcConnectUtil.writeTagValue({
                //   targetFacility: messageJson.IN_SERIAL,
                //   tagInfo: [{ tagName: 'Dock_Out_Request', value: false }],
                // });

                // BS12 값 write
                await plcConnectUtil.writeTagValue({
                  targetFacility: messageJson.OUT_SERIAL,
                  tagInfo: [
                    { tagName: 'Dock_Request', value: true },
                    { tagName: 'Dock_AMR_Status', value: true },
                  ],
                });
                // setTimeout(() => {
                // await plcConnectUtil.writeTagValue({
                //   targetFacility: messageJson.OUT_SERIAL,
                //   tagInfo: [{ tagName: 'Dock_AMR_Status', value: true }],
                // });
                // }, 500);
                logging.MQTT_LOG({
                  title: 'acs same_pio request',
                  topic: messageTopic,
                  message: messageJson,
                });
                void itemLogDao.insert(messageJson);
              } catch (error) {
                console.log('same_pio request', error);
                throw error;
              }
            }
            if (topicSplit.length === 3 && topicSplit[1] === 'edit-facility') {
              const facilitySerial = topicSplit[2];
              const messageJson = JSON.parse(message);

              const mode = messageJson.mode;

              if (!mode || mode === '') {
                // error 발생
                logging.MQTT_LOG({
                  title: 'mcs workorder',
                  topic: messageTopic,
                  message: messageJson,
                });
                return;
              }

              await facilityService.editFacilityMode({ serial: facilitySerial, mode: mode });
            }
            if (topicSplit.length === 3 && topicSplit[1] === 'res-cancel-work-order') {
              const callId = topicSplit[2];
              const messageJson = JSON.parse(message);
              logging.MQTT_LOG({
                title: `mcs res-cancel-work-order ${callId}`,
                topic: messageTopic,
                message: messageJson,
              });

              try {
                // Todo[ssb] acs로부터 온 취소 응답 처리 로직 추가
                useCallCancelUtil().processCancelResponseFromAcs(messageJson);
              } catch (error) {
                console.log('logging.res-cancel-work-order', error);
              }
            }

            // mcs dock-signal-reset 메세지 처리
            if (topicSplit.length === 2 && topicSplit[1] === 'dock-signal-reset') {
              const messageJson = JSON.parse(message);
              const facilitySerial = messageJson.serial;
              if (!facilitySerial || facilitySerial === '') {
                logging.MQTT_ERROR({
                  title: 'mcs dock-signal-reset',
                  topic: messageTopic,
                  message: message,
                  error: new Error('facilitySerial is required'),
                });
                return;
              }

              logging.MQTT_LOG({
                title: 'mcs dock-signal-reset',
                topic: messageTopic,
                message: messageJson,
              });
              await plcConnectUtil.writeTagValue({
                targetFacility: facilitySerial,
                tagInfo: [
                  { tagName: 'Dock_Signal_Reset', value: true },
                  { tagName: 'Dock_AMR_Status', value: false },
                  { tagName: 'Dock_Request', value: false },
                  { tagName: 'Dock_Request_Charge', value: false },
                  { tagName: 'Dock_Request_Force', value: false },
                  { tagName: 'Dock_Out_Request', value: false },
                  { tagName: 'Docking_Status', value: '0' },
                ],
              });
              setTimeout(() => {
                plcConnectUtil.writeTagValue({
                  targetFacility: facilitySerial,
                  tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
                });
              }, 500);
            }

            // mcs call-cancel-response-reset 메세지 처리
            if (topicSplit.length === 2 && topicSplit[1] === 'call-cancel-response-reset') {
              const messageJson = JSON.parse(message);
              const facilitySerial = messageJson.serial;
              if (!facilitySerial || facilitySerial === '') {
                logging.MQTT_ERROR({
                  title: 'mcs call-cancel-response-reset',
                  topic: messageTopic,
                  message: message,
                  error: new Error('facilitySerial is required'),
                });
                return;
              }

              logging.MQTT_LOG({
                title: `mcs call-cancel-response-reset ${facilitySerial}`,
                topic: messageTopic,
                message: messageJson,
              });
              await plcConnectUtil.writeTagValue({
                targetFacility: facilitySerial,
                tagInfo: [{ tagName: 'Call_Cancel_Response', value: true }],
              });
            }

            // mcs call-signal-reset 메세지 처리
            if (topicSplit.length === 3 && topicSplit[1] === 'call-signal-reset') {
              const messageJson = JSON.parse(message);
              const facilitySerial = messageJson.serial;
              if (!facilitySerial || facilitySerial === '') {
                logging.MQTT_ERROR({
                  title: 'mcs call-signal-reset',
                  topic: messageTopic,
                  message: message,
                  error: new Error('facilitySerial is required'),
                });
                return;
              }

              const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
                RedisKeys.InfoFacilityBySerial,
                facilitySerial
              );
              if (!facilityInfo) {
                logging.MQTT_ERROR({
                  title: `mcs call-signal-reset ${facilitySerial}`,
                  topic: messageTopic,
                  message: messageJson,
                  error: new Error('facilityInfo not found'),
                });
                return;
              }
              logging.MQTT_LOG({
                title: `mcs call-signal-reset ${facilitySerial}`,
                topic: messageTopic,
                message: messageJson,
              });
              await plcConnectUtil.writeTagValue({
                targetFacility: facilitySerial,
                tagInfo: [
                  { tagName: 'Call_Response', value: false },
                  { tagName: 'Call_Response_Multi_1', value: false },
                  { tagName: 'Call_Response_Multi_2', value: false },
                  { tagName: 'Call_Cancel_Response', value: true },
                  { tagName: 'Call_Robot_Assigned', value: false },
                  { tagName: 'Call_Response_Count', value: '0' },
                ],
              });
              await useCallTypeUtil().callTypeResponseReset(facilitySerial);

              // ACS에서 Call_Signal_Reset 시, 오고 있는 AMR 정보 삭제
              // await resetAmrName(facilitySerial);

              if (facilityInfo.isActiveCallTrigger === true) {
                await checkCallSignalResetWorkOrder(messageTopic, messageJson, facilityInfo);
              } else {
                // 트리거가 아닌 설비
                logging.MQTT_LOG({
                  title: `mcs call-signal-reset - not active call trigger ${facilitySerial}`,
                  topic: messageTopic,
                  message: messageJson,
                });
              }
            }
            // sp-bs 라인 work type 변경
            if (topicSplit.length === 2 && topicSplit[1] === 'edit-sp-bs-work-type') {
              const messageJson = JSON.parse(message);
              await checkSpBsWorkType(messageJson);
            }
            // ACS에서 취소 시, Dock 신호 리셋
            //작업지시 cancel 상황
            if (topicSplit[1] === 'docking-cancel') {
              const messageJson: AcsChargerDockingCanceledType = JSON.parse(message);
              await useDockingUtil().dockingCanceled(messageJson);

              logging.MQTT_DEBUG({
                title: 'mcs message: docking-cancel',
                topic: messageTopic,
                message: messageJson,
              });
            }
            if (topicSplit[1] === 'wms' && topicSplit[2] === 'check-lift') {
              const messageJson: CheckPortPresenceRequestType = JSON.parse(message);
              await checkPortPresenceStatusMatch(messageJson);

              logging.MQTT_DEBUG({
                title: 'mcs message: docking-cancel',
                topic: messageTopic,
                message: messageJson,
              });
            }
          }

          // mcs에서 오는 메세지 처리
          if (serverTopic === 'mcs') {
            try {
              // item-logging 메세지 처리
              if (topicSplit.length === 2 && topicSplit[1] === 'workorder') {
                const messageJson = JSON.parse(message);
                console.log('🚀 ~ client.on ~ messageJson:', messageJson);
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
        const mbsTopicSplit = messageTopic.split('-');
        if (mbsTopicSplit.length > 1) {
          const systemTopic = mbsTopicSplit[0];
          const subTopic = mbsTopicSplit[1];
          const message = messageOrg.toString();
          const messageJson = JSON.parse(message);
          if (mbsTopicSplit.length === 2) {
            // WMS HEARTBEAT 수집
            if (wmsList.includes(systemTopic) && subTopic === 'HEARTBEAT') {
              checkConnectionWmsHeartbeat(systemTopic, messageJson);

              // logging.MQTT_LOG({
              //   title: 'wms heartbeat',
              //   topic: messageTopic,
              //   message: messageJson,
              // });
            }
          } else if (mbsTopicSplit.length === 3 && wmsList.includes(systemTopic)) {
            const logicTopic = mbsTopicSplit[2];
            logging.WMS_MQTT_LOG({
              title: `${mbsTopicSplit[1]}-${logicTopic}`,
              topic: messageTopic,
              message: messageJson,
            });
            // WMS에서 오는 메세지 처리
            if (wmsList.includes(systemTopic)) {
              if (logicTopic === 'CALL') {
                await wmsCall(systemTopic, messageJson);
              } else if (logicTopic === 'TRANSFER') {
                await wmsTransfer(systemTopic, messageJson);
              } else if (logicTopic === 'CARRIER') {
                await wmsCarrier(systemTopic, messageJson);
              } else if (logicTopic === 'PORT') {
                await wmsPort(systemTopic, messageJson);
              } else if (logicTopic === 'CRANE') {
                await wmsCrane(systemTopic, messageJson);
              } else if (logicTopic === 'BRANCH') {
                await wmsBranch(systemTopic, messageJson);
              } else if (logicTopic === 'ALARM') {
                await wmsAlarm(systemTopic, messageJson);
              } else if (logicTopic === 'ONLINE') {
                await wmsOnline(systemTopic, messageJson);
              }
            }
            // ACS에서 오는 메세지 처리
            else if (acsList.includes(systemTopic)) {
              if (logicTopic === 'PAYLOAD_STATE') {
                acsPayloadState(systemTopic, messageJson);
              } else if (logicTopic === 'MISSION_STATE') {
                acsMissionState(systemTopic, messageJson);
              } else if (logicTopic === 'ALARM_STATE') {
                acsAlarmState(systemTopic, messageJson);
              } else if (logicTopic === 'ACK_MISSION_COMMAND') {
                acsAckMissionCommand(systemTopic, messageJson);
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

/** MQTT 발송(retain=true). 구독 직후 브로커가 마지막 메시지를 내려줄 때 사용 (토픽당 마지막 1통만 유지). */
export const sendMqttRetain = (subTopic: string, message: string): void => {
  if (mqttConfig.host !== '') {
    let sendTopic = topic;
    if (subTopic) {
      sendTopic = topic + '/' + subTopic;
    }

    try {
      client.publish(sendTopic, message, { qos: 0, retain: true });
    } catch (err) {
      logging.MQTT_ERROR({
        title: 'mqtt send retain error',
        topic: topic,
        message: message,
        error: err,
      });
    }
  }
};

// wms mqtt 메세지 발송
export const sendMbsMqtt = (
  systemTopic: string,
  header: MbsMqttHeader,
  body: MbsMqttBody,
  systemName?: string | null
): void => {
  if (mqttConfig.host !== '') {
    // mqtt host가 등록된 경우에만 발송한다.
    let sendTopic = wmsMqttTopic;
    if (systemName) {
      sendTopic = sendTopic + '-' + systemName;
    }
    sendTopic = sendTopic + '-' + systemTopic;

    const sendMessageObj: MbsMqttMessage = {
      header: header,
      body: body,
    };
    const sendMessage = JSON.stringify(sendMessageObj);

    try {
      client.publish(sendTopic, sendMessage);
      if (sendTopic.split('-').length > 2) {
        logging.WMS_MQTT_LOG({
          title: `${sendTopic}`,
          topic: sendTopic,
          message: sendMessageObj,
        });
      }
    } catch (err) {
      logging.MQTT_ERROR({
        title: 'mqtt send to wms error',
        topic: sendTopic,
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
    subject: subject,
  };
};

export const separateMqttMessage = (messageJson: MbsMqttMessage) => {
  const messageId = messageJson.header.id;
  const subject = messageJson.header.subject;
  const messageBody = messageJson.body;

  return {
    messageId,
    subject,
    messageBody,
  };
};

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
