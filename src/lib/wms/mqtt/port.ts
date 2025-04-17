import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'PORT'

const portPresenceStatust = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsPortPresenceStatust')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const ackReqPortStateList = (wmsName: string) => {
  console.log('catch wmsAckReqPortStateList')
}


export const wmsPort = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PORT_PRESENCE_STATUS') {
    portPresenceStatust(wmsName, messageJson)
  } else if (subject === 'ACK_REQ_PORT_STATE_LIST') {
    ackReqPortStateList(wmsName)
  }
}