import { separateMqttMessage, MbsMqttMessage } from '../mqttUtil';

const ackMissionCommand = (acsName: string) => {
  console.log('catch acs ackMissionCommand');
};

export const acsAckMissionCommand = (acsName: string, messageJson: MbsMqttMessage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    ackMissionCommand(acsName);
  }
};
