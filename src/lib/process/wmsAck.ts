import { WmsCommandSetting } from "../../models/common/setting";
import { TrackingLogRedisUpdateParams } from "../../models/common/trackingLog";
import { logging } from "../logging";
import { makeMbsMqttHeader, MbsMqttBody, MbsMqttMesaage, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, RedisSettingKeys, useRedisUtil } from "../redisUtil";
import { formatDetailedDateTime, isCurrentTimeFasterThanAnyMinutes, isCurrentTimeFasterThanAnySeconds } from "../usefullToolUtil";
import { editTrackingLogRedis } from "./trackingLog";

const redisUtil = useRedisUtil();

const WmsCommandSettingDefaultValue = {
  // timeoutTimeSeconds: 30,     // 재시도 주기 시간  ( 초 )
  timeoutTimeSeconds: 300,     // 재시도 주기 시간  ( 초 )
  retryCount: 3,              // 기본 재시도 알람 기준 횟수
  retryTimeLimit: 60          // 재시도 MAX LIMIT 시간 ( 분 )
}

export interface DeletedData {
  [key: string]: any;
}
export interface RemainingAckCommand {
  subjectCmdId: string;      // [subject]-[Cmc_ID]
  count: number;             // 호출 회수
  alarmStatus: boolean;      // 알람 전송 여부
  createdTime: Date;         // 최초 생성 시간
  updatedTime: Date;         // 업데이트 되는 시간
  systemTopic: string;       // systemTopic : CALL, PORT ...
  systemName: string;
  message: MbsMqttMesaage;
  deletedData?: DeletedData
}

export interface ReceivedAckCommand {
  subjectCmdId: string;      // [subject]-[Cmc_ID]
  callId: string;
  systemTopic: string;       // systemTopic : CALL, PORT ...
  systemName: string;
  message: MbsMqttMesaage;
}

// wms
export const sendAckToWms = (topic: string, subject: string, ackBody: MbsMqttBody, systemName: string) => {
  const mqttHeader = makeMbsMqttHeader(subject);
  if (systemName) {
    sendMbsMqtt(topic, mqttHeader, ackBody, systemName)
  } else {
    sendMbsMqtt(topic, mqttHeader, ackBody)
  }
}

