import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'TRANSFER'

const transferInitiated = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferInitiated')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const transferCancelCompleted = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferCancelCompleted')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const transferAbortCompleted = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferAbortCompleted')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const transferPaused = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferPaused')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const transferResumed = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferResumed')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const transferCompleted = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsTransferCompleted')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

export const wmsTransfer = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'TRANSFER_INITIATED') {
    transferInitiated(wmsName, messageJson)
  } else if (subject === 'TRANSFER_CANCEL_COMPLETED') {
    transferCancelCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_ABORT_COMPLETED') {
    transferAbortCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_PAUSED') {
    transferPaused(wmsName, messageJson)
  } else if (subject === 'TRANSFER_RESUMED') {
    transferResumed(wmsName, messageJson)
  } else if (subject === 'TRANSFER_COMPLETED') {
    transferCompleted(wmsName, messageJson)
  }
}