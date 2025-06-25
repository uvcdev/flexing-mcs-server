import { TrackingLogInsertParams } from "models/common/trackingLog";
import { WorkStatus } from "./logging";
import { checkTrackingLogExists, CheckTrackingLogExists, regDetailLog, RegDetailLogInsertParams, regTrackingLog } from "./trackingLogUtil";
import { DetailLogInsertParams } from "models/timescale/detailLog";


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
      detailLogInsertParams.value = null
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