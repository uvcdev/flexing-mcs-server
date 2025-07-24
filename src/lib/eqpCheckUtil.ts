import { AttributeIds } from 'node-opcua-client';
import { TagValue, useKepServerUtil } from './kepServerUtil';
import { logging } from './logging';
import opcuaUtil from './opcuaUtil';
import { useCallRegisterUtil } from './callRegisterUtil';
import { useCallRemoveUtil } from './callRemoveUtil';
import { useDockingUtil } from './process/dockingUtil';
import { useCallCancelUtil } from './callCancelUtil';
import { useCallTypeUtil } from './callTypeUtil';
import { useMultiCallRegisterUtil } from './multiCallRegisterUtil';
import { useCallResponseUtil } from './callResponseUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';

export interface EQP_WCS {
  EQP_ID: string;
  CALL_ID: string;
  EQP_CALL_ID: string;
  WCS_CALL_ID?: string;
}

export const useEqpCheckUtil = () => {
  const eqpTaskStatus = async (targetTagInfo: TagValue) => {
    try {
      // TAG_NAME에 따라 다른 함수 실행
      switch (targetTagInfo.TAG_NAME) {
        // case 'Call_Request':
        //   console.log(`Changed Call_Request`, targetTagInfo.EQ_CODE, targetTagInfo.value);
        //   if (targetTagInfo.value === true) {
        //     await useCallRegisterUtil().callRegister(targetTagInfo)
        //   } else {
        //     await useCallRemoveUtil().callRemove(targetTagInfo)
        //   }
        //   break;
        case 'Call_Request':
          console.log(`Changed Call_Request`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === true) {
            await useRedisUtil().hset(
              RedisKeys.InfoCallRequestOnBySerial,
              targetTagInfo.EQ_CODE,
              JSON.stringify(targetTagInfo)
            );
          } else {
            await useCallRemoveUtil().callRemove(targetTagInfo);
          }
          break;

        case 'Call_Response':
          console.log(`Changed Call_Response`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          // 아래 주석 : ACS 로부터 직접 작업 취소/실패를 받아서 mqttUtil 에서 처리
          // if (targetTagInfo.value === false) {
          //   await useCallResponseUtil().callReRegister(targetTagInfo);
          // }
          break;

        case 'Call_Cancel_Request':
          console.log(`Changed Call_Cancel_Request`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useCallCancelUtil().callCancel(targetTagInfo);
          break;

        case 'Dock_Permit':
          console.log(`Changed Dock_Permit`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useDockingUtil().dockingStart(targetTagInfo);
          break;

        case 'Dock_Not_Permit':
          console.log(`Changed Dock_Not_Permit`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useDockingUtil().dockingFailed(targetTagInfo);
          break;

        case 'Dock_EQ_Status':
          console.log(`Changed Dock_EQ_Status`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useDockingUtil().dockingComplete(targetTagInfo);
          break;

        case 'Dock_Out_Permit':
          console.log(`Changed Dock_Out_Permit`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useDockingUtil().dockingOutStart(targetTagInfo);
          break;

        case 'Call_Type_01':
          console.log(`Changed Call_Type_01`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useCallTypeUtil().callTypeResponse(targetTagInfo);
          break;

        case 'Complete':
          console.log(`Changed Complete`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          // await useCallTypeUtil().callTypeResponse(targetTagInfo);
          // await useKepServerUtil().writeSimpleTagValue({
          //   targetFacility: targetTagInfo.EQ_CODE,
          //   tagName: 'Dock_Signal_Reset',
          //   value: true,
          // });

          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: targetTagInfo.EQ_CODE,
            tagName: 'Dock_Request',
            value: false,
          });

          await useKepServerUtil().writeSimpleTagValue({
            targetFacility: targetTagInfo.EQ_CODE,
            tagName: 'Dock_AMR_Status',
            value: false,
          });
          // setTimeout(() => {
          //   useKepServerUtil().writeSimpleTagValue({
          //     targetFacility: targetTagInfo.EQ_CODE,
          //     tagName: 'Dock_Signal_Reset',
          //     value: false,
          //   });
          // }, 1000);

          // todo 250724: 작업완료된 이후 멀티콜 판단해서 작업지시 만드는 로직
          await useCallResponseUtil().decisionWorkOrder(targetTagInfo);
          break;

        case 'Call_Request_Multi_1':
          console.log(`Changed Call_Request_Multi_1`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === true) {
            await useMultiCallRegisterUtil().hsetWithIncrementCount(
              RedisKeys.InfoWorkOrderCountBySerial,
              targetTagInfo.EQ_CODE
            );
            await useRedisUtil().hset(
              RedisKeys.InfoMultiCallRequestOnBySerial,
              `${targetTagInfo.EQ_CODE}_1`,
              JSON.stringify(targetTagInfo)
            );
          }
          break;

        case 'Call_Request_Multi_2':
          console.log(`Changed Call_Request_Multi_2`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === true) {
            await useMultiCallRegisterUtil().hsetWithIncrementCount(
              RedisKeys.InfoWorkOrderCountBySerial,
              targetTagInfo.EQ_CODE
            );
            await useRedisUtil().hset(
              RedisKeys.InfoMultiCallRequestOnBySerial,
              `${targetTagInfo.EQ_CODE}_2`,
              JSON.stringify(targetTagInfo)
            );
          }
          break;
      }
    } catch (error) {
      console.error('DoCheck error:', error);
    }
  };
  // callRequestMulti1Value와 callRequestMulti2Value의 값을 기반으로 multiValue 결정
  const determineMultiValue = (callRequestMulti1Value: string, callRequestMulti2Value: string): number => {
    if (callRequestMulti1Value === 'true' && callRequestMulti2Value === 'true') {
      return 3;
    } else if (callRequestMulti1Value === 'true') {
      return 2;
    } else {
      return 1;
    }
  };
  const createEQPCallId = async (
    targetKey: string,
    callCountValue: string,
    multiValue: number
  ): Promise<string[] | null> => {
    try {
      // 설비코드 1 + 설비코드 2 + 콜 ID 시간1(년도) + 콜 ID시간2(월,일) + 콜ID(0~9999)
      const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
      const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
      const callTimeYear = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_Year`);
      const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_MonthDay`);

      // 필요한 모든 nodeId들을 배열로 모음
      const needNodeIds = [
        EQCode01?.NODE_ID,
        EQCode02?.NODE_ID,
        callTimeYear?.NODE_ID,
        callTimeMonthDay?.NODE_ID,
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      const readDatas = await useKepServerUtil().readTagsValue(needNodeIds);
      console.log('🚀 ~ createEQPCallId ~ readDatas:', readDatas);

      const needKeys = [
        EQCode01?.TAG_NAME,
        EQCode02?.TAG_NAME,
        callTimeYear?.TAG_NAME,
        callTimeMonthDay?.TAG_NAME,
      ].filter((tagName): tagName is string => tagName !== undefined);

      for (let i = 0; i < needKeys.length; i++) {
        useKepServerUtil().updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }

      const EQCode01Value = EQCode01?.value.toString() || '0';
      const EQCode02Value = EQCode02?.value.toString() || '0';
      const callTimeYearValue = callTimeYear?.value.toString() || '0';
      const callTimeMonthDayValue = callTimeMonthDay?.value.toString() || '0';

      // callTimeMonthDay 값을 4자릿수로 변환
      const callTimeMonthDayStr = callTimeMonthDayValue.toString().padStart(4, '0');

      const result = [];
      for (let i = 0; i < multiValue; i++) {
        const callId =
          EQCode01Value +
          EQCode02Value +
          callTimeYearValue +
          callTimeMonthDayStr +
          callCountValue +
          (i >= 1 ? '_' + i.toString() : '');
        result.push(callId);
      }

      return result;
    } catch (error) {
      console.error('Error creating EQP Call ID:', error);
      return null;
    }
  };

  /*
    const callRegister = async (targetTagInfo: TagValue) => {
      if (targetTagInfo.TAG_NAME !== "Call_Request") {
        throw new Error(`Call_Request 태그가 아님. ${targetTagInfo.TAG_NAME}`);
      }
  
      if (targetTagInfo.value !== true) {
        console.log(`Call_Request 태그가 0이 들어옴. ${targetTagInfo.value}`);
        logging.SYSTEM_LOG({
          title: "Call_Request 태그가 0이 들어옴.",
          message: targetTagInfo.value
        });
        return;
      }
  
      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
      // 필요한 태그 값들 가져오기
      const callType01 = opcuaUtil.tagMap.get(`${targetKey}.Call_Type_01`);
      const callPriority = opcuaUtil.tagMap.get(`${targetKey}.Call_Priority`);
      const callCount = opcuaUtil.tagMap.get(`${targetKey}.Call_Count`);
      const callRequestMulti1 = opcuaUtil.tagMap.get(`${targetKey}.Call_Request_Multi_1`);
      const callRequestMulti2 = opcuaUtil.tagMap.get(`${targetKey}.Call_Request_Multi_2`);
      // 필요한 모든 nodeId들을 배열로 모음
      const needNodeIds = [
        callType01?.NODE_ID,
        callPriority?.NODE_ID,
        callCount?.NODE_ID,
        callRequestMulti1?.NODE_ID,
        callRequestMulti2?.NODE_ID
      ].filter((nodeId): nodeId is string => nodeId !== undefined);
  
      const readDatas = await useKepServerUtil().readTagsValue(needNodeIds);
  
      const needKeys = [
        callType01?.TAG_NAME,
        callPriority?.TAG_NAME,
        callCount?.TAG_NAME,
        callRequestMulti1?.TAG_NAME,
        callRequestMulti2?.TAG_NAME
      ].filter((tagName): tagName is string => tagName !== undefined);
  
      for (let i = 0; i < needKeys.length; i++) {
        useKepServerUtil().updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      }
  
      const callType01Value = callType01?.value.toString() || "0";
      const callPriorityValue = callPriority?.value.toString() || "0";
      const callCountPrevValue = callCount?.prevValue.toString() || "0";
      const callCountValue = callCount?.value.toString() || "0";
      const callRequestMulti1Value = callRequestMulti1?.value.toString() || "0";
      const callRequestMulti2Value = callRequestMulti2?.value.toString() || "0";
  
  
      // 유효성 검사
      if (callType01Value === "0" || callCountValue === "0") {
        console.log(`callTypeValue가 0이거나 callCountValue가 0
                    callType: ${callType01Value}, 
                    callCount: ${callCountValue}
                    `);
  
        logging.SYSTEM_LOG({
          title: "얘네가 다 0이 아니어야 되는데 0이 들어옴.",
          message: `callType: ${callType01Value}, callCount: ${callCountValue}
                    ` });
  
        throw new Error(`callTypeValue가 0이거나 callCountValue가 0.
                    callType: ${callType01Value}, 
                    callCount: ${callCountValue}
                    `);
      }
  
      // 우선순위 체크
      // callPriorityValue === "1"
      // 중복 콜 체크
      // callCountPrevValue === callCountValue
      // 다중 호출 체크
      // callRequestMulti1Value === "1"
      // callRequestMulti2Value === "1"
  
  
      const multiValue = determineMultiValue(callRequestMulti1Value, callRequestMulti2Value);
  
      const eqpCallId = await createEQPCallId(targetKey, callCountValue, multiValue);
  
      const eqpWcsInfo: EQP_WCS[] = eqpCallId?.map((callId) => ({
        EQP_ID: targetTagInfo.CHANNEL,
        EQP_CALL_ID: callId
      })) || [];
  
      console.log("🚀 ~ consteqpWcsInfo:EQP_WCS[]=eqpCallId?.map ~ eqpWcsInfo:", eqpWcsInfo)
      // WCS에 콜 등록 요청
  
      console.log(`Call request sent to WCS. TYPE: ${callType01Value}, CallID: ${callCountValue}`);
  
      // 1. EQP (LOAD_PORT 11 투입) to WMS - WMS입장에서 반출   call out api
      // 2. EQP (UNLOAD_PORT 12 회수) to WMS - WMS입장에서 반입 call in api
      // 3. EQP to EQP 
  
  
      // 창고요청응답후 EQP에 호출응답신호 ( writeTagsValue 테스트)
      const callResponse = opcuaUtil.tagMap.get(`${targetKey}.Call_Response`);
      const callResponseWriteResult = await useKepServerUtil().writeTagsValue([
        {
          nodeId: callResponse?.NODE_ID,
          attributeId: AttributeIds.Value,
          value: {
            value: {
              dataType: callResponse?.DATA_TYPE,
              value: true
            }
          }
        }
      ]);
    };*/

  const callCancel = async (targetTagInfo: TagValue) => {
    // 구현 필요
  };

  return { eqpTaskStatus };
};
