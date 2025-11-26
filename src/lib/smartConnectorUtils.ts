import { RedisKeys, useRedisUtil } from './redisUtil';
import { initSmartConnectorMqtt, sendMqttToSmartConnector } from './smartConnectorMqttUtil';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import smartConnector from '../models/smartConnector/smartConnector';
import { initializeSmartConnectorEventsHandlers } from '../events/smartConnectorEventsHandlers';
import { MqttTopics, sendMqtt } from './mqttUtil';
import { logging } from './logging';
import { timestampToDate } from './usefullToolUtil';

export interface SendSmartConnectorMqttMessage {
  facilityName: string;
  tag: string;
  value: string;
}

export interface WriteDataParams {
  targetFacility: string;
  tagName: string;
  value: boolean | string | number;
}

export interface SmartConnectorWriteTag {
  WRITE_ID: string;
  DEVICE_ID: string;
  TAG_ID: string;
  TAG_VALUE: string;
  COUNT: number;
}

export interface Tag {
  NODE_ID: string;
  CHANNEL: string;
  DEVICE: string;
  TAGGROUP: string;
  TAG_NAME: string;
  DESCRIPTION: string;
  DATA_TYPE: string;
  ADDRESS: string;
  SUBSCRIPTION: boolean;
  INPUT_TYPE: string;
  EQ_CODE: string;
}

// JSON 파일 읽기
const loadTags = async (filePath: string) => {
  const data = await fs.readFile(filePath, 'utf8');
  return data;
};

const smartConnectorStatusIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5;

export const asciiToWord = (value: string): number => {
  // 2글자 이상이면 앞 2글자만 사용
  // 0글자이면 0 반환
  // 1글자이면 첫 번째 글자의 아스키 코드 값을 반환
  if (value.length > 2) {
    value = value.substring(0, 2);
  }
  if (value.length === 0) return 0;

  const low = value.charCodeAt(0);
  const high = value.length > 1 ? value.charCodeAt(1) : 0;

  return low | (high << 8);
};

export const wordToAscii = (value: number): string => {
  if (value < 0 || value > 0xffff) {
    return '';
  }
  if (value === 0) return '';
  const low = value & 0xff;
  const high = (value >> 8) & 0xff;

  let result = String.fromCharCode(low);
  if (high !== 0) {
    result += String.fromCharCode(high);
  }
  return result;
};

