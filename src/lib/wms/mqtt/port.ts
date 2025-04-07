import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"

const portPresenceStatust = (wmsName: string) => {
  console.log('catch wmsPortPresenceStatust')
}

const ackReqPortStateList = (wmsName: string) => {
  console.log('catch wmsAckReqPortStateList')
}


export const wmsPort = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PORT_PRESENCE_STATUS') {
    portPresenceStatust(wmsName)
  } else if (subject === 'ACK_REQ_PORT_STATE_LIST') {
    ackReqPortStateList(wmsName)
  }
}