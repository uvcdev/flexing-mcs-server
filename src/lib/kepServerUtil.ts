import fs from "fs/promises";
import { DataType, NodeId, AttributeIds, DataValue, ReadValueIdOptions, WriteValueOptions, StatusCode } from 'node-opcua-client';
import { formatWithMilliseconds, logToConsoleAndFile } from './logging';
import opcuaClient from './opcuaUtil';
import { MqttTopics, sendMqtt } from './mqttUtil';
import path from "path";


export interface MonitorTagValue {
  key: string;
  value: boolean | number | string;
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
}

export interface Subscription {
  nodeId: NodeId;
  displayName: string;
  dataType: string;
  channel: string;
  device: string;
  tagGroup: string;
}

// JSON 파일 읽기
export const loadTags = async (filePath: string): Promise<string> => {
  const data = await fs.readFile(filePath, "utf8");
  return data;
};

// WORD 타입 태그에서 ASCII 값을 추출하는 함수
const parseWordToAscii = (value: number): string | number => {
  // 16진수로 해석하기 위해 10진수로 입력된 값을 16진수로 변환
  const hexValue = parseInt(value.toString(), 16);

  if (hexValue < 0 || hexValue > 0xFFFF) {
    throw new Error("Input must be a 2-byte integer (0 ~ 65535)");
  }

  const highByte = (hexValue >> 8) & 0xFF;
  const lowByte = hexValue & 0xFF;

  const highAscii = String.fromCharCode(highByte);
  const lowAscii = String.fromCharCode(lowByte);

  return highAscii + lowAscii;
}

// 태그 쓰는 함수
export async function writeTagsValue(date: WriteValueOptions[]): Promise<StatusCode[]> {
  try {
    const session = opcuaClient.session;
    let statusCodes: StatusCode[] = [];

    if (session) {
      // 태그 값 쓰기
      statusCodes = await session.write(date);
    }
    return statusCodes;
  } catch (error) {
    logToConsoleAndFile(`Error writing value to node: ${date}. Error: ${error}`, "red");
    throw error;
  }
}

// 태그 읽는 함수
export async function readTagsValue(nodeIds: string[]): Promise<DataValue[]> {
  try {
    const session = opcuaClient.session;

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
    throw error;
  }
}

// 전체 노드 읽는 함수
export async function monitorTagData() {
  try {
    const session = opcuaClient.session;

    if (session) {
      while (true) {
        try {
          opcuaClient.allTagNodeIds.forEach(async (value, key) => {
            const result: Record<string, any> = {};

            const readValueIdOptions = value.readValueIdOptions;
            const tagValue = value.tagValue;

            const dataValues = await session.read(readValueIdOptions);

            dataValues.forEach((dataValue, index) => {
              tagValue[index].value = dataValue.value.value;
              result[tagValue[index].key] = tagValue[index].value;
            });

            // 결과 객체 MQTT로 전송
            sendMqtt(`${MqttTopics.KepwareStatus}/${key}`, JSON.stringify(result));
          });


        } catch (readError) {
          console.error("태그 값 읽기 오류:", readError);
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초마다 데이터 가져오기
      }
    }
  } catch (error) {
    logToConsoleAndFile(`Error reading value from node  Error: ${error}`, "red");
    throw error;
  }
}

export async function heartbeat(): Promise<DataValue | null> {
  try {
    const session = opcuaClient.session;

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
    throw error;
  }
}

export async function initTagData() {
  const allTagsStringData = await loadTags(path.join(__dirname, '../../kepserverTag.json'));
  const allTags: Tag[] = JSON.parse(allTagsStringData)['MBS'];

  // tagMap 초기화
  opcuaClient.tagMap.clear();

  // 각 태그에 대해 Map 엔트리 생성
  allTags.forEach((tag: Tag) => {
    const key = tag.TAGGROUP
      ? `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAGGROUP}.${tag.TAG_NAME}`
      : `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAG_NAME}`;

    opcuaClient.tagMap.set(key, {
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
      NODE_ID: tag.NODE_ID
    });

    const monitorKey = tag.TAGGROUP
      ? `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAGGROUP}`
      : `${tag.CHANNEL}.${tag.DEVICE}`;

    if (opcuaClient.allTagNodeIds.has(monitorKey)) {
      // 키가 이미 존재하는 경우, 기존 항목을 업데이트
      const existingEntry = opcuaClient.allTagNodeIds.get(monitorKey);
      if (existingEntry) {
        // readValueIdOptions 배열에 새로운 객체 추가
        existingEntry.readValueIdOptions.push({ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value });

        // 기존 항목에 새로운 TAG_NAME을 키로 추가
        existingEntry.tagValue.push({ key: tag.TAG_NAME, value: "" });
      }
    } else {
      // 키가 존재하지 않는 경우, 새로운 항목 생성
      opcuaClient.allTagNodeIds.set(monitorKey, {
        readValueIdOptions: [{ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value }],
        tagValue: [{ key: tag.TAG_NAME, value: "" }]
      });
    }
  });

}



// 변경된 태그 데이터 값 처리
export function updateTagValue(nodeId: string, value: DataValue): TagValue {

  let targetTagInfo = null;

  if (opcuaClient.tagMap) {
    targetTagInfo = opcuaClient.tagMap.get(nodeId);
  }

  if (!targetTagInfo) {

    const errorMessage = `No Tag found with name: ${nodeId}, ${value}`;
    logToConsoleAndFile(errorMessage, "yellow");
    throw new Error(errorMessage);
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
      logToConsoleAndFile(`Unhandled type for nodeId:: ${nodeId}, ${value}`, "yellow");
      break;
  }

  return targetTagInfo;
}
