import {
  TrackingLogInsertParams,
  TrackingLogProcessState,
  TrackingLogRedisAttributes,
  TrackingLogRedisUpdateParams,
  TrackingLogState,
  TrackingLogSubjectType,
  TrackingLogUpdateParams,
} from '../../models/common/trackingLog';
import { trackingLogService } from '../../service/common/trackingLogService';
import { EqpCallStats } from '../callRegisterUtil';
import { generateUUIDNode } from '../hashUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { dao as trackingLogDao } from '../../dao/common/trackingLogDao';
import { itemLogDao } from '../../dao/timescale/itemLogDao';
import { logging } from '../logging';
import { ItemLogInsertParams, ItemLogSubjectType } from '../../models/timescale/itemLog';
import { formatDetailedDateTime, isCurrentTimeFasterThanAnyMinutesFromTzString } from '../usefullToolUtil';
import { sendMqtt } from '../mqttUtil';

export interface InitAbnormalTrackingLogParams {
  callId: string;
  subjcet: TrackingLogSubjectType;
  detail: string;
  state: TrackingLogState;
  processState: TrackingLogProcessState;
  eqpCallId?: string;
  transferId?: string;
  callType?: string;
  caller?: string;
  callQuantity?: number;
  callPriority?: string;
  systemName?: string;
  startFacility?: string;
  destFacility?: string;
  assignedRobot?: string;
  value?: string;
  description?: string;
  missionDestination?: string;
  message?: string;
  location?: string;
}

const redisUtil = useRedisUtil();

export const initTrackingLogRedis = async (callInfo: EqpCallStats) => {
  // Subject = CALL_CREATED
  const subject: TrackingLogSubjectType = 'CALL_CREATED';
  const state: TrackingLogState = 'PUBLISHED';
  // 콜 발생 정보 수집
  // 여기서 eqpCallId는 설비의 Call Count가 아닌, 자체 Count 번호
  const callId = callInfo.CALL_ID;
  const eqpCallId = callInfo.CALL_ID.slice(-4);
  const facilityCode = callInfo.Caller;

  // 2025-08-18 멀티콜 때문에 기존에 있는 Tracking Log 삭제를 진행하지 않음
  // Redis에서 삭제되는 조건은 1번 완료 2번 Update 시간이 1일 이상 지연된 경우 정도 될 예정
  // 기존에 있던 tracking log 먼저 조회 - 이전 데이터를 삭제하기 위함
  // const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, facilityCode);

  // // 이미 해당 설비에 해당하는 콜 정보가 살아있는 경우에는 콜 정보를 지운 후 새로운 콜 정보를 올린다.
  // // InfoTrackingLogByCallId 정보는 지우고 InfoTrackingLogByFacilityCode 정보는 덮어쓴다.
  // if (infoTrackingLogByFacilityCode) {
  //   const lastCallId = infoTrackingLogByFacilityCode.callId;
  //   if (lastCallId) {
  //     redisUtil.hdel(RedisKeys.InfoTrackingLogByCallId, lastCallId)
  //   }
  // }

  // tracking Log insert
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: generateUUIDNode(),
    plcName: callInfo.Caller,
    portName: null,
    callId: callId,
    // callType: callInfo.Call_Type,
    callType: callInfo.Cargo_Type,
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
    missionDestination: null,
    processState: 'NORMAL',
  };

  const trackingLogInsertedResult = await trackingLogDao.insert(trackingLogInsertParams);

  const trackingLogId = trackingLogInsertedResult.insertedId;

  if (!trackingLogId || trackingLogId === 0) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - initTrackingLogRedis',
      error: `trackingLogId (${trackingLogId}) is invalid `,
      params: null,
      result: false,
    });
    return;
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
    value: callInfo.EQP_CALL_ID.padStart(4, '0'),
    resultStatus: 'SUCCESS',
    createdDateTime: dateNow,
  };

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
    missionDestination: trackingLogInsertParams.missionDestination,
    processState: trackingLogInsertParams.processState,
    createdDateTime: dateNow,
    updatedDateTime: dateNow,
    itemLogList: itemLogList,
  };

  // 물류 로그 Redis Set
  // 설비당 트래킹 로그가 다수 존재할 수 있기 때문에 FacilityCode에 해당하는 로그는 의미가 없어짐
  // await redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, callInfo.Caller, JSON.stringify(trackingLogRedisBody));
  await redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callInfo.CALL_ID, JSON.stringify(trackingLogRedisBody));
};

