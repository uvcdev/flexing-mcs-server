import { separateMqttMessage, mbsMqttMesaage } from "../mqttUtil"

const ackMissionCommand = (acsName: string) => {
  console.log('catch acs AlarmReport')
}

export const acsAckMissionCommand = (acsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    ackMissionCommand(acsName)
  }
}