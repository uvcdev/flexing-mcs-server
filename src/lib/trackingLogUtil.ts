import { logging, LogFormat, ActionLog } from '../lib/logging';
import { DetailLogAttributes, DetailLogInsertParams } from '../models/timescale/detailLog';
import { TrackingLogAttributes, TrackingLogFindOrCreatedParams, TrackingLogInsertParams, TrackingLogState, TrackingLogUpdateParams } from './../models/common/trackingLog';
import { dao as trackingLogDao } from '../dao/common/trackingLogDao';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { v4 as uuidv4 } from 'uuid';
import { sendMqtt } from './mqttUtil';
import { detailLogDao } from '../dao/timescale/detailLogDao';
import { LogDurationSetting } from '../models/common/setting';

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
  wcsCallId?: string | null,
  fromFacility?: string | null,
  toFacility?: string | null,
  assignedRobot?: string | null,
  value?: string | null,
  description?: string | null,
}

// Detail Log 데이터 수집 함수 - 저장
export const regDetailLog = async (params: RegDetailLogInsertParams) => {
  try {
    const eqpCallId = (params.eqpCallId)?.split('$')[0] || ''

    const { trackingLogState, fromFacility, toFacility, assignedRobot, value, description, wcsCallId, ...newDetailLogInsertParams } = params

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
    let trackingLogRedisInfo = null;
    let trackingLogDbInfo = null;

    try {
      trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId);
      if (trackingLogRedisInfo) {
        trackingLogId = trackingLogRedisInfo.id
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regDetailLog - Redis 조회',
        error: `Redis 조회 중 오류: ${error}`,
        params: { eqpCallId },
        result: false,
      });
    }

    // Redis Data가 없는 경우
    if (!trackingLogRedisInfo) {
      try {
        trackingLogDbInfo = await trackingLogDao.selectInfoByEqpCallId({ eqpCallId: eqpCallId })

        //DB Data 조회
        if (trackingLogDbInfo) {
          trackingLogId = trackingLogDbInfo.id
        }
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'trackingLogUtil.ts - regDetailLog - DB 조회',
          error: `DB 조회 중 오류: ${error}`,
          params: { eqpCallId },
          result: false,
        });
      }
    }

    const trackingLogInfo: TrackingLogRedisAttributes = (trackingLogRedisInfo || trackingLogDbInfo) as TrackingLogRedisAttributes
    if (trackingLogInfo) {
      trackingLogInfo.detailLogList = trackingLogRedisInfo?.detailLogList || []
    }

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
      wcsCallId: wcsCallId ? wcsCallId : trackingLogInfo.wcsCallId,
      itemCode: trackingLogInfo.itemCode,
      subject: newDetailLogInsertParams.topic,
      detail: newDetailLogInsertParams.subject ? newDetailLogInsertParams.subject : trackingLogInfo.subject,
      state: trackingLogState ? trackingLogState : trackingLogInfo.state,
      // fromFacility: fromFacility ? fromFacility : trackingLogInfo.fromFacility,
      // toFacility: toFacility ? toFacility : trackingLogInfo.toFacility,
      // assignedRobot: assignedRobot ? assignedRobot : trackingLogInfo.assignedRobot,
      value: value ? value : trackingLogInfo.value,
      description: description ? description : trackingLogInfo.description,
    }

    if (newDetailLogInsertParams.topic === 'AMR_ASSIGNED') {
      trackingLogUpdateParams.assignedRobot = assignedRobot
    }
    if (newDetailLogInsertParams.topic === 'WORK_CREATE') {
      trackingLogUpdateParams.fromFacility = fromFacility;
      trackingLogUpdateParams.toFacility = toFacility;
    }

    try {
      const trackingLogUpdatedResult = await trackingLogDao.update(trackingLogUpdateParams)
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regDetailLog - TrackingLog 업데이트',
        error: `TrackingLog 업데이트 중 오류: ${error}`,
        params: trackingLogUpdateParams,
        result: false,
      });
    }

    // Set Detail Log Data
    const detailLogInsertParams: DetailLogInsertParams = {
      ...newDetailLogInsertParams,
      value: value,
      subject: newDetailLogInsertParams.subject ? newDetailLogInsertParams.subject : trackingLogUpdateParams.subject,
      trackingLogId: trackingLogId,
      createdDateTime: new Date().toISOString(),
    }

    try {
      await detailLogDao.insert(detailLogInsertParams)
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regDetailLog - DetailLog 저장',
        error: `DetailLog 저장 중 오류: ${error}`,
        params: detailLogInsertParams,
        result: false,
      });
    }

    // Update Redis Data
    try {
      const newDetails = [...(trackingLogInfo.detailLogList || [])]
      newDetails.push(detailLogInsertParams as DetailLogRedisAttributes)

      const trackingLogRedisData: TrackingLogRedisAttributes = {
        id: trackingLogUpdateParams.id,
        code: trackingLogUpdateParams.code ?? null,
        caller: trackingLogUpdateParams.caller ?? null,
        eqpCallId: trackingLogUpdateParams.eqpCallId ?? null,
        callId: trackingLogUpdateParams.callId ?? null,
        wcsCallId: trackingLogUpdateParams.wcsCallId ?? null,
        itemCode: trackingLogUpdateParams.itemCode ?? null,
        subject: trackingLogUpdateParams.subject ?? null,
        detail: trackingLogUpdateParams.detail ?? null,
        state: trackingLogUpdateParams.state ?? null,
        fromFacility: trackingLogUpdateParams.fromFacility ?? null,
        toFacility: trackingLogUpdateParams.toFacility ?? null,
        assignedRobot: trackingLogInfo.assignedRobot,
        value: trackingLogUpdateParams.value ?? null,
        description: trackingLogUpdateParams.description ?? null,
        detailLogList: newDetails,
        createdDateTime: trackingLogInfo.createdDateTime || new Date().toISOString(),
        updatedDateTime: new Date().toISOString()
      }

      if (eqpCallId && !eqpCallId.includes('MANUAL') && !eqpCallId.includes('dryrun')) {
        await redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId, JSON.stringify(trackingLogRedisData))
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regDetailLog - Redis 업데이트',
        error: `Redis 업데이트 중 오류: ${error}`,
        params: { eqpCallId },
        result: false,
      });
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - regDetailLog - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: params,
      result: false,
    });
  }
}

