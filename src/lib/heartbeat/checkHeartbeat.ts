import { HeartbeatInfo } from "../redis/init";
import { RedisKeys, useRedisUtil } from "../redisUtil"
import { formatDetailedDateTime } from "../usefullToolUtil";

const redisUtil = useRedisUtil();
const heartBeatCheckTime = Number(process.env.HEARTBEAT_CHECK_TIME) || 10

export const checkConnectionWmsHeartbeat = (wmsName: string, message: string) => {
  const checkTime = formatDetailedDateTime(new Date());
  // const redisKey = wmsName;
  const redisKey = 'WMS';
  const heartbeatData: HeartbeatInfo = {
    systemName: redisKey,
    state: 'connection',
    time: checkTime,
  }
  redisUtil.hset(RedisKeys.Heartbeat, redisKey, JSON.stringify(heartbeatData))
}

export const checkSystemConnectionStatus = async () => {

  const systemHeartbeatList = await redisUtil.hgetAllObject<HeartbeatInfo>(RedisKeys.Heartbeat) || [];
  console.log("🚀 ~ checkSystemConnectionStatus ~ systemHeartbeatList:", systemHeartbeatList)

  for (let i = 0, length = systemHeartbeatList.length; i < length; i++) {
    const systemHeartbeatInfo = systemHeartbeatList[i];

    const latestTime = new Date(systemHeartbeatInfo.time)
    const currentTime = new Date();
    const timeThreshold = new Date(currentTime.getTime() - 1000 * heartBeatCheckTime);

    let isTimeover = false
    if (latestTime < timeThreshold) {
      isTimeover = true
    }

    if (systemHeartbeatInfo.state === 'connection' && isTimeover) {
      const heartbeatData: HeartbeatInfo = {
        systemName: systemHeartbeatInfo.systemName,
        state: 'disconnection',
        time: formatDetailedDateTime(currentTime),
      }
      redisUtil.hset(RedisKeys.Heartbeat, systemHeartbeatInfo.systemName, JSON.stringify(heartbeatData))
    }
  }
}
