import { separateMqttMessage, MbsMqttMesaage } from "../mqttUtil"

const alarmReport = (acsName: string) => {
  console.log('catch acs alarmReport')
}

const alarmClear = (acsName: string) => {
  console.log('catch acs alarmClear')
}


export const acsAlarmState = (acsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    alarmReport(acsName)
  } else if (subject === 'ALARM_CLEAR') {
    alarmClear(acsName)
  }
}