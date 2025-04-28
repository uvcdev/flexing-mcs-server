import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'CARRIER'

const carrierTransferring = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsCallRequest')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierIdread = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckCallInfo')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierWaitin = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckCancelCallInfo')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierWaitout = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierStored = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierRemoved = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierInstallCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierRemoveCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

export const wmsCarrier = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

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