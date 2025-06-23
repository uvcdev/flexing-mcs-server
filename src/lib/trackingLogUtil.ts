import { DetailLogAttributes } from 'models/timescale/detailLog';
import { TrackingLogAttributes } from './../models/common/trackingLog';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { sendMqtt } from './mqttUtil';

const redisUtil = useRedisUtil();

// Type 선언
export interface DetailLogRedisAttributes extends Omit<DetailLogAttributes, 'createdAt'> {
}

export interface TrackingLogRedisAttributes extends Omit<TrackingLogAttributes, 'createdAt' | 'updatedAt' | 'deletedAt'> {
  keyValue: string; // [설비명 + 년월일 +콜 번호]  // ex) BM1O202506190001
  detailLogList: Array<DetailLogRedisAttributes>;
  createdDateTime: string;
  updatedDateTime: string;
}

// Detail Log 데이터 수집 함수 - 저장
export const regDetailLog = () => {

}
// Tracking Log 데이터 수집 함수 - 저장
export const regTrackingLog = () => {
  // Tracking Log 
}

// Tracking Log 데이터 수집 함수
export const getTrackingLog = () => {

}

// Tracking Log 데이터를 ACS에 전송하는 함수
export const sendTrackingLogListMqtt = async () => {
  const trackingLogList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId) || []

  for (let i = 0, length = trackingLogList?.length; i < length; i++) {
    const infoTrackingLogByFacilityCode = trackingLogList[i];

    // KEY ( ex : BM1O202506190001 )
    const trackingLogKeyValue = infoTrackingLogByFacilityCode.keyValue;

    console.log('i', i, 'trackingLogKeyValue', trackingLogKeyValue, 'infoTrackingLogByFacilityCode', infoTrackingLogByFacilityCode)

    sendMqtt(`tracking_log/${trackingLogKeyValue}`, JSON.stringify(infoTrackingLogByFacilityCode))
  }
}

// Tracking Log 데이터 처리 함수