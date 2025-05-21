import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { setReceivedAckCommand } from "../../process/wmsAck"

const systemTopic = 'ALARM'

export interface AlarmMessageBody {
  Cmd_ID: string
  TransferID: string
  AlarmID: string
  AlarmText: string
  EQPName: string
  UnitID: string
  CraneID: string
  CraneUnitID: string
}

// AlarmID : AlarmID List 는 다솜 시스템에서 공유할 예정 - 우선 string

const alarmReport = (wmsName: string, suject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms AlarmReport')

  const alarmMessageBody = messageMessage.body as AlarmMessageBody
  const alarmId = alarmMessageBody.AlarmID
  const transferId = alarmMessageBody.TransferID

  const callId: string = 'TODO ALARM CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // 트래킹 로그랑 연결하기 위해서는 transferId 정보 필요
  // 알람 기록 후 레디스에 등록

  // 알람 ID 지정 후 작업 예정

}

const alarmClear = (wmsName: string, suject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms AlarmClear')

  const alarmMessageBody = messageMessage.body as AlarmMessageBody
  const alarmId = alarmMessageBody.AlarmID
  const transferId = alarmMessageBody.TransferID

  const callId: string = 'TODO ALARM CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // 트래킹 로그랑 연결하기 위해서는 transferId 정보 필요
  // 알람 해제 후 레디스에 알람 해제

  // 알람 ID 지정 후 작업 예정
}


export const wmsAlarm = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'ALARM_REPORT') {
    alarmReport(wmsName, subject, messageJson)
  } else if (subject === 'ALARM_CLEAR') {
    alarmClear(wmsName, subject, messageJson)
  }
}