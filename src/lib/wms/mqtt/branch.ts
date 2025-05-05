import { PendingWorkOrderAttributes } from "../../../models/operation/workOrder";
import { logging } from "../../logging";
import { separateMqttMessage, MbsMqttMesaage, MbsMqttBody, sendMqtt } from "../../mqttUtil"
import { deleteRemainingAckCommand, RemainingAckCommand, setReceivedAckCommand } from "../../process/wmsAck"
import { BranchInfoReqBody, DeletedBranchInfoReq, deleteInfoAckMissionCallByCallId, deleteInfoAckOutCallByCallId } from "../../process/wmsBranch";
import { setAbortedCommandForRetry } from "../../process/wmsCommon";
import { RedisKeys, useRedisUtil } from "../../redisUtil";
import { removeAckPrefix } from "../../usefullToolUtil";

const systemTopic = 'BRANCH'
const redisUtil = useRedisUtil();
interface ackBranchInfoReqBody extends MbsMqttBody {
  HCACK: string;
  Comment: string;
}

interface BranchInfoRepCarrierInfo {
  CarrierID: string;
  CarrierState: string;
  Call_Type: string;
  NewDest: string;
  ResultCode: string;
}
interface BranchInfoRepBody extends MbsMqttBody {
  Cmd_ID: string;
  Call_ID: string;
  CurrentLocation: string;
  AMRID: string;
  amrId: string;
  CarrierList: Array<BranchInfoRepCarrierInfo>
}

interface InfoBranchCallAttributes extends BranchInfoReqBody, DeletedBranchInfoReq {

}

