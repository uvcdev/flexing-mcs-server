import { TrackingLogRedisUpdateParams } from "../../../models/common/trackingLog"
import { EqpCallStatsForAck } from "../../callRegisterUtil"
import { useKepServerUtil } from "../../kepServerUtil"
import { generateUUIDNode } from "../../hashUtil"
import { logging } from "../../logging"
import { separateMqttMessage, MbsMqttMesaage, MbsMqttBody, makeMbsMqttHeader, sendMbsMqtt } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog"
import { deleteRemainingAckCommand, RemainingAckCommand, setReceivedAckCommand, setRemainingAckCommand } from "../../process/wmsAck"
import { CallInfoBody } from "../../process/wmsCallInfo"
import { setAbortedCommandForRetry } from "../../process/wmsCommon"
import { RedisKeys, useRedisUtil } from "../../redisUtil"
import { removeAckPrefix } from "../../usefullToolUtil"

const systemTopic = 'CALL'
const redisUtil = useRedisUtil();
interface ackCallInfoBody extends MbsMqttBody {
  HCACK: string;
  Comment: string;
}

interface CallRequestBody extends MbsMqttBody {
  Cmd_ID: string
  Call_ID: string
}

interface AckCancelCallInfoBody extends MbsMqttBody {
  Cmd_ID: string;
  HCACK: string;
  Comment: string;
}

const callRequest = async (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsCallRequest')
  // set Data
  const callRequestBody = messageMessage.body as CallRequestBody
  const callId = callRequestBody.Call_ID

  // set GetAckCommandByCmdId - Call Request
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // 1. 콜 아이디에 해당하는 정보 다시 쓰기
  const infoAckInCallByCallId = await redisUtil.hgetObject<EqpCallStatsForAck>(RedisKeys.InfoAckInCallByCallId, callId)

  if (!infoAckInCallByCallId) {
    // TODO - ljk ) 이때 해당 CALL ID 가 없어서 HCACK = 6 으로 회신해야 하는지 질문해야함
    logging.ACTION_INFO({
      filename: `call.ts - callRequest`,
      error: `[infoAckInCallByCallId] infoAckInCallByCallId ${infoAckInCallByCallId} is invalid`,
      params: null,
      result: true,
    });

    return
  }

  // CALL INFO 재전송 가능한 경우 해당 내용으로 CALLINFO 재전송 
  const callInfoTopic = 'CALL'
  const callInfoSubject = 'CALL_INFO'
  const newCmdId = generateUUIDNode()

  const mqttHeader = makeMbsMqttHeader(callInfoSubject);
  const mqttBody: MbsMqttBody = {
    Cmd_ID: newCmdId,
    Call_ID: infoAckInCallByCallId.CALL_ID,
    Call_Type: infoAckInCallByCallId.Call_Type,
    Caller: infoAckInCallByCallId.Caller,
    Call_Quantity: infoAckInCallByCallId.Call_Quantity,
    Call_Priority: infoAckInCallByCallId.Call_Priority
  };
  // CALLINFO MQTT 데이터 전송
  sendMbsMqtt(callInfoTopic, mqttHeader, mqttBody, wmsName);

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(callInfoTopic, wmsName, { header: mqttHeader, body: mqttBody });

  // 진행 중인 infoAckInCallByCallId의 Cmd_ID 변경해주기
  const infoAckInCallByCallIdData: EqpCallStatsForAck = {
    Cmd_ID: newCmdId,
    CALL_ID: infoAckInCallByCallId.CALL_ID,
    EQP_CALL_ID: infoAckInCallByCallId.EQP_CALL_ID,
    Call_Type: infoAckInCallByCallId.Call_Type,
    Caller: infoAckInCallByCallId.Caller,
    Call_Priority: infoAckInCallByCallId.Call_Priority,
    Call_Quantity: Number(infoAckInCallByCallId.Call_Quantity) || 1,
  }
  redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdData))

  // CALL INFO 추가 로깅
  const trackingLogSubject = 'CALL_INFO'
  const trackingLogDetail = 'CALL_INFO'
  const trackingLogState = 'PROCESSING'
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
    description: `Requesting CALL_INFO from WMS(${wmsName}) for Call ID ${callId}`
  }
  await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName)
}

