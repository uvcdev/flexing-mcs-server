import {
  TrackingLogRedisAttributes,
  TrackingLogRedisUpdateParams,
  TrackingLogState,
} from '../../../models/common/trackingLog';
import { generateUUIDNode } from '../../hashUtil';
import { logging } from '../../logging';
import { separateMqttMessage, MbsMqttMesaage, MbsMqttBody, sendMbsMqtt, makeMbsMqttHeader } from '../../mqttUtil';
import { editTrackingLogRedis } from '../../process/trackingLog';
import { CheckRetryCallInfoByCallIdParams, setReceivedAckCommand, setRemainingAckCommand } from '../../process/wmsAck';
import { deleteInfoAckInCallByCallId } from '../../process/wmsCallInfo';
import {
  AbnormalCompletedCallInfo,
  deleteRecentCallInfoTaskByCmdId,
  RecentCallInfo,
  setRecentCallInfoTaskByCmdId,
} from '../../process/wmsCommon';
import { RedisKeys, useRedisUtil } from '../../redisUtil';
import { InfoAckInCallByCallIdBody } from './call';

const redisUtil = useRedisUtil();

const systemTopic = 'TRANSFER';

export interface TransferCompletedBody {
  Cmd_ID: string;
  TransferID: string;
  Call_ID: string;
  PairTransferID: string;
  CarrierLoc: string;
  ResultCode: '4' | '11' | '12' | '21' | '31' | '64';
}

export interface TransferCancelCompletedBody extends MbsMqttBody {
  Cmd_ID: string;
  TransferID: string;
  Call_ID: string;
  CarrierID: string;
  PairTransferID: string;
  ResultCode: string;
}

export interface TransferAbortCompletedBody extends MbsMqttBody {
  Cmd_ID: string;
  TransferID: string;
  Call_ID: string;
  CarrierID: string;
  PairTransferID: string;
  ResultCode: string;
}

const transferInitiated = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wms TRANSFER_INITIATED');

  const callId = messageMessage.body.Call_ID;
  const transferId = messageMessage.body.TransferID;

  // 단순 Hcack = 4 기록
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // Item Log 생성
  const trackingLogInfoByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
    RedisKeys.InfoTrackingLogByCallId,
    callId
  );

  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  const trackingLogState = 'PROCESSING';
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
    description: `Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})`,
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
};

