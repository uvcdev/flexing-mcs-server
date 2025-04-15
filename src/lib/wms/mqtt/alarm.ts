import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'ALARM'

const alarmReport = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms AlarmReport')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const alarmClear = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms AlarmClear')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}


export const wmsAlarm = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    alarmReport(wmsName, messageJson)
  } else if (subject === 'ALARM_CLEAR') {
    alarmClear(wmsName, messageJson)
  }
}