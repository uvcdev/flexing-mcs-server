import { WmsCommandSetting } from "../../models/common/setting";
import { EqpCallStats } from "../callRemoveUtil";
import { generateUUIDNode } from "../hashUtil";
import { logging } from "../logging";
import { makeMbsMqttHeader, MbsMqttBody, MbsMqttMesaage, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, RedisSettingKeys, useRedisUtil } from "../redisUtil";
import { formatDetailedDateTime, isCurrentTimeFasterThanAnyMinutes } from "../usefullToolUtil";
import { setRemainingAckCommand } from "./wmsAck";
import { CallInfoBody } from "./wmsCallInfo";

const redisUtil = useRedisUtil();

const WmsWaitTimeSettingDefaultValue = {
  retryWaitTimeMinutes: 5
}


export interface AbortedCommandForRetryInfo {
  subjectCmdId: string;
  systemName: string;
  messageTopic: string;
  messageSubject: string;
  createdTime: string;
  message: MbsMqttMesaage;
}

export interface RecentCallInfo {
  cmdId: string;
  transferId: string | null;
  callId: string;
  callType: string;
  callQuantity: string;
  callPriority: string;
  caller: string;
  port?: string | null;
}

export interface CancelCallInfo {
  Cmd_ID?: string;
  Call_ID: string;
  Call_Quantity: number;
  systemName?: string;
}

export const setAbortedCommandForRetry = (systemName: string, subject: string, messageTopic: string, mqttMessage: MbsMqttMesaage) => {
  const newMqttBody = { ...mqttMessage.body };
  newMqttBody.Cmd_ID = generateUUIDNode();

  const subjectCmdId = `${subject}-${newMqttBody.Cmd_ID}`

  const newMessage = {
    header: mqttMessage.header,
    body: newMqttBody
  }

  const abortedCommandForRetryInfo: AbortedCommandForRetryInfo = {
    subjectCmdId: subjectCmdId,
    systemName: systemName,
    messageTopic: messageTopic,
    messageSubject: subject,
    createdTime: formatDetailedDateTime(new Date()),
    message: newMessage
  }

  redisUtil.hset(RedisKeys.AbortedCommandForRetryBySubjectCmdId, subjectCmdId, JSON.stringify(abortedCommandForRetryInfo))
}

export const deleteAbortedCommandForRetry = (subjectCmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  redisUtil.hdel(RedisKeys.AbortedCommandForRetryBySubjectCmdId, subjectCmdId);
}

