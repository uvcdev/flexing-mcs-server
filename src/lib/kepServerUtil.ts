import fs from 'fs/promises';
import fsOrigin from 'fs';
import {
  NodeId,
  AttributeIds,
  DataValue,
  ReadValueIdOptions,
  WriteValueOptions,
  StatusCode,
  DataType,
} from 'node-opcua-client';
import { logging, logToConsoleAndFile } from './logging';
import opcuaUtil from './opcuaUtil';
import { MqttTopics, sendMqtt } from './mqttUtil';
import path from 'path';
import { KepwareWriteParams } from '../models/kepware/kepware';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { FacilityAttributes } from '../models/operation/facility';
import { timestampToDate } from '../lib/usefullToolUtil';
import { usePlcConnectUtil } from './plcConnectUtil';

const timezoneValue = process.env.TIME_ZONE || '';

export interface MonitorTagValue {
  key: string;
  value: boolean | number | string;
  inputType: string;
}
export interface MonitorTag {
  readValueIdOptions: ReadValueIdOptions[];
  tagValue: MonitorTagValue[];
}

export interface TagInfo {
  NODE_ID?: string;
  CHANNEL?: string;
}
export interface TagValue {
  value: boolean | number | string;
  prevValue: boolean | number | string;
  timestamp: number;
  createTime?: string;
  eqpCallId?: string;
  quality?: string;
  reRegister: string;
  CHANNEL: string;
  DEVICE: string;
  TAGGROUP: string;
  TAG_NAME: string;
  DATA_TYPE: string;
  INPUT_TYPE: string;
  NODE_ID: string;
  EQ_CODE: string;
  CALL_ID?: string;
}

interface TagValueJson {
  [key: string]: TagValue[];
}
interface TagsJson {
  [key: string]: Tag[];
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
    tagName: string;
    value: string | boolean | number;
  }[];
}
export interface WriteDataParams {
  targetFacility: string;
  tagName: string;
  value: boolean | string | number;
}

// ASCII → 10진수 Word
export const parseAsciiToDecWord = (value: string): number => {
  const v = value.slice(0, 2);

  let high = 0;
  let low = 0;

  if (v.length === 1) {
    // 'C' → 0x0043
    low = v.charCodeAt(0);
  } else if (v.length === 2) {
    // 'CS' → 0x4353
    high = v.charCodeAt(0);
    low = v.charCodeAt(1);
  }

  return (high << 8) | low;
};

// ASCII → 16진수 Word
export const parseAsciiToHexWord = (value: string): number => {
  if (value.length > 2) {
    value = value.substring(0, 2);
  }
  if (value.length === 0) return 0;

  // const char1 = value.charCodeAt(0); // 첫 번째 문자 (상위 바이트)
  const char1 = value.length > 1 ? value.charCodeAt(0) : 0; // 첫 번째 문자 (상위 바이트)
  const char2 = value.charCodeAt(1); // 두 번째 문자 (하위 바이트)

  const word = (char1 << 8) | char2;

  return parseInt(word.toString(16), 10);
};

// 10진수 Word → ASCII
export const parseDecWordToAscii = (value: number): string => {
  if (value === 0) return '';

  const high = (value >> 8) & 0xff;
  const low = value & 0xff;

  let result = '';
  if (high !== 0) result += String.fromCharCode(high);
  if (low !== 0) result += String.fromCharCode(low);

  return result;
};

// 16진수 Word → ASCII
export const parseHexWordToAscii = (value: number): string => {
  if (typeof value !== 'number' || value < 0 || value > 0xffff) {
    // throw new Error('0 ~ 65535 사이의 정수를 입력하세요.');
    return '';
  }

  if (value === 0) return '';

  // 10진수 숫자를 4자리 문자열로 변환
  const str = value.toString().padStart(4, '0'); // 예: 4350 → "4350"

  // 앞 2자리와 뒤 2자리 추출
  const highHex = str.slice(0, 2); // "43"
  const lowHex = str.slice(2, 4); // "50"

  // 16진수로 해석 후 ASCII 문자 변환
  const char1 = String.fromCharCode(parseInt(highHex, 16)) || ''; // 0x43 → 'C'
  const char2 = String.fromCharCode(parseInt(lowHex, 16)) || ''; // 0x50 → 'P'
  return char1 + char2;
};