export const initAbnormalTrackingLogRedis = async (callInfo: InitAbnormalTrackingLogParams) => {
  // Subject = CALL_CREATED
  const subject: TrackingLogSubjectType = callInfo.subjcet;
  const detail = callInfo.detail;
  const state: TrackingLogState = callInfo.state;
  // 콜 발생 정보 수집
  // 여기서 eqpCallId는 설비의 Call Count가 아닌, 자체 Count 번호
  const callId = callInfo.callId;

  // 2025-08-18 멀티콜 때문에 기존에 있는 Tracking Log 삭제를 진행하지 않음
  // Redis에서 삭제되는 조건은 1번 완료 2번 Update 시간이 1일 이상 지연된 경우 정도 될 예정
  // 기존에 있던 tracking log 먼저 조회 - 이전 데이터를 삭제하기 위함
  // const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, facilityCode);

  // // 이미 해당 설비에 해당하는 콜 정보가 살아있는 경우에는 콜 정보를 지운 후 새로운 콜 정보를 올린다.
  // // InfoTrackingLogByCallId 정보는 지우고 InfoTrackingLogByFacilityCode 정보는 덮어쓴다.
  // if (infoTrackingLogByFacilityCode) {
  //   const lastCallId = infoTrackingLogByFacilityCode.callId;
  //   if (lastCallId) {
  //     redisUtil.hdel(RedisKeys.InfoTrackingLogByCallId, lastCallId)
  //   }
  // }

  // tracking Log insert
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: generateUUIDNode(),
    plcName: callInfo.caller || null,
    portName: null,
    callId: callId,
    callType: callInfo.callType || null,
    eqpCallId: callInfo.eqpCallId || null,
    transferId: null,
    subject: subject,
    detail: detail,
    state: state,
    startFacility: callInfo.startFacility || null,
    destFacility: callInfo.destFacility || null,
    assignedRobot: callInfo.assignedRobot || null,
    value: callInfo.value || null,
    description: callInfo.description || null,
    missionDestination: callInfo.description || null,
    processState: callInfo.processState,
  };

  const trackingLogInsertedResult = await trackingLogDao.insert(trackingLogInsertParams);

  const trackingLogId = trackingLogInsertedResult.insertedId;

  if (!trackingLogId || trackingLogId === 0) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - initTrackingLogRedis',
      error: `trackingLogId (${trackingLogId}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  // item Log insert
  const dateNow = formatDetailedDateTime(new Date());
  const itemLogInsertParams: ItemLogInsertParams = {
    itemCode: null,
    facilityCode: null,
    facilityName: callInfo.caller || null,
    amrCode: null,
    amrName: null,
    floor: null,
    topic: null,
    subject: subject,
    body: null,
    trackingLogId: trackingLogId,
    state: subject,
    location: callInfo.location || null,
    message: callInfo.message || null,
    callId: callId,
    value: callInfo.value || null,
    resultStatus: 'SUCCESS',
    createdDateTime: dateNow,
  };

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
    detail: detail,
    state: state,
    startFacility: trackingLogInsertParams.startFacility,
    destFacility: trackingLogInsertParams.destFacility,
    assignedRobot: trackingLogInsertParams.assignedRobot,
    value: trackingLogInsertParams.value,
    description: trackingLogInsertParams.description,
    missionDestination: trackingLogInsertParams.missionDestination,
    processState: trackingLogInsertParams.processState,
    createdDateTime: dateNow,
    updatedDateTime: dateNow,
    itemLogList: itemLogList,
  };

  // 물류 로그 Redis Set
  // 설비당 트래킹 로그가 다수 존재할 수 있기 때문에 FacilityCode에 해당하는 로그는 의미가 없어짐
  // await redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, callInfo.Caller, JSON.stringify(trackingLogRedisBody));
  await redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callId, JSON.stringify(trackingLogRedisBody));
};

export const editTrackingLogRedis = async (
  trackingLogUpdateData: TrackingLogRedisUpdateParams,
  value?: string,
  resultStatus?: string,
  location?: string
) => {
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
    return;
  }

  const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
    RedisKeys.InfoTrackingLogByCallId,
    callId
  );

  if (!infoTrackingLogByCallId) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId (${infoTrackingLogByCallId}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  const plcName = infoTrackingLogByCallId.plcName;

  if (!plcName) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `plcName (${plcName}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  // const infoTrackingLogByFacilityCode = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByFacilityCode, plcName)

  // if (!infoTrackingLogByFacilityCode) {
  //   logging.ACTION_ERROR({
  //     filename: 'trackingLog.ts - editTrackingLogRedis',
  //     error: `infoTrackingLogByFacilityCode (${infoTrackingLogByFacilityCode}) is invalid `,
  //     params: null,
  //     result: false,
  //   });
  //   return
  // }

  if (!infoTrackingLogByCallId.id) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId.id (${infoTrackingLogByCallId.id}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  // 2차 검증 => 서로 관리하는 데이터의 id 값이 동일해야한다.
  // if (infoTrackingLogByCallId.id !== infoTrackingLogByFacilityCode.id) {
  //   logging.ACTION_ERROR({
  //     filename: 'trackingLog.ts - editTrackingLogRedis',
  //     error: `ID information mismatch: InfoTrackingLogByFacilityCode (${infoTrackingLogByFacilityCode.id}) does not match with InfoTrackingLogByCallId id (${infoTrackingLogByCallId.id}).`,
  //     params: null,
  //     result: false,
  //   });
  //   return
  // }

  // message 내용 추가
  const FromMissionStates = [
    'AMR_ACQUIRE_STARTED',
    'AMR_ACQUIRE_COMPLETED',
    'FROM_DOCKING_REQ',
    'FROM_DOCKING_PERMIT',
    'FROM_DOCKING_COMPLETED',
  ];
  const ToMissionStates = [
    'TO_DOCKING_REQ',
    'TO_DOCKING_PERMIT',
    'TO_DOCKING_COMPLETED',
    'AMR_DEPOSIT_STARTED',
    'AMR_DEPOSIT_COMPLETED',
  ];

  if (trackingLogUpdateData.detail) {
    if (FromMissionStates.includes(trackingLogUpdateData.detail)) {
      if (infoTrackingLogByCallId.startFacility) {
        trackingLogUpdateData.description = `FAC(${infoTrackingLogByCallId.startFacility}) : AMR(${infoTrackingLogByCallId.assignedRobot}) Mission State : ${trackingLogUpdateData.detail}`;
      }
    }
    if (ToMissionStates.includes(trackingLogUpdateData.detail)) {
      if (infoTrackingLogByCallId.destFacility) {
        trackingLogUpdateData.description = `FAC(${infoTrackingLogByCallId.destFacility}) : AMR(${infoTrackingLogByCallId.assignedRobot}) Mission State : ${trackingLogUpdateData.detail}`;
      }
    }
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
    startFacility: trackingLogUpdateData.startFacility
      ? trackingLogUpdateData.startFacility
      : infoTrackingLogByCallId.startFacility,
    destFacility: trackingLogUpdateData.destFacility
      ? trackingLogUpdateData.destFacility
      : infoTrackingLogByCallId.destFacility,
    assignedRobot: trackingLogUpdateData.assignedRobot
      ? trackingLogUpdateData.assignedRobot
      : infoTrackingLogByCallId.assignedRobot,
    value: trackingLogUpdateData.value ? trackingLogUpdateData.value : infoTrackingLogByCallId.value,
    description: trackingLogUpdateData.description
      ? trackingLogUpdateData.description
      : infoTrackingLogByCallId.description,
    processState: trackingLogUpdateData.processState
      ? trackingLogUpdateData.processState
      : infoTrackingLogByCallId.processState,
    missionDestination: trackingLogUpdateData.missionDestination
      ? trackingLogUpdateData.missionDestination
      : infoTrackingLogByCallId.missionDestination,
  };

  await trackingLogDao.update(trackingLogUpdateParams);

  // item Log insert
  const itemLogInsertParams: ItemLogInsertParams = {
    itemCode: null,
    facilityCode: null,
    facilityName: plcName,
    amrCode: null,
    amrName: null,
    floor: null,
    topic: null,
    subject: trackingLogUpdateData.subject ? (trackingLogUpdateData.subject as ItemLogSubjectType) : null,
    body: null,
    trackingLogId: infoTrackingLogByCallId.id,
    state: trackingLogUpdateData.detail ? trackingLogUpdateData.detail : null,
    location: location,
    message: trackingLogUpdateData.description ? trackingLogUpdateData.description : null,
    callId: infoTrackingLogByCallId.callId,
    value: value,
    resultStatus: resultStatus,
    createdDateTime: dateNow,
  };
  // Item Log Insert
  void itemLogDao.insert(itemLogInsertParams);

  const itemLogList = [...infoTrackingLogByCallId.itemLogList];

  itemLogList.push(itemLogInsertParams);

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
    itemLogList: itemLogList,
    processState: trackingLogUpdateParams?.processState ?? null,
    missionDestination: trackingLogUpdateParams?.missionDestination ?? null,
  };

  // redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, plcName, JSON.stringify(trackingLogRedisBody));
  redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callId, JSON.stringify(trackingLogRedisBody));
};