const ackCallInfo = async (wmsName: string, subject: string, messageBody: ackCallInfoBody) => {
  // 1. 필요한 데이터 세팅
  const prefixSubject = removeAckPrefix(subject)
  const cmdId = messageBody.Cmd_ID
  const hcack = messageBody.HCACK
  const ackComment = messageBody.Comment

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  const remainingAckCommandSubjectCmdId = `${prefixSubject}-${cmdId}`

  const remainingCommandInfo = await redisUtil.hgetObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId, remainingAckCommandSubjectCmdId) || null;
  if (!remainingCommandInfo) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[remainingCommandInfo] No existing ACK information found for ${subject}.`,
      params: null,
      result: false,
    });
    return
  }

  const callId = remainingCommandInfo.message.body.Call_ID
  const callInfoData = remainingCommandInfo.message.body as CallInfoBody

  // 2. CALLINFO에 해당하는 RemainingAckCommandBySubjectCmdId 삭제
  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId)

  // 3. HCACK 결과 별 로직 처리
  switch (hcack) {
    // hcack = 4 : OK 실행 예정 - 정상
    // 물류 로그 기록, InfoAckInCallByCallId 레디스 기록
    case '4':
      // 물류 로그 기록
      // InfoAckInCallByCallId 레디스 기록
      const infoAckInCallByCallIdData: EqpCallStatsForAck = {
        Cmd_ID: callInfoData.Cmd_ID,
        CALL_ID: callInfoData.Call_ID,
        EQP_CALL_ID: callId.slice(-4),
        Call_Type: callInfoData.Call_Type,
        Caller: callInfoData.Caller,
        Call_Priority: callInfoData.Call_Priority,
        Call_Quantity: Number(callInfoData.Call_Quantity) || 1,
      }
      redisUtil.hset(RedisKeys.InfoAckInCallByCallId, callId, JSON.stringify(infoAckInCallByCallIdData))

      logging.ACTION_INFO({
        filename: `call.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] CallId (${callId}) Command executed successfully - comment : ${ackComment}`,
        params: null,
        result: true,
      });

      const trackingLogSubject = 'ACK_CALL_INFO'
      const trackingLogDetail = 'ACK_CALL_INFO'
      const trackingLogState = 'PROCESSING'
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: callId,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        startFacility: callInfoData.Caller,
        transferId: null,
        destFacility: null,
        assignedRobot: null,
        value: null,
        description: `Call ID ${callId} received ACK_CALL_INFO from WMS(${wmsName})`
      }
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', wmsName)

      // call_response 작성
      await useKepServerUtil().writeSimpleTagValue({
        targetFacility: callInfoData.Caller,
        tagName: 'Call_Response',
        value: true,
      });

      const callResponseTrackingLogSubject = 'CALL_RESPONSE'
      const callResponseTrackingLogDetail = 'CALL_RESPONSE'
      const callResponseTrackingLogState = 'PROCESSING'
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
        description: `[Call ID ${callId}] Call responsed`
      }
      await editTrackingLogRedis(callResponseTrackingLogUpdateData, undefined, 'SUCCESS', wmsName)



      break;

    // hcack = 0 : Command가 이미 실행 되었음
    // 해당 내용 로깅 처리 후 알람 발생 
    case '0':
      logging.ACTION_ERROR({
        filename: `call.ts - ackCallInfo`,
        error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`,
        params: null,
        result: false,
      });

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

      setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message)

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

    // hcack = 51 : 재고 없음 실행 불가
    // 실행 불가 로깅 처리 후 
    // 설비에 관련 정보 삭제 할 수 있는 판단 레디스 값 추가
    case '51':
      logging.ACTION_ERROR({
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

      setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message)

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
}

