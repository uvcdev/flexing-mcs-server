import { separateMqttMessage, MbsMqttMesaage } from "../mqttUtil"

const payloadState = (acsName: string) => {
  console.log('catch acs payloadState')
}


export const acsPayloadState = (acsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PAYLOAD_STATE') {
    payloadState(acsName)
  }
}