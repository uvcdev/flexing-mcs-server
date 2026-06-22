import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../../../models/common/trackingLog';
import { logging } from '../../logging';
import { separateMqttMessage, MbsMqttMessage, MbsMqttBody } from '../../mqttUtil';
import { usePlcConnectUtil } from '../../plcConnectUtil';
import { editTrackingLogRedis } from '../../process/trackingLog';
import { setReceivedAckCommand } from '../../process/wmsAck';
import { RecentCallInfo } from '../../process/wmsCommon';
import { RedisKeys, useRedisUtil } from '../../redisUtil';

const redisUtil = useRedisUtil();

const systemTopic = 'CRANE';

export interface CraneActiveBody extends MbsMqttBody {
  EQPName: string;
  TransferID: string;
  CraneID: string;
}

export interface CraneIdleBody extends MbsMqttBody {
  EQPName: string;
  CraneID: string;
}

export interface ForkActiveBody extends MbsMqttBody {
  EQPName: string;
  TransferID: string;
  CraneID: string;
  ForkAction: 'PICKUP' | 'UNLOAD';
}

const craneActive = async (wmsName: string, subject: string, messageMessage: MbsMqttMessage) => {
  // console.log('catch wms CraneActive');
  const transferId = messageMessage.body.TransferID || null;
  const cmdId = messageMessage.body.Cmd_ID || null;

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneActive`,
      error: `cmdId (${cmdId}) is invalid `,
      params: null,
      result: false,
    });
    return;
  }

  const recentCallInfoTask = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);
  // console.log('recentCallInfoTask', recentCallInfoTask);
  const callId = recentCallInfoTask?.callId || '';

  // console.log('recentCallInfoTask', recentCallInfoTask);
  // ACK 발송
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  if (!transferId) {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneActive`,
      error: `transferId (${transferId}) is invalid `,
      params: null,
      result: false,
    });

    return;
  }

  // Item Log 생성
  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  const trackingLogState = 'PROCESSING';
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: null,
    transferId: transferId,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Call ID ${callId} received 'CRANE_ACTIVE' from WMS(${wmsName})`,
    processState: 'NORMAL',
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);

  const caller = recentCallInfoTask?.caller || '';
  if (!!caller) {
    const plcConnectUtil = usePlcConnectUtil();
    const callResponseValue = (await plcConnectUtil.getTagValue(caller, 'Call_Response')) as boolean;

    if (callResponseValue === false) {
      const callCountValue = (await plcConnectUtil.getTagValue(caller, 'Call_Count')) as number;

      await plcConnectUtil.writeTagValue({
        targetFacility: caller || '',
        tagInfo: [
          { tagName: 'Call_Response', value: true },
          { tagName: 'Call_Response_Count', value: String(callCountValue) },
        ],
      });
    }
  }
};

const craneIdle = async (wmsName: string, subject: string, messageMessage: MbsMqttMessage) => {
  console.log('catch wms CraneIdle');

  const messageBody = messageMessage.body as CraneIdleBody;
  const cmdId = messageBody.Cmd_ID || '';

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneIdle`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const recentCallInfoTask = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);

  const callId = recentCallInfoTask?.callId || '';

  // ACK 발송 callId 상관 없이 일단 보내야함
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  if (!callId || callId === '') {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneIdle - recentCallInfoTask`,
      error: `[CallId] CallId Id ${callId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  // Item Log 생성
  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  const trackingLogState = 'PROCESSING';
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
    description: `Call ID ${callId} received '${subject}' from WMS(${wmsName})`,
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
};

const craneForkActive = async (wmsName: string, subject: string, messageMessage: MbsMqttMessage) => {
  // console.log('catch wms CraneIdle');

  const messageBody = messageMessage.body as ForkActiveBody;
  const cmdId = messageBody.Cmd_ID || '';

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneForkActive`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const recentCallInfoTask = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId);

  const callId = recentCallInfoTask?.callId || '';

  // ACK 발송 callId 상관 없이 일단 보내야함
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  if (!callId || callId === '') {
    logging.ACTION_ERROR({
      filename: `crane.ts - craneForkActive - recentCallInfoTask`,
      error: `[CallId] CallId Id ${callId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  // Item Log 생성
  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  const trackingLogState = 'PROCESSING';
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
    description: `Call ID ${callId} received '${subject}' from WMS(${wmsName})`,
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
};

export const wmsCrane = async (wmsName: string, messageJson: MbsMqttMessage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CRANE_ACTIVE') {
    await craneActive(wmsName, subject, messageJson);
  } else if (subject === 'CRANE_IDLE') {
    await craneIdle(wmsName, subject, messageJson);
  } else if (subject === 'FORK_ACTIVE') {
    await craneForkActive(wmsName, subject, messageJson);
  }
};
