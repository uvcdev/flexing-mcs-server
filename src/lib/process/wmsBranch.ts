import { del } from "superagent";
import { generateUUIDNode } from "../hashUtil";
import { logging } from "../logging";
import { makeMbsMqttHeader, MbsMqttBody, sendMbsMqtt } from "../mqttUtil";
import { RedisKeys, useRedisUtil } from "../redisUtil";
import { setRemainingAckCommand } from "./wmsAck";
import { EqpCallStats } from "../callRegisterUtil";


const redisUtil = useRedisUtil();

interface ReqCarrierInfo {
  CarrierID: string;
  CarrierState: string;
  Call_Type: string;
}

interface RepCarrierInfo {
  CarrierID: string;
  CarrierState: string;
  Call_Type: string;
  NewDest: string;
  ResultCode: string;
}

export interface BranchInfoReqBody {
  Cmd_ID: string;
  Call_ID: string;
  AMRID: string;
  MissionID: string;
  CurrentLocation: string;
  CarrierList: Array<ReqCarrierInfo>
}

export interface BranchInfoRepBody {
  Cmd_ID: string;
  Call_ID: string;
  AMRID: string;
  MissionID: string;
  CurrentLocation: string;
  CarrierList: Array<RepCarrierInfo>
}

export interface BranchInfoReqForWms extends BranchInfoReqBody {
  systemName?: string;
  workOrderCode?: string;
  workOrderId?: number;
}

export interface DeletedBranchInfoReq {
  isMissionOrder?: boolean;
  workOrderCode?: string | null;
  workOrderId?: number | null;
}

export interface MqttBranchInfoDataFromAcs {
  workOrderCode: string;
  workOrderId: string;
  amrName: string;
  missionOrderCode: string;
  waitPointCode: string;
  carrierId: string;
  carrierState: string;
  callType: string;
  mode: 'auto' | 'manual'
}

// 공통 함수: Redis에서 미션 결정지 콜 정보를 확인하고 처리하는 함수
export const checkMissionBranchInfoReqForWms = async () => {
  const missionBranchInfoList = await redisUtil.hgetAllObject<BranchInfoReqForWms>(RedisKeys.InfoMissionCallByCallId) || [];

  for (let i = 0, length = missionBranchInfoList.length; i < length; i++) {
    const branchInfo = { ...missionBranchInfoList[i] };
    const systemName = branchInfo.systemName || 'WMS';

    const deletedBranchInfoReqInfo: DeletedBranchInfoReq = {
      isMissionOrder: true,
      workOrderCode: branchInfo.workOrderCode,
      workOrderId: branchInfo.workOrderId,
    }

    delete branchInfo['systemName'];
    delete branchInfo['workOrderCode'];
    delete branchInfo['workOrderId'];

    sendBranchInfoToWms(branchInfo, systemName, deletedBranchInfoReqInfo);
  }
};

// 공통 함수: Redis에서 OUT 콜 정보를 확인하고 처리하는 함수
export const checkOutBranchInfoReqForWms = async () => {
  const outBranchInfoList = await redisUtil.hgetAllObject<EqpCallStats>(RedisKeys.InfoOutCallByCallId) || [];

  for (let i = 0, length = outBranchInfoList.length; i < length; i++) {
    const outCallInfo = outBranchInfoList[i];

    const branchInfo: BranchInfoReqBody = {
      Cmd_ID: '',
      Call_ID: outCallInfo.CALL_ID,
      MissionID: outCallInfo.CALL_ID,
      AMRID: '',
      CurrentLocation: outCallInfo.Caller,
      CarrierList: [
        {
          CarrierID: '',
          CarrierState: '',
          Call_Type: outCallInfo.Call_Type
        }
      ]
    }
    // const systemName = callInfo.SYSTEM_NAME || 'WMS';
    const systemName = 'WMS';

    const deletedBranchInfoReqInfo: DeletedBranchInfoReq = {
      isMissionOrder: false,
      workOrderCode: null,
      workOrderId: null,
    }

    sendBranchInfoToWms(branchInfo, systemName, deletedBranchInfoReqInfo);
  }
};

