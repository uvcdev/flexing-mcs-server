import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'ONLINE'

const online = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms online')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}


export const wmsOnline = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'WMS_ONLINE') {
    online(wmsName, messageJson)
  } else {
    
  }
}