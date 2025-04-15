import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'PORT'

const portPresenceStatust = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsPortPresenceStatust')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const ackReqPortStateList = (wmsName: string) => {
  console.log('catch wmsAckReqPortStateList')
}


export const wmsPort = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PORT_PRESENCE_STATUS') {
    portPresenceStatust(wmsName, messageJson)
  } else if (subject === 'ACK_REQ_PORT_STATE_LIST') {
    ackReqPortStateList(wmsName)
  }
}