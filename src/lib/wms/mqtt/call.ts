import { TrackingLogRedisUpdateParams, TrackingLogState } from '../../../models/common/trackingLog';
import { EqpCallStats, EqpCallStatsForAck } from '../../callRegisterUtil';
import { useKepServerUtil } from '../../kepServerUtil';
import { generateUUIDNode } from '../../hashUtil';
import { logging } from '../../logging';
import {
  separateMqttMessage,
  MbsMqttMesaage,
  MbsMqttBody,
  makeMbsMqttHeader,
  sendMbsMqtt,
  MbsMqttHeader,
} from '../../mqttUtil';
import { editTrackingLogRedis } from '../../process/trackingLog';
import {
  deleteRemainingAckCommand,
  RemainingAckCommand,
  setReceivedAckCommand,
  setRemainingAckCommand,
} from '../../process/wmsAck';
import { CallInfoBody, deleteInfoAckInCallByCallId } from '../../process/wmsCallInfo';
import {
  deleteRecentCallInfoTaskByCmdId,
  RecentCallInfo,
  setAbortedCommandForRetry,
  setRecentCallInfoTaskByCmdId,
} from '../../process/wmsCommon';
import { RedisKeys, useRedisUtil } from '../../redisUtil';
import { removeAckPrefix } from '../../usefullToolUtil';
import opcuaUtil from '../../opcuaUtil';
import { useCallTypeUtil } from '../../callTypeUtil';
import { useCallCancelUtil } from '../../callCancelUtil';

const systemTopic = 'CALL';
const redisUtil = useRedisUtil();
interface ackCallInfoBody extends MbsMqttBody {
  HCACK: string;
  Comment: string;
}

interface CallRequestBody extends MbsMqttBody {
  Cmd_ID: string;
  Call_ID: string;
}

interface AckCancelCallInfoBody extends MbsMqttBody {
  Cmd_ID: string;
  HCACK: string;
  Comment: string;
}

interface CallInfoData {
  Call_ID: string;
  Cmd_ID: string;
  Call_Type: string;
  Cargo_Type: string;
  Caller: string;
  Call_Quantity: string;
  Call_Priority: string;
}

interface AckReqCallInfoListBody extends MbsMqttBody {
  Call_InfoList: Array<CallInfoData>;
}

export interface InfoAckInCallByCallIdBody extends EqpCallStatsForAck {
  updatedTime: Date;
}

const callRequest = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsCallRequest');
  // set Data
  const callRequestBody = messageMessage.body as CallRequestBody;
  const callId = callRequestBody.Call_ID;

  // set GetAckCommandByCmdId - Call Request
  // setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);
  // 2025-11-20 : call Request 한정으로 바로 ACK 응답
  const newSubtopic = `ACK_${subject}`;
  const cmdId = callRequestBody.Cmd_ID;

  const ackMqttHeader = makeMbsMqttHeader(newSubtopic);
  const ackMqttBody: MbsMqttBody = {
    Cmd_ID: cmdId,
    HCACK: '4',
  };

  sendMbsMqtt(systemTopic, ackMqttHeader, ackMqttBody, wmsName);

  // 1안
  // 1. 콜 아이디에 해당하는 정보 다시 쓰기
  const infoAckInCallByCallId = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
    RedisKeys.InfoAckInCallByCallId,
    callId
  );

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

  // 09-23 변경
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
  // 수정후
  // 새로운 내용으로 ACK를 받을 예정이기 때문에 infoAckInCallByCallId 를 삭제 해주어야한다.
  deleteInfoAckInCallByCallId(callId);

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
    startFacility: null,
    transferId: null,
    destFacility: null,
    assignedRobot: null,
    value: null,
    description: `Requesting CALL_INFO from WMS(${wmsName}) for Call ID ${callId}`,
    processState: 'NORMAL',
  };
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);

  // 2안
  // AbnormalCompletedCallInfoTaskByCallId Redis 정보에서 빼서 해당 정보로 CallInfo 다시 만들기
};

