import { MqttClient } from 'mqtt';
import { useRedisUtil, RedisKeys } from './redisUtil';
import { logging } from './logging';
import { smartConnectorEventEmitter } from '../events/smartConnectorEvents';
import { SmartConnectorWriteTag } from './smartConnectorUtils';
import { formatDetailedDateTime } from './usefullToolUtil';
import { sendSmartConnectorHeartbeat } from './heartbeat/sendHeartbeat';
import smartConnector from '../models/smartConnector/smartConnector';
import { wordToAscii } from './smartConnectorUtils';
import { FacilityAttributes } from '../models/operation/facility';

/**
 * SmartConnector 토픽 규칙.
 *
 * ★ 현장에 규칙이 **두 가지** 있다. 둘 다 받는다.
 *   MBS 형식   데이터 `smartConnector/facility/{설비}/data`
 *              쓰기   `smartConnector/{설비}/control/request` · 결과 `smartConnector/{설비}/control/result`
 *   UNT 형식   데이터 `smartConnector/{설비}/data`
 *              쓰기   `smartConnector/control/request`        · 결과 `smartConnector/control/result`
 *   (UNT·HGP·RH 시뮬레이터 프로필이 UNT 형식이다. 설비는 페이로드의 DEVICE_ID 로 가린다)
 * ★ 받는 쪽은 두 형식을 모두 알아본다. 겹치는 토픽이 없어서 설정이 필요 없다.
 * ★ 보내는 쪽은 하나를 골라야 한다 — `SMART_CONNECTOR_CONTROL_TOPIC` 으로 정한다.
 *   `{facilityName}` 을 넣으면 설비별로 보낸다. 없으면 기존 MBS 형식이다 (회귀 없음).
 */
const CONTROL_TOPIC_TEMPLATE =
  process.env.SMART_CONNECTOR_CONTROL_TOPIC || 'smartConnector/{facilityName}/control/request';

/** 쓰기 요청을 보낼 토픽. 최초 요청과 재전송이 **반드시 같은 토픽**을 써야 한다 */
export const smartConnectorControlTopic = (deviceId: string): string =>
  CONTROL_TOPIC_TEMPLATE.replace('{facilityName}', deviceId);

/** 주기 데이터 토픽이면 설비 이름을, 아니면 null 을 준다 (두 형식 모두) */
const parseDataTopic = (topicSplit: string[]): string | null => {
  if (topicSplit[0] !== 'smartConnector') return null;
  // MBS 형식: smartConnector/facility/{설비}/data
  if (topicSplit.length === 4 && topicSplit[1] === 'facility' && topicSplit[3] === 'data') return topicSplit[2];
  // UNT 형식: smartConnector/{설비}/data
  // ★ `control` 은 설비 이름이 될 수 없다 — 쓰기 결과 토픽과 헷갈리지 않게 막는다
  if (topicSplit.length === 3 && topicSplit[2] === 'data' && topicSplit[1] !== 'control') return topicSplit[1];
  return null;
};

/** 쓰기 결과 토픽인가 (두 형식 모두) */
const isControlResultTopic = (topicSplit: string[]): boolean =>
  topicSplit[0] === 'smartConnector' &&
  ((topicSplit.length === 4 && topicSplit[2] === 'control' && topicSplit[3] === 'result') ||
    (topicSplit.length === 3 && topicSplit[1] === 'control' && topicSplit[2] === 'result'));

/**
 * 쓰기 결과가 성공인가.
 * ★ 커넥터마다 값이 다르다 — 실장비는 문자열 `'TRUE'`, 시뮬레이터는 불리언 `true` 를 보낸다.
 *   문자열만 비교하면 성공한 쓰기를 전부 실패로 보고 세 번 재전송한다 (실제로 겪었다).
 */
const isWriteSuccess = (result: unknown): boolean =>
  result === true || (typeof result === 'string' && result.toUpperCase() === 'TRUE');
