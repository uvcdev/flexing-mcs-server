import { logging, LogFormat, ActionLog } from '../lib/logging';
import { DetailLogAttributes, DetailLogInsertParams } from 'models/timescale/detailLog';
import { TrackingLogAttributes, TrackingLogFindOrCreatedParams, TrackingLogInsertParams, TrackingLogState, TrackingLogUpdateParams } from './../models/common/trackingLog';
import { dao as trackingLogDao } from '../dao/common/trackingLogDao';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { v4 as uuidv4 } from 'uuid';
import { sendMqtt } from './mqttUtil';
import { detailLogDao } from '../dao/timescale/detailLogDao';
import { LogDurationSetting } from 'models/common/setting';

const redisUtil = useRedisUtil();

// Type 선언
export interface DetailLogRedisAttributes extends Omit<DetailLogAttributes, 'createdAt' | 'id'> {
}

export interface TrackingLogRedisAttributes extends Omit<TrackingLogAttributes, 'createdAt' | 'updatedAt' | 'deletedAt'> {
  detailLogList: Array<DetailLogRedisAttributes>;
  createdDateTime: string;
  updatedDateTime: string;
}

export interface CheckTrackingLogExists {
  eqpCallId: string;
}

export interface RegDetailLogInsertParams extends DetailLogInsertParams {
  trackingLogState?: TrackingLogState | null,
  fromFacility?: string | null,
  toFacility?: string | null,
  assignedRobot?: string | null,
  value?: string | null,
  description?: string | null,
}


// Detail Log 데이터 수집 함수 - 저장
export const regDetailLog = async (params: RegDetailLogInsertParams) => {
  const eqpCallId = params.eqpCallId || ''

  const { trackingLogState, fromFacility, toFacility, assignedRobot, value, description, ...newDetailLogInsertParams } = params

  let trackingLogId = 0

  if (!eqpCallId) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - regDetailLog',
      error: `유효하지 않은 eqpCallId (${eqpCallId}) 값입니다.`,
      params: null,
      result: false,
    });
    return
  }

  // GET Tracking Log 정보
  // Redis Data가 있는 경우
  const trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId);
  let trackingLogDbInfo
  if (trackingLogRedisInfo) {
    trackingLogId = trackingLogRedisInfo.id
  }
  // Redis Data가 없는 경우
  else {
    trackingLogDbInfo = await trackingLogDao.selectInfoByEqpCallId({ eqpCallId: eqpCallId })

    //DB Data 조회
    if (trackingLogDbInfo) {
      trackingLogId = trackingLogDbInfo.id
    }
  }

  const trackingLogInfo: TrackingLogRedisAttributes = (trackingLogRedisInfo || trackingLogDbInfo) as TrackingLogRedisAttributes
  trackingLogInfo.detailLogList = trackingLogRedisInfo?.detailLogList || []

  // Redis와 DB 모두 없는 경우
  if (!trackingLogInfo) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - regDetailLog',
      error: `EqpCallId(${eqpCallId})에 해당하는 Tracking Log를 찾을 수 없습니다.`,
      params: null,
      result: false,
    });
    return
  }

  // Update Tracking Log Data
  const trackingLogUpdateParams: TrackingLogUpdateParams = {
    id: trackingLogId,
    caller: trackingLogInfo.caller,
    eqpCallId: trackingLogInfo.eqpCallId,
    callId: trackingLogInfo.callId,
    itemCode: trackingLogInfo.itemCode,
    subject: newDetailLogInsertParams.topic,
    detail: newDetailLogInsertParams.subject,
    state: trackingLogState ? trackingLogState : trackingLogInfo.state,
    fromFacility: fromFacility ? fromFacility : trackingLogInfo.fromFacility,
    toFacility: toFacility ? toFacility : trackingLogInfo.toFacility,
    assignedRobot: assignedRobot ? assignedRobot : trackingLogInfo.assignedRobot,
    value: value ? value : trackingLogInfo.value,
    description: description ? description : trackingLogInfo.description,
  }

  const trackingLogUpdatedResult = await trackingLogDao.update(trackingLogUpdateParams)

  // Set Detail Log Data
  const detailLogInsertParams: DetailLogInsertParams = {
    ...newDetailLogInsertParams,
    trackingLogId: trackingLogId,
    createdDateTime: new Date().toISOString(),
  }
  await detailLogDao.insert(detailLogInsertParams)

  // Update Redis Data
  const newDetails = [...trackingLogInfo.detailLogList]

  newDetails.push(detailLogInsertParams as DetailLogRedisAttributes)

  const trackingLogRedisData: TrackingLogRedisAttributes = {
    id: trackingLogUpdateParams.id,
    code: trackingLogUpdateParams.code ?? null,
    caller: trackingLogUpdateParams.caller ?? null,
    eqpCallId: trackingLogUpdateParams.eqpCallId ?? null,
    callId: trackingLogUpdateParams.callId ?? null,
    itemCode: trackingLogUpdateParams.itemCode ?? null,
    subject: trackingLogUpdateParams.subject ?? null,
    detail: trackingLogUpdateParams.detail ?? null,
    state: trackingLogUpdateParams.state ?? null,
    fromFacility: trackingLogUpdateParams.fromFacility ?? null,
    toFacility: trackingLogUpdateParams.toFacility ?? null,
    assignedRobot: trackingLogUpdateParams.assignedRobot ?? null,
    value: trackingLogUpdateParams.value ?? null,
    description: trackingLogUpdateParams.description ?? null,
    detailLogList: newDetails,
    createdDateTime: trackingLogInfo.createdDateTime || new Date().toISOString(),
    updatedDateTime: new Date().toISOString()
  }

  await redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId, JSON.stringify(trackingLogRedisData))
}

