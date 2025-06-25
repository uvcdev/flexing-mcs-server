import { TrackingLogInsertParams } from "../models/common/trackingLog";
import { logging, WorkStatus } from "./logging";
import { checkTrackingLogExists, CheckTrackingLogExists, regDetailLog, RegDetailLogInsertParams, regTrackingLog, TrackingLogRedisAttributes } from "./trackingLogUtil";
import { DetailLogInsertParams, DetailLogSubjectType } from "../models/timescale/detailLog";
import { ImcsWorkOrderInsertParams } from "../models/operation/workOrder";
import { dao as facilityDao } from '../dao/operation/facilityDao';
import { dao as trackingLogDao } from '../dao/common/trackingLogDao';
import { RedisKeys, useRedisUtil } from "./redisUtil";

const redisUtil = useRedisUtil();

export interface AcsMqttTrackingLogType {
  EQP_CALL_ID: string;
  SUBJECT: string;
  STATUS: string;
  AMR_NAME: string | null;
}

export interface DockingTrackingLoggingParams {
  dockingType: 'request' | 'permit' | 'complete';
  TYPE: 'IN' | 'OUT';
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  EXC_CLS: 'AUTO' | 'MANUAL' | 'CHARGE' | null
  WORKER_ID: string;
  REPORT_ID: string;
  INSTRUCTION_ID: string;
}

export const acsTrackingLogging = async (data: AcsMqttTrackingLogType) => {
  const trackingLogStatus = data.SUBJECT;
  const checkTrackingLogExistsParams: CheckTrackingLogExists = {
    eqpCallId: data.EQP_CALL_ID
  }
  let callId = ''
  if (!data.EQP_CALL_ID.includes('MANUAL')) {
    callId = data.EQP_CALL_ID.slice(-4)
  }
  let message = ''
  let isTrackingLogExists = true
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: null,
    caller: null,
    eqpCallId: data.EQP_CALL_ID,
    callId: callId,
    itemCode: null,
    subject: null,
    detail: null,
    state: null,
    fromFacility: null,
    toFacility: null,
    assignedRobot: null,
    value: null,
    description: null,
  }

  const detailLogInsertParams: RegDetailLogInsertParams = {
    topic: trackingLogStatus,
    subject: null,
    trackingLogId: null,
    callId: callId,
    eqpCallId: data.EQP_CALL_ID,
    value: null,
    location: null,
    message: null,
    resultStatus: 'SUCCESS'
  }


  switch (trackingLogStatus) {
    case 'AMR_ASSIGNED':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `AMR(${data.AMR_NAME}) 할당`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = data.AMR_NAME
      detailLogInsertParams.value = data.AMR_NAME
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'AMR_ASSIGNED'
      detailLogInsertParams.value = data.AMR_NAME
      detailLogInsertParams.location = 'ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)

      break;

    case 'FROM_START':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `FROM 작업 시작`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'FROM_START'
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)

      break;

    case 'FROM_COMPLETED':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `FROM 작업 완료`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'FROM_COMPLETED'
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;

    case 'TO_START':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      // message = `WCS(${trackingLogInsertParams.eqpCallId}) 창고 포트 배정 - ${data.WCS_PORT}`
      message = `TO 작업 시작`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'TO_START'
      // detailLogInsertParams.value = data.WCS_PORT
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;

    // TO_COMPLETED - 상태 완료 처리
    case 'TO_COMPLETED':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'COMPLETED'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      // message = `WCS(${trackingLogInsertParams.eqpCallId}) 창고 포트 배정 - ${data.WCS_PORT}`
      message = `TO 작업 완료`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'COMPLETED'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'TO_COMPLETED'
      // detailLogInsertParams.value = data.WCS_PORT
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;
  }
}

