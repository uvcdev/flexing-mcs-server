import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'CRANE'

const craneActive = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms CraneActive')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const craneIdle = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms CraneIdle')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const ackForkActive = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms CraneIdle')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

export const wmsCrane = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CRANE_ACTIVE') {
    craneActive(wmsName, messageJson)
  } else if (subject === 'CRANE_IDLE') {
    craneIdle(wmsName, messageJson)
  } else if (subject === 'FORK_ACITIVE') {
    ackForkActive(wmsName, messageJson)
  }
}