import { separateMqttMessage, mbsMqttMesaage } from "../../mqttUtil"

const callRequest = (wmsName: string) => {
  console.log('catch wmsCallRequest')
}

const ackCallInfo = (wmsName: string) => {
  console.log('catch wmsAckCallInfo')
  // 창고 콜 정보로 작업 지시나 To 미션 결정지 생성
}

const ackCancelCallInfo = (wmsName: string) => {
  console.log('catch wmsAckCancelCallInfo')
}

const ackReqCallInfoList = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

export const wmsCall = (wmsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CALL_REQUEST') {
    callRequest(wmsName)
  } else if (subject === 'ACK_CALL_INFO') {
    ackCallInfo(wmsName)
  } else if (subject === 'ACK_CANCEL_CALL_INFO') {
    ackCancelCallInfo(wmsName)
  } else if (subject === 'ACK_REQ_CALL_INFO_LIST') {
    ackReqCallInfoList(wmsName)
  }
}