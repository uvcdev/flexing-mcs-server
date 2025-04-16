import { WmsAckSetting } from "../../models/common/setting";
import { logging } from "../logging";
import { makeMbsMqttHeader, mbsMqttBody, mbsMqttMesaage, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, RedisSettingKeys, useRedisUtil } from "../redisUtil";
import { isCurrentTimeFasterThanAnySeconds } from "../usefullToolUtil";

const redisUtil = useRedisUtil();

const wmsAckSettingDefaultValue = {
  timeoutTimeSeconds: 30,
  retryCount: 3,
}

export interface RemainingAckCommand {
  cmdId: string;
  count: number;
  time: Date;
  systemTopic: string;       // systemTopic : CALL, PORT ...
  systemName: string;
  message: mbsMqttMesaage;
}

export interface ReceivedAckCommand {
  cmdId: string;
  systemTopic: string;       // systemTopic : CALL, PORT ...
  systemName: string;
  message: mbsMqttMesaage;
}

// wms
export const sendAckToWms = (topic: string, subject: string, ackBody: mbsMqttBody, systemName: string) => {
  const mqttHeader = makeMbsMqttHeader(subject);
  if (systemName) {
    sendMbsMqtt(topic, mqttHeader, ackBody, systemName)
  } else {
    sendMbsMqtt(topic, mqttHeader, ackBody)
  }
}

// Set remainingAckCommand
// MCS에서 WMS으로 보내는 MQTT 정보들에 대한 데이터 관리
export const setRemainingAckCommand = (systemTopic: string, systemName: string, mqttMessage: mbsMqttMesaage) => {
  const cmdId = mqttMessage.body.Cmd_ID || null

  if (!cmdId) {
    logging.ACTION_ERROR({
      filename: 'ack.ts',
      error: `Cmd Id ${cmdId} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const remainingAckCommand: RemainingAckCommand = {
    count: 0,
    time: new Date(),
    cmdId: cmdId,
    systemName: systemName,
    systemTopic: systemTopic,
    message: mqttMessage,
  }

  redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, cmdId, JSON.stringify(remainingAckCommand))
}

// WMS에서 MCS로 들어온 데이터들에 대한 관리
export const setReceivedAckCommand = (systemTopic: string, systemName: string, mqttMessage: mbsMqttMesaage) => {
  const cmdId = mqttMessage.body.Cmd_ID || null

  if (!cmdId) {
    logging.ACTION_ERROR({
      filename: 'ack.ts',
      error: `Cmd Id ${cmdId} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const receivedAckCommand: ReceivedAckCommand = {
    cmdId: cmdId,
    systemName: systemName,
    systemTopic: systemTopic,
    message: mqttMessage,
  }

  redisUtil.hset(RedisKeys.ReceivedAckCommandBySubjectCmdId, cmdId, JSON.stringify(receivedAckCommand))
}

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteRemainingAckCommand = (cmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, cmdId);
}

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteReceivedAckCommand = (cmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.ReceivedAckCommandBySubjectCmdId, cmdId);
}

// ACK를 응답 받지 못한 Command 재전송 로직
// 남아있는 remainingAckCommand 중 setting의 timeoutTimeSeconds 이 지났다면 메세지 재전송
// count가 setting의 retryCount 이상이 되면 알람 발생 ( 알람 발생 후 후처리가 어떻게 될지 논의 필요 )
export const checkRemainingAckCommand = async () => {
  const remainingAckCommandList = await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId) || [];

  const wmsAckSetting = await redisUtil.hgetObject<WmsAckSetting>(RedisKeys.Setting, RedisSettingKeys.WmsAckSetting);
  const ackTimeoutTimeSeconds = Number(wmsAckSetting?.data.timeoutTimeSeconds) || wmsAckSettingDefaultValue.timeoutTimeSeconds;
  const ackRetryCount = wmsAckSetting?.data.retryCount || wmsAckSettingDefaultValue.retryCount;

  for (let i = 0; i < remainingAckCommandList.length; i++) {
    const remainingAckCommand = remainingAckCommandList[i];
    const remainingAckCommandDate = new Date(remainingAckCommand.time)

    // count가 setting의 retryCount 이상인 경우
    if (Number(remainingAckCommand.count) >= ackRetryCount) {
      // 알람 발생

      // TODO-ljk) - 후처리
      // ex => 카운트 1부터 재실행 or 취소 or 삭제 ??
    }

    // 기준 시간보다 오래 유지되고 있는 경우 retry
    if (isCurrentTimeFasterThanAnySeconds(remainingAckCommandDate, ackTimeoutTimeSeconds)) {
      // 기존 정보 redis 의 count, time update
      remainingAckCommand.count++
      remainingAckCommand.time = new Date();

      redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, remainingAckCommand.cmdId, JSON.stringify(remainingAckCommand))
      // MQTT 메세지 재전송
      sendMbsMqtt(remainingAckCommand.systemTopic, remainingAckCommand.message.header, remainingAckCommand.message.body, remainingAckCommand.systemName);
    }
  }
}