// Set remainingAckCommand
// MCS에서 WMS으로 보내는 MQTT 정보들에 대한 데이터 관리
export const setRemainingAckCommand = (systemTopic: string, systemName: string, mqttMessage: MbsMqttMesaage, deletedData?: DeletedData) => {
  const cmdId = mqttMessage.body.Cmd_ID || null
  const subject = mqttMessage.header.subject || ''

  if (!cmdId) {
    logging.ACTION_ERROR({
      filename: 'wmsAck.ts',
      error: `Cmd Id ${cmdId} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  if (!subject || subject === '') {
    logging.ACTION_ERROR({
      filename: 'wmsAck.ts',
      error: `Subject ${subject} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const subjectCmdId = `${subject}-${cmdId}`

  const remainingAckCommand: RemainingAckCommand = {
    count: 0,
    alarmStatus: false,
    createdTime: new Date(),
    updatedTime: new Date(),
    subjectCmdId: subjectCmdId,
    systemName: systemName,
    systemTopic: systemTopic,
    message: mqttMessage,
    deletedData: deletedData || {},
  }

  redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId, JSON.stringify(remainingAckCommand))
}

// WMS에서 MCS로 들어온 데이터들에 대한 관리
export const setReceivedAckCommand = (systemTopic: string, systemName: string, callId: string, mqttMessage: MbsMqttMesaage) => {
  const cmdId = mqttMessage.body.Cmd_ID || null
  const subject = mqttMessage.header.subject || ''

  if (!cmdId) {
    logging.ACTION_ERROR({
      filename: 'wmsAck.ts',
      error: `Cmd Id ${cmdId} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  if (!subject || subject === '') {
    logging.ACTION_ERROR({
      filename: 'wmsAck.ts',
      error: `Subject ${subject} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const subjectCmdId = `${subject}-${cmdId}`

  const receivedAckCommand: ReceivedAckCommand = {
    subjectCmdId: subjectCmdId,
    callId: callId,
    systemName: systemName,
    systemTopic: systemTopic,
    message: mqttMessage,
  }

  redisUtil.hset(RedisKeys.ReceivedAckCommandBySubjectCmdId, subjectCmdId, JSON.stringify(receivedAckCommand))
}

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteRemainingAckCommand = (subjectCmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.RemainingAckCommandBySubjectCmdId, subjectCmdId);
}

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteReceivedAckCommand = (subjectCmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.ReceivedAckCommandBySubjectCmdId, subjectCmdId);
}

// ACK를 응답 받지 못한 Command 재전송 로직
// 남아있는 remainingAckCommand 중 setting의 timeoutTimeSeconds 이 지났다면 메세지 재전송
// count가 setting의 retryCount 이상이 되면 알람 발생 ( 알람 발생 후 후처리가 어떻게 될지 논의 필요 )
export const checkRemainingAckCommand = async () => {

  // ACK TEST REDIS 생성용
  // redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, "CALL_INFO-292db679-715f-4aea-a4ae-d5615c5355b2", JSON.stringify({
  //   count: 0,
  //   createdTime: new Date(),
  //   updatedTime: new Date(),
  //   subjectCmdId: "CALL_INFO-292db679-715f-4aea-a4ae-d5615c5355b2",
  //   systemName: "MW01",
  //   systemTopic: "CALL",
  //   message: {
  //     "header": {
  //       "id": "5badb25a-8565-4170-99ea-766fdfca6579",
  //       "time": "2025.04.15 14:11:53:031",
  //       "subject": "CALL_INFO"
  //     },
  //     "body": {
  //       "Cmd_ID": "292db679-715f-4aea-a4ae-d5615c5355b2",
  //       "Call_ID": "MP122025041514300001",
  //       "Call_Type": "N0961",
  //       "Caller": "MP12",
  //       "Call_Quantity": "1",
  //       "Call_Priority": "99"
  //     }
  //   },
  // }))

  const remainingAckCommandList = await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId) || [];

  const WmsCommandSetting = await redisUtil.hgetObject<WmsCommandSetting>(RedisKeys.Setting, RedisSettingKeys.WmsCommandSetting);
  const ackTimeoutTimeSeconds = Number(WmsCommandSetting?.data.timeoutTimeSeconds) || WmsCommandSettingDefaultValue.timeoutTimeSeconds;
  const ackRetryCount = Number(WmsCommandSetting?.data.retryCount) || WmsCommandSettingDefaultValue.retryCount;
  const ackRetryTimeLimit = Number(WmsCommandSetting?.data.retryTimeLimit) || WmsCommandSettingDefaultValue.retryTimeLimit;

  for (let i = 0; i < remainingAckCommandList.length; i++) {
    const remainingAckCommand = remainingAckCommandList[i];
    const remainingAckCommandCreatedDate = new Date(remainingAckCommand.createdTime)
    const remainingAckCommandUpdatedDate = new Date(remainingAckCommand.updatedTime)

    // 생성 시간이 ackRetryTimeLimit 이후라면 해당 레디스 데이터 삭제 후 재전송 없앰
    if (isCurrentTimeFasterThanAnyMinutes(remainingAckCommandCreatedDate, ackRetryTimeLimit)) {
      const remainingAckCommandKey = remainingAckCommand.subjectCmdId

      deleteRemainingAckCommand(remainingAckCommandKey)
    }

    // count가 setting의 retryCount 와 같은 경우 알람 발생
    // count보다 넘어가도 정해진 시간동안 계속 
    if (Number(remainingAckCommand.count) === ackRetryCount + 1 && remainingAckCommand.alarmStatus === false) {
      // 알람 발생 - 알람 발생 => 해당 알람 발생 이후 만약 ack가 들어오면 알람 해제를 해줘야함
      // TODO - 알람 발생 로직 추가
      console.log("알람 발생")

      remainingAckCommand.alarmStatus = true
      redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, remainingAckCommand.subjectCmdId, JSON.stringify(remainingAckCommand))
    }

    // 기준 시간보다 오래 유지되고 있는 경우 retry
    if (isCurrentTimeFasterThanAnySeconds(remainingAckCommandUpdatedDate, ackTimeoutTimeSeconds)) {
      // 기존 정보 redis 의 count, time update

      remainingAckCommand.count++
      remainingAckCommand.updatedTime = new Date();

      remainingAckCommand.message.header.time = formatDetailedDateTime(new Date());

      redisUtil.hset(RedisKeys.RemainingAckCommandBySubjectCmdId, remainingAckCommand.subjectCmdId, JSON.stringify(remainingAckCommand))
      // MQTT 메세지 재전송
      sendMbsMqtt(remainingAckCommand.systemTopic, remainingAckCommand.message.header, remainingAckCommand.message.body, remainingAckCommand.systemName);
    }
  }
}

// ACK 여부만 보내면 되는 subtopic list
const trackingAckSubtopicList = [
  'CALL_REQUEST',
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
  'FORK_ACTIVE',
  'BRANCH_INFO_REP',
  'ALARM_REPORT',
  'ALARM_CLEAR',
]

const systemAckSubtopicList = [
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
    const callId = receivedAckCommand.message.body.Call_ID || ''

    await basicAckForInterfaceTest(receivedAckCommand, receivedAckCommandSubtopic, callId)
  }
}

// interface 테스트 단순 회신을 위한 함수
const basicAckForInterfaceTest = async (ackCommand: ReceivedAckCommand, subtopic: string, callId: string) => {
  if (!ackCommand.message.body.Cmd_ID) {
    return;
  }

  const systemTopic = ackCommand.systemTopic
  const newSubtopic = `ACK_${subtopic}`
  const mqttHeader = makeMbsMqttHeader(newSubtopic)
  const mqttBody: MbsMqttBody = {
    Cmd_ID: ackCommand.message.body.Cmd_ID,
    HCACK: "4"
  }

  const subjectCmdId = `${subtopic}-${ackCommand.message.body.Cmd_ID}`

  sendMbsMqtt(systemTopic, mqttHeader, mqttBody, ackCommand.systemName);

  // 해당 로그에 대한 Item 로깅 추가
  if (trackingAckSubtopicList.includes(subtopic)) {
    const trackingLogSubject = newSubtopic
    const trackingLogDetail = newSubtopic
    const trackingLogState = 'PROCESSING'
    const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
      callId: callId,
      subject: trackingLogSubject,
      detail: trackingLogDetail,
      state: trackingLogState,
      startFacility: null,
      transferId: null,
      destFacility: null,
      assignedRobot: null,
      value: null,
      description: `Call ID ${callId} sent ${newSubtopic} to MCS`
    }
    await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', 'MCS')
  }

  deleteReceivedAckCommand(subjectCmdId)
}