interface SmartConnectorEventPayload {
  facilityName: string;
  tag: string;
  old: string | null;
  new: string | null;
}

/**
 * smartConnector에 메시지를 보낼 때 사용하는 인터페이스
 * @example
 * const message: SendSmartConnectorMqttMessage = {
 *   facilityName: 'BM3I',
 *   tag: 'Call_Request',
 *   value: '1',
 * };
 * sendMqttToSmartConnector(message);
 */

// mqttUtil.ts에서 initializeSmartConnectorMqtt 호출 시 전달받은 client를 저장
let mqttClient: MqttClient | null = null;
/**
 * 메시지 처리기를 이미 붙인 클라이언트.
 * ★ initSmartConnectorMqtt 는 MQTT **연결될 때마다** 불린다 (mqttUtil 의 client.on('connect') 안).
 *   그때마다 client.on('message') 를 또 붙이면 재연결 한 번에 처리기가 둘이 되어 모든 태그 메시지를
 *   두 번 처리한다 — 같은 변화가 이력에 두 번 쌓이고(PK 중복 에러 · 에러 없는 중복 행 약 10%),
 *   태그 변경 이벤트(콜 감지)도 두 번 발생한다 (2026-09-21 실제로 겪었다).
 *   구독은 연결마다 다시 걸고, 처리기는 클라이언트당 한 번만 붙인다.
 */
let boundClient: MqttClient | null = null;

/**
 * MQTT로 받은 TAGS 배열을 { [key: string]: string } 형태의 객체로 변환합니다.
 */
const tagsToObject = (deviceId: string, tags: { TAG_ID: string; TAG_VALUE: string }[]): { [key: string]: string } => {
  const stateObject: { [key: string]: string } = {};
  for (const tag of tags) {
    const tagMapValue = smartConnector.tagMap.get(`${deviceId}.${tag.TAG_ID}`);
    if (!tagMapValue) {
      logging.ACTION_ERROR({
        filename: 'smartConnectorMqttUtil.ts-tagsToObject',
        params: { deviceId, tag: tag.TAG_ID },
        result: null,
        error: new Error('tagMapValue is not found for key: ' + tag.TAG_ID),
      });
      return stateObject;
    }
    switch (tagMapValue?.DATA_TYPE) {
      case 'Boolean':
        stateObject[tag.TAG_ID] = tag.TAG_VALUE;
        break;
      case 'UInt16':
        if (tag.TAG_ID.includes('Call_Time')) {
          stateObject[tag.TAG_ID] = tag.TAG_VALUE.padStart(4, '0');
        } else {
          stateObject[tag.TAG_ID] = tag.TAG_VALUE;
        }
        break;
      case 'String':
        stateObject[tag.TAG_ID] = wordToAscii(Number(tag.TAG_VALUE));
        break;
      default:
        logging.ACTION_ERROR({
          filename: 'smartConnectorMqttUtil.ts-tagsToObject',
          params: { deviceId, tag: tag.TAG_ID },
          result: null,
          error: new Error('tagMapValue data type is not valid: ' + tagMapValue?.DATA_TYPE),
        });
        stateObject[tag.TAG_ID] = tag.TAG_VALUE;
        break;
    }
  }
  return stateObject;
};
/**
 * PLC 상태 변경이 감지되었을 때 이벤트를 발행하는 함수
 */
