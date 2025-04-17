import { separateMqttMessage, MbsMqttMesaage } from "../mqttUtil"
import { sendAckToWms } from "../process/wmsAck";

const topic = 'MISSION_STATE'

export type MissionStateType =
  | 'MISSION_INITIATED'
  | 'AMR_ASSIGNED'
  | 'AMR_ARRIVED'
  | 'AMR_ACQUIRE_STARTED'
  | 'AMR_ACQUIRE_COMPLETED'
  | 'CARRIER_TRANSFERRING'
  | 'AMR_DEPOSIT_STARTED'
  | 'AMR_DEPOSIT_COMPLETED'
  | 'AMR_UNASSIGNED'
  | 'MISSION_COMPLETED'
  | 'MISSION_CANCELED'
  | 'MISSION_FAILED';

export interface MissionState {
  mission: string;
  state: MissionStateType;
  assign: {
    robot: string;
    task: string;
  }
}

export interface AllMissionState {
  missions: MissionState[]
}

export interface MissionCompleted {
  mission: string;
  robot: string;
}

export interface MissionFailed {
  mission: string;
}

const missionState = (acsName: string, messageJson: MbsMqttMesaage) => {
  console.log('catch acs missionState')
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)
  // acs 물류 로그 저장
  // 물류 로그 state 로직 처리 ( canceled or failed 일 때 로직 필요할 듯 )
  // ACK 전송
  const ackBody = {
    mission: messageBody.mission || ''
  }
  sendAckToWms(topic, subject, ackBody, acsName)
}

const allMissionState = (acsName: string) => {
  console.log('catch acs allMissionState')
}

const missionCompleted = (acsName: string, messageJson: MbsMqttMesaage) => {
  console.log('catch acs missionCompleted')
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)
  // acs 물류 로그 저장
  // 작업 완료 처리
  // ACK 전송
  const ackBody = {
    mission: messageBody.mission || ''
  }
  sendAckToWms(topic, subject, ackBody, acsName)
}

const missionFailed = (acsName: string, messageJson: MbsMqttMesaage) => {
  console.log('catch acs missionFailed')
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)
  // acs 물류 로그 저장
  // 작업 완료 처리
  // ACK 전송
  const ackBody = {
    mission: messageBody.mission || ''
  }
  sendAckToWms(topic, subject, ackBody, acsName)
}


export const acsMissionState = (acsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'MISSION_STATE') {
    missionState(acsName, messageJson)
  } else if (subject === 'ALL_MISSION_STATE') {
    allMissionState(acsName)
  } else if (subject === 'MISSION_COMPLETED') {
    missionCompleted(acsName, messageJson)
  } else if (subject === 'MISSION_FAILED') {
    missionFailed(acsName, messageJson)
  }
}