export const checkTrackingLogExists = async (params: CheckTrackingLogExists): Promise<boolean> => {
  try {
    // 1. 이미 있는 데이터 인지 조회 - REDIS
    const paramsEqpCallId = (params.eqpCallId)?.split('$')[0] || '';

    try {
      const trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId);
      if (trackingLogRedisInfo) {
        return true;
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - checkTrackingLogExists - Redis 조회',
        error: `Redis 조회 중 오류: ${error}`,
        params: { paramsEqpCallId },
        result: false,
      });
    }

    // 2. 이미 있는 데이터 인지 조회 - DB
    try {
      const trackingLogDbInfo = await trackingLogDao.selectInfoByEqpCallId({ eqpCallId: paramsEqpCallId })
      if (trackingLogDbInfo) {
        return true;
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - checkTrackingLogExists - DB 조회',
        error: `DB 조회 중 오류: ${error}`,
        params: params,
        result: false,
      });
    }

    // 없으면 Return
    return false
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - checkTrackingLogExists - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: params,
      result: false,
    });
    return false;
  }
}

// Tracking Log 데이터 수집 함수 - 저장
export const regTrackingLog = async (params: TrackingLogInsertParams) => {
  try {
    // 1. 이미 있는 데이터 인지 조회 - REDIS
    const paramsEqpCallId = (params.eqpCallId)?.split('$')[0] || '';

    let trackingLogRedisInfo = null;
    try {
      trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId);
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regTrackingLog - Redis 조회',
        error: `Redis 조회 중 오류: ${error}`,
        params: { paramsEqpCallId },
        result: false,
      });
    }

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

    try {
      const findOrCreatedTrackingLogResult = await trackingLogDao.findOrCreate(trackingLogFindOrCreatedParams)

      if (findOrCreatedTrackingLogResult.isCreated) {
        const trackingLogRedisData: TrackingLogRedisAttributes = {
          id: findOrCreatedTrackingLogResult.findOrCreatedId,
          code: trackingLogFindOrCreatedParams.code,
          caller: trackingLogFindOrCreatedParams.caller ?? null,
          eqpCallId: trackingLogFindOrCreatedParams.eqpCallId,
          callId: trackingLogFindOrCreatedParams.callId,
          wcsCallId: trackingLogFindOrCreatedParams.wcsCallId,
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

        try {
          if (trackingLogRedisData.eqpCallId && !trackingLogRedisData.eqpCallId.includes('MANUAL') && !trackingLogRedisData.eqpCallId.includes('dryrun')) {
            await redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, paramsEqpCallId, JSON.stringify(trackingLogRedisData))
          }
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'trackingLogUtil.ts - regTrackingLog - Redis 저장',
            error: `Redis 저장 중 오류: ${error}`,
            params: trackingLogRedisData,
            result: false,
          });
        }
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - regTrackingLog - DB 생성',
        error: `DB 생성 중 오류: ${error}`,
        params: trackingLogFindOrCreatedParams,
        result: false,
      });
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - regTrackingLog - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: params,
      result: false,
    });
  }
}

