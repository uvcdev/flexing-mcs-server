import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'ALARM'

const alarmReport = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms AlarmReport')

  const callId: string = 'TODO ALARM CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const alarmClear = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms AlarmClear')

  const callId: string = 'TODO ALARM CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}


export const wmsAlarm = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    alarmReport(wmsName, messageJson)
  } else if (subject === 'ALARM_CLEAR') {
    alarmClear(wmsName, messageJson)
  }
}