// ACK 여부만 보내면 되는 subtopic list
const basicAckSubtopicList = [
  'TRANSFER_INITIATED',
  'TRANSFER_CANCEL_COMPLETED',
  'TRANSFER_ABORT_COMPLETED',
  'TRANSFER_PAUSED',
  'TRANSFER_RESUMED',
  'TRANSFER_COMPLETED',
  'CARRIER_TRANSFERRING',
  'CARRIER_IDREAD',
  'CARRIER_WAITIN',
  'CARRIER_WAITOUT',
  'CARRIER_STORED',
  'CARRIER_REMOVED',
  'CARRIER_INSTALL_COMPLETED',
  'CARRIER_REMOVE_COMPLETED',
  'PORT_PRESENCE_STATUS',
  'CRANE_ACTIVE',
  'CRANE_IDLE',
  'FORK_ACITIVE',
  'BRANCH_INFO_REP',
  'ALARM_REPORT',
  'ALARM_CLEAR',
  'WMS_ONLINE'
]

// 중간 로직을 거치고 나서 보내야 하는 subtopic list
const logicAckSubtopicList = [
  'CALL_REQUEST', 'ACK_CALL_INFO', 'ACK_CANCEL_CALL_INFO', 'ACK_REQ_CALL_INFO_LIST', 'ACK_REQ_PORT_STATE_LIST', 'ACK_BRANCH_INFO_REQ',
]

// ACK 호출을 위한 목록 ( WMS에서 받은 데이터 들에 대한 ACK 호출 )
export const checkReceivedAckCommand = async () => {
  const receivedAckCommandList = await redisUtil.hgetAllObject<ReceivedAckCommand>(RedisKeys.ReceivedAckCommandBySubjectCmdId) || [];

  for (let i = 0; i < receivedAckCommandList.length; i++) {
    const receivedAckCommand = receivedAckCommandList[i];
    const receivedAckCommandSubtopic = receivedAckCommand.message.header.subject
    if (basicAckSubtopicList.includes(receivedAckCommandSubtopic)) {
      basicAckForInterfaceTest(receivedAckCommand, receivedAckCommandSubtopic)
    } else if (logicAckSubtopicList.includes(receivedAckCommandSubtopic)) {

    } else {

    }


  }
}

// interface 테스트 단순 회신을 위한 함수
const basicAckForInterfaceTest = (ackCommand: ReceivedAckCommand, subtopic: string) => {
  if (!ackCommand.message.body.Cmd_ID) {
    return;
  }

  const systemTopic = ackCommand.systemTopic
  const newSubtopic = `ACK_${subtopic}`
  const mqttHeader = makeMbsMqttHeader(newSubtopic)
  const mqttBody: mbsMqttBody = {
    Cmd_ID: ackCommand.message.body.Cmd_ID,
    HCACK: "4"
  }

  console.log('',)
  sendMbsMqtt(systemTopic, mqttHeader, mqttBody, ackCommand.systemName);

  deleteReceivedAckCommand(ackCommand.message.body.Cmd_ID)
}