import { TrackingLogInsertParams } from "../models/common/trackingLog";
import { WorkStatus } from "./logging";
import { checkTrackingLogExists, CheckTrackingLogExists, regDetailLog, RegDetailLogInsertParams, regTrackingLog } from "./trackingLogUtil";
import { DetailLogInsertParams } from "../models/timescale/detailLog";
import { ImcsWorkOrderInsertParams } from "../models/operation/workOrder";
import { dao as facilityDao } from '../dao/operation/facilityDao';


export const imcsTrackingLogging = async (data: WorkStatus) => {
  const trackingLogStatus = data.STATUS;
  const checkTrackingLogExistsParams: CheckTrackingLogExists = {
    eqpCallId: data.EQP_CALL_ID
  }
  let message = ''
  let isTrackingLogExists = true
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: null,
    caller: data.EQP_ID,
    eqpCallId: data.EQP_CALL_ID,
    callId: data.EQP_CALL_ID.slice(-4),
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
    callId: data.EQP_CALL_ID.slice(-4),
    eqpCallId: data.EQP_CALL_ID,
    value: null,
    location: null,
    message: null,
    resultStatus: 'SUCCESS'
  }


  switch (trackingLogStatus) {
    case 'CALL_CREATE':
      // Set Tracking Log
      trackingLogInsertParams.subject = trackingLogStatus
      trackingLogInsertParams.detail = trackingLogStatus
      trackingLogInsertParams.state = 'PUBLISHED'

      await regTrackingLog(trackingLogInsertParams)

      // Set Detail Log
      // tracking Log 정보
      message = `${trackingLogInsertParams.caller} 설비에서 CALL ID (${trackingLogInsertParams.callId}) 발생`
      detailLogInsertParams.trackingLogState = 'PUBLISHED'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'CALL_CREATE'
      detailLogInsertParams.value = trackingLogInsertParams.callId
      detailLogInsertParams.location = trackingLogInsertParams.caller
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;
    case 'CALL_REQUEST':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `EQP(${trackingLogInsertParams.eqpCallId}) 창고 요청`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'CALL_REQUEST'
      detailLogInsertParams.value = null
      detailLogInsertParams.location = trackingLogInsertParams.caller
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)

      break;

    case 'CALL_CHECK':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `WCS(${data.WCS_CALL_ID}) 창고 응답`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'CALL_CHECK'
      detailLogInsertParams.value = data.WCS_CALL_ID
      detailLogInsertParams.location = 'WCS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)

      break;

    case 'CALL_RESPONSE':
      isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }

      // Set Detail Log
      message = `EQP(${trackingLogInsertParams.eqpCallId}) 호출 응답`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'CALL_RESPONSE'
      detailLogInsertParams.value = null
      detailLogInsertParams.location = trackingLogInsertParams.caller
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;

    case 'PORT_ASSIGNED':
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
      message = `WCS(${trackingLogInsertParams.eqpCallId}) 창고 포트 배정`
      // tracking Log 정보
      detailLogInsertParams.trackingLogState = 'PROCESSING'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'PORT_ASSIGNED'
      // detailLogInsertParams.value = data.WCS_PORT
      detailLogInsertParams.value = data.WCS_PORT || ''
      detailLogInsertParams.location = 'WCS'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
      break;

    // WORK_CREATE, WORK_ASSIGNED도 검토 후 확인 필요
    case 'WORK_CREATE':

      break;

    case 'WORK_ASSIGNED':

      break;

    // Docking 쪽 부터는 검토 후 확인 필요
    case 'WCS_DOCKING_REQUEST':

      break;
    case 'WCS_DOCKING_REQUEST':

      break;
    case 'WCS_DOCKING_REQUEST':

      break;
    case 'EQP_DOCKING_REQUEST':

      break;
    case 'EQP_DOCKING_RESPONSE':

      break;
    case 'EQP_DOCKING_COMPLETE':

      break;

    default:
      break;
  }


}

export const imcsWorkOrderTrackingLogging = async (data: ImcsWorkOrderInsertParams) => {
  const trackingLogStatus = 'WORK_CREATE';
  const checkTrackingLogExistsParams: CheckTrackingLogExists = {
    eqpCallId: data.EQP_CALL_ID
  }

  // 설비 정보 GET
  let fromFacilitySerial = null;
  let toFacilitySerial = null;

  if (data.TYPE === 'OUT') {
    fromFacilitySerial = data.EQP_ID;
    toFacilitySerial = data.PORT_ID;
  } else {
    fromFacilitySerial = data.PORT_ID;
    toFacilitySerial = data.EQP_ID;
  }

  const fromFacilityInfo = await facilityDao.selectSerial({ serial: fromFacilitySerial });
  const toFacilityInfo = await facilityDao.selectSerial({ serial: toFacilitySerial });

  // Tracking 로그 만들기
  const trackingLogInsertParams: TrackingLogInsertParams = {
    code: null,
    caller: data.EQP_ID,
    eqpCallId: data.EQP_CALL_ID,
    callId: data.EQP_CALL_ID.slice(-4),
    itemCode: data.CALL_TYPE,
    subject: null,
    detail: null,
    state: null,
    fromFacility: fromFacilityInfo?.name || null,
    toFacility: toFacilityInfo?.name || null,
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
    callId: data.EQP_CALL_ID.slice(-4),
    eqpCallId: data.EQP_CALL_ID,
    value: null,
    location: null,
    message: null,
    resultStatus: 'SUCCESS'
  }

  // Set Detail Log
  // tracking Log 정보
  const message = `(${fromFacilityInfo?.name}) - (${toFacilityInfo?.name}) 작업 지시 생성`
  detailLogInsertParams.trackingLogState = 'PROCESSING'
  detailLogInsertParams.fromFacility = fromFacilityInfo?.name || null,
    detailLogInsertParams.toFacility = toFacilityInfo?.name || null,
    detailLogInsertParams.assignedRobot = null
  detailLogInsertParams.value = null
  detailLogInsertParams.description = message
  // detail Log 정보
  detailLogInsertParams.subject = 'WORK_CREATE'
  detailLogInsertParams.value = null
  detailLogInsertParams.location = 'MCS & ACS'
  detailLogInsertParams.message = message

  await regDetailLog(detailLogInsertParams)
}