export const checkAbortedCommandForRetry = async () => {
  const WmsCommandSetting = await redisUtil.hgetObject<WmsCommandSetting>(RedisKeys.Setting, RedisSettingKeys.WmsCommandSetting);
  const retryWaitTimeMinutes = Number(WmsCommandSetting?.data.retryWaitTimeMinutes) || WmsWaitTimeSettingDefaultValue.retryWaitTimeMinutes;
  const abortedCommandForRetryList = await redisUtil.hgetAllObject<AbortedCommandForRetryInfo>(RedisKeys.AbortedCommandForRetryBySubjectCmdId) || [];

  if (abortedCommandForRetryList.length === 0) {
    return
  }

  if (!abortedCommandForRetryList) {
    logging.ACTION_ERROR({
      filename: `wmsCommon.ts - checkAbortedCommandForRetry`,
      error: `[AbortedCommandForRetryList] AbortedCommandForRetryList ${abortedCommandForRetryList} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  for (let i = 0, length = abortedCommandForRetryList.length; i < length; i++) {
    const abortedCommandForRetryInfo = abortedCommandForRetryList[i];
    const abortedCommandForRetryCreatedTime = new Date(abortedCommandForRetryInfo.createdTime);

    // 일정 시간 보다 시간이 더 지난 경우
    if (isCurrentTimeFasterThanAnyMinutes(abortedCommandForRetryCreatedTime, retryWaitTimeMinutes)) {
      const abortedCommandForRetryKey = abortedCommandForRetryInfo.subjectCmdId
      const newMqttHeader = makeMbsMqttHeader(abortedCommandForRetryInfo.messageSubject)
      // 해당 내용 MQTT 재전송
      sendMbsMqtt(abortedCommandForRetryInfo.messageTopic, newMqttHeader, abortedCommandForRetryInfo.message.body, abortedCommandForRetryInfo.systemName);
      // 해당 내용 REDIS 삭제
      deleteAbortedCommandForRetry(abortedCommandForRetryKey)
    }
  }
}

export const setRecentCallInfoTaskByCmdId = (recentCallInfoParams: RecentCallInfo) => {
  const cmdId = recentCallInfoParams.cmdId

  redisUtil.hset(RedisKeys.RecentCallInfoTaskByCmdId, cmdId, JSON.stringify(recentCallInfoParams))
}

export const deleteRecentCallInfoTaskByCmdId = async (cmdId: string) => {
  redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId)
}

// 설비 콜 취소 내용 수신 후 처리 로직
export const checkCancelCall = async () => {
  const cancelCallByCallIdList = await redisUtil.hgetAllObject<EqpCallStats>(RedisKeys.InfoCancelCallByCallId) || []

  for (let i = 0, length = cancelCallByCallIdList.length; i < length; i++) {
    const infoCancelCallByCallId = cancelCallByCallIdList[i];

    const newCancelCallInfoData: CancelCallInfo = {
      Call_ID: infoCancelCallByCallId.CALL_ID,
      Call_Quantity: infoCancelCallByCallId.Call_Quantity || 0,
      systemName: infoCancelCallByCallId.SYSTEM_NAME || 'MW01'
    }

    if (!newCancelCallInfoData.Cmd_ID || newCancelCallInfoData.Cmd_ID === '') {
      newCancelCallInfoData.Cmd_ID = generateUUIDNode()
    }

    await checkCancelCallInfo(newCancelCallInfoData)
  }
}

const checkCancelCallInfo = async (cancelCallInfo: CancelCallInfo) => {
  const callId = cancelCallInfo.Call_ID

  // 진행 중인 CALL INFO 중 해당 CALL INFO가 있는지 확인함
  const infoAckInCallByCallId = await redisUtil.hgetObject<CallInfoBody>(RedisKeys.InfoAckInCallByCallId, callId)
  // 진행 중인 CALL INFO가 있다면 해당 정보로 CancelCall 날림

  // if (infoAckInCallByCallId?.Call_Quantity !== cancelCallInfo.Call_Quantity) {
  //   // 필요한 경우 return 지금은 새로 들어온 값 기준으로 판단
  //   logging.ACTION_DEBUG({
  //     filename: `wmsCommon.ts - checkCancelCallInfo`,
  //     error: `[Call_Quantity] The new value(${cancelCallInfo.Call_Quantity}) does not match the existing value(${infoAckInCallByCallId?.Call_Quantity})`,
  //     params: null,
  //     result: false,
  //   });
  // }

  if (!cancelCallInfo.Cmd_ID) {
    logging.ACTION_ERROR({
      filename: `wmsCommon.ts - checkCancelCallInfo`,
      error: `[Cmd_ID] Cmd_ID ${cancelCallInfo.Cmd_ID} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const systemName = cancelCallInfo.systemName || 'MW01' // 이거 동적으로 바꿔야 함
  const topic = 'CALL'
  const subtopic = 'CANCEL_CALL_INFO'
  const mqttHeader = makeMbsMqttHeader(subtopic)
  const mqttBody: MbsMqttBody = cancelCallInfo

  sendMbsMqtt(topic, mqttHeader, mqttBody, systemName);

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody }, {});

  // InfoCancelCallByCallId 정보 삭제
  redisUtil.hdel(RedisKeys.InfoCancelCallByCallId, cancelCallInfo.Call_ID)
}