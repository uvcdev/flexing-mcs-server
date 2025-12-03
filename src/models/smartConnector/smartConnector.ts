export interface SmartConnectorWriteTagParams {
  targetFacility: string; // 대상 설비, ex) "BM3I"
  tagName: string; // 태그 이름, ex) "Call_Request"
  value: string; // 값, ex) "1"
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

export const smartConnector = {
  tagMap: new Map<string, TagValue>(),
};

export default smartConnector;
