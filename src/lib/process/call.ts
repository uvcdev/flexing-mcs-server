import { generateUUIDNode } from "../hashUtil";
import { logging } from "../logging";
import { makeMbsMqttHeader, mbsMqttBody, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, useRedisUtil } from "../redisUtil";
import { setRemainingAckCommand } from "./ack";

const redisUtil = useRedisUtil();

export interface CallMessageAttributes {
  id: number;
  eqpCallId: string;
  ackCount: number;
}
export interface CallInfoBody {
  cmdId: string;         // 메세지에 대한 uuid  ex) 4c6cc04d-6ed8-4247-9962-6fe1d2bd4d2b
  callId: string;        // 설비에서 발생한 Call Id   ex) OP012023090500001  ( 영문 2글자 + 숫자 )
  callType: string;      // Call 호출 요청 기종  ex) 99  ( 0~65537 )
  caller: string;        // Call 호출 PLC  ex) BM170  ( EQP NAME )
  callQuantity: string;  // Call 요청 수량 ex) 1   ( 1 ~ 99 -> 부품창고 : 2, BMA창고 :1 사용 )
  callPriority: string;  // Call 우선 순위 ex) 99  ( 1 ~ 99 -> PLC Call Priority Bit On : 99, Off :1)
}

// beforeSendInCallInfoForWms 는 설비 반입 (창고 반출) 콜 중 아직 처리되지 않은 콜 목록임
// key 값은 EQP CALL ID
export interface beforeSendInCallInfoForWms extends CallInfoBody {
  systemName?: string;    // 설비랑 상호작용 하는 창고 이름
}

// Redis에 있는 리스트 중 출고 정보 CallInfo를 전송 해야 하는 경우 확인
// WMS 입장에서 in은 창고 배출 , WMS 입장에서 in은 창고 입고
export const checkInCallInfoForWms = async () => {
  const beforeSendInCallInfoForWmsList = await redisUtil.hgetAllObject<beforeSendInCallInfoForWms>(RedisKeys.BeforeSendInCallInfoForWms) || [];

  for (let i = 0, length = beforeSendInCallInfoForWmsList.length; i < length; i++) {
    const beforeSendInCallInfoForWmsInfo = { ...beforeSendInCallInfoForWmsList[i] }
    const systemName = beforeSendInCallInfoForWmsInfo.systemName || 'WMS';

    delete beforeSendInCallInfoForWmsInfo['systemName']

    sendInCallInfoForWms(beforeSendInCallInfoForWmsInfo, systemName)
  }
}

// ack 에 대한 send in call info 도 추가하기 위해서 해당 함수 분리
const sendInCallInfoForWms = (callInfo: CallInfoBody, systemName: string) => {
  const topic = 'CALL'

  const callInfoData = { ...callInfo }
  // 처음 들어온 정보는 cmd id 가 존재하지 않음 이미 있는 메세지는 cmdid 존재 ( cmdid 동일하기 재요청 )
  if (callInfoData.cmdId === '') {
    callInfo.cmdId = generateUUIDNode();
  }

  // 배출 정보 CallInfo MQTT 전송
  if (!callInfo.cmdId || callInfo.cmdId === '') {
    // cmdId는 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: 'call.ts - sendInCallInfoForWms()',
      error: `Cmd Id ${callInfo.cmdId} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  if (!systemName) {
    // 해당 메세지에 대한 systemName은 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: 'call.ts - sendInCallInfoForWms()',
      error: `systemName : ${systemName} is invalid `,
      params: null,
      result: false,
    });
    return
  }

  const mqttHeader = makeMbsMqttHeader(topic)
  const mqttBody: mbsMqttBody = callInfoData
  // CALLINFO MQTT 데이터 전송 
  sendMbsMqtt(topic, mqttHeader, mqttBody, systemName)
  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody })

  // ITEM LOG 기록
  // TODO - 물류 로그에 대한 redis 값 업데이트


}