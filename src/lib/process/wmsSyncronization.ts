import { CheckPortPresenceRequestType, makeMbsMqttHeader, MbsMqttBody, MbsMqttHeader, sendMbsMqtt } from '../mqttUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { setRemainingAckCommand } from './wmsAck';

const wmsName = process.env.WMS_LIST?.split(',')[0];
export interface SendReqPortStateListBody extends MbsMqttBody {
  Cmd_ID: string;
}

export interface SendCallInfoListBody extends MbsMqttBody {
  Cmd_ID: string;
}

export interface CheckPortPresenceListMatchParams {
  cmdId: string;
  mqttHeader: MbsMqttHeader;
  mqttBody: SendReqPortStateListBody;
  checkPortPresenceStatusMatchParams: CheckPortPresenceRequestType | undefined;
}

const redisUtil = useRedisUtil();

export const sendReqPortStateList = (
  isSyncronization: boolean,
  checkPortPresenceStatusMatchParams?: CheckPortPresenceRequestType
) => {
  const topic = 'PORT';
  const subject = 'REQ_PORT_STATE_LIST';

  const mqttHeader = makeMbsMqttHeader(subject);
  // mqtt Body의 Cmd_Id는 변경 가능성 높음
  const mqttBody: SendReqPortStateListBody = {
    Cmd_ID: mqttHeader.id,
  };

  if (!isSyncronization && checkPortPresenceStatusMatchParams) {
    const CheckPortPresenceListMatchParams: CheckPortPresenceListMatchParams = {
      cmdId: mqttBody.Cmd_ID,
      mqttHeader: mqttHeader,
      mqttBody: mqttBody,
      checkPortPresenceStatusMatchParams: checkPortPresenceStatusMatchParams,
    };

    redisUtil.hset(
      RedisKeys.CheckPortPresenceListMatchByCmdId,
      CheckPortPresenceListMatchParams.cmdId,
      JSON.stringify(CheckPortPresenceListMatchParams)
    );
  }

  sendMbsMqtt(topic, mqttHeader, mqttBody, wmsName);
};

export const sendCallInfoList = () => {
  const topic = 'CALL';
  const subject = 'REQ_CALL_INFO_LIST';

  const mqttHeader = makeMbsMqttHeader(subject);
  // mqtt Body의 Cmd_Id는 변경 가능성 높음
  const mqttBody: SendCallInfoListBody = {
    Cmd_ID: mqttHeader.id,
  };

  sendMbsMqtt(topic, mqttHeader, mqttBody, wmsName);

  const systemName = `${process.env.MQTT_WMS_TOPIC || 'MW01'}`;
  // CallInfoList 에 대한 ack 초기값 설정
  setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody });
};