const ackCallInfo = async (wmsName: string, subject: string, messageBody: ackCallInfoBody) => {
  // 1. 필요한 데이터 세팅
  const prefixSubject = removeAckPrefix(subject);
  const cmdId = messageBody.Cmd_ID;
  const hcack = messageBody.HCACK;
  const ackComment = messageBody.Comment;

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const remainingAckCommandSubjectCmdId = `${prefixSubject}-${cmdId}`;

  const remainingCommandInfo =
    (await redisUtil.hgetObject<RemainingAckCommand>(
      RedisKeys.RemainingAckCommandBySubjectCmdId,
      remainingAckCommandSubjectCmdId
    )) || null;
  if (!remainingCommandInfo) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[remainingCommandInfo] No existing ACK information found for ${subject}.`,
      params: null,
      result: false,
    });
    return;
  }

  const callId = remainingCommandInfo.message.body.Call_ID;
  const callInfoData = remainingCommandInfo.message.body as CallInfoBody;

  // 2. CALLINFO에 해당하는 RemainingAckCommandBySubjectCmdId 삭제
  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId);

  // 3. HCACK 결과 별 로직 처리
  switch (hcack) {
    // hcack = 4 : OK 실행 예정 - 정상
    // 물류 로그 기록, InfoAckInCallByCallId 레디스 기록
    case '4':
      // 물류 로그 기록
      // InfoAckInCallByCallId 레디스 기록
      const infoAckInCallByCallIdData: InfoAckInCallByCallIdBody = {
        Cmd_ID: callInfoData.Cmd_ID,
        CALL_ID: callInfoData.Call_ID,
        EQP_CALL_ID: callId.slice(-4),
        Call_Type: callInfoData.Call_Type,
        Cargo_Type: callInfoData.Cargo_Type,
        Caller: callInfoData.Caller,
        Call_Priority: callInfoData.Call_Priority,
        Call_Quantity: Number(callInfoData.Call_Quantity) || 1,
        updatedTime: new Date(),
      };
      redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdData));

      logging.ACTION_INFO({
        filename: `call.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] CallId (${callId}) Command executed successfully - comment : ${ackComment}`,
        params: null,
        result: true,
      });

      let trackingLogSubject = 'ACK_CALL_INFO';
      let trackingLogDetail = 'ACK_CALL_INFO';
      let trackingLogState = 'PROCESSING' as TrackingLogState;
      let trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: null,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})`,
        processState: 'NORMAL',
      };
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);

      // call_response 작성
      await useKepServerUtil().writeSimpleTagValue({
        targetFacility: callInfoData.Caller,
        tagName: 'Call_Response',
        value: true,
      });

      await useCallTypeUtil().callTypeResponse(callInfoData.Caller);
      const callResponseTrackingLogSubject = 'CALL_RESPONSE';
      const callResponseTrackingLogDetail = 'CALL_RESPONSE';
      const callResponseTrackingLogState = 'PROCESSING';
      const callResponseTrackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: callResponseTrackingLogSubject,
        detail: callResponseTrackingLogDetail,
        state: callResponseTrackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `[Call ID ${callId}] Call responsed`,
        processState: 'NORMAL',
      };
      await editTrackingLogRedis(callResponseTrackingLogUpdateData, undefined, 'SUCCESS', wmsName);

      break;

    // hcack = 0 : Command가 이미 실행 되었음
    // 해당 내용 로깅 처리 후 알람 발생
    // 동일한 Call Info 수신
    case '0':
      // 물류 로그 기록
      // InfoAckInCallByCallId 레디스 기록
      const infoAckInCallByCallIdDataHcack0: InfoAckInCallByCallIdBody = {
        Cmd_ID: callInfoData.Cmd_ID,
        CALL_ID: callInfoData.Call_ID,
        EQP_CALL_ID: callId.slice(-4),
        Call_Type: callInfoData.Call_Type,
        Cargo_Type: callInfoData.Cargo_Type,
        Caller: callInfoData.Caller,
        Call_Priority: callInfoData.Call_Priority,
        Call_Quantity: Number(callInfoData.Call_Quantity) || 1,
        updatedTime: new Date(),
      };
      redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdDataHcack0));

      logging.ACTION_INFO({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      const hcack0TrackingLogSubject = 'ACK_CALL_INFO';
      const hcack0TrackingLogDetail = 'ACK_CALL_INFO';
      const hcack0TrackingLogState = 'PROCESSING' as TrackingLogState;
      const hcack0TrackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: hcack0TrackingLogSubject,
        detail: hcack0TrackingLogDetail,
        state: hcack0TrackingLogState,
        startFacility: null,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `HCACK(${hcack})Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})`,
        processState: 'NORMAL',
      };
      await editTrackingLogRedis(hcack0TrackingLogUpdateData, undefined, 'SUCCESS', wmsName);

      // call_response 작성
      await useKepServerUtil().writeSimpleTagValue({
        targetFacility: callInfoData.Caller,
        tagName: 'Call_Response',
        value: true,
      });

      await useCallTypeUtil().callTypeResponse(callInfoData.Caller);
      const callResponseTrackingLogSubjectHcack0 = 'CALL_RESPONSE';
      const callResponseTrackingLogDetailHcack0 = 'CALL_RESPONSE';
      const callResponseTrackingLogStateHcack0 = 'PROCESSING';
      const callResponseTrackingLogUpdateDataHcack0: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: callResponseTrackingLogSubjectHcack0,
        detail: callResponseTrackingLogDetailHcack0,
        state: callResponseTrackingLogStateHcack0,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `[Call ID ${callId}] Call responsed`,
        processState: 'NORMAL',
      };
      await editTrackingLogRedis(callResponseTrackingLogUpdateDataHcack0, undefined, 'SUCCESS', wmsName);

      // 콜 진행 정보를 삭제
      // 동일 Call 정보를 수신 했다면 해당 정보 있어야 하기 때문에 Call Id 쪽 삭제는 보류
      // 정보가 남아 있다면 recent_Call_info_task_by_cmd_id 정보도 남아 있어야 할 것 같아서 남겨둠
      // infoAckInCallByCallId 정보 삭제
      // deleteInfoAckInCallByCallId(callId)
      // RecentCallInfoTaskByCmdId 정보 삭제
      // deleteRecentCallInfoTaskByCmdId(cmdId);

      break;

    // hcack = 1 : 커맨드가 존재하지 않음
    // 해당 내용 로깅 처리 후 알람 발생
    case '1':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command does not exist - comment : ${ackComment}`,
        params: null,
        result: false,
      });
      break;

    // hcack = 2 : 현재 실행 가능하지 않음
    // 정해진 시간이 지난 후 같은 내용 재전송 (redis만 저장)
    case '2':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] CallId (${callId}) Execution not possible at this time - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      await setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message);

      break;

    // hcack = 3 : 1개 이상의 값들이 Valid 하지 않음
    // 해당 내용 로깅 처리 후 알람 발생
    case '3':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] One or more values are invalid - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 5 : 거부, 이미 요청 받은 Command
    // 해당 내용 로깅 처리
    case '5':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] Command already received - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 6 : 객체 존재하지 않음
    // 해당 내용 로깅 처리
    case '6':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] Object does not exist - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 7 : NG
    // 해당 내용 로깅 처리
    case '7':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] NG error occurred - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    /* 250918 논의 결과
    hcack = 52 재고 없음 실행 예정은 사용하지 않고 hcack=51 : 재고 없음 실행 불가만 사용한다. 이유: 재고가 언제 들어오는 지는 창고도 알 수 없음
    hcack = 51 도 재고 없음 실행 불가지만, 해당 응답이 온 경우에는 로깅 후, 몇 분 뒤에 해당 정보 그대로 (cmdId 만 변경) 재 요청한다.
    */

    // hcack = 51 : 재고 없음 실행 불가
    // 실행 불가 로깅 처리 후
    // 설비에 관련 정보 삭제 할 수 있는 판단 레디스 값 추가
    // 재고 없음 알람 발생
    // 사용자 개입 후 호출 취소를 진행할 것으로 예상됨
    case '51':
      // 콜 진행 정보를 삭제
      // infoAckInCallByCallId 정보 삭제
      deleteInfoAckInCallByCallId(callId);

      // 20250919 - 해당 내용 변경 ( Call Info 정보를 무조건 지우는 것이 아니라 해당 정보로 재요청 하는 것으로 변경 )
      // // RecentCallInfoTaskByCmdId 정보 삭제
      // deleteRecentCallInfoTaskByCmdId(cmdId);
      await setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message);

      const abortedTrackingLogSubject = 'ACK_CALL_INFO';
      const abortedTrackingLogDetail = 'ACK_CALL_INFO';
      const abortedTrackingLogState = 'ABORTED' as TrackingLogState;
      const abortedTrackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: abortedTrackingLogSubject,
        detail: abortedTrackingLogDetail,
        state: abortedTrackingLogState,
        startFacility: null,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})-Out of Stock(51)`,
        processState: 'OUT_OF_STOCK',
      };
      await editTrackingLogRedis(abortedTrackingLogUpdateData, hcack, 'ABORTED', wmsName);

      logging.ACTION_DEBUG({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] CallId (${callId}) execution unavailable due to insufficient inventory - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 52 : 재고 없음 실행 예정
    // 몇 분 뒤에 재요청 할 수 있는 레디스 값 추가
    case '52':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] CallId (${callId}) execution planned with pending inventory replenishment - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      // RecentCallInfoTaskByCmdId 정보 삭제
      deleteRecentCallInfoTaskByCmdId(cmdId);

      await setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message);

      break;

    // 정의되지 않은 hcack 수신 오류 발생 후 로깅 처리
    default:
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] HCACK Id ${hcack} is invalid - Undefined HCACK received - comment : ${ackComment}`,
        params: null,
        result: false,
      });
      break;
  }
};

const ackCancelCallInfo = async (wmsName: string, subject: string, messageBody: AckCancelCallInfoBody) => {
  console.log('catch wmsAckCancelCallInfo');
  // 1. 필요한 데이터 세팅
  const prefixSubject = removeAckPrefix(subject);
  const cmdId = messageBody.Cmd_ID;
  const hcack = messageBody.HCACK;
  const ackComment = messageBody.Comment;

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const remainingAckCommandSubjectCmdId = `${prefixSubject}-${cmdId}`;

  const remainingCommandInfo =
    (await redisUtil.hgetObject<RemainingAckCommand>(
      RedisKeys.RemainingAckCommandBySubjectCmdId,
      remainingAckCommandSubjectCmdId
    )) || null;
  if (!remainingCommandInfo) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[remainingCommandInfo] No existing ACK information found for ${subject}.`,
      params: null,
      result: false,
    });
    return;
  }

  const callId = remainingCommandInfo.message.body.Call_ID;
  const callInfoData = remainingCommandInfo.message.body as CallInfoBody;

  // 2. Cancel_CALLINFO에 해당하는 RemainingAckCommandBySubjectCmdId 삭제
  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId);

  const trackingLogSubject = subject;
  const trackingLogDetail = subject;
  // 3. HCACK 결과 별 로직 처리
  switch (hcack) {
    // hcack = 4 : OK 실행 예정 - 정상
    // 물류 로그 기록, InfoAckInCallByCallId 레디스 기록
    case '4': {
      // 물류 로그 기록
      // logging.ACTION_INFO({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] CallId (${callId}) Command executed successfully - comment : ${ackComment}`,
      //   params: null,
      //   result: true,
      // });
      const selectedInfoAckInCallByCallId = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
        RedisKeys.InfoAckInCallByCallId,
        callId
      );
      const selectedInfoAckInCallByCallIdCmdId = selectedInfoAckInCallByCallId?.Cmd_ID || '';

      const trackingLogState = 'CANCELED';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `CancelCallInfo (HCACK=4): Call ${callId} cancelled on EQP ${callInfoData.Caller}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // 진행중 정보를 가지고 있는 CALL 정보 삭제
      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);
      redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, selectedInfoAckInCallByCallIdCmdId);

      // 두번째 설비 호출 취소 요청일 수 있으니, ReinboundIfPortAssignedForFacilityCancelByCallId 삭제
      redisUtil.hdel(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId);

      break;
    }

    // hcack = 0 : Command가 이미 실행 되었음
    // 해당 내용 로깅 처리 후 알람 발생
    case '0': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });
      // 물류 로그 기록
      const selectedInfoAckInCallByCallId = await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(
        RedisKeys.InfoAckInCallByCallId,
        callId
      );
      const selectedInfoAckInCallByCallIdCmdId = selectedInfoAckInCallByCallId?.Cmd_ID || '';

      const trackingLogState = 'CANCELED';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `CancelCallInfo (HCACK=0): Call ${callId} cancelled on EQP ${callInfoData.Caller}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // 진행중 정보를 가지고 있는 CALL 정보 삭제
      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);
      redisUtil.hdel(RedisKeys.RecentCallInfoTaskByCmdId, selectedInfoAckInCallByCallIdCmdId);

      // 두번째 설비 호출 취소 요청일 수 있으니, ReinboundIfPortAssignedForFacilityCancelByCallId 삭제
      redisUtil.hdel(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId);

      break;
    }
    // hcack = 1 : 커맨드가 존재하지 않음
    // 해당 내용 로깅 처리 후 알람 발생
    case '1': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command does not exist - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ABORTED';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `Call ID ${callId} cancellation failed on EQP ${callInfoData.Caller} - cancellation not possible`,
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // 실행 불가능인 경우 해당 CALL 정보를 계속 진행 해야함

      break;
    }
    // hcack = 2 : 현재 실행 가능하지 않음
    // 정해진 시간이 지난 후 같은 내용 재전송 (redis만 저장)
    case '2': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] CallId (${callId}) Execution not possible at this time - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      // 해당 콜 아이디 정보로 재고순환 로직 추가
      redisUtil.hset(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId, JSON.stringify(callId));

      const trackingLogState = 'ABORTED';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `CancelCallInfo (HCACK=4): CallId (${callId}) Execution not possible at this time - comment : ${ackComment}`,
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // 정보 재전송
      // setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message);

      break;
    }
    // hcack = 3 : 1개 이상의 값들이 Valid 하지 않음
    // 해당 내용 로깅 처리 후 알람 발생
    case '3': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] One or more values are invalid - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ERROR';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `One or more values are invalid - comment : ${ackComment}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // TODO ) 진행 중인 콜을 어떻게 해야할지 기준이 없음.
      // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

      break;
    }
    // hcack = 5 : 거부, 이미 요청 받은 Command
    // 해당 내용 로깅 처리
    case '5': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] Command already received - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ERROR';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `Command already received - comment : ${ackComment}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);

      break;
    }

    // hcack = 6 : 객체 존재하지 않음
    // 해당 내용 로깅 처리
    case '6': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] Object does not exist - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ERROR';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: callId,
        description: `Object does not exist - comment : ${ackComment}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      // TODO - 해당 내용 정의 필요
      // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

      break;
    }
    // hcack = 7 : NG
    // 해당 내용 로깅 처리
    case '7': {
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] NG error occurred - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ERROR';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: hcack,
        description: `NG error occurred - comment : ${ackComment}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);

      break;
    }
    // hcack = 51 : 재고 없음 실행 불가
    // 실행 불가 로깅 처리 후
    // 설비에 관련 정보 삭제 할 수 있는 판단 레디스 값 추가
    // CANCEL CALL 에서는 사용하지 않을 것 같음
    // case '51': {
    //   logging.ACTION_ERROR({
    //     filename: `call.ts - ackCancelCallInfo`,
    //     error: `[HCACK = ${hcack}] CallId (${callId}) execution unavailable due to insufficient inventory - comment : ${ackComment}`,
    //     params: null,
    //     result: false,
    //   });

    //   break;
    // }

    // hcack = 52 : 재고 없음 실행 예정
    // 몇 분 뒤에 재요청 할 수 있는 레디스 값 추가
    // CANCEL CALL 에서는 사용하지 않을 것 같음
    // case '52':
    //   {
    //     logging.ACTION_ERROR({
    //       filename: `call.ts - ackCancelCallInfo`,
    //       error: `[HCACK = ${hcack}] CallId (${callId}) execution planned with pending inventory replenishment - comment : ${ackComment}`,
    //       params: null,
    //       result: false,
    //     });

    //     setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message)

    //     break;
    //   }

    // 정의되지 않은 hcack 수신 오류 발생 후 로깅 처리
    default:
      // logging.ACTION_ERROR({
      //   filename: `call.ts - ackCancelCallInfo`,
      //   error: `[HCACK = ${hcack}] HCACK Id ${hcack} is invalid - Undefined HCACK received - comment : ${ackComment}`,
      //   params: null,
      //   result: false,
      // });

      const trackingLogState = 'ERROR';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: hcack,
        description: `HCACK Id ${hcack} is invalid - Undefined HCACK received - comment : ${ackComment}`,
        processState: 'CANCELED',
      };
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName);

      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);

      break;
  }
};

