import fs from "fs/promises";
import { DataType, NodeId, AttributeIds, DataValue } from 'node-opcua-client';
import { formatWithMilliseconds, logToConsoleAndFile } from './logging';
import opcuaClient from './opcuaUtil';
import { MqttTopics, sendMqtt } from './mqttUtil';

export interface TagInfo {
  KEY: string;
  VALUE: string;
};

export interface Tag {
  TAG_NAME: string;
  DESCRIPTION: string;
  TAG_DEV_INFO: TagInfo[];
  DATA_TYPE: DataType;
  INPUT_TYPE: "PDEC" | "DEC" | "ASCII" | "BIT";
  CHILD_TAGS?: Tag[];
}

export interface TagData {
  tags: Tag[];
};

export interface EqpNode {
  channel: string; 		//	ex) "EQP"
  device: string;  		//	ex) "ST01_PLC01"
  tagGroup: string; 	//	ex) "SC11"
  tagName: string;    //	ex) "EQ_Code_02"
}

export interface DataState {
  [channel: string]: {
    [device: string]: {
      [tagGroup: string]: {
        [tagName: string]: string | number | boolean;
      };
    };
  };
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
export const loadTags = async (filePath: string): Promise<Tag[]> => {
  const data = await fs.readFile(filePath, "utf8");
  const jsonData: TagData = JSON.parse(data);
  return jsonData.tags;
};

// WORD 타입 태그에서 비트 추출하는 함수
export const extractBitsFromWord = (value: number, childTags: Tag[]): Record<string, number | string>[] => {
  let results: Record<string, number | string>[] = [];

  results = childTags.map((tag) => {
    const bitPoint = parseInt(tag.TAG_DEV_INFO.find(info => info.KEY === "BITPOINT")?.VALUE || "0", 10);
    const size = parseInt(tag.TAG_DEV_INFO.find(info => info.KEY === "SIZE")?.VALUE || "0", 10);
    const mask = (1 << size) - 1; // 추출할 비트 크기만큼 마스크 생성
    const extractedValue = (value >> bitPoint) & mask; // 비트를 추출하고 최하위로 정렬

    return {
      tagName: tag.TAG_NAME,
      value: extractedValue
    };
  })

  return results;
};

// WORD 타입 태그에서 ASCII 값을 추출하는 함수수
export const parseWordToAscii = (value: number): string | number => {
  if (value < 0 || value > 0xFFFF) {
    throw new Error("Input must be a 2-byte integer (0 ~ 65535)");
  }

  let highByte = (value >> 8) & 0xFF;
  let lowByte = value & 0xFF;

  if (highByte < 32 || highByte > 126) {
    highByte = 48;
  }
  if (lowByte < 32 || lowByte > 126) {
    lowByte = 48;
  }

  const highAscii = String.fromCharCode(highByte);
  const lowAscii = String.fromCharCode(lowByte);

  return highAscii + lowAscii;
}

// WORD 타입에 정수가 저장되지만 로직에서 string으로 처리해야할때 116(1월16일)을 "0116"으로 파싱하기 위한 함수
export const checkFormatSize = (value: number, tag: Tag): string | number => {

  const size = parseInt(tag.TAG_DEV_INFO.find(info => info.KEY === "SIZE")?.VALUE || "0", 10);

  if (size) {
    return value.toString().padStart(size, '0');
  } else {
    return value;
  }
}

export const printDataState = () => {
  // console.clear();

  console.log("this.dataState : ", formatWithMilliseconds(new Date()), JSON.stringify(opcuaClient.dataState, null, 2)); // JSON 형식으로 출력
}

export const parseNodeId = (nodeId: string): EqpNode | null => {
  const parts = nodeId.split('.');

  // if (parts.length === 4) {
  // 	// tag 그룹이 있는 태그
  // 	return {
  // 		channel: parts[0],
  // 		device: parts[1],
  // 		tagGroup: parts[2],
  // 		tagName: parts[3],
  // 	};
  // } else if (parts.length === 3) {
  // 	// tag 그룹이 없는 태그
  // 	return {
  // 		channel: parts[0],
  // 		device: parts[1],
  // 		tagGroup: null,
  // 		tagName: parts[2],
  // 	};
  // }
  // return null;

  return {
    channel: parts[0],
    device: parts[1],
    tagGroup: parts[2],
    tagName: parts[3],
  };
}

export const initializeDataState = (tagsInfo: Subscription[]): DataState => {

  const dataState: DataState = {};

  tagsInfo.forEach(tag => {
    const { channel, device, tagGroup } = tag;

    // channel 초기화
    if (!dataState[channel]) {
      dataState[channel] = {};
    }

    // device 초기화
    if (!dataState[channel][device]) {
      dataState[channel][device] = {};
    }

    // tagGroup 초기화
    if (!dataState[channel][device][tagGroup]) {
      dataState[channel][device][tagGroup] = {};
    }
  });

  return dataState;
}

// 태그 쓰는 함수
export async function writeTagValue(eqpNode: EqpNode, value: DataType) {
  try {
    const session = opcuaClient.session;
    const tagsInfo = opcuaClient.tagsInfo;
    let statusCode = null;
    let dataType: DataType = 0;
    const nodeId = `ns=2;s=${eqpNode.channel}.${eqpNode.device}.${eqpNode.tagGroup}.${eqpNode.tagName}`;

    if (tagsInfo) {
      const targetItem = tagsInfo.find(tag => tag.TAG_NAME === eqpNode.tagName);
      if (targetItem) {
        dataType = targetItem.DATA_TYPE;
      }
    } else {
      return statusCode = null;
    }

    if (session) {
      logToConsoleAndFile(`Successfully wrote value to node: ${nodeId}, value: ${value}`, "green");
      // 태그 값 쓰기
      statusCode = await session.write({
        nodeId,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: dataType,
            value: value,
          },
        },
      });
    }
    return statusCode;
  } catch (error) {
    logToConsoleAndFile(`Error writing value to node: ${eqpNode.tagName}. Error: ${error}`, "red");
    throw error;
  }
}

