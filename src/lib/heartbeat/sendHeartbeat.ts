import { makeMbsMqttHeader, sendMqtt, sendMbsMqtt, mbsMqttBody, mbsMqttHeader } from "../mqttUtil";
import { generateUUIDNode } from "../hashUtil"
import { formatDetailedDateTime } from "../usefullToolUtil";
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { HeartbeatInfo, heartbeatSystemList } from "../redis/init";
import { logging } from "../logging";


const redisUtil = useRedisUtil();

// MBS 형식의 Heartbeat
const sendMcsHeartbeat = () => {
  const topic = 'HEARTBEAT'

  const mqttHeader = makeMbsMqttHeader('HEARTBEAT')
  // mqtt Body의 Cmd_Id는 변경 가능성 높음
  const mqttBody: mbsMqttBody = {
    Cmd_Id: mqttHeader.id
  }

  // mcs heartbeat 업데이트
  const heartbeatData: HeartbeatInfo = {
    systemName: 'MCS',
    state: 'connection',
    time: mqttHeader.time,
  }
  redisUtil.hset(RedisKeys.Heartbeat, 'MCS', JSON.stringify(heartbeatData))

  sendMbsMqtt(topic, mqttHeader, mqttBody)
}

// 통합 Heartbeat ( mcs, kepware , wms )
const sendSystemHeartbeat = async () => {
  try {
    for (let i = 0; i < heartbeatSystemList.length; i++) {
      const systemName = heartbeatSystemList[i];
      const systemHeartbeatInfo = await redisUtil.hgetObject<HeartbeatInfo>(
        RedisKeys.Heartbeat,
        `${systemName}`
      ) || {};
      sendMqtt(`heartbeat/${systemName}`, JSON.stringify(systemHeartbeatInfo))
    }

  } catch (error) {
    logging.ACTION_INFO
  }
}

export const sendAllHeartbeat = async () => {
  sendMcsHeartbeat()
  await sendSystemHeartbeat()
}