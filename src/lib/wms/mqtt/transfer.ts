import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams, TrackingLogState } from "../../../models/common/trackingLog";
import { logging } from "../../logging";
import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog";
import { setReceivedAckCommand } from "../../process/wmsAck"
import { RedisKeys, useRedisUtil } from "../../redisUtil";

const redisUtil = useRedisUtil();

const systemTopic = 'TRANSFER'

export interface TransferCompletedBody {
  Cmd_ID: string,
  TransferID: string,
  Call_ID: string,
  PairTransferID: string,
  CarrierLoc: string,
  ResultCode: "4" | "11" | "12" | "21" | "31" | "64"
}


const transferInitiated = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms TRANSFER_INITIATED')

  const callId = messageMessage.body.Call_ID;
  const transferId = messageMessage.body.TransferID;

  // 단순 Hcack = 4 기록
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // Item Log 생성
  const trackingLogInfoByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId, callId);

  const trackingLogSubject = subject
  const trackingLogDetail = subject
  const trackingLogState = 'PROCESSING'
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: trackingLogInfoByCallId?.startFacility,
    transferId: transferId,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})`
  }
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName)
}

const transferCancelCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferCancelCompleted')

  const callId: string = 'TODO transfer CALL ID'

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const transferAbortCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferAbortCompleted')

  const callId: string = 'TODO transfer CALL ID'

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const transferPaused = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferPaused')

  const callId: string = 'TODO transfer CALL ID'

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const transferResumed = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferResumed')

  const callId: string = 'TODO transfer CALL ID'

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const transferCompleted = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferCompleted')

  const messageBody = messageMessage.body as TransferCompletedBody

  const resultCode = messageBody.ResultCode
  const callId = messageBody.Call_ID

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // result code 에 따른 분기 처리
  const trackingLogSubject = subject
  const trackingLogDetail = subject
  let trackingLogState: TrackingLogState
  const baseTrackingLogData = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    startFacility: null,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
  };


  switch (resultCode) {
    // result === 4 
    // 정상 완료
    case '4':
      // Item Log 생성
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName})`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // 각각의 에러 상황에 대한 정의는 64 비정상 완료만 존재함 ( 공출고 ) 나머지는 일단 TrackingLog 및 로깅 처리만
    // 목적지 상태 이상
    case '11':
      // Item Log 생성 - 에러
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Destination status abnormal`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ERROR'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Destination status abnormal`
      }, undefined, 'ERROR', wmsName)

      break;

    // 출발지 상태 이상 (Source Error, 알람, 사용금지, 제품 없음 外)
    case '12':
      // Item Log 생성 - 에러
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Origin status abnormal`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ERROR'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Origin status abnormal`
      }, undefined, 'ERROR', wmsName)
      break;
    // 목적지 만재 (Dest Full) 
    case '21':
      // Item Log 생성 - Abort
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Dest Full`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ABORTED'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Dest Full`
      }, undefined, 'ABORTED', wmsName)

      break;
    // 제품 없음
    case '31':
      // Item Log 생성 - Abort
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Inventory not available`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ABORTED'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Inventory not available`
      }, undefined, 'ABORTED', wmsName)

      break;
    // 비정상 완료
    case '64':
      // Item Log 생성 - 공출고
      // abort 로그만 기록한 후창고에서 CALL_REQUEST 요청한 것에 대한 응답만 잘 주면 됨.
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Empty shipment`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ABORTED'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Empty shipment`
      }, undefined, 'ABORTED', wmsName)

      break;
    default:
      // Item Log 생성 - 에러
      // 미확인된 작업
      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Inventory not available`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ABORTED'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId}, ResultCode(${resultCode}): Inventory not available`
      }, undefined, 'ABORTED', wmsName)
      break;
  }
}

export const wmsTransfer = async (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'TRANSFER_INITIATED') {
    await transferInitiated(wmsName, subject, messageJson)
  } else if (subject === 'TRANSFER_CANCEL_COMPLETED') {
    transferCancelCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_ABORT_COMPLETED') {
    transferAbortCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_PAUSED') {
    transferPaused(wmsName, messageJson)
  } else if (subject === 'TRANSFER_RESUMED') {
    transferResumed(wmsName, messageJson)
  } else if (subject === 'TRANSFER_COMPLETED') {
    transferCompleted(wmsName, subject, messageJson)
  }
}