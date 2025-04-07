import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"

const alarmReport = (wmsName: string) => {
  console.log('catch wms AlarmReport')
}

const alarmClear = (wmsName: string) => {
  console.log('catch wms AlarmClear')
}


export const wmsAlarm = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    alarmReport(wmsName)
  } else if (subject === 'ALARM_CLEAR') {
    alarmClear(wmsName)
  }
}