// call_type 함축 함수
export const makeCallType = async (value: string): Promise<string> => {
  const plcConnectUtil = usePlcConnectUtil();
  // if (value < 0 || value > 0xFFFF) {
  //   throw new Error('0 ~ 65535 사이의 정수를 입력하세요.');
  // }

  let callType = '';

  const targetCode = value;

  for (let i = 1; i <= 10; i++) {
    const suffix = i < 10 ? `0${i}` : `${i}`;
    const tag = (await plcConnectUtil.getTagValue(targetCode, `Call_Type_${suffix}`)) as string;
    if (tag) {
      callType += tag;
    }
  }
  callType = callType.replace(/[\s]/g, '');

  return callType;
};

const isFacilityStatusTag = (tagName: string): boolean => {
  return (
    tagName === 'EQ_Auto' || tagName === 'EQ_Manual' || tagName === 'Call_Request' || tagName === 'Call_Robot_Assigned'
  );
};
const kepwareStatusIntervalTime = Number(process.env.HEARTBEAT_INTERVAL_TIME) || 5;

export const useKepServerUtil = () => {
  const redisUtil = useRedisUtil();
  const site = process.env.SITE || 'MBS';
  // 필요한 태그 값들 읽어서 tagMap 업데이트 함수
  const updateTagMapValues = async (targetKey: string, targetCode: string, tagNames: string[]) => {
    if (!targetKey || !targetCode) {
      return;
    }
    const tagValues = tagNames.map((tagName) => {
      const tag = opcuaUtil.tagMap.get(`${targetCode}.${tagName}`);
      return tag;
    });

    const needNodeIds = tagValues.map((tag) => tag?.NODE_ID).filter((nodeId): nodeId is string => nodeId !== undefined);

    const readDatas = await readTagsValue(needNodeIds);

    const needKeys = tagValues
      .map((tag) => tag?.TAG_NAME)
      .filter((tagName): tagName is string => tagName !== undefined);

    for (let i = 0; i < needKeys.length; i++) {
      updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
    }
  };

  // JSON 파일 읽기
  const loadTags = async (filePath: string) => {
    const data = await fs.readFile(filePath, 'utf8');
    return data;
  };

  const getTagMapKey = (nodeId: string) => {
    // nodeId 형식: STACK01.SC11.Call_Request 일때
    const tagMapKey = nodeId.split('.').slice(1, 3).join('.');
    // nodeId 형식: SC.11.Call_Request 일때
    // const parts = nodeId.split('.');
    // const tagMapKey = parts.slice(0, 2).join('') + '.' + parts.slice(2)[0];

    return tagMapKey;
  };

  const getTagCode = (targetKey: string) => {
    // targetKey 형식: STACK01.SC11
    const tagCode = targetKey.split('.')[1];
    // targetKey 형식: SC.11
    // const tagCode = targetKey.split('.').join('');
    return tagCode;
  };

  // 태그 쓰는 함수 호출
  const writeSimpleTagValue = async (params: WriteDataParams): Promise<void> => {
    const tagMap = opcuaUtil.tagMap;
    try {
      const targetFacility = await redisUtil.hgetObject<FacilityAttributes>(
        RedisKeys.InfoFacilityBySerial,
        params.targetFacility
      );
      if (!targetFacility) {
        logging.ACTION_ERROR({
          filename: 'kepServerUtil.ts',
          error: null,
          params: null,
          result: `No facility found with name: ${params.targetFacility}`,
        });
        return;
      }
      const targetFacilitySerial = targetFacility.serial;
      const tagMapValue = tagMap.get(`${targetFacilitySerial}.${params.tagName}`);
      if (tagMapValue) {
        const writeDatas = {
          nodeId: tagMapValue.NODE_ID,
          attributeId: AttributeIds.Value,
          value: {
            value: {
              dataType: tagMapValue.DATA_TYPE,
              value: params.value,
            },
          },
        };
        await writeTagValue(writeDatas);
      }
    } catch (error) {
      logToConsoleAndFile(`Error making write datas from kepServerUtil.writeSimpleTagValue: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: null,
        value: null,
        message: `Error making write datas from kepServerUtil.writeSimpleTagValue`,
        error: error,
      });
      return;
    }
  };

  // 태그 쓰는 함수
  const writeTagValue = async (tag: WriteValueOptions): Promise<StatusCode | null> => {
    try {
      const session = opcuaUtil.session;

      if (!session) {
        logging.KEPWARE_ERROR({
          action: 'TAG_WRITE',
          tag: null,
          value: null,
          message: `Error writing value to node: ${tag}. Error: OPC UA 세션이 존재하지 않습니다.`,
          error: new Error('OPC UA 세션이 존재하지 않습니다.'),
        });
        return null;
      }

      const [statusCode] = await session.write([tag]); // 단건도 배열로 전달해야 함

      logging.KEPWARE_LOG({
        action: 'TAG_WRITE',
        tag: null,
        value: JSON.parse(JSON.stringify(tag)),
        message: `writing value from kepServerUtil.writeTagValue`,
        error: null,
      });
      return statusCode;
    } catch (error) {
      logToConsoleAndFile(`Error writing value to node: ${tag}. Error: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: tag.toString(),
        value: null,
        message: `Error writing value from kepServerUtil.writeTagValue`,
        error: error,
      });
      return null;
    }
  };

  // 태그 쓰는 함수
  const writeTagsValue = async (data: WriteValueOptions[]): Promise<StatusCode[]> => {
    try {
      const session = opcuaUtil.session;
      let statusCodes: StatusCode[] = [];

      if (!session) {
        logging.KEPWARE_ERROR({
          action: 'TAG_WRITE',
          tag: null,
          value: null,
          message: `Error writing value to node: ${data}. Error: OPC UA 세션이 존재하지 않습니다.`,
          error: new Error('OPC UA 세션이 존재하지 않습니다.'),
        });
        return [];
      }
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
      logToConsoleAndFile(`Error writing value to node: ${data}. Error: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: data.toString(),
        value: null,
        message: `Error writing value from kepServerUtil.writeTagsValue`,
        error: error,
      });
      return [];
    }
  };

  // 태그 읽는 함수
  const readTagsValue = async (nodeIds: string[]): Promise<DataValue[]> => {
    try {
      const session = opcuaUtil.session;

      let result: DataValue[] = [];

      const nodesToRead: ReadValueIdOptions[] = nodeIds.map((nodeId) => ({
        nodeId,
        attributeId: AttributeIds.Value,
      }));

      if (session) {
        // 태그 값 읽기
        result = await session.read(nodesToRead);
      }
      return result;
    } catch (error) {
      logToConsoleAndFile(`Error reading value from node: ${nodeIds}. Error: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_READ',
        tag: null,
        value: null,
        message: `Error reading value from kepServerUtil.readTagsValue`,
        error: error,
      });
      return [];
    }
  };

  // 전체 노드 읽는 함수
  const monitorTagData = async () => {
    while (true) {
      const startTime = Date.now();
      let session = opcuaUtil.session;
      try {
        if (!session) {
          await opcuaUtil.createSession();
          session = opcuaUtil.session;
        }
        if (!session) continue; // 세션이 없으면 다시 루프
        const safeSession = session; // 별도 변수에 할당

        // await Promise.all(
        //   Array.from(opcuaUtil.allTagNodeIds.entries()).map(async ([key, value]) => {
        //     const result: Record<string, any> = {};
        //     const dataValues = await safeSession.read(value.readValueIdOptions);

        //     dataValues.forEach((dataValue, index) => {
        //       const inputType = value.tagValue[index].inputType;
        //       value.tagValue[index].value =
        //         inputType === "ASCII"
        //           ? parseDecWordToAscii(dataValue.value.value)
        //           : dataValue.value.value;

        //       result[value.tagValue[index].key] = value.tagValue[index].value;
        //     });

        //     await redisUtil.hset(
        //       RedisKeys.InfoPlcBySerial,
        //       key.split('.').pop()?.toString() || '',
        //       JSON.stringify(result)
        //     );
        //     sendMqtt(`${MqttTopics.KepwareStatus}/${key}`, JSON.stringify(result));
        //   })
        // );
        for (const [key, value] of opcuaUtil.allTagNodeIds.entries()) {
          const result: Record<string, any> = {};
          const facilityStatus: Record<string, boolean> = {};
          const readValueIdOptions = value.readValueIdOptions;
          const tagValue = value.tagValue;

          const dataValues = await session.read(readValueIdOptions);

          dataValues.forEach((dataValue, index) => {
            if (dataValue.statusCode.isBad()) {
              logging.KEPWARE_ERROR({
                action: 'TAG_READ',
                tag: null,
                value: null,
                message: `Error reading value from kepServerUtil.monitorTagData`,
                error: dataValue.statusCode.toString() + ' ' + dataValue.value.value,
              });
              return;
            }
            const inputType = tagValue[index].inputType;
            if (inputType === 'ASCII') {
              tagValue[index].value = parseDecWordToAscii(dataValue.value.value);
              // tagValue[index].value = 12532
            } else {
              tagValue[index].value = dataValue.value.value;
              if (isFacilityStatusTag(tagValue[index].key)) {
                facilityStatus[tagValue[index].key] = dataValue.value.value as boolean;
              }
              // if (tagValue[index].value === null) {
              //   return;
              // }
            }
            result[tagValue[index].key] = tagValue[index].value;
          });

          // MQTT로 결과 전송
          // await redisUtil.hset(
          //   RedisKeys.InfoPlcBySerial,
          //   key.split('.').pop()?.toString() || '',
          //   JSON.stringify(result)
          // );
          const redisKey = `${RedisKeys.PlcRealtimeData}:${key}`;
          redisUtil.hSetPlcAllTags(redisKey, result);
          sendMqtt(`${MqttTopics.FacilityStatus}/${key}`, JSON.stringify(facilityStatus));
          sendMqtt(`${MqttTopics.PLCStatus}/${key}`, JSON.stringify(result));
        }
      } catch (error) {
        logging.MQTT_ERROR({
          title: 'Error reading value from kepServerUtil.monitorTagData',
          topic: `${MqttTopics.PLCStatus}`,
          message: null,
          error: error,
        });

        session = null; // 세션 초기화 (다음 루프에서 재연결 시도)
      }

      // await new Promise((resolve) => setTimeout(resolve, kepwareStatusIntervalTime * 1000)); // n초 후 반복

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, kepwareStatusIntervalTime * 1000 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

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
      logToConsoleAndFile(`Error reading value from node: i=2256. Error: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_READ',
        tag: null,
        value: null,
        message: `Error reading value from kepServerUtil.heartbeat`,
        error: error,
      });
      return null;
    }
  };

  const initTagData = async () => {
    const allTagsStringData = await loadTags(path.join(__dirname, '../../plcTagInfo.json'));
    const allTags: Tag[] = JSON.parse(allTagsStringData)[site];
    // // tagMap 초기화
    opcuaUtil.tagMap.clear();
    // 각 태그에 대해 Map 엔트리 생성
    allTags.forEach((tag: Tag) => {
      const key = `${tag.EQ_CODE}.${tag.TAG_NAME}`;
      //   const key = tag.TAGGROUP
      //   ? `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAGGROUP}.${tag.TAG_NAME}`
      //   : `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAG_NAME}`;

      // const monitorKey = tag.TAGGROUP
      //   ? `${tag.CHANNEL}.${tag.DEVICE}.${tag.TAGGROUP}`
      //   : `${tag.CHANNEL}.${tag.DEVICE}`;
      opcuaUtil.tagMap.set(key, {
        value: '',
        prevValue: '',
        timestamp: Date.now(),
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

      const monitorKey = tag.EQ_CODE;

      if (opcuaUtil.allTagNodeIds.has(monitorKey)) {
        // 키가 이미 존재하는 경우, 기존 항목을 업데이트
        const existingEntry = opcuaUtil.allTagNodeIds.get(monitorKey);
        if (existingEntry) {
          // readValueIdOptions 배열에 새로운 객체 추가
          existingEntry.readValueIdOptions.push({ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value });

          // 기존 항목에 새로운 TAG_NAME을 키로 추가
          existingEntry.tagValue.push({ key: tag.TAG_NAME, value: '', inputType: tag.INPUT_TYPE });
        }
      } else {
        // 키가 존재하지 않는 경우, 새로운 항목 생성
        opcuaUtil.allTagNodeIds.set(monitorKey, {
          readValueIdOptions: [{ nodeId: tag.NODE_ID, attributeId: AttributeIds.Value }],
          tagValue: [{ key: tag.TAG_NAME, value: '', inputType: tag.INPUT_TYPE }],
        });
      }
    });
    logging.KEPWARE_LOG({
      action: 'TAG_SUBSCRIBE',
      tag: JSON.parse(JSON.stringify(allTags)),
      value: null,
      message: `subscribing value from kepServerUtil.initTagData`,
    });
  };

  // 변경된 태그 데이터 값 처리
  const updateTagValue = (nodeId: string, value: DataValue): TagValue => {
    let targetTagInfo = null;

    if (opcuaUtil.tagMap) {
      const tagMapKey = getTagMapKey(nodeId);
      targetTagInfo = opcuaUtil.tagMap.get(tagMapKey);
    }

    if (!targetTagInfo) {
      const errorMessage = `No Tag found with name: ${nodeId}, ${value}`;
      logToConsoleAndFile(errorMessage, 'red');
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
      case 'ASCII':
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = parseDecWordToAscii(value.value.value);
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.createTime = timestampToDate(timezoneValue);
        targetTagInfo.quality = value.statusCode.toString();
        break;
      case 'DEC':
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = value.value.value;
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.createTime = timestampToDate(timezoneValue);
        targetTagInfo.quality = value.statusCode.toString();
        break;
      case 'Bool':
        targetTagInfo.prevValue = targetTagInfo.value;
        targetTagInfo.value = value.value.value;
        targetTagInfo.timestamp = value.sourceTimestamp ? value.sourceTimestamp.getTime() : Date.now();
        targetTagInfo.createTime = timestampToDate(timezoneValue);
        targetTagInfo.quality = value.statusCode.toString();
        break;
      default:
        const errorMessage = `Unhandled type for nodeId:: ${nodeId}, ${value}`;
        logToConsoleAndFile(errorMessage, 'yellow');
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
  };

  const makeWriteDatas = async (params: MakeWriteDatasParams): Promise<WriteValueOptions[]> => {
    const writeDatas: WriteValueOptions[] = [];
    const tagMap = opcuaUtil.tagMap;
    try {
      // const targetFacility = await redisUtil.hgetObject<FacilityAttributes>(
      //   RedisKeys.InfoFacilityBySerial,
      //   params.targetFacility
      // );
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
      // if (!targetFacility) {
      //   logging.ACTION_ERROR({
      //     filename: 'kepServerUtil.ts',
      //     error: null,
      //     params: null,
      //     result: `No facility found with name: ${params.targetFacility}`,
      //   });
      //   return [];
      // }
      const targetFacilitySerial = params.targetFacility;
      for (let i = 0, length = params.tagInfo.length; i < length; i++) {
        const tagMapValue = tagMap.get(`${targetFacilitySerial}.${params.tagInfo[i].tagName}`);
        if (tagMapValue) {
          writeDatas.push({
            nodeId: tagMapValue.NODE_ID,
            attributeId: AttributeIds.Value,
            value: {
              value: {
                dataType: tagMapValue.DATA_TYPE,
                value: params.tagInfo[i].value,
              },
            },
          });
        }
      }
      return writeDatas;
    } catch (error) {
      logToConsoleAndFile(`Error making write datas from kepServerUtil.makeWriteDatas: ${error}`, 'red');
      logging.KEPWARE_ERROR({
        action: 'TAG_WRITE',
        tag: null,
        value: null,
        message: `Error making write datas from kepServerUtil.makeWriteDatas`,
        error: error,
      });
      return [];
    }
  };

  const findTagInfo = (device: string, tagName: string): TagInfo | null => {
    const jsonData: TagValueJson = JSON.parse(fsOrigin.readFileSync('plcTagInfo.json', 'utf-8'));
    const tag = jsonData[site].find((t: TagValue) => t.DEVICE === device && t.TAG_NAME === tagName);
    return tag || null;
  };

  const getTargetTag = (device: string, tagName: string): Tag | null => {
    const jsonData: TagsJson = JSON.parse(fsOrigin.readFileSync('plcTagInfo.json', 'utf-8'));
    const tag = jsonData[site].find((t: Tag) => t.DEVICE === device && t.TAG_NAME === tagName);
    return tag || null;
  };

  const getTargetKey = (targetCode: string): string => {
    if (!targetCode) {
      return '';
    }
    const tag = getTargetTag(targetCode, 'Call_Request');

    if (!tag) {
      return '';
    }

    const targetTagInfo: TagValue = {
      value: true,
      prevValue: '',
      timestamp: Date.now(),
      createTime: timestampToDate(timezoneValue),
      CHANNEL: tag?.CHANNEL || '',
      DEVICE: tag?.DEVICE || '',
      TAGGROUP: tag?.TAGGROUP || '',
      TAG_NAME: tag?.TAG_NAME || '',
      DATA_TYPE: tag?.DATA_TYPE || '',
      INPUT_TYPE: tag?.INPUT_TYPE || '',
      NODE_ID: tag?.NODE_ID || '',
      EQ_CODE: tag?.EQ_CODE || '',
      reRegister: '',
    };

    const targetKey = targetTagInfo.TAGGROUP
      ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

    return targetKey;
  };

  return {
    writeSimpleTagValue,
    writeTagsValue,
    readTagsValue,
    monitorTagData,
    heartbeat,
    initTagData,
    updateTagValue,
    makeWriteDatas,
    getTagMapKey,
    getTagCode,
    findTagInfo,
    getTargetKey,
    updateTagMapValues,
  };
};