const onPlcStateChanged = async (
  facilityName: string,
  changes: { [key: string]: { old: string | null; new: string } }
) => {
  const redisUtil = useRedisUtil();
  logging.SYSTEM_LOG({
    title: `[SmartConnector State Change]`,
    message: `Facility: ${facilityName} | Changes: ${JSON.stringify(changes)}`,
  });
  const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilityName);
  if (!facilityInfo) {
    logging.ACTION_ERROR({
      filename: 'smartConnectorMqttUtil.ts-onPlcStateChanged',
      params: { facilityName, changes },
      result: null,
      error: 'facilityInfo is null',
    });
    return;
  }
  // 변경된 모든 태그에 대해 각각 이벤트를 발생시킴
  for (const tag in changes) {
    const tagMapValue = smartConnector.tagMap.get(`${facilityName}.${tag}`);
    if (!tagMapValue) {
      logging.ACTION_ERROR({
        filename: 'smartConnectorMqttUtil.ts-onPlcStateChanged',
        params: { facilityName, tag },
        result: null,
        error: 'tagMapValue is not found for key: ' + tag,
      });
      return;
    }
    redisUtil.hSetPlcTag(`${RedisKeys.PlcRealtimeData}:${facilityName}`, tag, changes[tag].new || '');
    const snapshotData = await redisUtil.hGetPlcAllTags(`${RedisKeys.PlcRealtimeData}:${facilityName}`);
    if (!snapshotData) {
      logging.ACTION_ERROR({
        filename: 'smartConnectorMqttUtil.ts-onPlcStateChanged',
        params: { facilityName, tag },
        result: null,
        error: 'snapshotData is null',
      });
      return;
    }
    logging.PLC_DATA_CHANGE_HISTORY_LOG.INSERT({
      ts: new Date(),
      createdAt: new Date(),
      facilityCode: facilityInfo.code,
      facilityName: facilityInfo.serial || '',
      facilityType: facilityInfo.type,
      isTriggered: facilityInfo.isActiveCallTrigger || false,
      tagName: tag,
      oldValue: changes[tag].old,
      newValue: changes[tag].new,
      valueType: tagMapValue.DATA_TYPE,
      snapshotData: snapshotData,
      userId: null,
    });
    const eventName = tag; // 이벤트 이름 생성 (예: "Call_Request")
    const payload: SmartConnectorEventPayload = { ...changes[tag], facilityName, tag };
    // 구체적인 태그 변경 이벤트 발행
    smartConnectorEventEmitter.emit(eventName, payload);
    // console.log('emit eventName', eventName, payload);
  }
};
/**
 * [SmartConnector용] PLC 상태 모니터링 모듈을 초기화하고 MQTT 이벤트를 바인딩.
 */
