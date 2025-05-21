import { logging, LogFormat } from '../../lib/logging';
import { InsertedResult, SelectedListResult, UpdatedResult, DeletedResult } from '../../lib/resUtil';
import { KepwareWriteParams } from '../../models/kepware/kepware';
import { useKepServerUtil } from '../../lib/kepServerUtil';
import { AttributeIds, StatusCode, WriteValueOptions } from 'node-opcua-client';
import { opcuaUtil } from '../../lib/opcuaUtil';
import { parseAsciiToWord } from '../../lib/kepServerUtil';
const service = {

  parseValue(value: string, dataType: string): boolean | number | string {
    switch (dataType) {
      case 'Boolean':
        if (value === 'true') return true;
        if (value === 'false') return false;
        // 잘못된 값이 들어왔을 경우, 오류를 발생시키거나, 기본 false로 처리
        return value;
      case 'UInt32':
      case 'Int16':
      case 'UInt16':
        return Number(value);
      case 'Byte':
      case 'SByte':
      case 'Double':
      case 'Float':
      case 'String':
      default:
        return value;
    }
  },

  async write(paramsList: KepwareWriteParams[], logFormat: LogFormat<unknown>): Promise<StatusCode[]> {
    let result: StatusCode[] = [];
    try {
      const writeDatas: WriteValueOptions[] = [];
      const tagMap = opcuaUtil.tagMap;
      for (let i = 0, length = paramsList.length; i < length; i++) {
        const params: KepwareWriteParams = paramsList[i];
        const tagMapValue = tagMap.get(`${params.targetFacility}.${params.tagName}`);
        if (tagMapValue) {
          if (tagMapValue.INPUT_TYPE === 'ASCII') {
            params.value = parseAsciiToWord(params.value).toString();
          }
          writeDatas.push({
            nodeId: tagMapValue.NODE_ID,
            attributeId: AttributeIds.Value,
            value: {
              value: {
                dataType: tagMapValue.DATA_TYPE,
                value: this.parseValue(params.value, tagMapValue.DATA_TYPE),
              },
            },
          });
        }
      }
      console.log("🚀 ~ service ~ writeDatas:", writeDatas)
      result = await useKepServerUtil().writeTagsValue(writeDatas);
      logging.METHOD_ACTION(logFormat, __filename, paramsList, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, paramsList, err);
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
    return new Promise((resolve) => {
      resolve(result);
    });
  }
};

export { service };
