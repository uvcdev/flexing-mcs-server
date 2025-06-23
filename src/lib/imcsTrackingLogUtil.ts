import { TrackingLogInsertParams } from "models/common/trackingLog";
import { WorkStatus } from "./logging";
import { CheckTrackingLogExists, regTrackingLog } from "./trackingLogUtil";
import { DetailLogInsertParams } from "models/timescale/detailLog";


export const imcsTrackingLogging = async (data: WorkStatus) => {
  const trackingLogStatus = data.STATUS;
  const checkTrackingLogExistsParams: CheckTrackingLogExists = {
    eqpCallId: data.EQP_CALL_ID
  }
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

  const detailLogInsertParams: DetailLogInsertParams = {
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

      break;
    case 'CALL_REQUEST':

      break;

    case 'CALL_CHECK':

      break;

    case 'CALL_RESPONSE':

      break;

    case 'PORT_ASSIGNED':

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