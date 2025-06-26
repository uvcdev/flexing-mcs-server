import { TrackingLogInsertParams } from "../models/common/trackingLog";
import { WorkStatus, logging } from "./logging";
import { checkTrackingLogExists, CheckTrackingLogExists, regDetailLog, RegDetailLogInsertParams, regTrackingLog } from "./trackingLogUtil";
import { DetailLogInsertParams } from "../models/timescale/detailLog";
import { ImcsWorkOrderInsertParams } from "../models/operation/workOrder";
import { dao as facilityDao } from '../dao/operation/facilityDao';

export const imcsTrackingLogging = async (data: WorkStatus) => {
  try {
    const trackingLogStatus = data.STATUS;
    const splitEqpCallId = data.EQP_CALL_ID.split('$')[0]
    const checkTrackingLogExistsParams: CheckTrackingLogExists = {
      eqpCallId: splitEqpCallId
    }

    let message = ''
    let isTrackingLogExists = true
    const trackingLogInsertParams: TrackingLogInsertParams = {
      code: null,
      caller: data.EQP_ID,
      eqpCallId: splitEqpCallId,
      callId: splitEqpCallId?.slice(-4) || '',
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
      callId: splitEqpCallId?.slice(-4) || '',
      eqpCallId: splitEqpCallId,
      value: null,
      location: null,
      message: null,
      resultStatus: 'SUCCESS'
    }

    switch (trackingLogStatus) {
      case 'CALL_CREATE':
        try {
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
          detailLogInsertParams.location = trackingLogInsertParams.caller || 'Unknown'
          detailLogInsertParams.message = message

          await regDetailLog(detailLogInsertParams)
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - CALL_CREATE',
            error: `CALL_CREATE 처리 중 오류: ${error}`,
            params: data,
            result: false,
          });
        }
        break;

      case 'CALL_REQUEST':
        try {
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
          detailLogInsertParams.location = trackingLogInsertParams.caller || 'Unknown'
          detailLogInsertParams.message = message

          await regDetailLog(detailLogInsertParams)
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - CALL_REQUEST',
            error: `CALL_REQUEST 처리 중 오류: ${error}`,
            params: data,
            result: false,
          });
        }
        break;

      case 'CALL_CHECK':
        try {
          isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

          if (!isTrackingLogExists) {
            // Set Tracking Log
            trackingLogInsertParams.subject = trackingLogStatus
            trackingLogInsertParams.detail = trackingLogStatus
            trackingLogInsertParams.state = 'PROCESSING'
            await regTrackingLog(trackingLogInsertParams)
          }

          // Set Detail Log
          message = `WCS(${data.WCS_CALL_ID || 'Unknown'}) 창고 응답`
          // tracking Log 정보
          detailLogInsertParams.trackingLogState = 'PROCESSING'
          detailLogInsertParams.fromFacility = null
          detailLogInsertParams.toFacility = null
          detailLogInsertParams.assignedRobot = null
          detailLogInsertParams.value = null
          detailLogInsertParams.description = message
          // detail Log 정보
          detailLogInsertParams.subject = 'CALL_CHECK'
          detailLogInsertParams.value = data.WCS_CALL_ID || null
          detailLogInsertParams.location = 'WCS'
          detailLogInsertParams.message = message

          await regDetailLog(detailLogInsertParams)
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - CALL_CHECK',
            error: `CALL_CHECK 처리 중 오류: ${error}`,
            params: data,
            result: false,
          });
        }
        break;

      case 'CALL_RESPONSE':
        try {
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
          detailLogInsertParams.location = trackingLogInsertParams.caller || 'Unknown'
          detailLogInsertParams.message = message

          await regDetailLog(detailLogInsertParams)
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - CALL_RESPONSE',
            error: `CALL_RESPONSE 처리 중 오류: ${error}`,
            params: data,
            result: false,
          });
        }
        break;

      case 'PORT_ASSIGNED':
        try {
          isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

          if (!isTrackingLogExists) {
            // Set Tracking Log
            trackingLogInsertParams.subject = trackingLogStatus
            trackingLogInsertParams.detail = trackingLogStatus
            trackingLogInsertParams.state = 'PROCESSING'
            await regTrackingLog(trackingLogInsertParams)
          }

          // Set Detail Log
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
          detailLogInsertParams.value = data.WCS_PORT || ''
          detailLogInsertParams.location = 'WCS'
          detailLogInsertParams.message = message

          await regDetailLog(detailLogInsertParams)
        } catch (error) {
          logging.ACTION_ERROR({
            filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - PORT_ASSIGNED',
            error: `PORT_ASSIGNED 처리 중 오류: ${error}`,
            params: data,
            result: false,
          });
        }
        break;

      case 'WORK_CREATE':
        // 구현 예정
        break;

      case 'WORK_ASSIGNED':
        // 구현 예정
        break;

      case 'WCS_DOCKING_REQUEST':
        // 구현 예정
        break;

      case 'EQP_DOCKING_REQUEST':
        // 구현 예정
        break;

      case 'EQP_DOCKING_RESPONSE':
        // 구현 예정
        break;

      case 'EQP_DOCKING_COMPLETE':
        // 구현 예정
        break;

      default:
        logging.ACTION_ERROR({
          filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging',
          error: `알 수 없는 trackingLogStatus: ${trackingLogStatus}`,
          params: data,
          result: false,
        });
        break;
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'imcsTrackingLogUtil.ts - imcsTrackingLogging - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: data,
      result: false,
    });
  }
}

