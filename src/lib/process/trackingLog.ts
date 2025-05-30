import { TrackingLogInsertParams, TrackingLogRedisAttributes, TrackingLogRedisUpdateParams, TrackingLogState, TrackingLogSubjectType, TrackingLogUpdateParams } from "../../models/common/trackingLog";
import { trackingLogService } from "../../service/common/trackingLogService";
import { EqpCallStats } from "../callRegisterUtil";
import { generateUUIDNode } from "../hashUtil";
import { RedisKeys, useRedisUtil } from "../redisUtil";
import { dao as trackingLogDao } from '../../dao/common/trackingLogDao';
import { itemLogDao } from '../../dao/timescale/itemLogDao';
import { logging } from "../logging";
import { ItemLogInsertParams } from "../../models/timescale/itemLog";
import { formatDetailedDateTime } from "../usefullToolUtil";
import { sendMqtt } from "../mqttUtil";

const redisUtil = useRedisUtil();


export const initTrackingLogRedis = async (callInfo: EqpCallStats) => {
  // Subject = CALL_CREATED
  const subject: TrackingLogSubjectType = 'CALL_CREATED'
  const state: TrackingLogState = 'PUBLISHED'
  // 콜 발생 정보 수집
  const eqpCallId = (callInfo.CALL_ID).slice(-4);
  const facilityCode = callInfo.Caller;

  // 기존에 있던 tracking log 먼저 조회 - 이전 데이터를 삭제하기 위함
  const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, facilityCode);

  // 이미 해당 설비에 해당하는 콜 정보가 살아있는 경우에는 콜 정보를 지운 후 새로운 콜 정보를 올린다.
  // InfoTrackingLogByCallId 정보는 지우고 InfoTrackingLogByFacilityCode 정보는 덮어쓴다. 
  if (infoTrackingLogByFacilityCode) {
    const lastCallId = infoTrackingLogByFacilityCode.callId;
    if (lastCallId) {
      redisUtil.hdel(RedisKeys.InfoTrackingLogByCallId, lastCallId)
    }
  }

  // tracking Log insert
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: generateUUIDNode(),
    plcName: callInfo.Caller,
    portName: null,
    callId: callInfo.CALL_ID,
    callType: callInfo.Call_Type,
    eqpCallId: eqpCallId,
    transferId: null,
    subject: subject,
    detail: subject,
    state: state,
    startFacility: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: null,
  }

  const trackingLogInsertedResult = await trackingLogDao.insert(trackingLogInsertParams);

  const trackingLogId = trackingLogInsertedResult.insertedId

  if (!trackingLogId || trackingLogId === 0) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - initTrackingLogRedis',
      error: `trackingLogId (${trackingLogId}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  // item Log insert
  const dateNow = formatDetailedDateTime(new Date());
  const itemLogInsertParams: ItemLogInsertParams = {
    itemCode: null,
    facilityCode: null,
    facilityName: callInfo.Caller,
    amrCode: null,
    amrName: null,
    floor: null,
    topic: null,
    subject: subject,
    body: null,
    trackingLogId: trackingLogId,
    state: subject,
    location: callInfo.Caller,
    message: `Call published: ${eqpCallId} from ${callInfo.Caller}`,
    callId: callInfo.CALL_ID,
    value: (callInfo.EQP_CALL_ID).padStart(4, '0'),
    resultStatus: 'SUCCESS',
    createdDateTime: dateNow
  }

  // Item Log Insert
  void itemLogDao.insert(itemLogInsertParams);
  // const itemLogInsertedResult = await itemLogDao.insert(itemLogInsertParams)
  // if (!itemLogInsertedResult) {
  //   logging.ACTION_ERROR({
  //     filename: 'trackingLog.ts - initTrackingLogRedis',
  //     error: `itemLogInsertedResult (${itemLogInsertedResult}) is invalid `,
  //     params: null,
  //     result: false,
  //   });
  // }

  // const itemLogId = itemLogInsertedResult.insertedId

  // if (!itemLogId || itemLogId === 0) {
  //   logging.ACTION_ERROR({
  //     filename: 'trackingLog.ts - initTrackingLogRedis',
  //     error: `itemLogId (${itemLogId}) is invalid `,
  //     params: null,
  //     result: false,
  //   });
  // }

  const itemLogList = [{ ...itemLogInsertParams }];

  const trackingLogRedisBody: TrackingLogRedisAttributes = {
    id: trackingLogId,
    code: trackingLogInsertParams.code,
    plcName: trackingLogInsertParams.plcName,
    portName: trackingLogInsertParams.portName,
    callId: trackingLogInsertParams.callId,
    callType: trackingLogInsertParams.callType,
    eqpCallId: trackingLogInsertParams.eqpCallId,
    transferId: trackingLogInsertParams.transferId,
    subject: subject,
    detail: subject,
    state: state,
    startFacility: trackingLogInsertParams.startFacility,
    destFacility: trackingLogInsertParams.destFacility,
    assignedRobot: trackingLogInsertParams.assignedRobot,
    value: trackingLogInsertParams.value,
    description: trackingLogInsertParams.description,
    createdDateTime: dateNow,
    updatedDateTime: dateNow,
    itemLogList: itemLogList
  }

  // 물류 로그 Redis Set
  await redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, callInfo.Caller, JSON.stringify(trackingLogRedisBody));
  await redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callInfo.CALL_ID, JSON.stringify(trackingLogRedisBody));
}

export const editTrackingLogRedis = async (trackingLogUpdateData: TrackingLogRedisUpdateParams, value?: string, resultStatus?: string, location?: string) => {
  // 필수 값 확인 
  const callId = trackingLogUpdateData.callId;
  const transferId = trackingLogUpdateData.transferId || null;

  // Redis 값 업데이트
  const dateNow = formatDetailedDateTime(new Date());

  if (!callId) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `callId (${callId}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId, callId)

  if (!infoTrackingLogByCallId) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId (${infoTrackingLogByCallId}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const plcName = infoTrackingLogByCallId.plcName;

  if (!plcName) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `plcName (${plcName}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, plcName)

  if (!infoTrackingLogByFacilityCode) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByFacilityCode (${infoTrackingLogByFacilityCode}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  if (!infoTrackingLogByCallId.id) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId.id (${infoTrackingLogByCallId.id}) is invalid `,
      params: null,
      result: false,
    });
    return
  }

  // 2차 검증 => 서로 관리하는 데이터의 id 값이 동일해야한다. 
  if (infoTrackingLogByCallId.id !== infoTrackingLogByFacilityCode.id) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `ID information mismatch: InfoTrackingLogByFacilityCode (${infoTrackingLogByFacilityCode.id}) does not match with InfoTrackingLogByCallId id (${infoTrackingLogByCallId.id}).`,
      params: null,
      result: false,
    });
    return
  }


  // 기존 tracking Log 업데이트
  const trackingLogUpdateParams: TrackingLogUpdateParams = {
    id: infoTrackingLogByCallId.id,
    code: infoTrackingLogByCallId.code,
    plcName: infoTrackingLogByCallId.plcName,
    portName: infoTrackingLogByCallId.portName,
    callId: infoTrackingLogByCallId.callId,
    callType: infoTrackingLogByCallId.callType,
    eqpCallId: infoTrackingLogByCallId.eqpCallId,
    transferId: transferId || infoTrackingLogByCallId.transferId,
    subject: trackingLogUpdateData.subject ? trackingLogUpdateData.subject : infoTrackingLogByCallId.subject,
    detail: trackingLogUpdateData.detail ? trackingLogUpdateData.detail : infoTrackingLogByCallId.detail,
    state: trackingLogUpdateData.state ? trackingLogUpdateData.state : infoTrackingLogByCallId.state,
    startFacility: trackingLogUpdateData.startFacility ? trackingLogUpdateData.startFacility : infoTrackingLogByCallId.startFacility,
    destFacility: trackingLogUpdateData.destFacility ? trackingLogUpdateData.destFacility : infoTrackingLogByCallId.destFacility,
    assignedRobot: trackingLogUpdateData.assignedRobot ? trackingLogUpdateData.assignedRobot : infoTrackingLogByCallId.assignedRobot,
    value: trackingLogUpdateData.value ? trackingLogUpdateData.value : infoTrackingLogByCallId.value,
    description: trackingLogUpdateData.description ? trackingLogUpdateData.description : infoTrackingLogByCallId.description,
  }

  await trackingLogDao.update(trackingLogUpdateParams)

  // item Log insert
  const itemLogInsertParams: ItemLogInsertParams = {
    itemCode: null,
    facilityCode: null,
    facilityName: plcName,
    amrCode: null,
    amrName: null,
    floor: null,
    topic: null,
    subject: trackingLogUpdateData.subject ? trackingLogUpdateData.subject : null,
    body: null,
    trackingLogId: infoTrackingLogByCallId.id,
    state: trackingLogUpdateData.detail ? trackingLogUpdateData.detail : null,
    location: location,
    message: trackingLogUpdateData.description ? trackingLogUpdateData.description : null,
    callId: infoTrackingLogByCallId.callId,
    value: value,
    resultStatus: resultStatus,
    createdDateTime: dateNow,
  }
  // Item Log Insert
  void itemLogDao.insert(itemLogInsertParams);

  const itemLogList = [...infoTrackingLogByCallId.itemLogList];

  itemLogList.push(itemLogInsertParams)

  const trackingLogRedisBody: TrackingLogRedisAttributes = {
    id: trackingLogUpdateParams.id,
    code: trackingLogUpdateParams.code ?? null,
    plcName: trackingLogUpdateParams.plcName ?? null,
    portName: trackingLogUpdateParams.portName ?? null,
    callId: trackingLogUpdateParams.callId ?? null,
    callType: trackingLogUpdateParams.callType ?? null,
    eqpCallId: trackingLogUpdateParams.eqpCallId ?? null,
    transferId: trackingLogUpdateParams.transferId ?? null,
    subject: trackingLogUpdateParams.subject ?? null,
    detail: trackingLogUpdateParams.detail ?? null,
    state: trackingLogUpdateParams.state ?? null,
    startFacility: trackingLogUpdateParams.startFacility ?? null,
    destFacility: trackingLogUpdateParams.destFacility ?? null,
    assignedRobot: trackingLogUpdateParams.assignedRobot ?? null,
    value: trackingLogUpdateParams.value ?? null,
    description: trackingLogUpdateParams.description ?? null,
    createdDateTime: infoTrackingLogByCallId.createdDateTime,
    updatedDateTime: dateNow,
    itemLogList: itemLogList
  };

  redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, plcName, JSON.stringify(trackingLogRedisBody));
  redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callId, JSON.stringify(trackingLogRedisBody));
}

export const sendTrackingLogs = async () => {
  const trackingLogByFacilityCodeList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode) || [];

  for (let i = 0, length = trackingLogByFacilityCodeList?.length; i < length; i++) {
    const infoTrackingLogByFacilityCode = trackingLogByFacilityCodeList[i];

    const facilityCode = infoTrackingLogByFacilityCode.startFacility;

    // console.log('i', i, 'infoTrackingLogByFacilityCode', infoTrackingLogByFacilityCode)

    sendMqtt(`tracking_log/${facilityCode}`, JSON.stringify(infoTrackingLogByFacilityCode))
  }
}