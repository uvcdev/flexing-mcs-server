import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"

const carrierTransferring = (wmsName: string) => {
  console.log('catch wmsCallRequest')
}

const carrierIdread = (wmsName: string) => {
  console.log('catch wmsAckCallInfo')
}

const carrierWaitin = (wmsName: string) => {
  console.log('catch wmsAckCancelCallInfo')
}

const carrierWaitout = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

const carrierStored = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

const carrierRemoved = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

const carrierInstallCompleted = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

const carrierRemoveCompleted = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

export const wmsCarrier = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CARRIER_TRANSFERRING') {
    carrierTransferring(wmsName)
  } else if (subject === 'CARRIER_IDREAD') {
    carrierIdread(wmsName)
  } else if (subject === 'CARRIER_WAITIN') {
    carrierWaitin(wmsName)
  } else if (subject === 'CARRIER_WAITOUT') {
    carrierWaitout(wmsName)
  } else if (subject === 'CARRIER_STORED') {
    carrierStored(wmsName)
  } else if (subject === 'CARRIER_REMOVED') {
    carrierRemoved(wmsName)
  } else if (subject === 'CARRIER_INSTALL_COMPLETED') {
    carrierInstallCompleted(wmsName)
  } else if (subject === 'CARRIER_REMOVE_COMPLETED') {
    carrierRemoveCompleted(wmsName)
  }
}