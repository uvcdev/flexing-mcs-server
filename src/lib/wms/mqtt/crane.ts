import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from "../../../models/common/trackingLog";
import { logging } from "../../logging";
import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog";
import { setReceivedAckCommand } from "../../process/wmsAck"
import { RedisKeys, useRedisUtil } from "../../redisUtil";

const redisUtil = useRedisUtil();

const systemTopic = 'CRANE'

const craneActive = async (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms CraneActive')



  const transferId = messageMessage.body.TransferID || null
  const trackingLogInfoByTransferId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByTransferId, transferId);
  const callId = trackingLogInfoByTransferId?.callId || ''

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  if (!transferId) {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneActive`,
      error: `transferId (${transferId}) is invalid `,
      params: null,
      result: false,
    });

    return
  }


  // Item Log 생성

  const trackingLogSubject = 'CRANE_ACTIVE'
  const trackingLogDetail = 'CRANE_ACTIVE'
  const trackingLogState = 'PROCESSING'
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: trackingLogInfoByTransferId?.startFacility,
    transferId: transferId,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Call ID ${trackingLogInfoByTransferId?.callId} received 'CRANE_ACTIVE' from WMS(${wmsName})`
  }
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName)
}

const craneIdle = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms CraneIdle')
  const callId: string = 'TODO crane CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

const ackForkActive = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms CraneIdle')
  const callId: string = 'TODO crane CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
}

export const wmsCrane = async (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CRANE_ACTIVE') {
    await craneActive(wmsName, messageJson)
  } else if (subject === 'CRANE_IDLE') {
    craneIdle(wmsName, messageJson)
  } else if (subject === 'FORK_ACTIVE') {
    ackForkActive(wmsName, messageJson)
  }
}