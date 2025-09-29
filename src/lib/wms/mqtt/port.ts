import { TrackingLogRedisUpdateParams } from '../../../models/common/trackingLog';
import { PendingWorkOrderAttributes } from '../../../models/operation/workOrder';
import { logging } from '../../logging';
import { separateMqttMessage, MbsMqttMesaage, makeMbsMqttHeader, MbsMqttBody } from '../../mqttUtil';
import { editTrackingLogRedis } from '../../process/trackingLog';
import { setReceivedAckCommand } from '../../process/wmsAck';
import { CallInfoBody, deleteInfoAckInCallByCallId } from '../../process/wmsCallInfo';
import { deleteRecentCallInfoTaskByCmdId } from '../../process/wmsCommon';
import { RedisKeys, useRedisUtil } from '../../redisUtil';
import { dao as workOrderDao } from '../../../dao/operation/workOrderDao';
import { sendCallInfoList } from '../../process/wmsSyncronization';
import { InfoAckInCallByCallIdBody } from './call';

const systemTopic = 'PORT';

const redisUtil = useRedisUtil();

export interface PortPresenceStatusBody {
  Cmd_ID: string; // 메세지에 대한 uuid  ex) "292db679-715f-4aea-a4ae-d5615c5355b2"
  EQPName: string; // 설비명 - 어떤 설비에 대한 정보인지 질문 ex) "WMS01"
  Call_ID: string; // MCS가 WMS에게 전달한 CALL_ID  ex) MP122025041514300001
  PortID: string; // 출발 포트 이름  ex) MW24
  CarrierID: string; // 화물 ID   ex ) ST-P#501
  PresenceStatus: string; // 화물 존재 여부 0 or 1  ex) 1
  PairTransferID: string; // Pair된 반송 명령 ID - CallQuantity가 2일때 부여
  NGCase: string; // NG 여부 Y or N  ex) N
}

interface PortPresenceStateInfo {
  PortID: string; // 출발 포트 이름  ex) MW24
  CarrierID: string; // 화물 ID   ex ) ST-P#501
  Call_ID: string; // MCS가 WMS에게 전달한 CALL_ID  ex) MP122025041514300001
  Cmd_ID: string; // 메세지에 대한 uuid  ex) "292db679-715f-4aea-a4ae-d5615c5355b2"
  PresenceStatus: '0' | '1'; // 화물 존재 여부 0 or 1  ex) 1 => 해당 경우는 포트에 스키드 존재 여부로 확인됨 ( 25.09.23 )
}

interface PortPresenceStateListBody {
  PortList: Array<PortPresenceStateInfo>;
}

const portPresenceStatus = async (
  wmsName: string,
  subject: string,
  messageMessage: MbsMqttMesaage,
  messageBody: PortPresenceStatusBody
) => {
  console.log('catch wmsPortPresenceStatust');

  const cmdId = messageBody.Cmd_ID;
  const portId = messageBody.PortID;
  const callId = messageBody.Call_ID;
  const separateCallId = callId.split('_');

  // HCACK = 4 수신
  setReceivedAckCommand(systemTopic, wmsName, callId, messageMessage);

  // 창고에서 만든 수동 작업 ( 재반입, 재고 순환 )
  // 창고 수동 작업 지시는 무조건 창고 배출 포트에서 창고 투입 포트로만 가능하며, 라인으로 보내고 싶을 시, ACS를 이용해야한다.
  // 예시 : MW01_출발지(WS14)_도착지(WS11)_202509191101290004
  // [창고명]_[출발지]_[도착지]_번호
  // 재고 순환에 대한 트래킹 로그를 기록 하는 것이 맞는가 ?
  if (separateCallId.length === 4) {
    const fromFacilityName = separateCallId[1];
    const toFacilityName = separateCallId[2];

    if (toFacilityName !== '') {
      const infoPendingWorkOrder: PendingWorkOrderAttributes = {
        callId: callId,
        fromFacilityName: fromFacilityName,
        toFacilityName: toFacilityName,
        type: 'OUT',
        isMissionOrder: false,
        callPriority: '99',
        // ToDO - CALL TYPE 이 없는데 ...
        // 해당 영역 어떻게 처리 할 지 고민 필요
        callType: 'NG11',
        eqpName: fromFacilityName,
        portName: toFacilityName,
      };

      // pending workOrder 레디스 정보 저장

      console.log('infoPendingWorkOrder', infoPendingWorkOrder);

      redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callId, JSON.stringify(infoPendingWorkOrder));
    }
    // [창고명]_[출발지]__번호
    // 도착지가 없이 Port 배정이 나오는 경우 MCS 알람 발생
    // MCS -> ACS로 알람 전달 예정 이후 사용자 수동 작업 예정 ( 협의 필요 )
    else if (toFacilityName !== '') {
    }
  }
  // CALL INFO 받아서 생성된 port presence status
  else {
    // infoAckInfoCallByCallId 랑 매칭되는 정보 조회
    // infoAckInfoCallByCallId 말고 RecentCallInfoTaskByCmdId 로도 가능함
    const infoAckInCallByCallId =
      (await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(RedisKeys.InfoAckInCallByCallId, callId)) || null;

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

      return;
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

      return;
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
    };

    // pending workOrder 레디스 정보 저장

    console.log('infoPendingWorkOrder', infoPendingWorkOrder);

    const reinboundIfPortAssignedForFacilityCancelByCallId = await redisUtil.hget(
      RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId,
      callId
    );
    if (reinboundIfPortAssignedForFacilityCancelByCallId) {
      infoPendingWorkOrder.callId = callId + '_canceled';
      infoPendingWorkOrder.fromFacilityName = portId;
      infoPendingWorkOrder.toFacilityName = null;
      infoPendingWorkOrder.type = 'MISSION';
      infoPendingWorkOrder.isMissionOrder = true;
      infoPendingWorkOrder.callPriority = infoAckInCallByCallId.Call_Priority;
      infoPendingWorkOrder.callType = infoAckInCallByCallId.Call_Type;
      infoPendingWorkOrder.portName = null;
      infoPendingWorkOrder.eqpName = portId;
      redisUtil.hdel(RedisKeys.ReinboundIfPortAssignedForFacilityCancelByCallId, callId);
    }

    redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, callId, JSON.stringify(infoPendingWorkOrder));

    // infoAckInCallByCallId 정보 삭제
    // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)
    deleteInfoAckInCallByCallId(callId);

    // RecentCallInfoTaskByCmdId 정보 삭제
    deleteRecentCallInfoTaskByCmdId(cmdId);

    // 물류 로그 저장 - 포트 지정 완료
    const trackingLogSubject = subject;
    const trackingLogDetail = 'PORT_ASSIGNED';
    const trackingLogState = 'PROCESSING';
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
      description: `Call ID ${callId} received ${subject} from WMS(${wmsName}) - Port assigned: ${portId}`,
    };
    await editTrackingLogRedis(trackingLogUpdateData, portId, 'SUCCESS', wmsName);
  }
};

