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
  systemTopic: string;
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
export const setAckCommand = (systemTopic: string, systemName: string, mqttMessage: mbsMqttMesaage) => {
  const cmdId = mqttMessage.body.Cmd_Id || null

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

  redisUtil.hset(RedisKeys.RemainingAckCommandByCmdId, cmdId, JSON.stringify(remainingAckCommand))
}

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteAckCommand = (cmdId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.RemainingAckCommandByCmdId, cmdId);
}

// ACK를 응답 받지 못한 Command 재전송 로직
// 남아있는 remainingAckCommand 중 setting의 timeoutTimeSeconds 이 지났다면 메세지 재전송
// count가 setting의 retryCount 이상이 되면 알람 발생 ( 알람 발생 후 후처리가 어떻게 될지 논의 필요 )
export const checkRemainingAckCommand = async () => {
  const remainingAckCommandList = await redisUtil.hgetAllObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandByCmdId) || [];

  const wmsAckSetting = await redisUtil.hgetObject<WmsAckSetting>(RedisKeys.Setting, RedisSettingKeys.WmsAckSetting);
  const ackTimeoutTimeSeconds = wmsAckSetting?.data.timeoutTimeSeconds || wmsAckSettingDefaultValue.timeoutTimeSeconds;
  const ackRetryCount = wmsAckSetting?.data.retryCount || wmsAckSettingDefaultValue.retryCount;

  for (let i = 0; i < remainingAckCommandList.length; i++) {
    const remainingAckCommand = remainingAckCommandList[i];

    // count가 setting의 retryCount 이상인 경우
    if (Number(remainingAckCommand.count) >= ackRetryCount) {
      // 알람 발생

      // TODO-ljk) - 후처리
      // ex => 카운트 1부터 재실행 or 취소 or 삭제 ??
    }

    // 기준 시간보다 오래 유지되고 있는 경우 retry
    if (isCurrentTimeFasterThanAnySeconds(remainingAckCommand.time, ackTimeoutTimeSeconds)) {
      // 기존 정보 redis 의 count, time update
      remainingAckCommand.count++
      remainingAckCommand.time = new Date();

      redisUtil.hset(RedisKeys.RemainingAckCommandByCmdId, remainingAckCommand.cmdId, JSON.stringify(remainingAckCommand))
      // MQTT 메세지 재전송
      sendMbsMqtt(remainingAckCommand.systemTopic, remainingAckCommand.message.header, remainingAckCommand.message.body, remainingAckCommand.systemName);
    }
  }
}