// 태그 읽는 함수
export async function readTagValue(eqpNode: EqpNode) {
  try {
    const session = opcuaClient.session;

    let result: DataValue;

    const nodeId = `ns=2;s=${eqpNode.channel}.${eqpNode.device}.${eqpNode.tagGroup}.${eqpNode.tagName}`;

    if (session) {
      // 태그 값 읽기
      result = await session.read({
        nodeId,
        attributeId: AttributeIds.Value,
      });
      logToConsoleAndFile(`Successfully read value from node: ${nodeId}, value: ${result.value}`, "green");
    }
    return { statuscode: result!.statusCode, value: result!.value };
  } catch (error) {
    logToConsoleAndFile(`Error reading value from node: ${eqpNode.tagName}. Error: ${error}`, "red");
    throw error;
  }
}

// 전체 노드 읽는 함수
export async function readTagValues() {
  try {
    const session = opcuaClient.session;

    let result: DataValue;
    // 모니터링 할 노드 목록 불러오기
    const subscriptionNodes = opcuaClient.loadTagsAndCreateSubscriptionNodes();
    console.log("🚀 ~ initKepserverex ~ subscriptionNodes1111:", subscriptionNodes)

    // const nodeId = `ns=2;s=${eqpNode.channel}.${eqpNode.device}.${eqpNode.tagGroup}.${eqpNode.tagName}`;
    if (session) {
      while (true) {
        try {
          for (const node of subscriptionNodes) {
            const dataValue = await session.read({
              nodeId: node.nodeId,
              attributeId: node.attributeId,  // node 객체에서 attributeId 사용
            });
            // console.log(`[${node.nodeId}] 실시간 태그 값: ${dataValue.value.value}`);

            sendMqtt(`${MqttTopics.KepwareStatus}/${node.deviceName}/${node.tagName}`, JSON.stringify(dataValue.value.value));
          }
        } catch (readError) {
          console.error("태그 값 읽기 오류:", readError);
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초마다 데이터 가져오기
      }
    }
    return { statuscode: result!.statusCode, value: result!.value };
  } catch (error) {
    // logToConsoleAndFile(`Error reading value from node: ${eqpNode.tagName}. Error: ${error}`, "red");
    throw error;
  }
}
