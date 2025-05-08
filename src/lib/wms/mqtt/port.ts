import { TrackingLogRedisUpdateParams } from "../../../models/common/trackingLog";
import { PendingWorkOrderAttributes } from "../../../models/operation/workOrder";
import { logging } from "../../logging";
import { separateMqttMessage, MbsMqttMesaage } from "../../mqttUtil"
import { editTrackingLogRedis } from "../../process/trackingLog";
import { setReceivedAckCommand } from "../../process/wmsAck"
import { CallInfoBody, deleteInfoAckInCallByCallId } from "../../process/wmsCallInfo";
import { deleteRecentCallInfoTaskByCmdId } from "../../process/wmsCommon";
import { RedisKeys, useRedisUtil } from "../../redisUtil";

const systemTopic = 'PORT'

const redisUtil = useRedisUtil();

export interface PortPresenceStatusBody {
  Cmd_ID: string,         // 메세지에 대한 uuid  ex) "292db679-715f-4aea-a4ae-d5615c5355b2"
  EQPName: string,        // 설비명 - 어떤 설비에 대한 정보인지 질문 ex) "WMS01"
  Call_ID: string,        // MCS가 WMS에게 전달한 CALL_ID  ex) MP122025041514300001
  PortID: string,         // 출발 포트 이름  ex) MW24
  CarrierID: string,      // 화물 ID   ex ) ST-P#501
  PresenceStatus: string, // 화물 존재 여부 0 or 1  ex) 1
  PairTransferID: string, // Pair된 반송 명령 ID - CallQuantity가 2일때 부여
  NGCase: string          // NG 여부 Y or N  ex) N
}


const portPresenceStatus = async (wmsName: string, subject: string, messageMessage: MbsMqttMesaage, messageBody: PortPresenceStatusBody) => {
  console.log('catch wmsPortPresenceStatust')

  const cmdId = messageBody.Cmd_ID;
  const portId = messageBody.PortID;
  const callId = messageBody.Call_ID;
  const separateCallId = callId.split('_')

  // HCACK = 4 수신
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage)

  // 창고에서 만든 수동 작업 ( 재반입 )
  if (separateCallId.length === 3) {
    const fromFacilityName = separateCallId[0]
    const toFacilityName = separateCallId[1]

    const infoPendingWorkOrder: PendingWorkOrderAttributes = {
      callId: callId,
      fromFacilityName: fromFacilityName,
      toFacilityName: toFacilityName,
      type: 'OUT',
      isMissionOrder: false,
      callPriority: "99",
      callType: "",
      eqpName: fromFacilityName,
      portName: toFacilityName,
    }

    // pending workOrder 레디스 정보 저장

    console.log('infoPendingWorkOrder', infoPendingWorkOrder)

    redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callId, JSON.stringify(infoPendingWorkOrder))

  }
  // CALL INFO 받아서 생성된 port presence status
  else {
    // infoAckInfoCallByCallId 랑 매칭되는 정보 조회
    // infoAckInfoCallByCallId 말고 RecentCallInfoTaskByCmdId 로도 가능함 
    const infoAckInCallByCallId = await redisUtil.hgetObject<CallInfoBody>(RedisKeys.InfoAckInCallByCallId, callId) || null

    // info ACk Info 가 있는 경우
    // 창고 정상 입고 시나리오

    // info ACK Info 가 없는 경우
    // 창고 재반입 시나리오
    if (!infoAckInCallByCallId) {
      logging.ACTION_ERROR({
        filename: `port.ts - portPresenceStatus`,
        error: `[infoAckInCallByCallId] No matching information found for Call ID(${callId})`,
        params: null,
        result: false,
      });

      return
    }

    // CALLINFO 부터 PORTPRESENCESTATUS 까지 Cmd_ID가 동일해야함
    // 더블 체크
    if (cmdId !== infoAckInCallByCallId.Cmd_ID) {
      logging.ACTION_ERROR({
        filename: `port.ts - portPresenceStatus`,
        error: `[Cmd_ID] Cmd ID does not match(REDIS : ${infoAckInCallByCallId.Cmd_ID} , MQTT: ${cmdId})`,
        params: null,
        result: false,
      });

      return
    }

    const infoPendingWorkOrder: PendingWorkOrderAttributes = {
      callId: callId,
      fromFacilityName: portId,
      toFacilityName: infoAckInCallByCallId.Caller,
      type: 'IN',
      isMissionOrder: false,
      callPriority: infoAckInCallByCallId.Call_Priority,
      callType: infoAckInCallByCallId.Call_Type,
      eqpName: infoAckInCallByCallId.Caller,
      portName: portId,
    }

    // pending workOrder 레디스 정보 저장

    console.log('infoPendingWorkOrder', infoPendingWorkOrder)

    redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callId, JSON.stringify(infoPendingWorkOrder))
    // infoAckInCallByCallId 정보 삭제
    // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)
    deleteInfoAckInCallByCallId(callId)

    // RecentCallInfoTaskByCmdId 정보 삭제
    deleteRecentCallInfoTaskByCmdId(cmdId)

    // 물류 로그 저장 - 포트 지정 완료
    const trackingLogSubject = subject
    const trackingLogDetail = 'PORT_ASSIGNED'
    const trackingLogState = 'PROCESSING'
    const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
      callId: callId,
      subject: trackingLogSubject,
      detail: trackingLogDetail,
      state: trackingLogState,
      transferId: null,
      startFacility: portId,
      destFacility: infoAckInCallByCallId.Caller,
      assignedRobot: null,
      value: portId,
      description: `Call ID ${callId} received ${subject} from WMS(${wmsName}) - Port assigned: ${portId}`
    }
    await editTrackingLogRedis(trackingLogUpdateData, portId, 'SUCCESS', wmsName)
  }
}

const ackReqPortStateList = (wmsName: string) => {
  console.log('catch wmsAckReqPortStateList')
}


export const wmsPort = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson)

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PORT_PRESENCE_STATUS') {
    portPresenceStatus(wmsName, subject, messageJson, messageBody as PortPresenceStatusBody)
  } else if (subject === 'ACK_REQ_PORT_STATE_LIST') {
    ackReqPortStateList(wmsName)
  }
}