export const checkTrackingLogExists = async (params: CheckTrackingLogExists): Promise<boolean> => {
  // 1. 이미 있는 데이터 인지 조회 - REDIS
  const paramsEqpCallId = (params.eqpCallId)?.split('$')[0] || '';

  const trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId);

  if (trackingLogRedisInfo) {
    return true;
  }
  // 2. 이미 있는 데이터 인지 조회 - DB
  const trackingLogDbInfo = await trackingLogDao.selectInfoByEqpCallId({ eqpCallId: params.eqpCallId })

  if (trackingLogDbInfo) {
    return true;
  }

  // 없으면 Return
  return false
}

// Tracking Log 데이터 수집 함수 - 저장
export const regTrackingLog = async (params: TrackingLogInsertParams) => {
  // 1. 이미 있는 데이터 인지 조회 - REDIS
  const paramsEqpCallId = (params.eqpCallId)?.split('$')[0] || '';

  const trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId);

  // 이미 레디스에 존재하는 데이터는 생성이 완료 됐던 데이터로 reg 작업을 진행하지 않고 return 한다.
  if (trackingLogRedisInfo) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - regTrackingLog',
      error: `이미 존재하는 EqpCallId(${paramsEqpCallId})로는 작업을 TrackingLog를 생성 할 수 없습니다.`,
      params: null,
      result: false,
    });
    return
  }
  // Tracking Log 
  const trackingLogFindOrCreatedParams = { ...params } as TrackingLogFindOrCreatedParams
  trackingLogFindOrCreatedParams.code = uuidv4()
  trackingLogFindOrCreatedParams.eqpCallId = paramsEqpCallId
  trackingLogFindOrCreatedParams.callId = !paramsEqpCallId.includes('MANUAL') ? (params.callId ? params.callId : paramsEqpCallId.slice(-4)) : null;
  trackingLogFindOrCreatedParams.subject = params.subject || 'CALL_CREATED'
  trackingLogFindOrCreatedParams.detail = params.detail || 'CALL_CREATED'
  trackingLogFindOrCreatedParams.state = params.state || 'PUBLISHED'
  trackingLogFindOrCreatedParams.value = params.value || paramsEqpCallId


  const findOrCreatedTrackingLogResult = await trackingLogDao.findOrCreate(trackingLogFindOrCreatedParams)

  if (findOrCreatedTrackingLogResult.isCreated) {
    const trackingLogRedisData: TrackingLogRedisAttributes = {
      id: findOrCreatedTrackingLogResult.findOrCreatedId,
      code: trackingLogFindOrCreatedParams.code,
      caller: trackingLogFindOrCreatedParams.caller ?? null,
      eqpCallId: trackingLogFindOrCreatedParams.eqpCallId,
      callId: trackingLogFindOrCreatedParams.callId,
      itemCode: trackingLogFindOrCreatedParams.itemCode ?? null,
      subject: trackingLogFindOrCreatedParams.subject,
      detail: trackingLogFindOrCreatedParams.detail,
      state: trackingLogFindOrCreatedParams.state,
      fromFacility: trackingLogFindOrCreatedParams.fromFacility ?? null,
      toFacility: trackingLogFindOrCreatedParams.toFacility ?? null,
      assignedRobot: trackingLogFindOrCreatedParams.assignedRobot ?? null,
      value: trackingLogFindOrCreatedParams.value,
      description: trackingLogFindOrCreatedParams.description ?? null,
      detailLogList: [],
      createdDateTime: new Date().toISOString(),
      updatedDateTime: new Date().toISOString()
    }

    await redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId, JSON.stringify(trackingLogRedisData))
  }
}

