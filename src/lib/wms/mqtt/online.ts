import { separateMqttMessage, MbsMqttMessage } from '../../mqttUtil';
import { setReceivedAckCommand } from '../../process/wmsAck';
import { sendCallInfoList, sendReqPortStateList } from '../../process/wmsSyncronization';

const systemTopic = 'ONLINE';

const online = (wmsName: string, messageMessage: MbsMqttMessage) => {
  console.log('catch wms online');
  const callId = '';
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // WMS Online이 확인 되면 WMS와 동기화 로직 진행
  // 의문점 1 -> 창고 쪽에 있는 데이터로만 맞추는게 맞나 ... ?
  sendReqPortStateList(true);

  // sendCallInfoList();
};

export const wmsOnline = (wmsName: string, messageJson: MbsMqttMessage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'WMS_ONLINE') {
    online(wmsName, messageJson);
  } else {
  }
};