// WMS에서 전달해주는 CALL 정보 중 겹치는 내용은 등록 안함 / WMS 리스트에만 있으면 신규 등록 / MCS에만 있으면 삭제
// 트래킹 로그 추가하면 해당 내용도 같이 추가해야함
const ackReqCallInfoList = async (wmsName: string, subject: string, messageBody: AckReqCallInfoListBody) => {
  const kepServerUtil = useKepServerUtil();
  // set Data
  const ackReqCallInfoListBody: AckReqCallInfoListBody = messageBody;

  //
  const prefixSubject = removeAckPrefix(subject);

  const remainingAckCommandSubjectCmdId = `${prefixSubject}-${ackReqCallInfoListBody.Cmd_ID}`;

  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId);

  // WMS에서 온 Call 리스트
  const wmsCallInfoList = ackReqCallInfoListBody.Call_InfoList || [];

  // MCS가 관리하고 있는 Call 리스트
  const mcsCallInfoList =
    (await redisUtil.hgetAllObject<InfoAckInCallByCallIdBody>(RedisKeys.InfoAckInCallByCallId)) || [];

  // 각 리스트에서 Call_ID만 추출 (비교용)
  const wmsCallIds = new Set(wmsCallInfoList.map((call) => call.Call_ID));
  const mcsCallIds = new Set(mcsCallInfoList.map((call) => call.CALL_ID));

  console.log('wmsCallIds', wmsCallIds);
  console.log('mcsCallIds', mcsCallIds);

  // WMS에만 있는 Call 객체들
  const wmsOnlyCallInfoList = wmsCallInfoList.filter((call) => !mcsCallIds.has(call.Call_ID));

  // WMS에만 있으면 해당 Call 등록
  // 콜 Request가 켜져 있으면 Call_Response True를 한 번 더 써줌
  console.log('wmsOnlyCallInfoList', wmsOnlyCallInfoList);
  for (let i = 0, length = wmsOnlyCallInfoList.length; i < length; i++) {
    const callInfoData = wmsOnlyCallInfoList[i];
    // 1. 콜이 있으면 해당 설비에 호출 응답 적어줌
    const caller = callInfoData.Caller;
    console.log('caller', caller);

    const targetKey = kepServerUtil.getTargetKey(caller);
    await kepServerUtil.updateTagMapValues(targetKey, caller, ['Call_Request']);

    const callRequestValue = opcuaUtil.tagMap.get(`${caller}.Call_Request`)?.value;
    if (callRequestValue === true) {
      await useKepServerUtil().writeSimpleTagValue({
        targetFacility: callInfoData.Caller,
        tagName: 'Call_Response',
        value: true,
      });
      await useCallTypeUtil().callTypeResponse(callInfoData.Caller);

      // Port 배정이 나올 레디스 값 저장
      // MCS_recent_call_info_task_by_cmd_id
      const recentCallInfoTaskParams: RecentCallInfo = {
        cmdId: callInfoData.Cmd_ID || '',
        callId: callInfoData.Call_ID,
        transferId: null,
        callType: callInfoData.Call_Type,
        callQuantity: callInfoData.Call_Quantity,
        callPriority: callInfoData.Call_Priority,
        caller: callInfoData.Caller,
        port: null,
      };
      setRecentCallInfoTaskByCmdId(recentCallInfoTaskParams);
      // MCS_info_ack_in_call_by_call_id
      const infoAckInCallByCallIdData: InfoAckInCallByCallIdBody = {
        Cmd_ID: callInfoData.Cmd_ID,
        CALL_ID: callInfoData.Call_ID,
        EQP_CALL_ID: callInfoData.Call_ID.slice(-4),
        Call_Type: callInfoData.Call_Type,
        Cargo_Type: callInfoData.Cargo_Type,
        Caller: callInfoData.Caller,
        Call_Priority: callInfoData.Call_Priority,
        Call_Quantity: Number(callInfoData.Call_Quantity) || 1,
        updatedTime: new Date(),
      };
      redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callInfoData.Call_ID, JSON.stringify(infoAckInCallByCallIdData));

      // 2. 해당 콜에 대한 트래킹 로그 만들어줌

      // 추가 사항 ( 250924 )
      // WMS에는 콜이 있고 MCS입장에서는 ACK를 못 받은 정보인 경우 -> ACK를 받았다고 처리한 후, 콜 정보 저장

      // WMS에는 콜이 있고 MCS에서도 ACK를 받았었던 정보라면
      // 반대편 설비의 응답이 켜져 있는 경우에는 키고, 켜져 있는 경우에는 유지
      // ACK는 받은 경우
      // 반대편 설비의 응답이 켜져 있는 경우에는 키고, 켜져 있는 경우에는 유지
      // 현재 진행중인 정보로 트래킹 로그 추가
    } else if (callRequestValue === false) {
      // CALL CANCEL REQUEST
      const systemName = wmsName;
      const topic = 'CALL';
      const subtopic = 'CANCEL_CALL_INFO';
      const newCmdId = generateUUIDNode();
      const mqttHeader = makeMbsMqttHeader(subtopic);
      const mqttBody: MbsMqttBody = {
        Cmd_ID: newCmdId,
        Call_ID: callInfoData.Call_ID,
        Call_Quantity: callInfoData.Call_Quantity,
      };

      sendMbsMqtt(topic, mqttHeader, mqttBody, systemName);

      // CALLINFO에 대한 ack 초기값 설정
      setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody }, {});
    }
  }

  // MCS에만 있는 Call 객체들
  const mcsOnlyCallInfoList = mcsCallInfoList.filter((call) => !wmsCallIds.has(call.CALL_ID));
  console.log('mcsOnlyCallInfoList', mcsOnlyCallInfoList);
  // MCS에만 있으면 해당 Call 정보들 삭제
  for (let i = 0, length = mcsOnlyCallInfoList.length; i < length; i++) {
    // 1. 트래킹 로그 정보 있으면 Cancel

    // 2. CallInfo 정보 삭제
    const callInfoData = mcsOnlyCallInfoList[i];
    deleteInfoAckInCallByCallId(callInfoData.CALL_ID);
    deleteRecentCallInfoTaskByCmdId(callInfoData.Cmd_ID);

    // 2025-09-24 수정본
    // 해당 설비에 CALL_REQUEST가 켜져있으면 같은 정보로 CALL_INFO를 재요청한다.
    // 멀티콜 도입 시, 해당 로직 수정 필요
    // 나중에 수정 필요 -> 작업 지시가 진행 중인 개수로 파악하면 그냥 지워주고 설비 요청 단계에서 새롭게 요청하는 방법으로 변경

    // const callInfoData = mcsOnlyCallInfoList[i];
    const caller = callInfoData.Caller;

    const targetKey = kepServerUtil.getTargetKey(caller);
    await kepServerUtil.updateTagMapValues(targetKey, caller, ['Call_Request']);

    const callRequestValue = opcuaUtil.tagMap.get(`${caller}.Call_Request`)?.value;

    if (callRequestValue === true) {
      // Line Call Response Off
      // 콜 응답 관련 데이터 쓰기
      await useKepServerUtil().writeSimpleTagValue({
        targetFacility: caller || '',
        tagName: 'Call_Response',
        value: false,
      });

      // CALL INFO 재전송 가능한 경우 해당 내용으로 CALLINFO 재전송
      const callInfoTopic = 'CALL';
      const callInfoSubject = 'CALL_INFO';
      const newCmdId = generateUUIDNode();

      const mqttHeader = makeMbsMqttHeader(callInfoSubject);
      const mqttBody: MbsMqttBody = {
        Cmd_ID: newCmdId,
        Call_ID: callInfoData.CALL_ID,
        Call_Type: callInfoData.Call_Type,
        Caller: callInfoData.Caller,
        Call_Quantity: callInfoData.Call_Quantity,
        Call_Priority: callInfoData.Call_Priority,
      };
      // CALLINFO MQTT 데이터 전송
      sendMbsMqtt(callInfoTopic, mqttHeader, mqttBody, wmsName);

      // CALLINFO에 대한 ack 초기값 설정
      setRemainingAckCommand(callInfoTopic, wmsName, { header: mqttHeader, body: mqttBody });

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
        callId: mqttBody.Call_ID,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: null,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `Requesting CALL_INFO from WMS(${wmsName}) for Call ID ${mqttBody.Call_ID}`,
        processState: 'NORMAL',
      };
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName);
    }
  }
};

export const wmsCall = async (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)
  console.log('wmsName 콜 들어올 때', wmsName);
  if (subject === 'CALL_REQUEST') {
    await callRequest(wmsName, subject, messageJson);
  } else if (subject === 'ACK_CALL_INFO') {
    await ackCallInfo(wmsName, subject, messageBody as ackCallInfoBody);
  } else if (subject === 'ACK_CANCEL_CALL_INFO') {
    await ackCancelCallInfo(wmsName, subject, messageBody as AckCancelCallInfoBody);
  } else if (subject === 'ACK_REQ_CALL_INFO_LIST') {
    await ackReqCallInfoList(wmsName, subject, messageBody as AckReqCallInfoListBody);
  }
};
