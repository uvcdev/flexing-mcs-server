import { TrackingLogRedisUpdateParams } from '../../models/common/trackingLog';
import { EqpCallStats } from '../callRegisterUtil';
import { generateUUIDNode } from '../hashUtil';
import { logging } from '../logging';
import { makeMbsMqttHeader, MbsMqttBody, sendMbsMqtt } from '../mqttUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { editTrackingLogRedis } from './trackingLog';
import { setRemainingAckCommand } from './wmsAck';
import { RecentCallInfo, setRecentCallInfoTaskByCmdId } from './wmsCommon';

const redisUtil = useRedisUtil();

export interface CallMessageAttributes {
  id: number;
  eqpCallId: string;
  ackCount: number;
}

export interface CallInfoBody {
  Cmd_ID: string; // 메세지에 대한 uuid  ex) 4c6cc04d-6ed8-4247-9962-6fe1d2bd4d2b
  Call_ID: string; // 설비에서 발생한 Call Id   ex) MP122025041514300001 => ( 설비명 (MP12) + 년월일분 (202504151430) + 설비 CALL ID 4자리 (0001) )
  Call_Type: string; // Call 호출 요청 기종  ex) 99  ( 0~65537 )
  Caller: string; // Call 호출 PLC  ex) BM170  ( EQP NAME )
  Call_Quantity: string; // Call 요청 수량 ex) 1   ( 1 ~ 99 -> 부품창고 : 2, BMA창고 :1 사용 )
  Call_Priority: string; // Call 우선 순위 ex) 99  ( 1 ~ 99 -> PLC Call Priority Bit On : 99, Off :1)
}

// 창고 콜 정보 인터페이스 (공통) - 설비 반입/반출 콜 중 아직 처리되지 않은 콜 목록
export interface CallInfoForWms extends CallInfoBody {
  systemName?: string; // 설비랑 상호작용 하는 창고 이름  ex) MW01
}

// 공통 함수: Redis에서 콜 정보를 확인하고 처리하는 함수
export const checkCallInfoForWms = async () => {
  const callInfoList = (await redisUtil.hgetAllObject<EqpCallStats>(RedisKeys.InfoInCallByCallId)) || [];

  for (let i = 0, length = callInfoList.length; i < length; i++) {
    const callInfo = { ...callInfoList[i] };
    // const systemName = callInfo.SYSTEM_NAME || 'WMS';
    const systemName = 'WMS';

    const wmsCallInfo: CallInfoForWms = {
      Call_ID: callInfo.CALL_ID,
      Call_Priority: callInfo.Call_Priority,
      Call_Quantity: callInfo.Call_Quantity.toString(),
      Call_Type: callInfo.Call_Type,
      Caller: callInfo.Caller,
      Cmd_ID: '',
    };

    // delete callInfo['systemName'];

    sendCallInfoToWms(wmsCallInfo, systemName);
  }
};

// 공통 함수: 콜 정보를 WMS로 전송하는 함수
const sendCallInfoToWms = async (callInfo: CallInfoBody, systemName: string) => {
  const topic = 'CALL';
  const subject = 'CALL_INFO';

  const callInfoData = { ...callInfo };
  // 처음 들어온 정보는 cmd id가 존재하지 않음, 이미 있는 메세지는 cmdid 존재 (cmdid 동일하게 재요청)
  if (callInfoData.Cmd_ID === '' || !callInfoData.Cmd_ID) {
    callInfoData.Cmd_ID = generateUUIDNode();
  }

  // CallInfo MQTT 전송 전 유효성 검사
  if (!callInfoData.Cmd_ID || callInfoData.Cmd_ID === '') {
    // cmdId는 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: `call.ts - CallInfo`,
      error: `Cmd Id ${callInfo.Cmd_ID} is invalid`,
      params: null,
      result: false,
    });
    return;
  }
  if (!systemName) {
    // 해당 메세지에 대한 systemName은 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: `call.ts - CallInfo`,
      error: `systemName: ${systemName} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const mqttHeader = makeMbsMqttHeader(subject);
  const mqttBody: MbsMqttBody = callInfoData;
  // CALLINFO MQTT 데이터 전송
  sendMbsMqtt(topic, mqttHeader, mqttBody, systemName);

  // CALLINFO 보내고 나서 해당 redis 값 삭제
  deleteInfoInCallByCallId(callInfoData.Call_ID);

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody });

  // Recent call info task 기록
  const recentCallInfoTaskParams: RecentCallInfo = {
    cmdId: callInfoData.Cmd_ID,
    callId: callInfoData.Call_ID,
    transferId: null,
    callType: callInfoData.Call_Type,
    callQuantity: callInfoData.Call_Quantity,
    callPriority: callInfoData.Call_Priority,
    caller: callInfoData.Caller,
    port: null,
  };
  setRecentCallInfoTaskByCmdId(recentCallInfoTaskParams);

  // ITEM LOG 기록
  // 물류 로그에 대한 redis 값 업데이트
  const trackingLogSubject = 'CALL_INFO';
  const trackingLogDetail = 'CALL_INFO';
  const trackingLogState = 'PROCESSING';
  const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
    callId: callInfoData.Call_ID,
    subject: trackingLogSubject,
    detail: trackingLogDetail,
    state: trackingLogState,
    startFacility: null,
    destFacility: callInfo.Caller,
    assignedRobot: null,
    value: null,
    description: `Facility ${callInfo.Caller} requested CALLINFO to WMS ${systemName} with call number ${callInfoData.Call_ID}`,
    plcName: null,
    portName: null,
  };
  await editTrackingLogRedis(trackingLogUpdateData, callInfoData.Call_ID.slice(-4), 'SUCCESS', callInfo.Caller);
};

// ACK 명령을 입력 받아서 remainingAckCommand 삭제
export const deleteInfoInCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정

  redisUtil.hdel(RedisKeys.InfoInCallByCallId, callId);
};

export const deleteInfoAckInCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정
  redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId);
};
