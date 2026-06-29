import { TagValue, useKepServerUtil } from './kepServerUtil';
import opcuaUtil from './opcuaUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { SendSmartConnectorMqttMessage, useSmartConnectorUtils } from './smartConnectorUtils';
import { initializeSmartConnectorEventsHandlers } from '../events/smartConnectorEventsHandlers';
import { logging } from './logging';
import smartConnector from '../models/smartConnector/smartConnector';
import { FacilityAttributes } from '../models/operation/facility';

export interface PlcWriteDataParams {
  targetFacility: string;
  tagInfo: {
    tagName: string;
    value: boolean | string | number;
  }[];
}

export const usePlcConnectUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const smartConnectorUtils = useSmartConnectorUtils();
  const plcConnType = process.env.PLC_CONN_TYPE || '';

  const getPlcConnType = () => {
    return plcConnType;
  };

  const initTagData = async () => {
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-initTagData',
        params: { plcConnType },
        result: null,
        error: new Error('PLC Connection Type is not set'),
      });
      throw new Error('PLC Connection Type is not set');
    }
    try {
      if (plcConnType === 'KEP') {
        // 초기 태그 데이터 초기화
        await kepServerUtil.initTagData();
      } else if (plcConnType === 'CONNECTOR') {
        await smartConnectorUtils.initTagData();
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-initTagData',
        params: { plcConnType },
        result: null,
        error: new Error('Error initializing tag data: ' + (error as Error).message),
      });
      throw error;
    }
  };

  const initPlcConnection = async () => {
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-initPlcConnection',
        params: { plcConnType },
        result: null,
        error: new Error('PLC Connection Type is not set'),
      });
      throw new Error('PLC Connection Type is not set');
    }
    try {
      if (plcConnType === 'KEP') {
        // NODE-OPCUA <-> KEPServerex 연결 및 초기화
        await opcuaUtil.initKepserverex();
      } else if (plcConnType === 'CONNECTOR') {
        // Smart Connector 초기화
        await smartConnectorUtils.initSmartConnector();
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-initPlcConnection',
        params: { plcConnType },
        result: null,
        error: new Error('Error initializing PLC connection: ' + (error as Error).message),
      });
      throw error;
    }
  };

  const monitorTagData = async () => {
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-monitorTagData',
        params: { plcConnType },
        result: null,
        error: new Error('PLC Connection Type is not set'),
      });
      throw new Error('PLC Connection Type is not set');
    }
    try {
      if (plcConnType === 'KEP') {
        // PLC 데이터 수집 (kepware 상태 불러와서 mqtt 전송)
        await kepServerUtil.monitorTagData();
      } else if (plcConnType === 'CONNECTOR') {
        // PLC 데이터 수집 (smart connector 상태 불러와서 mqtt 전송)
        await smartConnectorUtils.monitorTagData();
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-monitorTagData',
        params: { plcConnType },
        result: null,
        error: new Error('Error monitoring tag data: ' + (error as Error).message),
      });
      throw error;
    }
  };

  /**
   * 태그 쓰는 함수
   * @param params 태그 쓰기 정보
   * @example
   * await writeTagValue({
   *   targetFacility: 'SC11',
   *   tagInfo: [{ tagName: 'Call_Response', value: true }],
   * });
   */
  const writeTagValue = async (params: PlcWriteDataParams) => {
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-writeTagValue',
        params: { plcConnType },
        result: null,
        error: new Error('PLC Connection Type is not set'),
      });
      throw new Error('PLC Connection Type is not set');
    }
    const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
      RedisKeys.InfoFacilityBySerial,
      params.targetFacility
    );
    if (facilityInfo?.isVirtual === true) {
      return;
    }
    try {
      if (plcConnType === 'KEP') {
        const writeDatas = await kepServerUtil.makeWriteDatas({
          targetFacility: params.targetFacility,
          tagInfo: params.tagInfo,
        });
        if (writeDatas.length === 0) {
          logging.ACTION_ERROR({
            filename: 'plcConnectUtil.ts-writeTagValue',
            params: { plcConnType },
            result: null,
            error: new Error('Write datas is empty'),
          });
          return;
        }
        await kepServerUtil.writeTagsValue(writeDatas);
      } else if (plcConnType === 'CONNECTOR') {
        const sendMessage: SendSmartConnectorMqttMessage[] = params.tagInfo.map((tagInfo) => ({
          facilityName: params.targetFacility,
          tag: tagInfo.tagName,
          value: tagInfo.value.toString(),
        }));
        await smartConnectorUtils.setTagDataArrayToSmartConnector(sendMessage);
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-writeTagValue',
        params: { plcConnType },
        result: null,
        error: new Error('Error writing tag value: ' + (error as Error).message),
      });
      throw error;
    }
  };

  /**
   * 여러 태그를 한 번에 읽기 (KEP: OPC UA read 배치, CONNECTOR: Redis 병렬 조회)
   */
  const batchGetTagValue = async (
    targetCode: string,
    tagNames: string[]
  ): Promise<Record<string, boolean | number | string | null>> => {
    const out: Record<string, boolean | number | string | null> = {};
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-batchGetTagValue',
        params: { plcConnType },
        result: null,
        error: 'PLC Connection Type is not set',
      });
      return out;
    }
    const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
      RedisKeys.InfoFacilityBySerial,
      targetCode
    );
    if (facilityInfo?.isVirtual === true) {
      return out;
    }

    const names = tagNames.filter(Boolean);
    if (!targetCode || names.length === 0) {
      return out;
    }
    try {
      if (plcConnType === 'KEP') {
        const targetKey = kepServerUtil.getTargetKey(targetCode);
        await kepServerUtil.updateTagMapValues(targetKey, targetCode, names);
        for (const tagName of names) {
          out[tagName] = (opcuaUtil.tagMap.get(`${targetCode}.${tagName}`)?.value ?? null) as
            | boolean
            | number
            | string
            | null;
        }
        return out;
      }
      if (plcConnType === 'CONNECTOR') {
        await Promise.all(
          names.map(async (tagName) => {
            const data = await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(targetCode, tagName);
            const tagMapValue = smartConnector.tagMap.get(`${targetCode}.${tagName}`);
            if (!tagMapValue) {
              logging.ACTION_ERROR({
                filename: 'plcConnectUtil.ts-batchGetTagValue',
                params: { targetCode, tagName },
                result: null,
                error: 'Tag value is not found',
              });
              out[tagName] = null;
              return;
            }
            switch (tagMapValue.DATA_TYPE) {
              case 'Boolean':
                out[tagName] = data === 'true' ? true : false;
                break;
              case 'UInt16':
                out[tagName] = Number(data);
                break;
              case 'String':
                out[tagName] = data;
                break;
              default:
                logging.ACTION_ERROR({
                  filename: 'plcConnectUtil.ts-batchGetTagValue',
                  params: { targetCode, tagName },
                  result: null,
                  error: `Tag data type is not valid: ${tagMapValue.DATA_TYPE}`,
                });
                out[tagName] = null;
            }
          })
        );
        return out;
      }
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-batchGetTagValue',
        params: { plcConnType },
        result: null,
        error: 'PLC Connection Type is not valid',
      });
      return out;
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-batchGetTagValue',
        params: { targetCode, tagNames: names },
        result: null,
        error: 'Error batch getting tag values: ' + (error as Error).message,
      });
      throw error;
    }
  };

  /**
   * 태그 읽는 함수
   * @param targetCode 설비 코드
   * @param tagName 태그 이름
   * @example
   * const value = await getTagValue('SC11', 'Call_Response');
   */
  const getTagValue = async (targetCode: string, tagName: string): Promise<boolean | number | string | null> => {
    if (!plcConnType) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-getTagValue',
        params: { plcConnType },
        result: null,
        error: 'PLC Connection Type is not set',
      });
      return null;
    }
    const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
      RedisKeys.InfoFacilityBySerial,
      targetCode
    );
    if (facilityInfo?.isVirtual === true) {
      return null;
    }
    try {
      if (plcConnType === 'KEP') {
        if (!targetCode || !tagName) {
          logging.ACTION_ERROR({
            filename: 'plcConnectUtil.ts-getTagValue',
            params: { targetCode, tagName },
            result: null,
            error: 'Target Code or Tag Name is not set',
          });
          return null;
        }
        const targetKey = kepServerUtil.getTargetKey(targetCode);
        await kepServerUtil.updateTagMapValues(targetKey, targetCode, [tagName]);

        return opcuaUtil.tagMap.get(`${targetCode}.${tagName}`)?.value as boolean | number | string | null;
      } else if (plcConnType === 'CONNECTOR') {
        const data = await smartConnectorUtils.getPlcRealtimeTagDataFromRedis(targetCode, tagName);
        // tagMap에서 데이터 타입을 보고 해당 데이터 타입으로 반환해야함
        const tagMapValue = smartConnector.tagMap.get(`${targetCode}.${tagName}`);
        if (!tagMapValue) {
          logging.ACTION_ERROR({
            filename: 'plcConnectUtil.ts-getTagValue',
            params: { targetCode, tagName },
            result: null,
            error: 'Tag value is not found',
          });
          return null;
        }
        switch (tagMapValue.DATA_TYPE) {
          case 'Boolean':
            return data === 'true' ? true : false;
          case 'UInt16':
            return Number(data);
          case 'String':
            return data;
          default:
            logging.ACTION_ERROR({
              filename: 'plcConnectUtil.ts-getTagValue',
              params: { targetCode, tagName },
              result: null,
              error: `Tag data type is not valid: ${tagMapValue.DATA_TYPE}`,
            });
            return null;
        }
      } else {
        logging.ACTION_ERROR({
          filename: 'plcConnectUtil.ts-getTagValue',
          params: { plcConnType },
          result: null,
          error: 'PLC Connection Type is not valid',
        });
        return null;
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'plcConnectUtil.ts-getTagValue',
        params: { targetCode, tagName },
        result: null,
        error: 'Error getting tag value: ' + (error as Error).message,
      });
      throw error;
    }
  };

  return {
    getPlcConnType,
    initTagData,
    initPlcConnection,
    monitorTagData,
    writeTagValue,
    getTagValue,
    batchGetTagValue,
  };
};
