import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'BRANCH'

const branchInfoRep = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms BranchInfoRep')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const ackBranchInfoReq = (wmsName: string) => {
  console.log('catch wms AckBranchInfoReq')
}


export const wmsBranch = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'BRANCH_INFO_REP') {
    branchInfoRep(wmsName, messageJson)
  } else if (subject === 'ACK_BRANCH_INFO_REQ') {
    ackBranchInfoReq(wmsName)
  }
}