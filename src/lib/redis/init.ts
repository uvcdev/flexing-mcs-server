import { RedisKeys, useRedisUtil } from '../redisUtil';
import { formatDetailedDateTime } from '../usefullToolUtil';
import { service as settingService } from '../../service/common/settingService';
import { service as facilityService } from '../../service/operation/facilityService';

export interface HeartbeatInfo {
  systemName: string;
  state: 'connection' | 'disconnection',
  time: string,
}

export const heartbeatSystemList = process.env.SYSTEM_LIST?.split(',') || []

const redisUtil = useRedisUtil();

const initHeartbeatRedisData = () => {
  // kepware, wms redis 값 초기화

  const checkTime = formatDetailedDateTime(new Date());

  for (let i = 0; i < heartbeatSystemList.length; i++) {
    const redisKey = heartbeatSystemList[i];
    const heartbeatData: HeartbeatInfo = {
      systemName: redisKey,
      state: 'disconnection',
      time: checkTime,
    }
    redisUtil.hset(RedisKeys.Heartbeat, redisKey, JSON.stringify(heartbeatData))
  }
}

export const initAllRedisData = async () => {
  initHeartbeatRedisData()
  await settingService.redisInit()
  await facilityService.writeAllRedis();
}