// Tracking Log 데이터 수집 함수
export const getTrackingLog = () => {

}

// Tracking Log 데이터를 ACS에 전송하는 함수
export const sendTrackingLogListMqtt = async () => {
  const trackingLogList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId) || []

  for (let i = 0, length = trackingLogList?.length; i < length; i++) {
    const infoTrackingLogByFacilityCode = trackingLogList[i];

    // KEY = EQP CALL ID ( ex : BM1O202506190001 )
    const trackingLogByEqpCallId = infoTrackingLogByFacilityCode.eqpCallId;

    // console.log('i', i, 'trackingLogKeyValue', trackingLogByEqpCallId, 'infoTrackingLogByFacilityCode', infoTrackingLogByFacilityCode)

    if (!trackingLogByEqpCallId?.includes('MANUAL')) {
      sendMqtt(`tracking_log/${trackingLogByEqpCallId}`, JSON.stringify(infoTrackingLogByFacilityCode))
    }
  }
}

// Tracking Log 데이터 처리 함수
// 설비당 최근 작업은 3개만 보임 - CreatedDateTime 기준
// 완료된 물류 로그는 리스트 표현에서 삭제
// 일정 시간 ( 10분 ) 동안 업데이트가 없는 이력은 삭제
export const fixTrackingLogList = async () => {
  const dulationSetting = await redisUtil.hgetObject<LogDurationSetting>(RedisKeys.Setting, RedisSettingKeys.LogDuration)
  const dulationTime = dulationSetting?.data.durationTime || 10
  const dulationCount = dulationSetting?.data.durationCount || 3

  const trackingLogList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId) || []

  // 1. 완료된 작업 지시 리스트에서 제거
  const sortedNotCompletedTrackingLogList = trackingLogList.filter(trackingLog => trackingLog.state !== 'COMPLETED')

  // 2. 시간 순대로 정렬하기 - CreatedDateTime
  const sortedCreatedAtList = sortedNotCompletedTrackingLogList.sort((a, b) => {
    return new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
  })
  // 3. Caller가 같은 로그들 중 최근 이력 3개만 보이게 하고 지난 이력은 리스트에서 없애기
  const callerGrouped = sortedCreatedAtList.reduce((acc, log) => {
    const caller = log.caller // caller 필드명 확인 필요

    if (!caller) return acc // null이면 스킵

    if (!acc[caller]) {
      acc[caller] = []
    }
    if (acc[caller].length < dulationCount) { // 최근 3개만 유지
      acc[caller].push(log)
    }
    return acc
  }, {} as Record<string, TrackingLogRedisAttributes[]>)

  const limitedList = Object.values(callerGrouped).flat()

  // 4. 기준 시간(dulationTime) 동안 최근 Update가 안됐다면 리스트에서 없애기
  const now = new Date();
  const filteredTrackingLogList = limitedList.filter(trackingLog => {
    const updatedAt = trackingLog.updatedDateTime
    const updatedAtTime = new Date(updatedAt)
    const durationInMs = dulationTime * 60 * 1000
    const thresholdTime = new Date(updatedAtTime.getTime() + durationInMs);

    return now < thresholdTime
  })

  // 결과 - Redis에 새로운 데이터 저장
  await redisUtil.del(RedisKeys.InfoTrackingLogByEqpCallId)

  const savePromises = filteredTrackingLogList
    .filter(log => log.eqpCallId)
    .map(trackingLogObj =>
      redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, trackingLogObj.eqpCallId!, JSON.stringify(trackingLogObj))
    )

  await Promise.all(savePromises)
  // for (let i = 0, legnth = trackingLogList.length; i < legnth; i++) {
  //   const eqpCallId = trackingLogList[i].eqpCallId
  // }
  // for (let i = 0, length = filteredTrackingLogList.length; i < length; i++) {
  //   const trackingLogObj = filteredTrackingLogList[i]
  //   const eqpCallId = trackingLogObj.eqpCallId;
  //   if (eqpCallId) {
  //     redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId, JSON.stringify(trackingLogObj))
  //   }
  // }
}