const branchInfoRep = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage, messageBody: BranchInfoRepBody) => {
  // 1. 필요한 데이터 세팅
  const cmdId = messageBody.Cmd_ID
  const callId = messageBody.Call_ID
  const carrierInfo = messageBody.CarrierList[0] || null
  const resultCode = carrierInfo.ResultCode

  // RedisKeys.InfoAckOutCallByCallId 데이터
  const infoAckOutCallByCallId = await redisUtil.hgetObject<InfoBranchCallAttributes>(RedisKeys.InfoAckOutCallByCallId, callId) || null

  const infoAckMissionCallByCallId = await redisUtil.hgetObject<InfoBranchCallAttributes>(RedisKeys.InfoAckMissionCallByCallId, callId) || null

  const branchInfoRepData = infoAckOutCallByCallId || infoAckMissionCallByCallId;

  // 2. BRANCH_INFO_REP 의 ACK HCACK = 4 처리 ( ACK = 4는 특수한 경우 빼고는 전부 전송한다. MCS 서버에서만 에러날 수 있게 작업해야함 )
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // 3. 에러 핸들링
  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `branch.ts - branchInfoRep`,
      error: `[CmdID] Cmd Id ${cmdId} is invalid`,
      params: null,
      result: false,
    });
    return
  }

  if (!carrierInfo) {
    logging.ACTION_ERROR({
      filename: `branch.ts - branchInfoRep`,
      error: `[CarrierList] CarrierList must not be empty`,
      params: null,
      result: false,
    });
    return
  }

  if (!branchInfoRepData) {
    logging.ACTION_ERROR({
      filename: `branch.ts - branchInfoRep`,
      error: `[branchInfoRepData] branchInfoRepData must not be empty`,
      params: null,
      result: false,
    });
    return
  }

  // 4. InfoAckOutCallByCallId 정보 삭제
  if (branchInfoRepData.isMissionOrder) {
    deleteInfoAckMissionCallByCallId(callId)
  } else {
    deleteInfoAckOutCallByCallId(callId)
  }

  // 5. ResultCode 별 분기 처리
  switch (resultCode) {
    // ResultCode = 4 : 정상 완료
    // 5. 해당 데이터 기반으로 작업 지시 생성을 위한 레디스 데이터 기록
    case '4':
      // 이 부분이 조금 애매함 -> 근데 정보 조합을 맞추려면 이름으로 판단 하는게 좋을듯
      // 수동 작업 지시 같은 경우는 어떻게 하지 ?? 흠 .... 이건 고민 조금 더 해봐야할듯 ?

      // 미션 오더인 경우
      if (branchInfoRepData.isMissionOrder) {
        // 미션 오더 MQTT 전송
        // TODO MQTT 데이터 전송
        const missionOrderMqttMessage = {
          EQP_CALL_ID: branchInfoRepData.Call_ID,
          TYPE: 'MISSION',
          WORK_ORDER_ID: branchInfoRepData.workOrderId,
          EQP_ID: carrierInfo.NewDest,
          AMR_ID: branchInfoRepData.AMRID,
          AMR_DB_ID: Number(branchInfoRepData.amrDbId) || 0,
          CALL_TYPE: carrierInfo.Call_Type,
          CALL_ID: branchInfoRepData.Call_ID,
          IS_MISSION_ORDER: "TRUE",
          TX_ID: "",
          TAG_ID: "",
          CALL_PRIORITY: branchInfoRepData.callPriority,

        }
        sendMqtt('acs/missionorder', JSON.stringify(missionOrderMqttMessage));
      }
      // 설비에서 만든 out 콜인 경우 - normal order
      else {
        const prefixFromFacilityName = callId.substring(0, 4)

        const infoPendingWorkOrder: PendingWorkOrderAttributes = {
          callId: callId,
          fromFacilityName: prefixFromFacilityName,
          toFacilityName: carrierInfo.NewDest,
          type: 'OUT',
          isMissionOrder: false,
          callPriority: branchInfoRepData.callPriority || '',
          callType: carrierInfo.Call_Type,
          portName: carrierInfo.NewDest,
          eqpName: prefixFromFacilityName
        }

        redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callId, JSON.stringify(infoPendingWorkOrder))
      }

      break;
    // ResultCode = 11 : 목적지 상태 이상 (Dest Error)
    case '11':
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] Call_ID(${callId}) Destination status is abnormal, cannot proceed with operation`,
        params: null,
        result: false,
      });
      break;
    // ResultCode = 12 : 출발지 상태 이상 (Source Error, 알람, 사용금지, 제품 없음 外)
    case '12':
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] Call_ID(${callId}) Source status abnormal (Source Error, Alarm, Usage Prohibited, No Product, etc.)`,
        params: null,
        result: false,
      });
      break;
    // ResultCode = 21 : 목적지 만재 (Dest Full) 
    case '21':
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] Call_ID(${callId}) Destination full (Dest Full)`,
        params: null,
        result: false,
      });
      break;
    //  ResultCode = 31 : 제품 없음
    case '31':
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] Call_ID(${callId}) No product available (No Product)`,
        params: null,
        result: false,
      });
      break;
    //  ResultCode = 64 : 비정상 완료
    case '64':
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] Call_ID(${callId}) Abnormal completion (Abnormal Complete)`,
        params: null,
        result: false,
      });
      break;
    //  ResultCode = else : 비정상적인 Result Code 값
    default:
      logging.ACTION_ERROR({
        filename: `branch.ts - branchInfoRep`,
        error: `[RESULTCODE = ${resultCode}] RESULTCODE Id ${resultCode} is invalid - Undefined RESULTCODE received`,
        params: null,
        result: false,
      });
      break;
  }
}

const ackBranchInfoReq = async (wmsName: string, subject: string, messageBody: ackBranchInfoReqBody) => {
  // 1. 필요한 데이터 세팅
  const prefixSubject = removeAckPrefix(subject)
  const cmdId = messageBody.Cmd_ID
  const hcack = messageBody.HCACK
  const ackComment = messageBody.Comment

  if (!cmdId || cmdId === '') {
    logging.ACTION_ERROR({
      filename: `branch.ts - ackBranchInfoReq`,
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
      filename: `branch.ts - ackBranchInfoReq`,
      error: `[remainingCommandInfo] No existing ACK information found for ${subject}.`,
      params: null,
      result: false,
    });
    return
  }

  const callId = remainingCommandInfo.message.body.Call_ID
  const branchInfoData = remainingCommandInfo.message.body as BranchInfoReqBody
  const branchDeletedInfoData = remainingCommandInfo.deletedData || {}

  const infoAckOutCallData: InfoBranchCallAttributes = { ...branchInfoData, ...branchDeletedInfoData }

  // 2. Branch_info_req 에 해당하는 RemainingAckCommandBySubjectCmdId 삭제
  deleteRemainingAckCommand(remainingAckCommandSubjectCmdId)

  switch (hcack) {
    // hcack = 4 : OK 실행 예정 - 정상
    // 물류 로그 기록, InfoAckOutCallByCallId 레디스 기록
    case '4':
      // 물류 로그 기록
      // InfoAckOutCallByCallId 레디스 기록
      if (infoAckOutCallData.isMissionOrder) {
        redisUtil.hset(RedisKeys.InfoAckMissionCallByCallId, callId, JSON.stringify(infoAckOutCallData))
      } else {
        redisUtil.hset(RedisKeys.InfoAckOutCallByCallId, callId, JSON.stringify(infoAckOutCallData))
      }
      // 정상 처리 시, 별도의 로직 존재하지 않음 ( ACK 받은 것만 인지 할 수 있으면 됨 - remainingCommandInfo 삭제 )
      logging.ACTION_INFO({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] CallId (${callId}) Command executed successfully - comment : ${ackComment}`,
        params: null,
        result: true,
      });
      break;

    // hcack = 0 : Command가 이미 실행 되었음
    // 해당 내용 로깅 처리 후 알람 발생 
    case '0':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command has already been executed - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 1 : 커맨드가 존재하지 않음
    // 해당 내용 로깅 처리 후 알람 발생 
    case '1':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] Cmd_ID(${cmdId}) Command does not exist - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 2 : 현재 실행 가능하지 않음
    // 정해진 시간이 지난 후 같은 내용 재전송 (redis만 저장)
    case '2':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
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
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] One or more values are invalid - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 5 : 거부, 이미 요청 받은 Command 
    // 해당 내용 로깅 처리
    case '5':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] Command already received - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 6 : 객체 존재하지 않음
    // 해당 내용 로깅 처리
    case '6':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] Object does not exist - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 7 : NG
    // 해당 내용 로깅 처리
    case '7':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
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
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] CallId (${callId}) execution unavailable due to insufficient inventory - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      break;

    // hcack = 52 : 재고 없음 실행 예정
    // 몇 분 뒤에 재요청 할 수 있는 레디스 값 추가
    // 재고 없음이 창고 입고 시에는 발생하지 않을 것으로 예상
    case '52':
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] CallId (${callId}) execution planned with pending inventory replenishment - comment : ${ackComment}`,
        params: null,
        result: false,
      });

      setAbortedCommandForRetry(wmsName, prefixSubject, systemTopic, remainingCommandInfo.message)

      break;

    // 정의되지 않은 hcack 수신 오류 발생 후 로깅 처리 
    default:
      logging.ACTION_ERROR({
        filename: `branch.ts - ackBranchInfoReq`,
        error: `[HCACK = ${hcack}] HCACK Id ${hcack} is invalid - Undefined HCACK received - comment : ${ackComment}`,
        params: null,
        result: false,
      });
      break;
  }
}


export const wmsBranch = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  if (subject === 'BRANCH_INFO_REP') {
    branchInfoRep(wmsName, subject, messageJson, messageBody as BranchInfoRepBody)
  } else if (subject === 'ACK_BRANCH_INFO_REQ') {
    ackBranchInfoReq(wmsName, subject, messageBody as ackBranchInfoReqBody)
  }
}