export const imcsWorkOrderTrackingLogging = async (data: ImcsWorkOrderInsertParams) => {
  try {
    const trackingLogStatus = 'WORK_CREATE';
    const splitEqpCallId = data.EQP_CALL_ID.split('$')[0]
    const checkTrackingLogExistsParams: CheckTrackingLogExists = {
      eqpCallId: splitEqpCallId
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

    let fromFacilityInfo = null;
    let toFacilityInfo = null;

    try {
      fromFacilityInfo = await facilityDao.selectSerial({ serial: fromFacilitySerial });
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsWorkOrderTrackingLogging - fromFacility 조회',
        error: `fromFacility 조회 중 오류: ${error}`,
        params: { fromFacilitySerial },
        result: false,
      });
    }

    try {
      toFacilityInfo = await facilityDao.selectSerial({ serial: toFacilitySerial });
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsWorkOrderTrackingLogging - toFacility 조회',
        error: `toFacility 조회 중 오류: ${error}`,
        params: { toFacilitySerial },
        result: false,
      });
    }

    // Tracking 로그 만들기
    const trackingLogInsertParams: TrackingLogInsertParams = {
      code: null,
      caller: data.EQP_ID,
      eqpCallId: splitEqpCallId,
      callId: splitEqpCallId?.slice(-4) || '',
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

    try {
      const isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'PROCESSING'
        await regTrackingLog(trackingLogInsertParams)
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsWorkOrderTrackingLogging - TrackingLog 저장',
        error: `TrackingLog 저장 중 오류: ${error}`,
        params: trackingLogInsertParams,
        result: false,
      });
    }

    // Set Detail Log
    const detailLogInsertParams: RegDetailLogInsertParams = {
      topic: trackingLogStatus,
      subject: null,
      trackingLogId: null,
      callId: splitEqpCallId?.slice(-4) || '',
      eqpCallId: splitEqpCallId,
      value: null,
      location: null,
      message: null,
      resultStatus: 'SUCCESS'
    }

    try {
      // Set Detail Log
      // tracking Log 정보
      const message = `(${fromFacilityInfo?.name || 'Unknown'}) - (${toFacilityInfo?.name || 'Unknown'}) 작업 지시 생성`
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
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsWorkOrderTrackingLogging - DetailLog 저장',
        error: `DetailLog 저장 중 오류: ${error}`,
        params: detailLogInsertParams,
        result: false,
      });
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'imcsTrackingLogUtil.ts - imcsWorkOrderTrackingLogging - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: data,
      result: false,
    });
  }
}

export interface FacilityCanceledTrackingLoggingParams {
  eqpCallId: string,
}

export const imcsFacilityCanceledTrackingLogging = async (data: FacilityCanceledTrackingLoggingParams) => {
  try {
    const trackingLogStatus = 'UNKNOWN';
    const splitEqpCallId = data.eqpCallId.split('$')[0]
    const checkTrackingLogExistsParams: CheckTrackingLogExists = {
      eqpCallId: splitEqpCallId
    }

    // Tracking 로그 만들기
    const trackingLogInsertParams: TrackingLogInsertParams = {
      code: null,
      caller: null,
      eqpCallId: splitEqpCallId,
      callId: splitEqpCallId?.slice(-4) || '',
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

    try {
      const isTrackingLogExists = await checkTrackingLogExists(checkTrackingLogExistsParams)

      if (!isTrackingLogExists) {
        // Set Tracking Log
        trackingLogInsertParams.subject = trackingLogStatus
        trackingLogInsertParams.detail = trackingLogStatus
        trackingLogInsertParams.state = 'CANCELED'
        await regTrackingLog(trackingLogInsertParams)
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsFacilityCanceledTrackingLogging - TrackingLog 저장',
        error: `TrackingLog 저장 중 오류: ${error}`,
        params: trackingLogInsertParams,
        result: false,
      });
    }

    // Set Detail Log
    const detailLogInsertParams: RegDetailLogInsertParams = {
      topic: trackingLogStatus,
      subject: null,
      trackingLogId: null,
      callId: splitEqpCallId?.slice(-4) || '',
      eqpCallId: splitEqpCallId,
      value: null,
      location: null,
      message: null,
      resultStatus: 'SUCCESS'
    }

    try {
      // Set Detail Log
      // tracking Log 정보
      const message = `EQP CALL ID(${data.eqpCallId}) 설비 취소 발생`
      detailLogInsertParams.trackingLogState = 'CANCELED'
      detailLogInsertParams.fromFacility = null
      detailLogInsertParams.toFacility = null
      detailLogInsertParams.assignedRobot = null
      detailLogInsertParams.value = null
      detailLogInsertParams.description = message
      // detail Log 정보
      detailLogInsertParams.subject = 'UNKNOWN'
      detailLogInsertParams.value = null
      detailLogInsertParams.location = 'EQP'
      detailLogInsertParams.message = message

      await regDetailLog(detailLogInsertParams)
    } catch (error) {
      logging.ACTION_ERROR({
        filename: 'imcsTrackingLogUtil.ts - imcsFacilityCanceledTrackingLogging - DetailLog 저장',
        error: `DetailLog 저장 중 오류: ${error}`,
        params: detailLogInsertParams,
        result: false,
      });
    }
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'imcsTrackingLogUtil.ts - imcsFacilityCanceledTrackingLogging - 전체',
      error: `전체 함수 처리 중 오류: ${error}`,
      params: data,
      result: false,
    });
  }
}