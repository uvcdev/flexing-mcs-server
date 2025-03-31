import { separateMqttMessage, mbsMqttMesaage } from "../mqttUtil"

const branchInfoRep = (wmsName: string) => {
  console.log('catch wms BranchInfoRep')
}

const ackBranchInfoReq = (wmsName: string) => {
  console.log('catch wms AckBranchInfoReq')
}


export const wmsBranch = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'BRANCH_INFO_REP') {
    branchInfoRep(wmsName)
  } else if (subject === 'ACK_BRANCH_INFO_REQ') {
    ackBranchInfoReq(wmsName)
  }
}