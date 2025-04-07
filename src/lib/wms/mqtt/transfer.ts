import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"

const subTopic = 'TRANSFER'

const transferInitiated = (wmsName: string) => {
  console.log('catch wmsTransferInitiated')
}

const transferCancelCompleted = (wmsName: string) => {
  console.log('catch wmsTransferCancelCompleted')
}

const transferAbortCompleted = (wmsName: string) => {
  console.log('catch wmsTransferAbortCompleted')
}

const transferPaused = (wmsName: string) => {
  console.log('catch wmsTransferPaused')
}

const transferResumed = (wmsName: string) => {
  console.log('catch wmsTransferResumed')
}

const transferCompleted = (wmsName: string) => {
  console.log('catch wmsTransferCompleted')
}

export const wmsTransfer = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'TRANSFER_INITIATED') {
    transferInitiated(wmsName)
  } else if (subject === 'TRANSFER_CANCEL_COMPLETED') {
    transferCancelCompleted(wmsName)
  } else if (subject === 'TRANSFER_ABORT_COMPLETED') {
    transferAbortCompleted(wmsName)
  } else if (subject === 'TRANSFER_PAUSED') {
    transferPaused(wmsName)
  } else if (subject === 'TRANSFER_RESUMED') {
    transferResumed(wmsName)
  } else if (subject === 'TRANSFER_COMPLETED') {
    transferCompleted(wmsName)
  }
}