const ackCancelCallInfo = async (wmsName: string, subject: string, messageBody: AckCancelCallInfoBody) => {
  console.log('catch wmsAckCancelCallInfo')
  // 1. 필요한 데이터 세팅
  const prefixSubject = removeAckPrefix(subject)
  const cmdId = messageBody.Cmd_ID
  const hcack = messageBody.HCACK
  const ackComment = messageBody.Comment

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  const remainingAckCommandSubjectCmdId = `${prefixSubject}-${cmdId}`

  const remainingCommandInfo = await redisUtil.hgetObject<RemainingAckCommand>(RedisKeys.RemainingAckCommandBySubjectCmdId, remainingAckCommandSubjectCmdId) || null;
  if (!remainingCommandInfo) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCallInfo`,
      error: `[remainingCommandInfo] No existing ACK information found for ${subject}.`,
      params: null,
      result: false,
    });
    return
  }

  const callId = remainingCommandInfo.message.body.Call_ID
  const callInfoData = remainingCommandInfo.message.body as CallInfoBody

  // 2. Cancel_CALLINFO에 해당하는 RemainingAckCommandBySubjectCmdId 삭제
  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId)

  const trackingLogSubject = subject
  const trackingLogDetail = subject
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

      const trackingLogState = 'CANCELED'
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
        description: `Call ID ${callId} cancellation successful on EQP ${callInfoData.Caller}`
      }
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

      // 진행중 정보를 가지고 있는 CALL 정보 삭제
      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

      break;
    }

    // hcack = 0 : Command가 이미 실행 되었음
    // 해당 내용 로깅 처리 후 알람 발생 
    case '0':
      {
        // logging.ACTION_ERROR({
        //   filename: `call.ts - ackCancelCallInfo`,
        //   error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`,
        //   params: null,
        //   result: false,
        // });
        // 물류 로그 기록
        const trackingLogState = 'ABORTED'
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
          description: `Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`
        }
        await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

        // 진행중 정보를 가지고 있는 CALL 정보 삭제 - 이미 실행 되었다면 삭제되었기 때문에 redis 정보 삭제
        redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

        break;
      }
    // hcack = 1 : 커맨드가 존재하지 않음
    // 해당 내용 로깅 처리 후 알람 발생 
    case '1':
      {
        // logging.ACTION_ERROR({
        //   filename: `call.ts - ackCancelCallInfo`,
        //   error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command does not exist - comment : ${ackComment}`,
        //   params: null,
        //   result: false,
        // });

        const trackingLogState = 'ABORTED'
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
          description: `Call ID ${callId} cancellation failed on EQP ${callInfoData.Caller} - cancellation not possible`
        }
        await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

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

      const trackingLogState = 'ABORTED'
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
        description: `CallId (${callId}) Execution not possible at this time - comment : ${ackComment}`
      }
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

      // 정보 재전송
      setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message)

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

      const trackingLogState = 'ERROR'
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
        description: `One or more values are invalid - comment : ${ackComment}`
      }
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

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

      const trackingLogState = 'ERROR'
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
        description: `Command already received - comment : ${ackComment}`
      }
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

      break;
    }

    // hcack = 6 : 객체 존재하지 않음
    // 해당 내용 로깅 처리
    case '6':
      {
        // logging.ACTION_ERROR({
        //   filename: `call.ts - ackCancelCallInfo`,
        //   error: `[HCACK = ${hcack}] Object does not exist - comment : ${ackComment}`,
        //   params: null,
        //   result: false,
        // });

        const trackingLogState = 'ERROR'
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
          description: `Object does not exist - comment : ${ackComment}`
        }
        await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

        // TODO - 해당 내용 정의 필요
        // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

        break;
      }
    // hcack = 7 : NG
    // 해당 내용 로깅 처리
    case '7':
      {
        // logging.ACTION_ERROR({
        //   filename: `call.ts - ackCancelCallInfo`,
        //   error: `[HCACK = ${hcack}] NG error occurred - comment : ${ackComment}`,
        //   params: null,
        //   result: false,
        // });

        const trackingLogState = 'ERROR'
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
          description: `NG error occurred - comment : ${ackComment}`
        }
        await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

        redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

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

      const trackingLogState = 'ERROR'
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
        description: `HCACK Id ${hcack} is invalid - Undefined HCACK received - comment : ${ackComment}`
      }
      await editTrackingLogRedis(trackingLogUpdateData, hcack, 'SUCCESS', wmsName)

      redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)

      break;
  }
}

const ackReqCallInfoList = (wmsName: string) => {
  console.log('catch wmsAckReqCallInfoList')
}

export const wmsCall = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'CALL_REQUEST') {
    callRequest(wmsName, messageJson)
  } else if (subject === 'ACK_CALL_INFO') {
    ackCallInfo(wmsName, subject, messageBody as ackCallInfoBody)
  } else if (subject === 'ACK_CANCEL_CALL_INFO') {
    ackCancelCallInfo(wmsName, subject, messageBody as AckCancelCallInfoBody)
  } else if (subject === 'ACK_REQ_CALL_INFO_LIST') {
    ackReqCallInfoList(wmsName)
  }
}