// TransferCancelCompleted는 창고에서는 응답을 기다리지 않고 바로 처리한다.
const transferCancelCompleted = async (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferCancelCompleted');

  const transferCancelCompletedBody = messageMessage.body as TransferCancelCompletedBody;
  const cmdId = transferCancelCompletedBody.Cmd_ID;
  const callId: string = transferCancelCompletedBody.Call_ID;
  const infoAckInCallByCallId = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
    RedisKeys.InfoAckInCallByCallId,
    callId
  );

  // resultCode 별 분기 미정의
  const resultCode = transferCancelCompletedBody.ResultCode;

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // transfer aborted completed 트래킹 로그 기록
  // CALL INFO 추가 로깅
  const cancelTrackingLogSubject = 'TRANSFER';
  const cancelTrackingLogDetail = 'TRANSFER_CANCEL_COMPLETED';
  const cancelTrackingLogState = 'ABORTED';
  const cancelTrackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: cancelTrackingLogSubject,
    detail: cancelTrackingLogDetail,
    state: cancelTrackingLogState,
    startFacility: null,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Received TRANSFER_CANCEL_COMPLETED from WMS(${wmsName}) for Call ID ${callId}`,
  };
  await editTrackingLogRedis(cancelTrackingLogUpdateData, undefined, 'SUCCESS', wmsName);

  // 진행 중인 콜 정보 삭제
  // infoAckInCallByCallId 정보 삭제
  deleteInfoAckInCallByCallId(callId);

  // RecentCallInfoTaskByCmdId 정보 삭제
  if (infoAckInCallByCallId?.Cmd_ID) {
    deleteRecentCallInfoTaskByCmdId(infoAckInCallByCallId.Cmd_ID);
  }

  // 내용 수정 25-09-23 해당 내용 수정 설비 정보로 바로 CALL_INFO를 재요청한다.
  // 설비의 Call 정보 확인 후 재 송부가 필요한 내용을 Redis에 저장
  // const checkRetryCallInfoByCallIdParams: CheckRetryCallInfoByCallIdParams = {
  //   callId: callId,
  //   caller: callId.slice(0, 4),
  // };

  // redisUtil.hset(RedisKeys.CheckRetryCallInfoByCallId, callId, JSON.stringify(checkRetryCallInfoByCallIdParams));

  if (!infoAckInCallByCallId) {
    // TODO - ljk ) 이때 해당 CALL ID 가 없어서 HCACK = 6 으로 회신해야 하는지 질문해야함
    logging.ACTION_INFO({
      filename: `call.ts - callRequest`,
      error: `[infoAckInCallByCallId] infoAckInCallByCallId ${infoAckInCallByCallId} is invalid`,
      params: null,
      result: true,
    });

    return;
  }

  // CALL INFO 재전송 가능한 경우 해당 내용으로 CALLINFO 재전송
  const callInfoTopic = 'CALL';
  const callInfoSubject = 'CALL_INFO';
  const newCmdId = generateUUIDNode();

  const mqttHeader = makeMbsMqttHeader(callInfoSubject);
  const mqttBody: MbsMqttBody = {
    Cmd_ID: newCmdId,
    Call_ID: infoAckInCallByCallId.CALL_ID,
    Call_Type: infoAckInCallByCallId.Call_Type,
    Caller: infoAckInCallByCallId.Caller,
    Call_Quantity: infoAckInCallByCallId.Call_Quantity,
    Call_Priority: infoAckInCallByCallId.Call_Priority,
  };
  // CALLINFO MQTT 데이터 전송
  sendMbsMqtt(callInfoTopic, mqttHeader, mqttBody, wmsName);

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(callInfoTopic, wmsName, { header: mqttHeader, body: mqttBody });

  // 2025-09-25 진행 중인 콜은 ACK를 받으면 해당 정보는 새로 기록됨 
  // 진행 중인 infoAckInCallByCallId의 Cmd_ID 변경해주기
  // const infoAckInCallByCallIdData: InfoAckInCallByCallIdBody = {
  //   Cmd_ID: newCmdId,
  //   CALL_ID: infoAckInCallByCallId.CALL_ID,
  //   EQP_CALL_ID: infoAckInCallByCallId.EQP_CALL_ID,
  //   Call_Type: infoAckInCallByCallId.Call_Type,
  //   Caller: infoAckInCallByCallId.Caller,
  //   Call_Priority: infoAckInCallByCallId.Call_Priority,
  //   Call_Quantity: Number(infoAckInCallByCallId.Call_Quantity) || 1,
  //   updatedTime: new Date(),
  // };
  // redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdData));

  // Recent call info task 기록
  const recentCallInfoTaskParams: RecentCallInfo = {
    cmdId: mqttBody.Cmd_ID || '',
    callId: mqttBody.Call_ID,
    transferId: null,
    callType: mqttBody.Call_Type,
    callQuantity: mqttBody.Call_Quantity,
    callPriority: mqttBody.Call_Priority,
    caller: mqttBody.Caller,
    port: null,
  };
  setRecentCallInfoTaskByCmdId(recentCallInfoTaskParams);

  // CALL INFO 추가 로깅
  const trackingLogSubject = 'CALL_INFO';
  const trackingLogDetail = 'CALL_INFO';
  const trackingLogState = 'PROCESSING';
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: infoAckInCallByCallId.Caller,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Requesting CALL_INFO from WMS(${wmsName}) for Call ID ${callId} - TRANSFER_CANCELED`,
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
};

