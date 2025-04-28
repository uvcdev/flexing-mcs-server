import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from "../../../models/common/trackingLog";
import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog";
import { setReceivedAckCommand } from "../../process/wmsAck"
import { RedisKeys, useRedisUtil } from "../../redisUtil";

const redisUtil = useRedisUtil();

const systemTopic = 'TRANSFER'


const transferInitiated = async (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms TRANSFER_INITIATED')

  const callId = messageMessage.body.Call_ID;
  const transferId = messageMessage.body.TransferID;

  // 단순 Hcack = 4 기록
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // Item Log 생성
  const trackingLogInfoByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId, callId);

  const trackingLogSubject = 'TRANSFER_INITIATED'
  const trackingLogDetail = 'TRANSFER_INITIATED'
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

const transferCompleted = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferCompleted')

  const callId: string = 'TODO transfer CALL ID'

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

export const wmsTransfer = async (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'TRANSFER_INITIATED') {
    await transferInitiated(wmsName, messageJson)
  } else if (subject === 'TRANSFER_CANCEL_COMPLETED') {
    transferCancelCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_ABORT_COMPLETED') {
    transferAbortCompleted(wmsName, messageJson)
  } else if (subject === 'TRANSFER_PAUSED') {
    transferPaused(wmsName, messageJson)
  } else if (subject === 'TRANSFER_RESUMED') {
    transferResumed(wmsName, messageJson)
  } else if (subject === 'TRANSFER_COMPLETED') {
    transferCompleted(wmsName, messageJson)
  }
}