export const useSmartConnectorUtils = () => {
  const redisUtil = useRedisUtil();

  /**
   * smartConnector 초기 태그 데이터 초기화
   * @returns void
   * @example
   * await useSmartConnectorUtils().initTagData();
   */
  const initTagData = async () => {
    const allTagsStringData = await loadTags(path.join(__dirname, '../../plcTagInfo.json'));
    const allTags: Tag[] = JSON.parse(allTagsStringData)[process.env.SITE || 'MBS'];
    // tagMap 초기화
    smartConnector.tagMap.clear();
    // 각 태그에 대해 Map 엔트리 생성
    allTags.forEach((tag: Tag) => {
      const key = `${tag.EQ_CODE}.${tag.TAG_NAME}`;
      smartConnector.tagMap.set(key, {
        value: '',
        prevValue: '',
        timestamp: Date.now(),
        createTime: timestampToDate(process.env.TIME_ZONE || ''),
        quality: 'unknown',
        reRegister: '',
        CHANNEL: tag.CHANNEL,
        DEVICE: tag.DEVICE,
        TAGGROUP: tag.TAGGROUP,
        TAG_NAME: tag.TAG_NAME,
        DATA_TYPE: tag.DATA_TYPE,
        INPUT_TYPE: tag.INPUT_TYPE,
        NODE_ID: tag.NODE_ID,
        EQ_CODE: tag.EQ_CODE,
      });
    });
  };

  /**
   * smartConnector 초기화
   * @returns void
   * @example
   * await useSmartConnectorUtils().initSmartConnector();
   */
  const initSmartConnector = async () => {
    // Smart Connector Events 초기화
    initializeSmartConnectorEventsHandlers();
  };

  /**
   * smartConnector 태그 데이터 모니터링
   * @returns void
   * @example
   * await useSmartConnectorUtils().monitorTagData();
   */
  const monitorTagData = async () => {
    while (true) {
      const startTime = Date.now();
      try {
        // redis key: MCS_plc_realtime_data:${facilityName}
        // 여기서 facilityName을 가져오기
        const plcRealtimeData = await redisUtil.keys(`${RedisKeys.PlcRealtimeData}:*`);
        if (!plcRealtimeData || plcRealtimeData.length === 0) {
          logging.ACTION_ERROR({
            filename: 'smartConnectorUtils.ts-monitorTagData',
            params: { plcRealtimeData },
            result: null,
            error: new Error('plcRealtimeData is not found'),
          });
          throw new Error('plcRealtimeData is not found');
        }
        const suffixes = plcRealtimeData.map((k) => k.split(':')[1]); // 콜론 뒤만 추출

        suffixes.forEach(async (facilityName) => {
          const data = await getPlcRealtimeAllTagsDataFromRedis(facilityName);
          if (!data) {
            logging.ACTION_ERROR({
              filename: 'smartConnectorUtils.ts-monitorTagData',
              params: { facilityName },
              result: null,
              error: new Error('data is not found for facilityName: ' + facilityName),
            });
            throw new Error('data is not found for facilityName: ' + facilityName);
          }
          sendMqtt(`${MqttTopics.PLCStatus}/${facilityName}`, JSON.stringify(data));
        });
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'smartConnectorUtils.ts-monitorTagData',
          params: null,
          result: null,
          error: new Error('Error monitoring smartConnector tag data: ' + (error as Error).message),
        });
      }

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, smartConnectorStatusIntervalTime * 1000 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  /**
   * 레디스에서 특정 설비의 전체 태그 데이터를 가져옴
   * @param facilityName 설비 이름
   * @returns 태그 데이터 (object | null)
   * @example
   * const data = await getPlcRealtimeAllTagsDataFromRedis('BM3I');
   */
  const getPlcRealtimeAllTagsDataFromRedis = async (
    facilityName: string
  ): Promise<{ [key: string]: boolean | number | string } | null> => {
    const redisKey = `${RedisKeys.PlcRealtimeData}:${facilityName}`;
    const data = await redisUtil.hGetPlcAllTags(redisKey);
    if (!data) return null;
    const dataObject = Object.entries(data).reduce(
      (acc, [key, value]) => {
        const tagMapValue = smartConnector.tagMap.get(`${facilityName}.${key}`);
        if (!tagMapValue) {
          logging.ACTION_ERROR({
            filename: 'smartConnectorUtils.ts-getPlcRealtimeAllTagsDataFromRedis',
            params: { facilityName, key },
            result: null,
            error: new Error('tagMapValue is not found for key: ' + key),
          });
          return acc;
        }
        switch (tagMapValue.DATA_TYPE) {
          case 'Boolean':
            acc[key] = value === 'true' ? true : false;
            break;
          case 'Int16':
            acc[key] = Number(value);
            break;
          case 'String':
            acc[key] = value;
            break;
          default:
            logging.ACTION_ERROR({
              filename: 'smartConnectorUtils.ts-getPlcRealtimeAllTagsDataFromRedis',
              params: { facilityName, key },
              result: null,
              error: new Error('tagMapValue data type is not valid: ' + tagMapValue.DATA_TYPE),
            });
            break;
        }
        return acc;
      },
      {} as { [key: string]: boolean | number | string }
    );
    return dataObject;
  };

  /**
   * 레디스에서 특정 설비의 특정 태그 데이터를 가져옴
   * @param facilityName 설비 이름
   * @param tag 태그 이름
   * @returns 값 (string | null)
   * @example
   * const data = await getPlcRealtimeDataFromRedisByTag('BM3I', 'Call_Request');
   */
  const getPlcRealtimeTagDataFromRedis = async (facilityName: string, tag: string): Promise<string | null> => {
    const redisKey = `${RedisKeys.PlcRealtimeData}:${facilityName}`;
    const data = await redisUtil.hGetPlcTag(redisKey, tag);
    if (!data) return null;
    return data;
  };

  /**
   * smartConnector를 통해 특정 설비의 여러 태그 데이터 쓰기.
   * frontend api용 함수
   * @param messages 태그 데이터 배열
   * @example
   * await setTagDataArrayToSmartConnector([
   *   {
   *     facilityName: 'BM3I',
   *     tag: 'Call_Response',
   *     value: '1',
   *   },
   *   {
   *     facilityName: 'BM3I',
   *     tag: 'Call_Response',
   *     value: '1',
   *   },
   * ]);
   */
  const setTagDataArrayToSmartConnector = async (messages: SendSmartConnectorMqttMessage[]) => {
    for (const message of messages) {
      const topic = `smartConnector/${message.facilityName}/control/request`;
      const tagMapValue = smartConnector.tagMap.get(`${message.facilityName}.${message.tag}`);
      if (!tagMapValue) {
        logging.ACTION_ERROR({
          filename: 'smartConnectorUtils.ts-setTagDataArrayToSmartConnector',
          params: { facilityName: message.facilityName, tag: message.tag },
          result: null,
          error: new Error('tagMapValue is not found for key: ' + message.tag),
        });
        continue;
      }
      if (tagMapValue.DATA_TYPE === 'String') {
        message.value = asciiToWord(message.value).toString();
      }
      const sendMessage: SmartConnectorWriteTag = {
        WRITE_ID: uuidv4(),
        DEVICE_ID: message.facilityName,
        TAG_ID: message.tag,
        TAG_VALUE: message.value,
        COUNT: 0,
      };

      const sendMessageString = JSON.stringify(sendMessage);
      redisUtil.hset(RedisKeys.SmartConnectorWriteTag, sendMessage.WRITE_ID, sendMessageString);
      sendMqttToSmartConnector(topic, sendMessageString);
    }
  };

  /**
   * smartConnector를 통해 특정 설비의 특정 태그 데이터 쓰기.
   * @param params 태그 데이터 객체
   * @example
   * await setTagDataToSmartConnector({
   *   facilityName: 'BM3I',
   *   tagName: 'Call_Response',
   *   value: '1',
   * });
   */
  const setTagDataToSmartConnector = async (params: WriteDataParams) => {
    const topic = `smartConnector/${params.targetFacility}/control/request`;
    const sendMessage: SmartConnectorWriteTag = {
      WRITE_ID: uuidv4(),
      DEVICE_ID: params.targetFacility,
      TAG_ID: params.tagName,
      TAG_VALUE: params.value.toString(),
      COUNT: 0,
    };
    const sendMessageString = JSON.stringify(sendMessage);
    redisUtil.hset(RedisKeys.SmartConnectorWriteTag, sendMessage.WRITE_ID, sendMessageString);
    sendMqttToSmartConnector(topic, sendMessageString);
  };
  return {
    getPlcRealtimeAllTagsDataFromRedis,
    getPlcRealtimeTagDataFromRedis,
    setTagDataArrayToSmartConnector,
    setTagDataToSmartConnector,
    initTagData,
    initSmartConnector,
    monitorTagData,
  };
};