// TransferAbortCompleted는 창고가 MCS의 응답을 받은 이후에 진행한다.
const transferAbortCompleted = async (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferAbortCompleted');

  const transferCancelCompletedBody = messageMessage.body as TransferAbortCompletedBody;
  const cmdId = transferCancelCompletedBody.Cmd_ID;
  const callId: string = transferCancelCompletedBody.Call_ID;
  const infoAckInCallByCallId = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
    RedisKeys.InfoAckInCallByCallId,
    callId
  );

  // resultCode 별 분기 미정의
  const resultCode = transferCancelCompletedBody.ResultCode;

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // transfer aborted completed 트래킹 로그 기록
  // CALL INFO 추가 로깅
  const abortTrackingLogSubject = 'TRANSFER';
  const abortTrackingLogDetail = 'TRANSFER_ABORT_COMPLETED';
  const abortTrackingLogState = 'ABORTED';
  const abortTrackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: abortTrackingLogSubject,
    detail: abortTrackingLogDetail,
    state: abortTrackingLogState,
    startFacility: null,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Received TRANSFER_ABORT_COMPLETED from WMS(${wmsName}) for Call ID ${callId}`,
  };
  await editTrackingLogRedis(abortTrackingLogUpdateData, undefined, 'SUCCESS', wmsName);

  // 진행 중인 콜 정보 삭제
  // infoAckInCallByCallId 정보 삭제
  deleteInfoAckInCallByCallId(callId);

  // RecentCallInfoTaskByCmdId 정보 삭제
  if (infoAckInCallByCallId?.Cmd_ID) {
    deleteRecentCallInfoTaskByCmdId(infoAckInCallByCallId.Cmd_ID);
  }

  // 내용 수정 25-09-23 해당 내용 수정 설비 정보로 바로 CALL_INFO를 재요청한다.
  // 설비의 Call 정보 확인 후 재 송부가 필요한 내용을 Redis에 저장
  // const checkRetryCallInfoByCallIdParams: CheckRetryCallInfoByCallIdParams = {
  //   callId: callId,
  //   caller: callId.slice(0, 4),
  // };

  // redisUtil.hset(RedisKeys.CheckRetryCallInfoByCallId, callId, JSON.stringify(checkRetryCallInfoByCallIdParams));
  if (!infoAckInCallByCallId) {
    // TODO - ljk ) 이때 해당 CALL ID 가 없어서 HCACK = 6 으로 회신해야 하는지 질문해야함
    logging.ACTION_INFO({
      filename: `call.ts - callRequest`,
      error: `[infoAckInCallByCallId] infoAckInCallByCallId ${infoAckInCallByCallId} is invalid`,
      params: null,
      result: true,
    });

    return;
  }

  // CALL INFO 재전송 가능한 경우 해당 내용으로 CALLINFO 재전송
  const callInfoTopic = 'CALL';
  const callInfoSubject = 'CALL_INFO';
  const newCmdId = generateUUIDNode();

  const mqttHeader = makeMbsMqttHeader(callInfoSubject);
  const mqttBody: MbsMqttBody = {
    Cmd_ID: newCmdId,
    Call_ID: infoAckInCallByCallId.CALL_ID,
    Call_Type: infoAckInCallByCallId.Call_Type,
    Caller: infoAckInCallByCallId.Caller,
    Call_Quantity: infoAckInCallByCallId.Call_Quantity,
    Call_Priority: infoAckInCallByCallId.Call_Priority,
  };
  // CALLINFO MQTT 데이터 전송
  sendMbsMqtt(callInfoTopic, mqttHeader, mqttBody, wmsName);

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(callInfoTopic, wmsName, { header: mqttHeader, body: mqttBody });

  // 2025-09-25 진행 중인 콜은 ACK를 받으면 해당 정보는 새로 기록됨 
  // 진행 중인 infoAckInCallByCallId의 Cmd_ID 변경해주기
  // const infoAckInCallByCallIdData: InfoAckInCallByCallIdBody = {
  //   Cmd_ID: newCmdId,
  //   CALL_ID: infoAckInCallByCallId.CALL_ID,
  //   EQP_CALL_ID: infoAckInCallByCallId.EQP_CALL_ID,
  //   Call_Type: infoAckInCallByCallId.Call_Type,
  //   Caller: infoAckInCallByCallId.Caller,
  //   Call_Priority: infoAckInCallByCallId.Call_Priority,
  //   Call_Quantity: Number(infoAckInCallByCallId.Call_Quantity) || 1,
  //   updatedTime: new Date(),
  // };
  // redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdData));

  // Recent call info task 기록
  const recentCallInfoTaskParams: RecentCallInfo = {
    cmdId: mqttBody.Cmd_ID || '',
    callId: mqttBody.Call_ID,
    transferId: null,
    callType: mqttBody.Call_Type,
    callQuantity: mqttBody.Call_Quantity,
    callPriority: mqttBody.Call_Priority,
    caller: mqttBody.Caller,
    port: null,
  };
  setRecentCallInfoTaskByCmdId(recentCallInfoTaskParams);

  // CALL INFO 추가 로깅
  const trackingLogSubject = 'CALL_INFO';
  const trackingLogDetail = 'CALL_INFO';
  const trackingLogState = 'PROCESSING';
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callId,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: infoAckInCallByCallId.Caller,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Requesting CALL_INFO from WMS(${wmsName}) for Call ID ${callId} - TRANSFER_ABORT`,
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
};

const transferPaused = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferPaused');

  const callId: string = 'TODO transfer CALL ID';

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);
};

const transferResumed = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferResumed');

  const callId: string = 'TODO transfer CALL ID';

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);
};

