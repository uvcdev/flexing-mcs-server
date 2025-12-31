import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { useRedisUtil, RedisKeys } from './redisUtil';
import { logging } from './logging';
import { smartConnectorEventEmitter } from '../events/smartConnectorEvents';
import { SmartConnectorWriteTag } from './smartConnectorUtils';
import { formatDetailedDateTime } from './usefullToolUtil';
import { sendSmartConnectorHeartbeat } from './heartbeat/sendHeartbeat';
import smartConnector from '../models/smartConnector/smartConnector';
import { wordToAscii } from './smartConnectorUtils';
interface SmartConnectorEventPayload {
  facilityName: string;
  tag: string;
  old: string | null;
  new: string | null;
}

type SmartConnectorMqttConfig = {
  host: string;
  port: number;
  topic: string;
};

const smartConnectorMqttConfig: SmartConnectorMqttConfig = {
  host: process.env.SMART_CONNECTOR_MQTT_HOST || '',
  port: Number(process.env.SMART_CONNECTOR_MQTT_PORT || '1883'),
  topic: process.env.SMART_CONNECTOR_MQTT_TOPIC || 'smartConnector',
};

const clientId = 'smartConnector_' + Math.random().toString(16).substr(2, 8);
const options: IClientOptions = {
  host: smartConnectorMqttConfig.host,
  port: smartConnectorMqttConfig.port,
  clientId: clientId,
};
const smartConnectorMqttClient = mqtt.connect(options);

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
const onPlcStateChanged = (facilityName: string, changes: { [key: string]: { old: string | null; new: string } }) => {
  logging.SYSTEM_LOG({
    title: `[SmartConnector State Change]`,
    message: `Facility: ${facilityName} | Changes: ${JSON.stringify(changes)}`,
  });
  // 변경된 모든 태그에 대해 각각 이벤트를 발생시킴
  for (const tag in changes) {
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
export const initSmartConnectorMqtt = () => {
  // mqttClient 변수에 저장하여 sendMqttToSmartConnector에서 사용할 수 있도록 함
  mqttClient = smartConnectorMqttClient;

  const SmartConnector_TOPIC = 'smartConnector/#';
  const redisUtil = useRedisUtil();
  // 1. 토픽 구독
  smartConnectorMqttClient.subscribe(SmartConnector_TOPIC, (err) => {
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
  // 2. 메시지 수신 시 처리할 로직
  smartConnectorMqttClient.on('message', async (topic, message) => {
    const topicSplit = topic.split('/');
    // 주기적으로 받는 PLC 데이터 처리
    if (
      topicSplit.length === 3 &&
      topicSplit[0] === 'smartConnector' &&
      topicSplit[2] === 'data'
    ) {
      try {
        const payload = JSON.parse(message.toString());
        const deviceId = payload.DEVICE_ID;
        const tags = payload.TAGS;

        if (deviceId !== topicSplit[1]) {
          logging.MQTT_ERROR({
            title: 'smartConnector Message Error',
            topic,
            message: message.toString(),
            error: new Error('deviceId is not match'),
          });
          return;
        }

        if (!deviceId || !Array.isArray(tags)) {
          logging.MQTT_ERROR({
            title: 'smartConnector Message Error',
            topic,
            message: message.toString(),
            error: new Error('deviceId or tags is null'),
          });
          return;
        }

        const newState = tagsToObject(deviceId, tags);
        const redisKey = `${RedisKeys.PlcRealtimeData}:${deviceId}`;

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
            onPlcStateChanged(deviceId, changes);
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
    if (
      topicSplit.length === 4 &&
      topicSplit[0] === 'smartConnector' &&
      topicSplit[2] === 'control' &&
      topicSplit[3] === 'result'
    ) {
      try {
        logging.MQTT_LOG({
          title: 'smartConnector Write Result',
          topic,
          message: message.toString(),
        });
        const payload: { WRITE_ID: string; RESULT: string } = JSON.parse(message.toString());
        const writeId = payload.WRITE_ID;
        const isSuccess = payload.RESULT === 'TRUE';
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
              error: new Error('writeMessage is null'),
            });
            return;
          }

          if (writeMessage && writeMessage.COUNT < 3) {
            const sendMessageString = JSON.stringify({ ...writeMessage, COUNT: writeMessage.COUNT + 1 });
            redisUtil.hset(RedisKeys.SmartConnectorWriteTag, writeId, sendMessageString);
            sendMqttToSmartConnector(`smartConnector/control/request`, sendMessageString);
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
      error: new Error('mqttClient is null'),
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
