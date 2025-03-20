import { separateMqttMessage, mbsMqttMesaage } from "../mqttUtil"

const missionState = (acsName: string) => {
  console.log('catch acs AlarmReport')
}

const allMissionState = (acsName: string) => {
  console.log('catch acs AlarmClear')
}

const missionCompleted = (acsName: string) => {
  console.log('catch acs AlarmReport')
}

const missionFailed = (acsName: string) => {
  console.log('catch acs AlarmClear')
}


export const acsMissionState = (acsName: string, messageJson: mbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'MISSION_STATE') {
    missionState(acsName)
  } else if (subject === 'ALL_MISSION_STATE') {
    allMissionState(acsName)
  } else if (subject === 'MISSION_COMPLETED') {
    missionCompleted(acsName)
  } else if (subject === 'MISSION_FAILED') {
    missionFailed(acsName)
  }
}