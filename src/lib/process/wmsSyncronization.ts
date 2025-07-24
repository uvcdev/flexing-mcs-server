import { makeMbsMqttHeader, MbsMqttBody, sendMbsMqtt } from '../mqttUtil';


const wmsName = (process.env.WMS_LIST)?.split(',')[0]
export interface SendReqPortStateListBody extends MbsMqttBody {
  Cmd_ID: string;
}

export interface SendCallInfoListBody extends MbsMqttBody {
  Cmd_ID: string;
}

export const sendReqPortStateList = () => {
  const topic = 'PORT';
  const subject = 'REQ_PORT_STATE_LIST';

  const mqttHeader = makeMbsMqttHeader(subject);
  // mqtt Body의 Cmd_Id는 변경 가능성 높음
  const mqttBody: SendReqPortStateListBody = {
    Cmd_ID: mqttHeader.id,
  };

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
};
