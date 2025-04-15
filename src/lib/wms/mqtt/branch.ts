import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/ack"

const systemTopic = 'BRANCH'

const branchInfoRep = (wmsName: string, messageMessage: mbsMqttMesaage) => {
  console.log('catch wms BranchInfoRep')

  setReceivedAckCommand(systemTopic, wmsName, messageMessage)
}

const ackBranchInfoReq = (wmsName: string) => {
  console.log('catch wms AckBranchInfoReq')
}


export const wmsBranch = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'BRANCH_INFO_REP') {
    branchInfoRep(wmsName,messageJson)
  } else if (subject === 'ACK_BRANCH_INFO_REQ') {
    ackBranchInfoReq(wmsName)
  }
}