export const initSmartConnectorMqtt = (client: MqttClient) => {
  // mqttClient 변수에 저장하여 sendMqttToSmartConnector에서 사용할 수 있도록 함
  mqttClient = client;

  const SmartConnector_TOPIC = 'smartConnector/#';
  const redisUtil = useRedisUtil();
  // 1. 토픽 구독
  client.subscribe(SmartConnector_TOPIC, (err) => {
    if (err) {
      logging.MQTT_ERROR({
        title: 'smartConnector Subscribe Error',
        topic: SmartConnector_TOPIC,
        message: err.message,
        error: err,
      });
    } else {
      logging.MQTT_LOG({
        title: 'smartConnector Subscribed',
        topic: SmartConnector_TOPIC,
        message: 'smartConnector Subscribed',
      });
    }
  });
  // 2. 메시지 수신 시 처리할 로직 — 클라이언트당 한 번만 붙인다 (재연결마다 쌓이지 않게)
  if (boundClient === client) return;
  boundClient = client;
  client.on('message', async (topic, message) => {
    const topicSplit = topic.split('/');
    // 주기적으로 받는 PLC 데이터 처리 (MBS·UNT 두 형식)
    const topicDeviceId = parseDataTopic(topicSplit);
    if (topicDeviceId !== null) {
      try {
        const payload = JSON.parse(message.toString());
        const deviceId = payload.DEVICE_ID;
        const tags = payload.TAGS;

        if (deviceId !== topicDeviceId) {
          logging.MQTT_ERROR({
            title: 'smartConnector Message Error',
            topic,
            message: message.toString(),
            error: 'deviceId is not match',
          });
          return;
        }

        if (!deviceId || !Array.isArray(tags)) {
          logging.MQTT_ERROR({
            title: 'smartConnector Message Error',
            topic,
            message: message.toString(),
            error: 'deviceId or tags is null',
          });
          return;
        }

        const newState = tagsToObject(deviceId, tags);
        const redisKey = `${RedisKeys.PlcRealtimeData}:${deviceId}`;

        if (Object.keys(newState).length === 0) {
          logging.MQTT_ERROR({
            title: 'smartConnector Message Error',
            topic,
            message: message.toString(),
            error: 'newState is empty',
          });
          return;
        }
        const oldState = await redisUtil.hGetPlcAllTags(redisKey);
        const changes: { [key: string]: { old: string | null; new: string } } = {};
        if (!oldState) {
          redisUtil.hSetPlcAllTags(redisKey, newState);
        } else {
          Object.keys(newState).forEach((key) => {
            if (oldState[key] !== newState[key]) {
              changes[key] = { old: oldState[key] || null, new: newState[key] };
            }
          });
          if (Object.keys(changes).length > 0) {
            await onPlcStateChanged(deviceId, changes);
            redisUtil.hSetPlcAllTags(redisKey, newState);
          }
        }
      } catch (err) {
        logging.MQTT_ERROR({
          title: 'smartConnector Message Error',
          topic,
          message: message.toString(),
          error: err,
        });
      }
    }

    // 쓰기 요청 응답 처리
    if (isControlResultTopic(topicSplit)) {
      try {
        logging.MQTT_LOG({
          title: 'smartConnector Write Result',
          topic,
          message: message.toString(),
        });
        const payload: { WRITE_ID: string; RESULT: string | boolean } = JSON.parse(message.toString());
        const writeId = payload.WRITE_ID;
        const isSuccess = isWriteSuccess(payload.RESULT);
        if (isSuccess) {
          redisUtil.hdel(RedisKeys.SmartConnectorWriteTag, writeId);
        } else {
          // 쓰기 요청 재전송
          const writeMessage = await redisUtil.hgetObject<SmartConnectorWriteTag>(
            RedisKeys.SmartConnectorWriteTag,
            writeId
          );
          if (!writeMessage) {
            logging.MQTT_ERROR({
              title: 'smartConnector Write Result Error',
              topic,
              message: message.toString(),
              error: 'writeMessage is null',
            });
            return;
          }

          if (writeMessage && writeMessage.COUNT < 3) {
            const sendMessageString = JSON.stringify({ ...writeMessage, COUNT: writeMessage.COUNT + 1 });
            redisUtil.hset(RedisKeys.SmartConnectorWriteTag, writeId, sendMessageString);
            // ★ 최초 요청과 같은 토픽으로 보낸다. 예전에는 `/control` 로 보내서
            //   커넥터가 재전송을 한 번도 받지 못했다
            sendMqttToSmartConnector(smartConnectorControlTopic(writeMessage.DEVICE_ID), sendMessageString);
          }
        }
      } catch (err) {
        logging.MQTT_ERROR({
          title: 'smartConnector Write Result Error',
          topic,
          message: message.toString(),
          error: err,
        });
      }
    }

    // smart connector heartbeat 처리
    if (topicSplit.length === 2 && topicSplit[0] === 'smartConnector' && topicSplit[1] === 'is_alive') {
      const isAlive = message.toString() === 'true';
      const receiveAt = formatDetailedDateTime(new Date());
      sendSmartConnectorHeartbeat(isAlive, receiveAt);
    }
  });
};

export const sendMqttToSmartConnector = (topic: string, message: string) => {
  if (!mqttClient) {
    logging.MQTT_ERROR({
      title: 'smartConnector MQTT Client Not Initialized',
      topic,
      message: 'mqttClient is null. Please initialize first.',
      error: 'mqttClient is null',
    });
    return;
  }
  try {
    mqttClient.publish(topic, message);
    logging.MQTT_LOG({
      title: 'smartConnector MQTT Publish Success',
      topic,
      message: message,
    });
  } catch (err) {
    logging.MQTT_ERROR({
      title: 'smartConnector MQTT Publish Error',
      topic,
      message: message,
      error: err,
    });
  }
};
