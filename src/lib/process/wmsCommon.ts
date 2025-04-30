import { WmsCommandSetting } from "../../models/common/setting";
import { generateUUIDNode } from "../hashUtil";
import { logging } from "../logging";
import { makeMbsMqttHeader, MbsMqttMesaage, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, RedisSettingKeys, useRedisUtil } from "../redisUtil";
import { formatDetailedDateTime, isCurrentTimeFasterThanAnyMinutes } from "../usefullToolUtil";

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