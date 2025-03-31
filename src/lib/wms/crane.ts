import { separateMqttMessage, mbsMqttMesaage } from "../mqttUtil"

const craneActive = (wmsName: string) => {
  console.log('catch wms CraneActive')
}

const craneIdle = (wmsName: string) => {
  console.log('catch wms CraneIdle')
}


export const wmsCrane = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CRANE_ACTIVE') {
    craneActive(wmsName)
  } else if (subject === 'CRANE_IDLE') {
    craneIdle(wmsName)
  }
}