// 창고 동기화 로직 ( Port List )
// 창고 기준 배출 포트의 Port Status List 를 전달 받는다.
// Cmd ID로 응답 받았다고 처리 -> ackReqPortSTateList는 재요청하지 않기 때문에 cmd Id와 hcack는 없고 무조건 진행한다.
// ACK_CALL_INFO를 받은 목록 중 MCS_recent_call_info_task_by_cmd_id, MCS_info_ack_in_call_by_call_id 를 확인하여 Port 배정을 못 받은 응답이 있는지 확인한다.
// 있을 경우, Port 배정과 같은 시나리오로 pending work order를 생성한다.
// 없을 경우, 이미 작업 지시가 진행 중인지 확인하고
// 작업지시가 만들어졌으면 Ok , 작업 지시가 만들어지지 않았으면 해당 콜로 작업 지시를 만들어준다.
// For 문 반복
const ackReqPortStateList = async (
  wmsName: string,
  subject: string,
  messageMessage: MbsMqttMesaage,
  messageBody: PortPresenceStateListBody
) => {
  console.log('catch wmsAckReqPortStateList');
  const portStatusList = messageBody.PortList || [];

  // Cmd ID로 응답 받았다고 처리
  // ACK_REQ_PORT_STATE_LIST는 재요청을 진행하지 않기 때문에

  for (let i = 0, length = portStatusList.length; i < length; i++) {
    const portStatusInfo = portStatusList[i];
    const portCallId = portStatusInfo.Call_ID;
    const portCmdId = portStatusInfo.Cmd_ID;
    const portPortId = portStatusInfo.PortID;

    // portStatusInfo.PresenceStatus === '0' 인 경우에는 스키드가 해당 포트에 존재하지 않는 것이기 때문에 처리할 케이스가 없음
    // 기다리면 PORT_PRESENCE 가 응답이 올 것
    if (portStatusInfo.PresenceStatus === '0') {
      continue;
    }
    // portStatusInfo.PresenceStatus === '0' 재고가 있는 경우
    else if (portStatusInfo.PresenceStatus === '1') {
      const separateCallId = portCallId.split('_');

      // 해당 포트가 재고순환 작업을 들고 있는 경우
      if (separateCallId.length === 4) {
        const workOrderInfo = await workOrderDao.selectInfoByCode({ code: portCallId });

        if (workOrderInfo) {
          continue;
        }

        const fromFacilityName = separateCallId[1];
        const toFacilityName = separateCallId[2];

        if (toFacilityName !== '') {
          const infoPendingWorkOrder: PendingWorkOrderAttributes = {
            callId: portCallId,
            fromFacilityName: fromFacilityName,
            toFacilityName: toFacilityName,
            type: 'OUT',
            isMissionOrder: false,
            callPriority: '99',
            // ToDO - CALL TYPE 이 없는데 ...
            // 해당 영역 어떻게 처리 할 지 고민 필요
            callType: 'NG11',
            eqpName: fromFacilityName,
            portName: toFacilityName,
          };

          // pending workOrder 레디스 정보 저장
          console.log('infoPendingWorkOrder', infoPendingWorkOrder);

          redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, portCallId, JSON.stringify(infoPendingWorkOrder));
        }
      } else {
        // 해당 포트가 재고순환 작업을 들고 있지 않은 경우
        const infoAckInCallByCallId =
          (await redisUtil.hgetObject<InfoAckInCallByCallIdBody>(RedisKeys.InfoAckInCallByCallId, portCallId)) || null;
        // PORT_PRESENCE를 받았는지 여부 확인 ( ACK_CALL_INFO에 대한 응답이 남아 있는지 ? )
        // ACK_CALL_INFO 정보가 있는 경우
        // 해당 정보로 PORT_PRESENCE와 같은 로직으로 처리한다. ( ACK_PORT_PRESENCE 작성 및 pending work order 생성 )
        if (infoAckInCallByCallId) {
          if (portCmdId !== infoAckInCallByCallId.Cmd_ID) {
            logging.ACTION_ERROR({
              filename: `port.ts - portPresenceStatus`,
              error: `[Cmd_ID] Cmd ID does not match(REDIS : ${infoAckInCallByCallId.Cmd_ID} , MQTT: ${portCmdId})`,
              params: null,
              result: false,
            });

            continue;
          }

          const portPresenceStatusSubject = 'ACK_PORT_PRESENCE_STATUS';
          const mqttHeader = makeMbsMqttHeader(portPresenceStatusSubject);
          const mqttBody: MbsMqttBody = {
            Cmd_ID: portCmdId,
          };

          // HCACK = 4 수신
          setReceivedAckCommand(systemTopic, wmsName, portCallId, { header: mqttHeader, body: mqttBody });

          const infoPendingWorkOrder: PendingWorkOrderAttributes = {
            callId: portCallId,
            fromFacilityName: portPortId,
            toFacilityName: infoAckInCallByCallId.Caller,
            type: 'IN',
            isMissionOrder: false,
            callPriority: infoAckInCallByCallId.Call_Priority,
            callType: infoAckInCallByCallId.Call_Type,
            eqpName: infoAckInCallByCallId.Caller,
            portName: portPortId,
          };

          // pending workOrder 레디스 정보 저장
          redisUtil.hset(RedisKeys.InfoPendingWorkOrderByCallId, portCallId, JSON.stringify(infoPendingWorkOrder));

          // infoAckInCallByCallId 정보 삭제
          // redisUtil.hdel(RedisKeys.InfoAckInCallByCallId, callId)
          deleteInfoAckInCallByCallId(portCallId);

          // RecentCallInfoTaskByCmdId 정보 삭제
          deleteRecentCallInfoTaskByCmdId(portCmdId);

          // 물류 로그 저장 - 포트 지정 완료
          const trackingLogSubject = subject;
          const trackingLogDetail = 'PORT_ASSIGNED';
          const trackingLogState = 'PROCESSING';
          const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
            callId: portCallId,
            subject: trackingLogSubject,
            detail: trackingLogDetail,
            state: trackingLogState,
            transferId: null,
            startFacility: portPortId,
            destFacility: infoAckInCallByCallId.Caller,
            assignedRobot: null,
            value: portPortId,
            description: `Call ID ${portCallId} received ${subject} from WMS(${wmsName}) - Port assigned: ${portPortId}`,
          };
          await editTrackingLogRedis(trackingLogUpdateData, portPortId, 'SUCCESS', wmsName);

          continue;
        }
        // ACK_CALL_INFO 정보가 없는 경우
        // work order 존재 여부를 확인한다.
        else if (!infoAckInCallByCallId) {
          // work order 존재가 있는 경우 ( pending 도 확인 필요 )
          // work order 가 있기 때문에 이미 처리 중인 정보라서 continue
          const portPresenceWorkOrder = await workOrderDao.selectInfoByCode({ code: portCallId });
          if (portPresenceWorkOrder) {
            console.log(`이미 처리된 콜 ID 입니다. ${portCallId}`);
            continue;
          }
          // work order도 없는 경우
          // PORT_PRESENCE와 같은 로직으로 처리한다. 단, 해당 경우는 거의 발생할 수 없는 경우이기 때문에 일단 코드 작성은 진행한다.
          // 일단 미작업. 해당 경우로 WMS와 인터페이스 오류가 발생할 가능성이 있음
          else if (!portPresenceWorkOrder) {
            // 이 경우는 에러로 처리하는 것이 맞는 것으로 보임
          }
        }
      }
    }
  }

  // 0924 이후 변경점 PORT_PRESENCE_STATE_LIST 이후 CALL LIST 호출
  sendCallInfoList();
};

export const wmsPort = (wmsName: string, messageJson: MbsMqttMesaage) => {
  const { messageId, subject, messageBody } = separateMqttMessage(messageJson);

  // console.log('messageId', messageId, 'subject', subject, 'messageBody', messageBody)

  if (subject === 'PORT_PRESENCE_STATUS') {
    portPresenceStatus(wmsName, subject, messageJson, messageBody as PortPresenceStatusBody);
  } else if (subject === 'ACK_REQ_PORT_STATE_LIST') {
    ackReqPortStateList(wmsName, subject, messageJson, messageBody as PortPresenceStateListBody);
  }
};