// Tracking Log 데이터 수집 함수
export const getTrackingLog = () => {
  try {
    // 구현 예정
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - getTrackingLog - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: null,
      result: false,
    });
  }
}

// Tracking Log 데이터를 ACS에 전송하는 함수
export const sendTrackingLogListMqtt = async () => {
  try {
    let trackingLogList = [];
    try {
      trackingLogList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId) || []
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - sendTrackingLogListMqtt - Redis 조회',
        error: `Redis 조회 중 오류: ${error}`,
        params: null,
        result: false,
      });
      return;
    }

    for (let i = 0, length = trackingLogList?.length; i < length; i++) {
      try {
        const infoTrackingLogByFacilityCode = trackingLogList[i];

        // KEY = EQP CALL ID ( ex : BM1O202506190001 )
        const trackingLogByEqpCallId = infoTrackingLogByFacilityCode?.eqpCallId;

        if (trackingLogByEqpCallId && !trackingLogByEqpCallId.includes('MANUAL') && !trackingLogByEqpCallId.includes('dryrun')) {
          await sendMqtt(`tracking_log/${trackingLogByEqpCallId}`, JSON.stringify(infoTrackingLogByFacilityCode))
        }
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'trackingLogUtil.ts - sendTrackingLogListMqtt - MQTT 전송',
          error: `MQTT 전송 중 오류 (index: ${i}): ${error}`,
          params: trackingLogList[i],
          result: false,
        });
        // 하나 실패해도 다음 것은 계속 처리
        continue;
      }
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - sendTrackingLogListMqtt - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: null,
      result: false,
    });
  }
}