export const acsDockingTrackingLogging = async (data: DockingTrackingLoggingParams) => {
  // From, To - Docking
  let trackingLogStatus = '';
  let eqpCallId = data.EQP_CALL_ID

  if (data.EXC_CLS === 'AUTO' || data.EXC_CLS === 'MANUAL') {
    const trackingLogRedisInfo = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByEqpCallId, eqpCallId);
    let trackingLogDbInfo
    if (!trackingLogRedisInfo) {
      trackingLogDbInfo = await trackingLogDao.selectInfoByEqpCallId({ eqpCallId: eqpCallId })
    }
    const trackingLogInfo = trackingLogRedisInfo || trackingLogDbInfo

    const fromFacility = trackingLogInfo?.fromFacility
    const toFacility = trackingLogInfo?.toFacility

    if (fromFacility) {
      const fromFacilityInfo = await facilityDao.selectSerial({ serial: data.PORT_ID });
      if (fromFacilityInfo?.name === trackingLogInfo.fromFacility) {
        if (data.dockingType === 'request') {
          trackingLogStatus = 'FROM_DOCKING_REQ'
        } else if (data.dockingType === 'permit') {
          trackingLogStatus = 'FROM_DOCKING_PERMIT'
        } else if (data.dockingType === 'complete') {
          trackingLogStatus = 'FROM_DOCKING_COMPLETED'
        }
      }
    }
    if (toFacility && trackingLogStatus === '') {
      const toFacilityInfo = await facilityDao.selectSerial({ serial: data.PORT_ID });
      if (toFacilityInfo?.name === trackingLogInfo.toFacility) {
        if (data.dockingType === 'request') {
          trackingLogStatus = 'TO_DOCKING_REQ'
        } else if (data.dockingType === 'permit') {
          trackingLogStatus = 'TO_DOCKING_PERMIT'
        } else if (data.dockingType === 'complete') {
          trackingLogStatus = 'TO_DOCKING_COMPLETED'
        }
      }
    }
    if (trackingLogStatus !== '') {
      const checkTrackingLogExistsParams: CheckTrackingLogExists = {
        eqpCallId: data.EQP_CALL_ID
      }
      // Tracking 로그 만들기
      const callId = !data.EQP_CALL_ID.includes('MANUAL') ? data.EQP_CALL_ID.slice(-4) : null
      const trackingLogInsertParams: TrackingLogInsertParams = {
        code: null,
        caller: null,
        eqpCallId: data.EQP_CALL_ID,
        callId: callId,
        itemCode: null,
        subject: trackingLogStatus,
        detail: trackingLogStatus,
        state: 'PROCESSING',
        fromFacility: null,
        toFacility: null,
        assignedRobot: null,
        value: null,
        description: null,
      }

      const isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      const detailLogInsertParams: RegDetailLogInsertParams = {
        topic: trackingLogStatus,
        subject: null,
        trackingLogId: null,
        callId: callId,
        eqpCallId: data.EQP_CALL_ID,
        value: null,
        location: null,
        message: null,
        resultStatus: 'SUCCESS'
      }
      // Set Detail Log
      // tracking Log 정보

      let message = ''
      if (trackingLogStatus === 'FROM_DOCKING_REQ') {
        message = `${data.EQP_CALL_ID} 설비 도킹 요청`
      }
      else if (trackingLogStatus === 'FROM_DOCKING_PERMIT') {
        message = `${data.EQP_CALL_ID} 설비 도킹 허가`
      }
      else if (trackingLogStatus === 'FROM_DOCKING_COMPLETED') {
        message = `${data.EQP_CALL_ID} 설비 도킹 완료`
      }
      else if (trackingLogStatus === 'TO_DOCKING_REQ') {
        message = `${data.EQP_CALL_ID} 설비 도킹 요청`
      }
      else if (trackingLogStatus === 'TO_DOCKING_PERMIT') {
        message = `${data.EQP_CALL_ID} 설비 도킹 허가`
      }
      else if (trackingLogStatus === 'TO_DOCKING_COMPLETED') {
        message = `${data.EQP_CALL_ID} 설비 도킹 완료`
      }

      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = trackingLogStatus as DetailLogSubjectType
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'iMCS & ACS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
    } else {
      logging.ACTION_ERROR({
        filename: 'acsTrackingLogUtil.ts - acsDockingTrackingLogging',
        error: `알맞은 도킹 정보를 찾을 수 없습니다. data : ${data}`,
        params: null,
        result: false,
      });
      return
    }
  }
}
