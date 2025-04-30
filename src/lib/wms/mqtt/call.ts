import { TrackingLogRedisUpdateParams } from "../../../models/common/trackingLog"
import { EqpCallStatsForAck } from "../../callRegisterUtil"
import { logging } from "../../logging"
import { separateMqttMessage, MbsMqttMesaage, MbsMqttBody } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog"
import { deleteRemainingAckCommand, RemainingAckCommand, setReceivedAckCommand } from "../../process/wmsAck"
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

const callRequest = (wmsName: string, messageMessage: MbsMqttMesaage) => {
  console.log('catch wmsCallRequest')

  // set GetAckCommandByCmdId - Call Request
  const callId: string = 'TODO CallRequest CALL ID'
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)
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
        Call_Quantity: Number(callInfoData.Call_Quantity) || 1
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

const ackCancelCallInfo = (wmsName: string) => {
  console.log('catch wmsAckCancelCallInfo')
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
    ackCancelCallInfo(wmsName)
  } else if (subject === 'ACK_REQ_CALL_INFO_LIST') {
    ackReqCallInfoList(wmsName)
  }
}