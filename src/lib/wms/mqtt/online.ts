import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'ONLINE'

const online = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms online')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}


export const wmsOnline = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'WMS_ONLINE') {
    online(wmsName, messageJson)
  } else {

  }
}