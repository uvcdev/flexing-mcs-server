import { separateMqttMessage, mbsMqttMesaage } from "../mqttUtil"

const payloadState = (acsName: string) => {
  console.log('catch acs AlarmReport')
}


export const acsPayloadState = (acsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PAYLOAD_STATE') {
    payloadState(acsName)
  }
}