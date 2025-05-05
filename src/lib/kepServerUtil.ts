import fs from "fs/promises";
import { NodeId, AttributeIds, DataValue, ReadValueIdOptions, WriteValueOptions, StatusCode } from 'node-opcua-client';
import { logging, logToConsoleAndFile } from './logging';
import opcuaUtil from './opcuaUtil';
import { MqttTopics, sendMqtt } from './mqttUtil';
import path from "path";
import { KepwareWriteParams } from "../models/kepware/kepware";
import { RedisKeys, useRedisUtil } from "./redisUtil";
import { FacilityAttributes } from "../models/operation/facility";

export interface MonitorTagValue {
  key: string;
  value: boolean | number | string;
  inputType: string;
}
export interface MonitorTag {
  readValueIdOptions: ReadValueIdOptions[];
  tagValue: MonitorTagValue[];
}
export interface TagValue {
  value: boolean | number | string;
  prevValue: boolean | number | string;
  timestamp: number;
  quality?: string;
  CHANNEL: string;
  DEVICE: string;
  TAGGROUP: string;
  TAG_NAME: string;
  DATA_TYPE: string;
  INPUT_TYPE: string;
  NODE_ID: string;
  EQ_CODE: string;
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

export interface Subscription {
  nodeId: NodeId;
  displayName: string;
  dataType: string;
  channel: string;
  device: string;
  tagGroup: string;
}

export interface MakeWriteDatasParams {
  targetFacility: string;
  tagInfo: {
    tagName: string,
    value: string | boolean
  }[];
}


// ASCII 타입 태그에서 WORD 값을 추출하는 함수
export const parseAsciiToWord = (value: string): number => {
  if (typeof value !== 'string' || value.length !== 2) {
    throw new Error('두 자리 문자열을 입력하세요.');
  }

  const char1 = value.charCodeAt(0); // 첫 번째 문자 (상위 바이트)
  const char2 = value.charCodeAt(1); // 두 번째 문자 (하위 바이트)

  return (char1 << 8) | char2; // 상위 바이트를 왼쪽으로 8비트 이동 후 OR 연산
};

// WORD 타입 태그에서 ASCII 값을 추출하는 함수
export const parseWordToAscii = (value: number): string => {
  if (typeof value !== 'number' || value < 0 || value > 0xFFFF) {
    throw new Error('0 ~ 65535 사이의 정수를 입력하세요.');
  }

  if (value === 0) return '';

  const lowByte = (value >> 8) & 0xFF;  // 반대로!
  const highByte = value & 0xFF;

  const char1 = String.fromCharCode(lowByte);
  const char2 = String.fromCharCode(highByte);
  return char1 + char2;
}
const kepwareStatusIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5

export const useKepServerUtil = () => {
  const redisUtil = useRedisUtil();
  // JSON 파일 읽기
  const loadTags = async (filePath: string) => {
    const data = await fs.readFile(filePath, "utf8");
    return data;
  };

  const getTagMapKey = (nodeId: string) => {

    // nodeId 형식: STACK01.SC11.Call_Request 일때
    const tagMapKey = nodeId.split('.').slice(1, 3).join('.');
    // nodeId 형식: SC.11.Call_Request 일때
    // const parts = nodeId.split('.');
    // const tagMapKey = parts.slice(0, 2).join('') + '.' + parts.slice(2)[0];

    return tagMapKey;
  }

  const getTagCode = (targetKey: string) => {
    // targetKey 형식: STACK01.SC11
    const tagCode = targetKey.split('.')[1];
    // targetKey 형식: SC.11
    // const tagCode = targetKey.split('.').join('');
    return tagCode;
  }

  // 태그 쓰는 함수
  const writeTagsValue = async (data: WriteValueOptions[]): Promise<StatusCode[]> => {
    try {
      const session = opcuaUtil.session;
      let statusCodes: StatusCode[] = [];

      if (session) {
        // 태그 값 쓰기
        statusCodes = await session.write(data);
      }
      logging.KEPWARE_LOG({
        action: 'TAG_WRITE',
        tag: null,
        value: JSON.parse(JSON.stringify(data)),
        message: `writing value from kepServerUtil.writeTagsValue`,
        error: null,
      });
      return statusCodes;
    } catch (error) {
      logToConsoleAndFile(`Error writing value to node: ${data}. Error: ${error}`, "red");
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: data.toString(),
        value: null,
        message: `Error writing value from kepServerUtil.writeTagsValue`,
        error: error,
      });
      throw error;
    }
  }

  // 태그 읽는 함수
  const readTagsValue = async (nodeIds: string[]): Promise<DataValue[]> => {
    try {
      const session = opcuaUtil.session;

      let result: DataValue[] = [];

      const nodesToRead: ReadValueIdOptions[] = nodeIds.map(nodeId => ({
        nodeId,
        attributeId: AttributeIds.Value,
      }));

      if (session) {
        // 태그 값 읽기
        result = await session.read(nodesToRead);
      }
      return result;
    } catch (error) {
      logToConsoleAndFile(`Error reading value from node: ${nodeIds}. Error: ${error}`, "red");
      logging.KEPWARE_ERROR({
        action: 'TAG_READ',
        tag: null,
        value: null,
        message: `Error reading value from kepServerUtil.readTagsValue`,
        error: error,
      });
      throw error;
    }
  }

  // 전체 노드 읽는 함수
  const monitorTagData = async () => {
    while (true) {
      let session = opcuaUtil.session;
      try {
        if (!session) {
          await opcuaUtil.createSession();
          if (!session) continue; // 세션이 없으면 다시 루프
        }

        for (const [key, value] of opcuaUtil.allTagNodeIds.entries()) {
          const result: Record<string, any> = {};
          const readValueIdOptions = value.readValueIdOptions;
          const tagValue = value.tagValue;

          const dataValues = await session.read(readValueIdOptions);

          dataValues.forEach((dataValue, index) => {
            const inputType = tagValue[index].inputType;
            if (inputType === 'ASCII') {
              tagValue[index].value = parseWordToAscii(dataValue.value.value);
            } else {
              tagValue[index].value = dataValue.value.value;
            }
            result[tagValue[index].key] = tagValue[index].value;
          });

          // MQTT로 결과 전송
          sendMqtt(`${MqttTopics.KepwareStatus}/${key}`, JSON.stringify(result));
        }
      } catch (error) {
        logging.MQTT_ERROR({
          title: "Error reading value from kepServerUtil.monitorTagData",
          topic: `${MqttTopics.KepwareStatus}`,
          message: null,
          error: error,
        });

        session = null; // 세션 초기화 (다음 루프에서 재연결 시도)
      }

      await new Promise(resolve => setTimeout(resolve, kepwareStatusIntervalTime * 1000)); // n초 후 반복
    }
  }

  const heartbeat = async (): Promise<DataValue | null> => {
    try {
      const session = opcuaUtil.session;

      let result: DataValue | null = null;

      if (session) {
        // 태그 값 읽기
        result = await session.read({
          nodeId: 'i=2256',
          attributeId: AttributeIds.Value,
        });
        // logToConsoleAndFile(`Successfully read value from node value: ${result.value.value}`, "green");
      }
      return result;
    } catch (error) {
      logToConsoleAndFile(`Error reading value from node: i=2256. Error: ${error}`, "red");
      logging.KEPWARE_ERROR({
        action: 'TAG_READ',
        tag: null,
        value: null,
        message: `Error reading value from kepServerUtil.heartbeat`,
        error: error,
      });
      throw error;
    }
  }

  const initTagData = async () => {
    const allTagsStringData = await loadTags(path.join(__dirname, '../../kepserverTag.json'));
    const allTags: Tag[] = JSON.parse(allTagsStringData)['MBS'];
    // // tagMap 초기화
    opcuaUtil.tagMap.clear();
    // 각 태그에 대해 Map 엔트리 생성
    allTags.forEach((tag: Tag) => {
      const key = `${tag.EQ_CODE}.${tag.TAG_NAME}`;
      opcuaUtil.tagMap.set(key, {
        value: "",
        prevValue: "",
        timestamp: Date.now(),
        quality: "unknown",
        CHANNEL: tag.CHANNEL,
        DEVICE: tag.DEVICE,
        TAGGROUP: tag.TAGGROUP,
        TAG_NAME: tag.TAG_NAME,
        DATA_TYPE: tag.DATA_TYPE,
        INPUT_TYPE: tag.INPUT_TYPE,
        NODE_ID: tag.NODE_ID,
        EQ_CODE: tag.EQ_CODE
      });

      const monitorKey = tag.EQ_CODE;

      if (opcuaUtil.allTagNodeIds.has(monitorKey)) {
        // 키가 이미 존재하는 경우, 기존 항목을 업데이트
        const existingEntry = opcuaUtil.allTagNodeIds.get(monitorKey);
        if (existingEntry) {
          // readValueIdOptions 배열에 새로운 객체 추가
          existingEntry.readValueIdOptions.push({ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value });

          // 기존 항목에 새로운 TAG_NAME을 키로 추가
          existingEntry.tagValue.push({ key: tag.TAG_NAME, value: "", inputType: tag.INPUT_TYPE });
        }
      } else {
        // 키가 존재하지 않는 경우, 새로운 항목 생성
        opcuaUtil.allTagNodeIds.set(monitorKey, {
          readValueIdOptions: [{ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value }],
          tagValue: [{ key: tag.TAG_NAME, value: "", inputType: tag.INPUT_TYPE }],
        });
      }
    });
    logging.KEPWARE_LOG({
      action: 'TAG_SUBSCRIBE',
      tag: JSON.parse(JSON.stringify(allTags)),
      value: null,
      message: `subscribing value from kepServerUtil.initTagData`,
    });
  }

  // 변경된 태그 데이터 값 처리
  const updateTagValue = (nodeId: string, value: DataValue): TagValue => {
    let targetTagInfo = null;

    if (opcuaUtil.tagMap) {
      const tagMapKey = getTagMapKey(nodeId);
      targetTagInfo = opcuaUtil.tagMap.get(tagMapKey);
    }

    if (!targetTagInfo) {
      const errorMessage = `No Tag found with name: ${nodeId}, ${value}`;
      logToConsoleAndFile(errorMessage, "red");
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: null,
        value: null,
        message: `Error writing value from kepServerUtil.updateTagValue`,
        error: errorMessage,
      });
      throw null;
    }

    switch (targetTagInfo.INPUT_TYPE) {
      case "ASCII":
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = parseWordToAscii(value.value.value);
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.quality = value.statusCode.toString();
        break;
      case "DEC":
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = value.value.value;
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.quality = value.statusCode.toString();
        break;
      case "Bool":
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = value.value.value;
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.quality = value.statusCode.toString();
        break;
      default:
        const errorMessage = `Unhandled type for nodeId:: ${nodeId}, ${value}`;
        logToConsoleAndFile(errorMessage, "yellow");
        logging.KEPWARE_ERROR({
          action: 'TAG_SUBSCRIBE',
          tag: null,
          value: null,
          message: `Error subscribing value from kepServerUtil.updateTagValue`,
          error: errorMessage,
        });
        break;
    }

    return targetTagInfo;
  }


  const makeWriteDatas = async (params: MakeWriteDatasParams): Promise<WriteValueOptions[]> => {
    const writeDatas: WriteValueOptions[] = [];
    const tagMap = opcuaUtil.tagMap;
    try {
      const targetFacility = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, params.targetFacility);
      // if (!targetFacility) {
      //   throw new Error(`No facility found with name: ${params.targetFacility}`);
      // }
      // const targetFacilityObject = JSON.parse(targetFacility);
      // TODO: 설비의 코드,시리얼,이름 중 무엇을 사용할지 결정(kepwaretag와 매칭되어야함)
      // // targetFacilityObject.facilityCode = 'SC11' -> targetFacilityCode = 'SC.11'
      // const targetFacilityCode = targetFacilityObject.facilityCode.slice(0, 2) + '.' + targetFacilityObject.facilityCode.slice(2);
      // // targetFacilityObject.serial = 'SC11' -> targetFacilitySerial = 'SC.11'
      // const targetFacilitySerial = targetFacilityObject.serial.slice(0, 2) + '.' + targetFacilityObject.serial.slice(2);
      // const targetFacilityCode = targetFacilityObject.facilityCode;
      // const targetFacilityCode = 'STACK01.LOAD-PORT';
      if (!targetFacility) {
        logging.ACTION_ERROR({
          filename: 'kepServerUtil.ts',
          error: null,
          params: null,
          result: `No facility found with name: ${params.targetFacility}`,
        });
        return [];
      }
      const targetFacilitySerial = targetFacility.serial;
      for (let i = 0, length = params.tagInfo.length; i < length; i++) {
        const tagMapValue = tagMap.get(`${targetFacilitySerial}.${params.tagInfo[i].tagName}`);
        if (tagMapValue) {
          writeDatas.push({
            nodeId: tagMapValue.NODE_ID,
            attributeId: AttributeIds.Value,
            value: {
              value: {
                dataType: tagMapValue.DATA_TYPE,
                value: params.tagInfo[i].value
              }
            }
          });
        }
      }
      return writeDatas;

    } catch (error) {
      logToConsoleAndFile(`Error making write datas from kepServerUtil.makeWriteDatas: ${error}`, "red");
      throw error;
    }
  }


  return {
    writeTagsValue,
    readTagsValue,
    monitorTagData,
    heartbeat,
    initTagData,
    updateTagValue,
    makeWriteDatas,
    getTagCode
  }
}