const transferCompleted = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsTransferCompleted');

  const messageBody = messageMessage.body as TransferCompletedBody;

  const resultCode = messageBody.ResultCode;
  const callId = messageBody.Call_ID;

  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // result code 에 따른 분기 처리
  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  let trackingLogState: TrackingLogState;
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
      trackingLogState = 'PROCESSING';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId} received '${subject}' from WMS(${wmsName})`,
        },
        undefined,
        'SUCCESS',
        wmsName
      );
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
      trackingLogState = 'ERROR';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Destination status abnormal`,
        },
        undefined,
        'ERROR',
        wmsName
      );

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
      trackingLogState = 'ERROR';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Origin status abnormal`,
        },
        undefined,
        'ERROR',
        wmsName
      );
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
      trackingLogState = 'ABORTED';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Dest Full`,
        },
        undefined,
        'ABORTED',
        wmsName
      );

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
      trackingLogState = 'ABORTED';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Inventory not available`,
        },
        undefined,
        'ABORTED',
        wmsName
      );

      break;
    // 비정상 완료
    case '64':
      // Item Log 생성 - 공출고
      // abort 로그만 기록한 후창고에서 CALL_REQUEST 요청한 것에 대한 응답만 잘 주면 됨.

      // 공출고 로직
      // 적용 여부 고민 중... => Call Request에서 기존에 있던 콜 정보 목록에서 원하는 콜 정보를 보내는 방향으로 작업 중
      // const cmdId = messageBody.Cmd_ID;

      // const recentCallInfoTaskByCmdIdInfo = await redisUtil.hgetObject<RecentCallInfo>(RedisKeys.RecentCallInfoTaskByCmdId, cmdId)

      // if (recentCallInfoTaskByCmdIdInfo) {
      //   // 현재 진행 중인 콜 정보 삭제 한 후 해당 정보를 AbnormalCompletedCommandBySubjectCmdId Redis에 저장
      //   // 공 출고에 해당하는 알람 자체는 ALARM 로직에서 진행 될 예정
      //   const abnormalCompletedCallInfoValue: AbnormalCompletedCallInfo = {
      //     cmdId: '',
      //     callId: recentCallInfoTaskByCmdIdInfo?.callId,
      //     callType: recentCallInfoTaskByCmdIdInfo?.callType,
      //     caller: recentCallInfoTaskByCmdIdInfo?.caller,
      //     callQuantity: recentCallInfoTaskByCmdIdInfo?.callQuantity,
      //     callPriority: recentCallInfoTaskByCmdIdInfo?.callPriority,
      //   }

      //   redisUtil.hset(RedisKeys.AbnormalCompletedCallInfoTaskByCallId, abnormalCompletedCallInfoValue.callId, JSON.stringify(abnormalCompletedCallInfoValue))

      //   redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, cmdId)
      // } else {
      //   // 공출고를 진행 할 Call Info 정보가 없음
      //   // 추가 작업 필요 -> ALARM ?
      // }

      logging.ACTION_ERROR({
        filename: `transfer.ts - transferCompleted`,
        error: `[ResultCode = ${resultCode}] ResultCode(${resultCode}): Empty shipment`,
        params: null,
        result: false,
      });

      // Item Log 생성
      trackingLogState = 'ABORTED';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Empty shipment`,
        },
        undefined,
        'ABORTED',
        wmsName
      );

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
      trackingLogState = 'ABORTED';
      await editTrackingLogRedis(
        {
          ...baseTrackingLogData,
          state: trackingLogState,
          description: `Call ID ${callId}, ResultCode(${resultCode}): Inventory not available`,
        },
        undefined,
        'ABORTED',
        wmsName
      );
      break;
  }
};

export const wmsTransfer = async (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'TRANSFER_INITIATED') {
    await transferInitiated(wmsName, subject, messageJson);
  } else if (subject === 'TRANSFER_CANCEL_COMPLETED') {
    await transferCancelCompleted(wmsName, messageJson);
  } else if (subject === 'TRANSFER_ABORT_COMPLETED') {
    await transferAbortCompleted(wmsName, messageJson);
  } else if (subject === 'TRANSFER_PAUSED') {
    transferPaused(wmsName, messageJson);
  } else if (subject === 'TRANSFER_RESUMED') {
    transferResumed(wmsName, messageJson);
  } else if (subject === 'TRANSFER_COMPLETED') {
    transferCompleted(wmsName, subject, messageJson);
  }
};
