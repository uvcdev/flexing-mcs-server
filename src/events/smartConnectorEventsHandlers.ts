import { smartConnectorEventEmitter } from './smartConnectorEvents';
import { smartConnector, TagValue } from '../models/smartConnector/smartConnector';
import { useEqpCheckUtil } from '../lib/eqpCheckUtil';
export const initializeSmartConnectorEventsHandlers = async () => {
  const eqpCheckUtil = useEqpCheckUtil();
  // 핸들러 초기화 함수가 호출되는 시점[디버깅용]
  console.log('[LISTENING] SmartConnector Events Handlers를 초기화하고 이벤트 구독을 시작합니다...');

  // 'Call_Request' 태그 변경
  smartConnectorEventEmitter.on('Call_Request', (payload) => {
    // 'Call_Request' 태그 변경 이벤트가 수신
    console.log('[RECEIVED] Event: Call_Request, Payload:', payload); // 디버깅용

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Call_Request`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Request 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Request 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Request 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request 변경 없음 처리!`);
    }
  });

  // 'Call_Response' 태그 변경
  smartConnectorEventEmitter.on('Call_Response', (payload) => {
    console.log('[RECEIVED] Event: Call_Response, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Call_Response`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Response 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Response 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Response 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Response 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Response 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Response 변경 없음 처리!`);
    }
  });

  // 'Call_Cancel_Request' 태그 변경
  smartConnectorEventEmitter.on('Call_Cancel_Request', (payload) => {
    console.log('[RECEIVED] Event: Call_Cancel_Request, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(
      `${payload.facilityName}.Call_Cancel_Request`
    );
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Cancel_Request 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Cancel_Request 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Cancel_Request 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Cancel_Request 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Cancel_Request 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Cancel_Request 변경 없음 처리!`);
    }
  });

  // 'Dock_Permit' 태그 변경
  smartConnectorEventEmitter.on('Dock_Permit', (payload) => {
    console.log('[RECEIVED] Event: Dock_Permit, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Dock_Permit`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Dock_Permit 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Dock_Permit 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Permit 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Dock_Permit 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Permit 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Permit 변경 없음 처리!`);
    }
  });

  // 'Dock_Not_Permit' 태그 변경
  smartConnectorEventEmitter.on('Dock_Not_Permit', (payload) => {
    console.log('[RECEIVED] Event: Dock_Not_Permit, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Dock_Not_Permit`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Dock_Not_Permit 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Dock_Not_Permit 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Not_Permit 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Dock_Not_Permit 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Not_Permit 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Not_Permit 변경 없음 처리!`);
    }
  });

  // 'Dock_EQ_Status' 태그 변경
  smartConnectorEventEmitter.on('Dock_EQ_Status', (payload) => {
    console.log('[RECEIVED] Event: Dock_EQ_Status, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Dock_EQ_Status`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Dock_EQ_Status 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Dock_EQ_Status 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_EQ_Status 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Dock_EQ_Status 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_EQ_Status 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Dock_EQ_Status 변경 없음 처리!`);
    }
  });

  // 'Dock_Out_Permit' 태그 변경
  smartConnectorEventEmitter.on('Dock_Out_Permit', (payload) => {
    console.log('[RECEIVED] Event: Dock_Out_Permit, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Dock_Out_Permit`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Dock_Out_Permit 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Dock_Out_Permit 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Out_Permit 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Dock_Out_Permit 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Out_Permit 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Out_Permit 변경 없음 처리!`);
    }
  });
  // 'Call_Type_01' 태그 변경
  smartConnectorEventEmitter.on('Call_Type_01', (payload) => {
    console.log('[RECEIVED] Event: Call_Type_01, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Call_Type_01`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Type_01 태그 없음!`);
      return;
    }
    if (payload.old !== '') {
      // todo: Call_Type_01 태그의 새로운 값이 발생했을 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Type_01 값 변경!`);
      targetTagInfo.value = payload.new;
      targetTagInfo.prevValue = payload.old;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, payload.new);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Type_01 값 변경 없음 처리!`);
    }
  });

  // 'Complete' 태그 변경
  smartConnectorEventEmitter.on('Complete', (payload) => {
    console.log('[RECEIVED] Event: Complete, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Complete`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Complete 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Complete 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Complete 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Complete 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Complete 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Complete 변경 없음 처리!`);
    }
  });

  // 'Call_Request_Multi_1' 태그 변경
  smartConnectorEventEmitter.on('Call_Request_Multi_1', (payload) => {
    console.log('[RECEIVED] Event: Call_Request_Multi_1, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(
      `${payload.facilityName}.Call_Request_Multi_1`
    );
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Request_Multi_1 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Request_Multi_1 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_1 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Request_Multi_1 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_1 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_1 변경 없음 처리!`);
    }
  });

  // 'Call_Request_Multi_2' 태그 변경
  smartConnectorEventEmitter.on('Call_Request_Multi_2', (payload) => {
    console.log('[RECEIVED] Event: Call_Request_Multi_2, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(
      `${payload.facilityName}.Call_Request_Multi_2`
    );
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Request_Multi_2 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Request_Multi_2 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_2 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Request_Multi_2 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_2 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Request_Multi_2 변경 없음 처리!`);
    }
  });

  // 'Call_Priority' 태그 변경
  smartConnectorEventEmitter.on('Call_Priority', (payload) => {
    console.log('[RECEIVED] Event: Call_Priority, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Call_Priority`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Call_Priority 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Call_Priority 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Priority 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Call_Priority 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Call_Priority 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Call_Priority 변경 없음 처리!`);
    }
  });

  // 'Dock_Disable' 태그 변경
  smartConnectorEventEmitter.on('Dock_Disable', (payload) => {
    console.log('[RECEIVED] Event: Dock_Disable, Payload:', payload);

    const targetTagInfo: TagValue | undefined = smartConnector.tagMap.get(`${payload.facilityName}.Dock_Disable`);
    if (!targetTagInfo) {
      console.log(`[Handler] tagmap에서 ${payload.facilityName}.Dock_Disable 태그 없음!`);
      return;
    }
    if (payload.old === 'false' && payload.new === 'true') {
      // todo: Dock_Disable 태그의 새로운 값이 '1'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Disable 발생!`);
      targetTagInfo.value = true;
      targetTagInfo.prevValue = false;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, true);
    } else if (payload.old === 'true' && payload.new === 'false') {
      // todo: Dock_Disable 태그의 새로운 값이 '0'일 때 로직 실행
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Disable 꺼짐!`);
      targetTagInfo.value = false;
      targetTagInfo.prevValue = true;
      targetTagInfo.timestamp = Date.now();
      eqpCheckUtil.eqpTaskStatus(targetTagInfo, false);
    } else {
      console.log(`[Handler] ${payload.facilityName}에서 Dock_Disable 변경 없음 처리!`);
    }
  });
};