export const editAbnormalTrackingLogRedis = async (
  trackingLogUpdateData: TrackingLogRedisUpdateParams,
  value?: string,
  resultStatus?: string,
  location?: string
) => {
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
    return;
  }

  const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
    RedisKeys.InfoTrackingLogByCallId,
    callId
  );

  if (!infoTrackingLogByCallId) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId (${infoTrackingLogByCallId}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  if (!infoTrackingLogByCallId.id) {
    logging.ACTION_ERROR({
      filename: 'trackingLog.ts - editTrackingLogRedis',
      error: `infoTrackingLogByCallId.id (${infoTrackingLogByCallId.id}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  // 2차 검증 => 서로 관리하는 데이터의 id 값이 동일해야한다.
  // if (infoTrackingLogByCallId.id !== infoTrackingLogByFacilityCode.id) {
  //   logging.ACTION_ERROR({
  //     filename: 'trackingLog.ts - editTrackingLogRedis',
  //     error: `ID information mismatch: InfoTrackingLogByFacilityCode (${infoTrackingLogByFacilityCode.id}) does not match with InfoTrackingLogByCallId id (${infoTrackingLogByCallId.id}).`,
  //     params: null,
  //     result: false,
  //   });
  //   return
  // }

  // message 내용 추가
  const FromMissionStates = [
    'AMR_ACQUIRE_STARTED',
    'AMR_ACQUIRE_COMPLETED',
    'FROM_DOCKING_REQ',
    'FROM_DOCKING_PERMIT',
    'FROM_DOCKING_COMPLETED',
  ];
  const ToMissionStates = [
    'TO_DOCKING_REQ',
    'TO_DOCKING_PERMIT',
    'TO_DOCKING_COMPLETED',
    'AMR_DEPOSIT_STARTED',
    'AMR_DEPOSIT_COMPLETED',
  ];

  if (trackingLogUpdateData.detail) {
    if (FromMissionStates.includes(trackingLogUpdateData.detail)) {
      if (infoTrackingLogByCallId.startFacility) {
        trackingLogUpdateData.description = `FAC(${infoTrackingLogByCallId.startFacility}) : AMR(${infoTrackingLogByCallId.assignedRobot}) Mission State : ${trackingLogUpdateData.detail}`;
      }
    }
    if (ToMissionStates.includes(trackingLogUpdateData.detail)) {
      if (infoTrackingLogByCallId.destFacility) {
        trackingLogUpdateData.description = `FAC(${infoTrackingLogByCallId.destFacility}) : AMR(${infoTrackingLogByCallId.assignedRobot}) Mission State : ${trackingLogUpdateData.detail}`;
      }
    }
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
    startFacility: trackingLogUpdateData.startFacility
      ? trackingLogUpdateData.startFacility
      : infoTrackingLogByCallId.startFacility,
    destFacility: trackingLogUpdateData.destFacility
      ? trackingLogUpdateData.destFacility
      : infoTrackingLogByCallId.destFacility,
    assignedRobot: trackingLogUpdateData.assignedRobot
      ? trackingLogUpdateData.assignedRobot
      : infoTrackingLogByCallId.assignedRobot,
    value: trackingLogUpdateData.value ? trackingLogUpdateData.value : infoTrackingLogByCallId.value,
    description: trackingLogUpdateData.description
      ? trackingLogUpdateData.description
      : infoTrackingLogByCallId.description,
    processState: trackingLogUpdateData.processState
      ? trackingLogUpdateData.processState
      : infoTrackingLogByCallId.processState,
    missionDestination: trackingLogUpdateData.missionDestination
      ? trackingLogUpdateData.missionDestination
      : infoTrackingLogByCallId.missionDestination,
  };

  await trackingLogDao.update(trackingLogUpdateParams);

  // item Log insert
  const itemLogInsertParams: ItemLogInsertParams = {
    itemCode: null,
    facilityCode: null,
    facilityName: null,
    amrCode: null,
    amrName: null,
    floor: null,
    topic: null,
    subject: trackingLogUpdateData.subject ? (trackingLogUpdateData.subject as ItemLogSubjectType) : null,
    body: null,
    trackingLogId: infoTrackingLogByCallId.id,
    state: trackingLogUpdateData.detail ? trackingLogUpdateData.detail : null,
    location: location,
    message: trackingLogUpdateData.description ? trackingLogUpdateData.description : null,
    callId: infoTrackingLogByCallId.callId,
    value: value,
    resultStatus: resultStatus,
    createdDateTime: dateNow,
  };
  // Item Log Insert
  void itemLogDao.insert(itemLogInsertParams);

  const itemLogList = [...infoTrackingLogByCallId.itemLogList];

  itemLogList.push(itemLogInsertParams);

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
    itemLogList: itemLogList,
    processState: trackingLogUpdateParams?.processState ?? null,
    missionDestination: trackingLogUpdateParams?.missionDestination ?? null,
  };

  // redisUtil.hset(RedisKeys.InfoTrackingLogByFacilityCode, plcName, JSON.stringify(trackingLogRedisBody));
  redisUtil.hset(RedisKeys.InfoTrackingLogByCallId, callId, JSON.stringify(trackingLogRedisBody));
};

export const sendTrackingLogs = async () => {
  const trackingLogByCallIdList =
    (await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId)) || [];

  for (let i = 0, length = trackingLogByCallIdList?.length; i < length; i++) {
    const trackingLogByCallIdInfo = trackingLogByCallIdList[i];

    const trackingLogCallId = trackingLogByCallIdInfo.callId || '';
    const facilityCode = trackingLogByCallIdInfo.startFacility;
    const trackingLogState = trackingLogByCallIdInfo.state || '';

    // sendMqtt(`tracking_log/${facilityCode}`, JSON.stringify(infoTrackingLogByFacilityCode))
    // 'PUBLISHED' | 'PROCESSING' | 'COMPLETED' | 'ABORTED' | 'CANCELED' | 'PAUSED' | 'ERROR';
    sendMqtt(`tracking_log/${trackingLogCallId}`, JSON.stringify(trackingLogByCallIdInfo));

    // const MQTT_SENDABLE_STATES = ['PUBLISHED', 'PROCESSING', 'ABORTED'];
    // if (!MQTT_SENDABLE_STATES.includes(trackingLogState)) {
    //   // sendMqtt(`tracking_log/${trackingLogCallId}`, JSON.stringify(trackingLogByCallIdInfo));
    //   if (trackingLogCallId !== '') {
    //     redisUtil.hdel(RedisKeys.InfoTrackingLogByCallId, trackingLogCallId);
    //   }
    // }

    // 11-26 트래킹 로그 삭제 조건 변경
    // 'COMPLETED' | 'CANCELED' | 'PAUSED' | 'ERROR' 상태인 경우에 일정 시간이 지나면 삭제
    const MQTT_SENDABLE_STATES = ['PUBLISHED', 'PROCESSING', 'ABORTED'];
    if (!MQTT_SENDABLE_STATES.includes(trackingLogState)) {
      // sendMqtt(`tracking_log/${trackingLogCallId}`, JSON.stringify(trackingLogByCallIdInfo));
      if (trackingLogCallId !== '') {
        // 완료된 작업은 10 분 / 취소된 작업은 1일 트래킹 로그 유지
        let deletedMinutes = 10;
        if (trackingLogState === 'CANCELED' || trackingLogState === 'ERROR') deletedMinutes = 1440;
        if (isCurrentTimeFasterThanAnyMinutesFromTzString(trackingLogByCallIdInfo.updatedDateTime, deletedMinutes)) {
          redisUtil.hdel(RedisKeys.InfoTrackingLogByCallId, trackingLogCallId);
        }
      }
    }
  }
};

// 주기적으로 TrackingLog의 Redis 데이터를 지워주는 함수 -> Tracking 로그를 지워주지 않고 계속 쌓게 되면 나중에 조회 속도에 문제가 생길 가능성이 높음
// 조건 1 ) 'COMPLETED' | 'CANCELED' | 'ERROR' 상태인 경우에는 트래캉 로그 redis 정보에서 삭제
// 조건 2 ) createdAt 시간이 1일 이상 지연된 경우에는 Tracking Log Redis 정보에서 삭제
export const checkTrackingLogCleanup = async () => {
  const trackingLogByCallIdList =
    (await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId)) || [];

  for (let i = 0, length = trackingLogByCallIdList.length; i < length; i++) {
    const trackingLogInfo = trackingLogByCallIdList[i];
  }
};
