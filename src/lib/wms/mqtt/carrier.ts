import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams, TrackingLogState } from "../../../models/common/trackingLog";
import { logging } from "../../logging";
import { separateMqttMessage, MbsMqttMesaage, MbsMqttBody } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog";
import { setReceivedAckCommand } from "../../process/wmsAck"
import { RecentCallInfo } from "../../process/wmsCommon";
import { RedisKeys, useRedisUtil } from "../../redisUtil";

const redisUtil = useRedisUtil();

const systemTopic = 'CARRIER'

export interface CarrierTransferringBody extends MbsMqttBody {
  EQPName: string,
  CarrierID: string,
  CarrierLoc: string
}

export interface CarrierWaitOutBody extends MbsMqttBody {
  EQPName: string,
  CarrierID: string,
  CarrierLoc: string,
  CarrierState: '0' | '1' | '2' | '3' | '4',
  CarrierQuantity: string,
}

const carrierTransferring = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsCallRequest')
  const messageBody = messageMessage.body as CarrierTransferringBody
  const cmdId = messageBody.Cmd_ID || '';

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `carrier.ts - carrierTransferring`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  const recentCallInfoTask = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId)

  const callId = recentCallInfoTask?.callId || ''

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `carrier.ts - carrierTransferring - recentCallInfoTask`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // Item Log 생성
  const trackingLogSubject = subject
  const trackingLogDetail = subject
  const trackingLogState = 'PROCESSING'
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: null,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Call ID ${callId} received '${subject}' from WMS(${wmsName})`
  }
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName)
}

const carrierIdread = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckCallInfo')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierWaitin = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckCancelCallInfo')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierWaitout = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const messageBody = messageMessage.body as CarrierWaitOutBody
  const cmdId = messageBody.Cmd_ID || '';
  const carrierState = messageBody.CarrierState

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `carrier.ts - carrierWaitout`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  const recentCallInfoTask = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId)

  const callId = recentCallInfoTask?.callId || ''

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `carrier.ts - carrierWaitout - recentCallInfoTask`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // ITEM LOG 기록
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

  switch (carrierState) {
    // Nomarl
    case '0':
      // Item Log 생성
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : Nomarl`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // FULL
    case '1':
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : FULL`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // EMPTY
    case '2':
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : EMPTY`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // 피킹 NG
    case '3':
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : Picking NG`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // 잔량 스키드 ( BSA 라인 ?)
    case '4':
      trackingLogState = 'PROCESSING'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : Remnant Load`
      }, undefined, 'SUCCESS', wmsName)
      break;
    // 의도하지 않은 CODE 오류 로깅
    // 해당 경우는 ERROR 지만 계속 물류 작업은 진행될 가능성이 있음
    default:
      trackingLogState = 'ERROR'
      await editTrackingLogRedis({
        ...baseTrackingLogData,
        state: trackingLogState,
        description: `Call ID ${callId} received '${subject}' from WMS(${wmsName}) - Carrier State : NONE`
      }, undefined, 'ERROR', wmsName)
      break;
  }
}

const carrierStored = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierRemoved = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierInstallCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const carrierRemoveCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsAckReqCallInfoList')
  const callId: string = 'TODO Carrier CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

export const wmsCarrier = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CARRIER_TRANSFERRING') {
    carrierTransferring(wmsName, subject, messageJson)
  } else if (subject === 'CARRIER_IDREAD') {
    carrierIdread(wmsName, messageJson)
  } else if (subject === 'CARRIER_WAITIN') {
    carrierWaitin(wmsName, messageJson)
  } else if (subject === 'CARRIER_WAITOUT') {
    carrierWaitout(wmsName, subject, messageJson)
  } else if (subject === 'CARRIER_STORED') {
    carrierStored(wmsName, messageJson)
  } else if (subject === 'CARRIER_REMOVED') {
    carrierRemoved(wmsName, messageJson)
  } else if (subject === 'CARRIER_INSTALL_COMPLETED') {
    carrierInstallCompleted(wmsName, messageJson)
  } else if (subject === 'CARRIER_REMOVE_COMPLETED') {
    carrierRemoveCompleted(wmsName, messageJson)
  }
}