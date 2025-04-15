import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'CARRIER'

const carrierTransferring = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsCallRequest')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierIdread = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckCallInfo')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierWaitin = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckCancelCallInfo')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierWaitout = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierStored = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierRemoved = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierInstallCompleted = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const carrierRemoveCompleted = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

export const wmsCarrier = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CARRIER_TRANSFERRING') {
    carrierTransferring(wmsName, messageJson)
  } else if (subject === 'CARRIER_IDREAD') {
    carrierIdread(wmsName, messageJson)
  } else if (subject === 'CARRIER_WAITIN') {
    carrierWaitin(wmsName, messageJson)
  } else if (subject === 'CARRIER_WAITOUT') {
    carrierWaitout(wmsName, messageJson)
  } else if (subject === 'CARRIER_STORED') {
    carrierStored(wmsName, messageJson)
  } else if (subject === 'CARRIER_REMOVED') {
    carrierRemoved(wmsName, messageJson)
  } else if (subject === 'CARRIER_INSTALL_COMPLETED') {
    carrierInstallCompleted(wmsName, messageJson)
  } else if (subject === 'CARRIER_REMOVE_COMPLETED') {
    carrierRemoveCompleted(wmsName, messageJson)
  }
}