const sendBranchInfoToWms = (branchInfo: BranchInfoReqBody, systemName: string, deletedBranchInfoReqInfo: DeletedBranchInfoReq) => {
  const topic = 'BRANCH';
  const subject = 'BRANCH_INFO_REQ'

  const branchInfoData = { ...branchInfo };
  // 처음 들어온 정보는 cmd id가 존재하지 않음, 이미 있는 메세지는 cmdid 존재 (cmdid 동일하게 재요청)
  if (branchInfoData.Cmd_ID === '') {
    branchInfoData.Cmd_ID = generateUUIDNode();
  }

  // CallInfo MQTT 전송 전 유효성 검사
  if (!branchInfoData.Cmd_ID || branchInfoData.Cmd_ID === '') {
    // cmdId는 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: `wmsBranch.ts - sendBranchInfoToWms`,
      error: `Cmd Id ${branchInfoData.Cmd_ID} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  if (!systemName) {
    // 해당 메세지에 대한 systemName은 필수 값이기 때문에 없으면 에러 발생
    logging.ACTION_ERROR({
      filename: `wmsBranch.ts - sendBranchInfoToWms`,
      error: `systemName: ${systemName} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const mqttHeader = makeMbsMqttHeader(subject);
  const mqttBody: MbsMqttBody = branchInfoData;

  // CALLINFO MQTT 데이터 전송
  sendMbsMqtt(topic, mqttHeader, mqttBody, systemName);

  // CALLINFO 보내고 나서 해당 redis 값 삭제
  if (deletedBranchInfoReqInfo.isMissionOrder) {
    deleteInfoMissionCallByCallId(branchInfoData.Call_ID)
  } else {
    deleteInfoOutCallByCallId(branchInfoData.Call_ID)
  }

  // CALLINFO에 대한 ack 초기값 설정
  setRemainingAckCommand(topic, systemName, { header: mqttHeader, body: mqttBody }, deletedBranchInfoReqInfo);

  // ITEM LOG 기록
  // TODO - 물류 로그에 대한 redis 값 업데이트
};

export const deleteInfoOutCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.InfoOutCallByCallId, callId);
}

export const deleteInfoAckOutCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.InfoAckOutCallByCallId, callId);
}

export const deleteInfoMissionCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.InfoMissionCallByCallId, callId);
}

export const deleteInfoAckMissionCallByCallId = (callId: string) => {
  // logging 처리는 이 함수를 사용하는 쪽에서 사용
  // TODO-ljk) ack 유효성 검사는 로직이 잡히면 추가될 예정 
  redisUtil.hdel(RedisKeys.InfoAckMissionCallByCallId, callId);
}

// 미션 오더 수집 후 해당 데이터 Redis로 수집
export const receiveBranchInfoFromACS = async (branchInfoMqttMessage: MqttBranchInfoDataFromAcs) => {
  if (branchInfoMqttMessage.mode === 'auto') {
    const callId = branchInfoMqttMessage.workOrderCode?.split('$')[0] || ''

    if (!callId || callId === '') {
      logging.ACTION_ERROR({
        filename: `wmsBranch.ts - receiveBranchInfoFromACS`,
        error: `callId(${callId}) is invalid value`,
        params: null,
        result: false,
      });
    }

    const branchInfoReqForWmsParams: BranchInfoReqForWms = {
      Cmd_ID: '',
      Call_ID: callId,
      AMRID: branchInfoMqttMessage.amrName,
      MissionID: branchInfoMqttMessage.workOrderCode,
      CurrentLocation: branchInfoMqttMessage.waitPointCode,
      CarrierList: [
        {
          CarrierID: branchInfoMqttMessage.carrierId,
          CarrierState: branchInfoMqttMessage.carrierState,
          Call_Type: branchInfoMqttMessage.callType
        }
      ]

    }
    redisUtil.hset(RedisKeys.InfoMissionCallByCallId, callId, JSON.stringify(branchInfoReqForWmsParams))
  }
  // 수동 작업 지시 미션 결정지에서는 어떻게 처리 할까 ...
  else if (branchInfoMqttMessage.mode === 'manual') {

  }

}

// 미션 오더 결과를 ACS에 데이터 송신
export const sendBranchInfoToACS = async (branchInfoMqttMessage: MqttBranchInfoDataFromAcs) => {
}