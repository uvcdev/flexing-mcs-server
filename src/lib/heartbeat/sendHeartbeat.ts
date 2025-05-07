import { makeMbsMqttHeader, sendMqtt, sendMbsMqtt, MbsMqttBody, MbsMqttHeader } from "../mqttUtil";
import { generateUUIDNode } from "../hashUtil"
import { formatDetailedDateTime } from "../usefullToolUtil";
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { HeartbeatInfo, heartbeatSystemList, KepwareHeartbeatInfo } from "../redis/init";
import { logging } from "../logging";
import { useKepServerUtil } from "../kepServerUtil";
// import { ServerState, ServerStatusDataType } from "node-opcua-types";
// enum ServerState {
//   Running = 0,
//   Failed = 1,
//   NoConfiguration = 2,
//   Suspended = 3,
//   Shutdown = 4,
//   Test = 5,
//   CommunicationFault = 6,
//   Unknown = 7,
//   Invalid = 4294967295
// }

const redisUtil = useRedisUtil();

// MBS 형식의 Heartbeat
const sendMcsHeartbeat = () => {
  const topic = 'HEARTBEAT'

  const mqttHeader = makeMbsMqttHeader(topic)
  // mqtt Body의 Cmd_Id는 변경 가능성 높음
  const mqttBody: MbsMqttBody = {
    Cmd_ID: mqttHeader.id
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

// kepware heartbeat 업데이트
const sendKepwareHeartbeat = async () => {

  const kepwareHeartbeat = await useKepServerUtil().heartbeat();
  // if (kepwareHeartbeat) {
  //   const kepwareHeartbeatValue: ServerStatusDataType = kepwareHeartbeat.value.value;
  //   const kepwareHeartbeatState: ServerState = kepwareHeartbeatValue.state;
  //   if (kepwareHeartbeatValue.currentTime) {
  //     const time = formatDetailedDateTime(kepwareHeartbeatValue.currentTime);
  //     const state = kepwareHeartbeatValue.state;

  //     // kepware heartbeat 업데이트
  //     const heartbeatData: KepwareHeartbeatInfo = {
  //       systemName: 'kepware',
  //       state: kepwareHeartbeatState === ServerState.Running ? 'connection' : 'disconnection',
  //       time: time,
  //       serverState: kepwareHeartbeatState,
  //       startTime: kepwareHeartbeatValue.startTime?.toString() || '',
  //       shutdownReason: kepwareHeartbeatValue.shutdownReason?.toString() || '',
  //     }


  //     redisUtil.hset(RedisKeys.Heartbeat, 'kepware', JSON.stringify(heartbeatData))

  //   }
  // }
}

// acs heartbeat 업데이트
export const sendAcsHeartbeat = (messageJson: any, receiveAt: string) => {


  const acsHeartbeatData: HeartbeatInfo = {
    systemName: 'ACS',
    state: 'connection',
    time: receiveAt,
  }
  redisUtil.hset(RedisKeys.Heartbeat, 'ACS', JSON.stringify(acsHeartbeatData))

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
  await sendKepwareHeartbeat()
  await sendSystemHeartbeat()
}