// Tracking Log 데이터 처리 함수
// 설비당 최근 작업은 3개만 보임 - CreatedDateTime 기준
// 완료된 물류 로그는 리스트 표현에서 삭제
// 일정 시간 ( 10분 ) 동안 업데이트가 없는 이력은 삭제
export const fixTrackingLogList = async () => {
  try {
    let dulationSetting = null;
    try {
      dulationSetting = await redisUtil.hgetObject<LogDurationSetting>(RedisKeys.Setting, RedisSettingKeys.LogDuration)
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - fixTrackingLogList - 설정 조회',
        error: `설정 조회 중 오류: ${error}`,
        params: null,
        result: false,
      });
    }

    const dulationTime = dulationSetting?.data?.durationTime || 10
    const dulationCount = dulationSetting?.data?.durationCount || 3

    let trackingLogList = [];
    try {
      trackingLogList = await redisUtil.hgetAllObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId) || []
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - fixTrackingLogList - Redis 조회',
        error: `Redis 조회 중 오류: ${error}`,
        params: null,
        result: false,
      });
      return;
    }

    // 1. 완료된 작업 지시 리스트에서 제거
    // const sortedNotCompletedTrackingLogList = trackingLogList.filter(trackingLog => trackingLog?.state !== 'COMPLETED')
    const sortedNotCompletedTrackingLogList = trackingLogList

    // 2. 시간 순대로 정렬하기 - CreatedDateTime
    const sortedCreatedAtList = sortedNotCompletedTrackingLogList.sort((a, b) => {
      try {
        return new Date(b?.createdDateTime || '').getTime() - new Date(a?.createdDateTime || '').getTime()
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'trackingLogUtil.ts - fixTrackingLogList - 정렬',
          error: `날짜 정렬 중 오류: ${error}`,
          params: { a, b },
          result: false,
        });
        return 0;
      }
    })

    // 3. Caller가 같은 로그들 중 최근 이력 3개만 보이게 하고 지난 이력은 리스트에서 없애기
    const callerGrouped = sortedCreatedAtList.reduce((acc, log) => {
      try {
        const caller = log?.caller // caller 필드명 확인 필요

        if (!caller) return acc // null이면 스킵

        if (!acc[caller]) {
          acc[caller] = []
        }
        if (acc[caller].length < dulationCount) { // 최근 3개만 유지
          acc[caller].push(log)
        }
        return acc
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'trackingLogUtil.ts - fixTrackingLogList - Caller 그룹핑',
          error: `Caller 그룹핑 중 오류: ${error}`,
          params: log,
          result: false,
        });
        return acc;
      }
    }, {} as Record<string, TrackingLogRedisAttributes[]>)

    const limitedList = Object.values(callerGrouped).flat()

    // 4. 기준 시간(dulationTime) 동안 최근 Update가 안됐다면 리스트에서 없애기
    const now = new Date();
    const filteredTrackingLogList = limitedList.filter(trackingLog => {
      try {
        const updatedAt = trackingLog?.updatedDateTime
        if (!updatedAt) return false;

        const updatedAtTime = new Date(updatedAt)
        const durationInMs = dulationTime * 60 * 1000
        const thresholdTime = new Date(updatedAtTime.getTime() + durationInMs);

        return now < thresholdTime
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'trackingLogUtil.ts - fixTrackingLogList - 시간 필터링',
          error: `시간 필터링 중 오류: ${error}`,
          params: trackingLog,
          result: false,
        });
        return false;
      }
    })

    // Call Create 랑 Call Request 중 둘 중 하나라도 없으면 데이터 재 조회 후 Detail로그 재성성
    for (let i = 0; i < filteredTrackingLogList.length; i++) {
      const trackingLog = filteredTrackingLogList[i];

      const trackingLogDb = await trackingLogDao.selectInfo({ id: trackingLog.id })

      trackingLog.assignedRobot = trackingLogDb?.assignedRobot || ''
      // const isExistCallCreate = trackingLog.detailLogList.find(detailLog => detailLog.subject === 'CALL_CREATE')
      // const isExistCallRequest = trackingLog.detailLogList.find(detailLog => detailLog.subject === 'CALL_REQUEST')
      // const isExistCallCheck = trackingLog.detailLogList.find(detailLog => detailLog.subject === 'CALL_CHECK')

      // if (!isExistCallCreate || (!isExistCallRequest && isExistCallCheck)) {
      // DB에서 CALL_CREATE를 찾아서 넣어줌
      const detailLogList = await detailLogDao.selectList({ trackingLogId: trackingLog.id })
      const newDetailLogList = detailLogList.rows.map(detailLog => {
        return {
          topic: detailLog.topic,
          subject: detailLog.subject,
          trackingLogId: detailLog.trackingLogId,
          callId: detailLog.callId,
          state: detailLog.state,
          eqpCallId: detailLog.eqpCallId,
          location: detailLog.location,
          message: detailLog.message,
          resultStatus: detailLog.resultStatus,
          value: detailLog.value,
          // createdDateTime: (detailLog.createdAt).toISOString()
          createdDateTime: detailLog.createdAt instanceof Date
            ? detailLog.createdAt.toISOString()
            : detailLog.createdAt
        }
      })
      trackingLog.detailLogList = newDetailLogList

      if (trackingLog.detailLogList.find((detailLog) => detailLog.subject === 'TO_COMPLETED')) {
        trackingLog.state = 'COMPLETED'
      }
    }

    // 결과 - Redis에 새로운 데이터 저장
    try {
      await redisUtil.del(RedisKeys.InfoTrackingLogByEqpCallId)

      const savePromises = filteredTrackingLogList
        .filter(log => log?.eqpCallId)
        .map(trackingLogObj =>
          redisUtil.hset(RedisKeys.InfoTrackingLogByEqpCallId, trackingLogObj.eqpCallId!, JSON.stringify(trackingLogObj))
        )

      await Promise.all(savePromises)
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'trackingLogUtil.ts - fixTrackingLogList - Redis 저장',
        error: `Redis 저장 중 오류: ${error}`,
        params: { count: filteredTrackingLogList.length },
        result: false,
      });
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'trackingLogUtil.ts - fixTrackingLogList - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: null,
      result: false,
    });
  }
}