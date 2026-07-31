import {
  PendingWorkOrderAttributes,
  RecentWorkOrderInfoByFacilitySerialAttributes,
  RecentWorkOrderListByFacilitySerialAttributes,
} from '../models/operation/workOrder';
import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { useMultiCallRegisterUtil } from './multiCallRegisterUtil';
import { logging } from './logging';
import opcuaUtil from './opcuaUtil';
import { EQP_WCS } from './eqpCheckUtil';
import { formatToDateCode, makeCallCount } from './usefullToolUtil';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { editTrackingLogRedis, initTrackingLogRedis } from './process/trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { DryrunSetting } from '../models/common/setting';
import { dao as workOrderDao } from '../dao/operation/workOrderDao';
import { ErrorClass, responseCode } from './resUtil';
import { useCallTypeUtil } from './callTypeUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { MarkerOccupancyParams } from './process/commonUtils';
export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  DATA_TYPE?: string;
  ALWAYS_CALL_COUNT?: number;
  TRIGGER_CALL_COUNT?: number;
  CREATE_TIME?: string;
  EQ_CODE?: string;
  TAGGROUP?: string;
  CHANNEL?: string;
  DEVICE?: string;
  Cargo_Type: string;
  // 2026_06_24 추가
  IS_VIRTUAL?: boolean;

  // NODE_ID: string;
}

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
}

export const useCallRegisterUtil = () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  const callRegister = async () => {
    try {
      const callRegisterList = await redisUtil.hgetAllObject<EqpCallStats>(RedisKeys.InfoCallRequestOnBySerial);
      if (!callRegisterList) return;

      const sortedCallRegisterList = callRegisterList.sort(
        (a, b) => new Date(a.CREATE_TIME ?? 0).getTime() - new Date(b.CREATE_TIME ?? 0).getTime()
      );
      for (let i = 0, length = sortedCallRegisterList.length; i < length; i++) {
        const targetTagInfo = sortedCallRegisterList[i];
        const targetCode = targetTagInfo.EQ_CODE;
        const eqpCallId = targetTagInfo.CALL_ID || '';
        if (!targetCode) continue; // 코드 없으면 처리 불가
        if (!eqpCallId) continue;
        // SP20 / SP40 가상 설비 정보
        if (targetTagInfo.IS_VIRTUAL === true) {
          const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
            RedisKeys.InfoFacilityBySerial,
            targetCode
          );
          const resolvedSerial = targetCode.endsWith('0') ? targetCode.slice(0, -1) + '1' : targetCode;
          const newCallType = await makeCallType(resolvedSerial);
          const newCargoType = newCallType;

          const markerOccupancyByVirtualFacilitySerialInfo = await redisUtil.hgetObject<MarkerOccupancyParams>(
            RedisKeys.MarkerOccupancyByVirtualFacilitySerial,
            targetCode
          );
          if (facilityInfo?.mode === 'manual' || markerOccupancyByVirtualFacilitySerialInfo?.status === 'occupied') {
            continue;
          }
          if (facilityInfo?.generatedCallCount) {
            const callInfo: EqpCallStats = {
              EQP_CALL_ID: targetTagInfo.CALL_ID.slice(-4), // 뒤의 4자리
              CALL_ID: eqpCallId, // 작업지시코드
              Call_Type: newCallType || 'SKID',
              Cargo_Type: newCargoType || '',
              Caller: targetCode, // 앞의 4자리
              Call_Quantity: 1,
              Call_Priority: '99',
              DATA_TYPE: targetTagInfo.DATA_TYPE,
              TRIGGER_CALL_COUNT: 0,
              ALWAYS_CALL_COUNT: -1,
            };
            if (facilityInfo?.isActiveCallTrigger === true) {
              if (facilityInfo?.isMissionOrderCapable && facilityInfo?.type === 'out') {
              } else {
                if (
                  facilityInfo?.linkedEqpIds &&
                  facilityInfo?.linkedEqpIds.length > 0 &&
                  facilityInfo.system === 'EQP'
                ) {
                } else {
                  if ((facilityInfo?.type).toUpperCase() === 'IN' && facilityInfo.system === 'WMS') {
                    // const createdCallId = await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister);
                    callInfo.CALL_ID = eqpCallId;
                    // await initTrackingLogRedis(callInfo);
                    const wmsCallInfoString = JSON.stringify(callInfo);

                    if (newCallType === '') {
                      continue;
                    }
                    await redisUtil.hset(RedisKeys.InfoInCallByCallId, eqpCallId, wmsCallInfoString);
                    // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                    await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);
                    // await useMultiCallRegisterUtil().hsetWithIncrementCount(
                    //   RedisKeys.InfoWorkOrderCountBySerial,
                    //   callInfo.Caller
                    // );

                    let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                      RedisKeys.RecentWorkOrderListByFacilitySerial,
                      targetCode
                    );

                    if (workOrderListInfo) {
                      for (let i = 0; i < workOrderListInfo.count; i++) {
                        if (workOrderListInfo.workOrderList[i].callId === eqpCallId) {
                          workOrderListInfo.workOrderList[i].state = 'beforeWorkOrder';
                        }
                      }

                      const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                        {
                          count: workOrderListInfo.count,

                          workOrderList: workOrderListInfo.workOrderList,

                          facilitySerial: targetCode,

                          facilityInfo: facilityInfo,
                        };

                      redisUtil.hset(
                        RedisKeys.RecentWorkOrderListByFacilitySerial,
                        targetCode,
                        JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
                      );
                    }
                  }
                }
              }
            }
          }
        } else {
          // remainCall doesn't need callRegister again
          // 250916 remove reamin
          // let nextCallInfo = false;
          // const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
          // if (remainCallList) {
          //   for (let i = 0; i < remainCallList.length; i++) {
          //     const remainCallInfo = remainCallList[i].callId
          //     const remainCallIdSub = remainCallInfo?.substring(0, 4)
          //     if (targetCode === remainCallIdSub) {
          //       nextCallInfo = true;
          //       break;
          //     }
          //   }
          // }
          // if (nextCallInfo === true) continue;

          // PLC offline 체크 - _System._Error 태그로 설비 에러 여부 확인
          const isError = await kepServerUtil.isDeviceError(targetCode);
          const plcConnType = process.env.PLC_CONN_TYPE || '';
          if (isError && plcConnType === 'KEP') continue;

          // 필요한 태그 값들 가져오기 (KEP: OPC read 1회, CONNECTOR: Redis 병렬)
          const statusByTag = await plcConnectUtil.batchGetTagValue(targetCode, [
            'Call_Count',
            'Call_Priority',
            'EQ_Auto',
            'Call_Request',
          ]);
          const callCountValue = statusByTag['Call_Count'] as number;
          const callPriorityValue = statusByTag['Call_Priority'] as boolean;
          const eqAutoValue = statusByTag['EQ_Auto'] as boolean;
          const callRequestValue = statusByTag['Call_Request'] as boolean;
          const callType = targetTagInfo.Call_Type;
          const newCallType = await makeCallType(targetCode);
          const newCargoType = newCallType;
          const cargoType = targetTagInfo.Cargo_Type;
          const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
            RedisKeys.InfoFacilityBySerial,
            targetCode
          );

          if (facilityInfo?.mode === 'manual' || !eqAutoValue || !callRequestValue) {
            continue;
          }

          // 유효성 검사 필요할 수도
          if (facilityInfo?.generatedCallCount) {
            const callInfo: EqpCallStats = {
              EQP_CALL_ID: String(callCountValue), // 뒤의 4자리
              CALL_ID: '', // 작업지시코드
              Call_Type: newCallType || 'SKID',
              Cargo_Type: newCargoType || '',
              Caller: targetCode, // 앞의 4자리
              Call_Quantity: 1,
              Call_Priority: callPriorityValue ? '99' : '1',
              DATA_TYPE: targetTagInfo.DATA_TYPE,
              TRIGGER_CALL_COUNT: callCountValue,
              ALWAYS_CALL_COUNT: -1,
            };

            // 작업 생성 트리거 판단
            if (facilityInfo?.isActiveCallTrigger === true) {
              if (facilityInfo?.isMissionOrderCapable && facilityInfo?.type === 'out') {
                // ======= 미션결정 작업지시 (설비기준 회수) =======
                // const eqpCallId = (await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister)) || '';
                callInfo.CALL_ID = eqpCallId;
                // await initTrackingLogRedis(callInfo);
                const infoPendingMissionWorkOrder: PendingWorkOrderAttributes = {
                  callId: String(eqpCallId),
                  fromFacilityName: callInfo.Caller,
                  toFacilityName: null,
                  type: 'MISSION',
                  isMissionOrder: true,
                  callPriority: callInfo.Call_Priority || '',
                  callType: newCallType || 'SKID',
                  cargoType: newCallType || '',
                  portName: null,
                  eqpName: callInfo.Caller,
                  triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                };
                // 작업지시 예정 레디스 저장
                redisUtil.hset(
                  RedisKeys.InfoPendingWorkOrderByCallId,
                  String(eqpCallId),
                  JSON.stringify(infoPendingMissionWorkOrder)
                );
                // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);
                // 현재 설비에 대한 작업지시 개수 증가
                // await useMultiCallRegisterUtil().hsetWithIncrementCount(
                //   RedisKeys.InfoWorkOrderCountBySerial,
                //   callInfo.Caller
                // );
                await plcConnectUtil.writeTagValue({
                  targetFacility: callInfo.Caller,
                  tagInfo: [
                    { tagName: 'Call_Response', value: true },
                    { tagName: 'Call_Response_Count', value: callCountValue.toString() },
                  ],
                });
                await useCallTypeUtil().callTypeResponse(callInfo.Caller);
                const trackingLogSubject = 'CALL_RESPONSE';
                const trackingLogDetail = 'CALL_RESPONSE';
                const trackingLogState = 'PROCESSING';
                const trackingLogUpdateMissionData: TrackingLogRedisUpdateParams = {
                  callId: infoPendingMissionWorkOrder?.callId,
                  subject: trackingLogSubject,
                  detail: trackingLogDetail,
                  state: trackingLogState,
                  startFacility: null,
                  transferId: null,
                  destFacility: null,
                  assignedRobot: null,
                  value: null,
                  description: `Call ID ${infoPendingMissionWorkOrder?.callId} responsed`,
                  processState: 'NORMAL',
                  // ACS에서 작업 할당 후 해당 정보 알 수 있음
                  missionDestination: null,
                  callType: infoPendingMissionWorkOrder.cargoType,
                };
                await editTrackingLogRedis(trackingLogUpdateMissionData, undefined, 'SUCCESS', callInfo.Caller);
              } else {
                // ======= to 작업지시 =======
                if (
                  facilityInfo?.linkedEqpIds &&
                  facilityInfo?.linkedEqpIds.length > 0 &&
                  facilityInfo.system === 'EQP'
                ) {
                  // 설비 - 설비로직
                  const linkedEqpList = await Promise.all(
                    facilityInfo.linkedEqpIds.map((id) =>
                      redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, id.toString())
                    )
                  );
                  // null 제거 + priority 정렬 (내림차순)
                  const sortedLinkedEqpList = linkedEqpList
                    .filter((x): x is FacilityAttributes => x != null)
                    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

                  for (let i = 0; i < sortedLinkedEqpList.length; i++) {
                    const linkedEqpId = sortedLinkedEqpList[i].id;
                    const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                      RedisKeys.InfoFacilityById,
                      linkedEqpId.toString() || ''
                    );

                    if (!linkedFacilityInfo?.serial || linkedFacilityInfo?.mode === 'manual') {
                      continue;
                    }
                    // PLC offline 체크 - _System._Error 태그로 설비 에러 여부 확인
                    const isError = await kepServerUtil.isDeviceError(linkedFacilityInfo.serial);
                    const plcConnType = process.env.PLC_CONN_TYPE || '';
                    if (isError && plcConnType === 'KEPWARE') continue;

                    const linkedSerial = linkedFacilityInfo.serial;
                    const linkedStatusByTag = await plcConnectUtil.batchGetTagValue(linkedSerial, [
                      'Call_Request',
                      'Call_Response',
                      'EQ_Auto',
                      'Call_Count',
                    ]);
                    const linkedFacilityCallRequestValue = linkedStatusByTag['Call_Request'] as boolean;
                    const linkedFacilityCallResponseValue = linkedStatusByTag['Call_Response'] as boolean;
                    const linkedFacilityEQAutoValue = linkedStatusByTag['EQ_Auto'] as boolean;
                    const linkedFacilityCallCountValue = linkedStatusByTag['Call_Count'] as number;
                    const linkedFacilityCallTypeValue = await makeCallType(linkedFacilityInfo?.serial?.toString());
                    if (!linkedFacilityEQAutoValue) continue;

                    // 반대쪽에 콜 요청 떠 있고 콜 응답 내려가 있는 경우 작업 생성
                    if (
                      linkedFacilityInfo &&
                      linkedFacilityCallRequestValue === true &&
                      // todo: 20250908 for dryrun test (SC <-> CS/CR)
                      linkedFacilityCallResponseValue === false &&
                      // 콜타입 동일 체크 필요
                      // 20260319 콜타입매칭 여부 컬럼 추가로 수정
                      // facilityInfo의 isCheckCallType 컬럼이 true 인 경우 콜타입 매칭 체크 필요, false인 경우 콜타입 매칭 체크 필요 없음
                      // facilityInfo.isCheckCallType이 TRUE면 linkedFacilityCallTypeValue === callType도 TRUE여야함
                      // facilityInfo.isCheckCallType이 FALSE면 linkedFacilityCallTypeValue === callType는 TRUE이든 FALSE이든 상관없음
                      ((facilityInfo.isCheckCallType === true && linkedFacilityCallTypeValue === newCallType) ||
                        facilityInfo.isCheckCallType === false)
                    ) {
                      // const eqpCallId =
                      //   (await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister)) || '';
                      callInfo.CALL_ID = eqpCallId;
                      // await initTrackingLogRedis(callInfo);
                      const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                        callId: String(eqpCallId),
                        eqpName: callInfo.Caller,
                        portName: linkedFacilityInfo?.serial,
                        type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                        isMissionOrder: false,
                        callPriority: callInfo.Call_Priority,
                        callType: newCallType || 'SKID',
                        cargoType: newCargoType || '',
                        fromFacilityName:
                          (facilityInfo?.type === 'in' ? linkedFacilityInfo?.serial : callInfo.Caller) || '',
                        toFacilityName: facilityInfo?.type === 'in' ? callInfo.Caller : linkedFacilityInfo?.serial,
                        alwaysCallCount: Number(linkedFacilityCallCountValue),
                        triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                      };
                      // 작업지시 예정 레디스 저장
                      redisUtil.hset(
                        RedisKeys.InfoPendingWorkOrderByCallId,
                        String(eqpCallId),
                        JSON.stringify(infoPendingWorkOrder)
                      );
                      // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                      await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);
                      // 작업지시 개수 증가
                      // await useMultiCallRegisterUtil().hsetWithIncrementCount(
                      //   RedisKeys.InfoWorkOrderCountBySerial,
                      //   targetCode
                      // );
                      // 콜 응답 관련 데이터 쓰기
                      await plcConnectUtil.writeTagValue({
                        targetFacility: facilityInfo.serial || '',
                        tagInfo: [
                          { tagName: 'Call_Response', value: true },
                          { tagName: 'Call_Response_Count', value: String(infoPendingWorkOrder.triggerCallCount) },
                        ],
                      });
                      await useCallTypeUtil().callTypeResponse(facilityInfo.serial || '');

                      const trackingLogSubject = 'CALL_RESPONSE';
                      const trackingLogDetail = 'CALL_RESPONSE';
                      const trackingLogState = 'PROCESSING';
                      const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
                        callId: String(eqpCallId),
                        subject: trackingLogSubject,
                        detail: trackingLogDetail,
                        state: trackingLogState,
                        startFacility: callInfo.Caller,
                        transferId: null,
                        destFacility: linkedFacilityInfo?.serial,
                        assignedRobot: null,
                        value: null,
                        description: `Call ID ${String(eqpCallId)} responsed`,
                        callType: callInfo.Cargo_Type,
                      };
                      await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', callInfo.Caller);

                      // 콜 응답 관련 데이터 쓰기
                      await plcConnectUtil.writeTagValue({
                        targetFacility: linkedFacilityInfo.serial || '',
                        tagInfo: [
                          { tagName: 'Call_Response', value: true },
                          { tagName: 'Call_Response_Count', value: String(infoPendingWorkOrder.alwaysCallCount) },
                        ],
                      });
                      await useCallTypeUtil().callTypeResponse(linkedFacilityInfo.serial || '');

                      const trackingLogUpdateResData: TrackingLogRedisUpdateParams = {
                        callId: String(eqpCallId),
                        subject: trackingLogSubject,
                        detail: trackingLogDetail,
                        state: trackingLogState,
                        startFacility: linkedFacilityInfo?.serial,
                        transferId: null,
                        destFacility: callInfo.Caller,
                        assignedRobot: null,
                        value: null,
                        description: `Call ID ${String(eqpCallId)} responsed`,
                        callType: callInfo.Cargo_Type,
                      };
                      await editTrackingLogRedis(
                        trackingLogUpdateResData,
                        undefined,
                        'SUCCESS',
                        linkedFacilityInfo?.serial?.toString()
                      );
                      console.log(`Call request sent to EQP from EQP. TYPE: ${newCallType}, CallID: ${callCountValue}`);
                      break;
                    }
                    /////////// 250916 remove remain
                    // else if (
                    //   ((linkedFacilityInfo && linkedFacilityCallRequestValue === false) ||
                    //     (linkedFacilityInfo &&
                    //       linkedFacilityCallRequestValue === true))
                    //   // todo: 20250908 for dryrun test (SC <-> CS/CR)
                    //   /*
                    //   ((linkedFacilityInfo && linkedFacilityCallRequestValue === false) ||
                    //     (linkedFacilityInfo &&
                    //       linkedFacilityCallRequestValue === true &&
                    //       linkedFacilityCallResponseValue === true)) &&
                    //       linkedFacilityCallTypeValue === callType
                    //   */
                    // ) {
                    //   // 반대쪽에 콜이 떠 있지 않은 경우와
                    //   // 반대쪽에 작업중인 경우 (Call_Request, Call_Response 켜져 있는 경우)
                    //   // 반복해서 판단하는 redis에 저장
                    //   const eqpCallId =
                    //     (await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister)) || '';
                    //   callInfo.CALL_ID = eqpCallId;
                    //   await initTrackingLogRedis(callInfo);
                    //   const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                    //     callId: String(eqpCallId),
                    //     eqpName: callInfo.Caller,
                    //     portName: linkedFacilityInfo?.serial,
                    //     type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                    //     isMissionOrder: false,
                    //     callPriority: callInfo.Call_Priority,
                    //     callType: callInfo.Call_Type || 'SKID',
                    //     fromFacilityName:
                    //       (facilityInfo?.type === 'in' ? linkedFacilityInfo?.serial : callInfo.Caller) || '',
                    //     toFacilityName: facilityInfo?.type === 'in' ? callInfo.Caller : linkedFacilityInfo?.serial,
                    //     alwaysCallCount: Number(linkedFacilityCallCountValue),
                    //     triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                    //   };
                    //   redisUtil.hset(
                    //     RedisKeys.InfoRemainCallById,
                    //     String(eqpCallId),
                    //     JSON.stringify({
                    //       ...infoPendingWorkOrder,
                    //       // fromFacilityName: facilityInfo.serial,
                    //       // toFacilityName: linkedFacilityInfo.serial,
                    //     })
                    //   );
                    //   // 반대 콜에 대한 판단을 지속적으로 하기 때문에 더이상 callRegister 판단 필요 없음
                    //   await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetTagInfo.EQ_CODE);
                    // }
                    /////////// 250916
                  }
                  // } else if (facilityInfo?.linkedEqpIds && facilityInfo?.linkedEqpIds.length > 1) {
                } else if (
                  facilityInfo?.linkedEqpIds &&
                  facilityInfo?.linkedEqpIds.length > 0 &&
                  facilityInfo.system === 'PRI'
                ) {
                  // 주성 - 위성 로직
                  const linkedEqpList = await Promise.all(
                    facilityInfo.linkedEqpIds.map((id) =>
                      redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityById, id.toString())
                    )
                  );
                  // null 제거 + priority 정렬 (내림차순)
                  const sortedLinkedEqpList = linkedEqpList
                    .filter((x): x is FacilityAttributes => x != null)
                    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

                  for (const sortedLinkedEqpInfo of sortedLinkedEqpList) {
                    const linkedEqpId = sortedLinkedEqpInfo.id;
                    const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
                      RedisKeys.InfoFacilityById,
                      linkedEqpId.toString() || ''
                    );

                    // 설비 정보 여부 확인
                    if (!linkedFacilityInfo) {
                      continue;
                    }
                    if (!linkedFacilityInfo.serial) {
                      continue;
                    }
                    // 가상 설비 여부 확인
                    // 가상 설비가 아니라면 continue
                    if (!linkedFacilityInfo.isVirtual) {
                      continue;
                    }

                    const linkedSerial = linkedFacilityInfo.serial;

                    const markerOccupancyInfo = await redisUtil.hgetObject<MarkerOccupancyParams>(
                      RedisKeys.MarkerOccupancyByVirtualFacilitySerial,
                      linkedSerial
                    );
                    if (!markerOccupancyInfo) {
                      continue;
                    }
                    // 도킹 중인 AMR이 있는 경우
                    if (markerOccupancyInfo.status === 'occupied') {
                      // 도킹 중인 AMR에 작업지시 할당 필요
                      callInfo.CALL_ID = eqpCallId;
                      const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                        callId: String(eqpCallId),
                        eqpName: callInfo.Caller,
                        portName: linkedFacilityInfo?.serial,
                        type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                        isMissionOrder: false,
                        callPriority: callInfo.Call_Priority,
                        callType: newCallType || 'SKID',
                        cargoType: newCargoType || '',
                        fromFacilityName:
                          (facilityInfo?.type === 'in' ? linkedFacilityInfo?.serial : callInfo.Caller) || '',
                        toFacilityName: facilityInfo?.type === 'in' ? callInfo.Caller : linkedFacilityInfo?.serial,
                        alwaysCallCount: 0,
                        triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                        isPrimaryOrder: true,
                        isCancelOrder: false,
                        targetAmrCode: markerOccupancyInfo.workerId,
                      };
                      // 작업지시 예정 레디스 저장
                      redisUtil.hset(
                        RedisKeys.InfoPendingWorkOrderByCallId,
                        String(eqpCallId),
                        JSON.stringify(infoPendingWorkOrder)
                      );
                      // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                      await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);

                      // 콜 응답 쓰기
                      await plcConnectUtil.writeTagValue({
                        targetFacility: facilityInfo.serial || '',
                        tagInfo: [
                          { tagName: 'Call_Response', value: true },
                          { tagName: 'Call_Response_Count', value: String(infoPendingWorkOrder.triggerCallCount) },
                        ],
                      });
                      await useCallTypeUtil().callTypeResponse(facilityInfo.serial || '');

                      const trackingLogSubject = 'CALL_RESPONSE';
                      const trackingLogDetail = 'CALL_RESPONSE';
                      const trackingLogState = 'PROCESSING';
                      const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
                        callId: String(eqpCallId),
                        subject: trackingLogSubject,
                        detail: trackingLogDetail,
                        state: trackingLogState,
                        startFacility: callInfo.Caller,
                        transferId: null,
                        destFacility: linkedFacilityInfo?.serial,
                        assignedRobot: null,
                        value: null,
                        description: `Call ID ${String(eqpCallId)} responsed`,
                        callType: callInfo.Cargo_Type,
                      };
                      await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', callInfo.Caller);
                    }
                    // 도킹 중인 AMR이 없는 경우
                    // markerOccupancyInfo.status === 'empty'
                    else {
                      const linkedFacilityRecentWorkOrderInfo =
                        await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                          RedisKeys.RecentWorkOrderListByFacilitySerial,
                          linkedSerial
                        );

                      // console.log('linkedFacilityRecentWorkOrderInfo', linkedFacilityRecentWorkOrderInfo);

                      if (linkedFacilityRecentWorkOrderInfo) {
                        const toWorkOrderInfo = linkedFacilityRecentWorkOrderInfo.workOrderList.find(
                          (workOrder) => workOrder.state === 'toWorkOrder'
                        );
                        if (toWorkOrderInfo) {
                          // 도킹 중인 AMR에 작업지시 할당 필요
                          callInfo.CALL_ID = eqpCallId;
                          const taskAmrCode = toWorkOrderInfo.amrCode || '';
                          const infoPendingWorkOrder: PendingWorkOrderAttributes = {
                            callId: String(eqpCallId),
                            eqpName: callInfo.Caller,
                            portName: linkedFacilityInfo?.serial,
                            type: facilityInfo?.type === 'in' ? 'IN' : 'OUT',
                            isMissionOrder: false,
                            callPriority: callInfo.Call_Priority,
                            callType: newCallType || 'SKID',
                            cargoType: newCargoType || '',
                            fromFacilityName:
                              (facilityInfo?.type === 'in' ? linkedFacilityInfo?.serial : callInfo.Caller) || '',
                            toFacilityName: facilityInfo?.type === 'in' ? callInfo.Caller : linkedFacilityInfo?.serial,
                            alwaysCallCount: 0,
                            triggerCallCount: callInfo.TRIGGER_CALL_COUNT,
                            isPrimaryOrder: true,
                            isCancelOrder: true,
                            targetAmrCode: taskAmrCode,
                          };
                          // 작업지시 예정 레디스 저장
                          redisUtil.hset(
                            RedisKeys.InfoPendingWorkOrderByCallId,
                            String(eqpCallId),
                            JSON.stringify(infoPendingWorkOrder)
                          );
                          // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                          await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);

                          // 콜 응답 쓰기
                          await plcConnectUtil.writeTagValue({
                            targetFacility: facilityInfo.serial || '',
                            tagInfo: [
                              { tagName: 'Call_Response', value: true },
                              { tagName: 'Call_Response_Count', value: String(infoPendingWorkOrder.triggerCallCount) },
                            ],
                          });
                          await useCallTypeUtil().callTypeResponse(facilityInfo.serial || '');

                          const trackingLogSubject = 'CALL_RESPONSE';
                          const trackingLogDetail = 'CALL_RESPONSE';
                          const trackingLogState = 'PROCESSING';
                          const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
                            callId: String(eqpCallId),
                            subject: trackingLogSubject,
                            detail: trackingLogDetail,
                            state: trackingLogState,
                            startFacility: callInfo.Caller,
                            transferId: null,
                            destFacility: linkedFacilityInfo?.serial,
                            assignedRobot: null,
                            value: null,
                            description: `Call ID ${String(eqpCallId)} responsed`,
                            callType: callInfo.Cargo_Type,
                          };
                          await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', callInfo.Caller);
                        }
                        // to로 가기전 ( from 작업 / 창고 응답 전) 상태는 대기한다. - continue
                        else {
                          continue;
                        }
                      } else {
                        continue;
                      }
                    }
                  }
                } else {
                  // 설비 - 창고 로직
                  // 설비 테이블에 어떤 창고와 통신을 해야한다는 창고를 등록하고
                  // SP11, SP21, SP31, SP41 만 facility.system === 'WMS' 로 설정해도 되지만, 편의상 WMS와 상호작용 하는 설비들은 WMS를 붙임 ( 창고 쪽 설비 )
                  if ((facilityInfo?.type).toUpperCase() === 'IN' && facilityInfo.system === 'WMS') {
                    // const createdCallId = await createWorkOrderCode(targetKey, facilityInfo, targetTagInfo.reRegister);
                    callInfo.CALL_ID = eqpCallId;
                    // await initTrackingLogRedis(callInfo);
                    const wmsCallInfoString = JSON.stringify(callInfo);

                    if (newCallType === '') {
                      continue;
                    }
                    await redisUtil.hset(RedisKeys.InfoInCallByCallId, eqpCallId, wmsCallInfoString);
                    // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                    await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetCode);
                    // await useMultiCallRegisterUtil().hsetWithIncrementCount(
                    //   RedisKeys.InfoWorkOrderCountBySerial,
                    //   callInfo.Caller
                    // );

                    let workOrderListInfo = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
                      RedisKeys.RecentWorkOrderListByFacilitySerial,
                      targetCode
                    );

                    if (workOrderListInfo) {
                      for (let i = 0; i < workOrderListInfo.count; i++) {
                        if (workOrderListInfo.workOrderList[i].callId === eqpCallId) {
                          workOrderListInfo.workOrderList[i].state = 'beforeWorkOrder';
                        }
                      }

                      const newRecentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes =
                        {
                          count: workOrderListInfo.count,

                          workOrderList: workOrderListInfo.workOrderList,

                          facilitySerial: targetCode,

                          facilityInfo: facilityInfo,
                        };

                      redisUtil.hset(
                        RedisKeys.RecentWorkOrderListByFacilitySerial,
                        targetCode,
                        JSON.stringify(newRecentWorkOrderListByFacilitySerialParams)
                      );
                    }
                  }
                  // else if ((facilityInfo?.type).toUpperCase() === 'OUT' && facilityInfo.system === 'WMS') {
                  //   await redisUtil.hset(RedisKeys.InfoOutCallByCallId, String(createdCallId), callInfoString);
                  //   // Call_Request ON으로 인해 작업생성까지 완료했기때문에 더이상 판단 필요 없음
                  //   await redisUtil.hdel(RedisKeys.InfoCallRequestOnBySerial, targetTagInfo.EQ_CODE);
                  //   await useMultiCallRegisterUtil().hsetWithIncrementCount(
                  //     RedisKeys.InfoWorkOrderCountBySerial,
                  //     callInfo.Caller
                  //   );
                  // }
                }
                // else {
                //   // todo: 도착지와 통신 없이 바로 작업 생성
                // }
              }
            } else if (facilityInfo?.isActiveCallTrigger === false) {
              // todo: 창고 to 창고 작업지시
              // console.log(
              //   `Call request sent to WCS. serial: ${facilityInfo.serial} TYPE: ${callType}, CallID: ${callCountValue}`
              // );
            }
            // }
          }
        }
      }
    } catch (error) {
      throw error;
    }
  };
  const createFacilityModeWorkOrder = async () => {
    try {
      const manualList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoFacilityModeBySerial);
      if (!manualList) return;

      for (const facility of manualList) {
        const eqCode = facility.EQ_CODE;
        if (!eqCode) continue;

        const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, eqCode);

        const callRequestValue = (await plcConnectUtil.getTagValue(eqCode, 'Call_Request')) as boolean;

        if (callRequestValue === false) {
          await redisUtil.hdel(RedisKeys.InfoFacilityModeBySerial, eqCode);
        }

        if (facilityInfo?.mode === 'auto' && callRequestValue === true) {
          // await callRegister(facility);
          await redisUtil.hdel(RedisKeys.InfoFacilityModeBySerial, eqCode);
        }
      }
    } catch (error) {
      console.error('[callRegisterUtil.createFacilityModeWorkOrder] error :', error);
      throw error;
    }
  };
  const createWorkOrderCode = async (
    targetCode: string,
    facilityInfo: FacilityAttributesDeep,
    reRegister: string,
    isVirtual?: boolean
  ): Promise<string | null> => {
    try {
      let facilityYearMonthDayValue: string;

      if (isVirtual) {
        const now = new Date();
        const year = now.getFullYear().toString();
        const monthDay = (now.getMonth() + 1) * 100 + now.getDate();
        const monthDayStr = formatToDateCode(monthDay);
        facilityYearMonthDayValue = targetCode + year + monthDayStr;
      } else {
        const timeByTag = await plcConnectUtil.batchGetTagValue(targetCode, ['Call_Time_Year', 'Call_Time_MonthDay']);
        const callTimeYearValue = timeByTag['Call_Time_Year'] as string;
        const callTimeMonthDayValue = timeByTag['Call_Time_MonthDay'] as string;
        const callTimeMonthDayStr = formatToDateCode(Number(callTimeMonthDayValue)).toString();
        facilityYearMonthDayValue = targetCode + callTimeYearValue + callTimeMonthDayStr;
      }

      const callCountValueStr = await makeCallCount(facilityInfo);

      const result = facilityYearMonthDayValue + callCountValueStr;

      // if (reRegister === '_R') {
      //   // ACS로부터 취소돼서 MCS가 자동으로 만드는 작업
      //   // 작업지시 코드로 조회해서 있으면 숫자만큼 뒤에 붙이기
      //   const lastWorkOrder = await workOrderDao.selectListCount({ code: result });
      //   if (!lastWorkOrder) {
      //     const errorMessage = `code: ${result} 작업지시를 찾을 수 없습니다.`;
      //     logging.ACTION_ERROR({
      //       filename: 'callRegisterUtil.ts.createEQPCallId',
      //       error: errorMessage,
      //       params: null,
      //       result: false,
      //     });
      //     const err = new ErrorClass(responseCode.BAD_REQUEST_NODATA, errorMessage);
      //     return new Promise((resolve, reject) => {
      //       reject(err);
      //     });
      //   }
      //   const workOrderCodeIndex = lastWorkOrder.count;
      //   result = `${result}_R${workOrderCodeIndex}`;
      // }
      // const result = [];
      // for (let i = 0; i < multiValue; i++) {
      //   const callId = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr + ((i >= 1) ? "_" + i.toString() : "");
      //   result.push(callId);
      // }
      // const result = targetCode + callTimeYearValue + callTimeMonthDayStr + callCountValueStr;
      return result;
    } catch (error) {
      console.error('Error creating EQP Call ID:', error);
      return null;
    }
  };
  const checkRemainEqpCall = async () => {
    // 250916 remove remain
    // const remainCallList = await redisUtil.hgetAllObject<PendingWorkOrderAttributes>(RedisKeys.InfoRemainCallById);
    // if (remainCallList) {
    //   for (const remainCall of remainCallList) {
    //     // eqpName => 콜 주체 설비
    //     // portName => 항상 켜있는 설비
    //     const alwaysCallCountFacilityName = remainCall?.portName;
    //     const triggerCallCountFacilityName = remainCall?.eqpName;
    //     if (alwaysCallCountFacilityName && triggerCallCountFacilityName) {
    //       const alwaysCallCountTargetKey = kepServerUtil.getTargetKey(alwaysCallCountFacilityName || '');
    //       const triggerCallCountTargetKey = kepServerUtil.getTargetKey(triggerCallCountFacilityName || '');
    //       await kepServerUtil.updateTagMapValues(alwaysCallCountTargetKey, alwaysCallCountFacilityName || '', [
    //         'Call_Request',
    //         'Call_Response',
    //         'Call_Count',
    //       ]);
    //       await kepServerUtil.updateTagMapValues(triggerCallCountTargetKey, triggerCallCountFacilityName || '', [
    //         'Call_Request',
    //         'Call_Response',
    //         'Call_Count',
    //       ]);
    //       const alwaysCallRequestValue = opcuaUtil.tagMap.get(`${alwaysCallCountFacilityName}.Call_Request`)?.value;
    //       const alwaysCallResponseValue = opcuaUtil.tagMap.get(`${alwaysCallCountFacilityName}.Call_Response`)?.value;
    //       const alwaysCallCountValue = opcuaUtil.tagMap.get(`${alwaysCallCountFacilityName}.Call_Count`)?.value;
    //       const alwaysCallTypeValue = await makeCallType(alwaysCallCountFacilityName);
    //       const triggerCallRequestValue = opcuaUtil.tagMap.get(`${triggerCallCountFacilityName}.Call_Request`)?.value;
    //       const triggerCallResponseValue = opcuaUtil.tagMap.get(`${triggerCallCountFacilityName}.Call_Response`)?.value;
    //       const triggerCallCountValue = opcuaUtil.tagMap.get(`${triggerCallCountFacilityName}.Call_Count`)?.value;
    //       const triggerCallTypeValue = await makeCallType(triggerCallCountFacilityName);
    //       const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
    //         RedisKeys.InfoTrackingLogByCallId,
    //         remainCall.callId || ''
    //       );
    //       // todo: 20250908 for dryrun test (SC <-> CS/CR)
    //       // 양 쪽 설비 Call_Type 동일 && 양 쪽 설비 Call_Request ON && 양 쪽 설비 Call_Response OFF
    //       if (
    //         alwaysCallCountFacilityName &&
    //         triggerCallCountFacilityName &&
    //         // alwaysCallTypeValue === triggerCallTypeValue &&
    //         alwaysCallRequestValue === true &&
    //         // alwaysCallResponseValue === false &&
    //         triggerCallRequestValue === true
    //         //triggerCallResponseValue === false
    //       ) {
    //         // 콜 응답 관련 데이터 쓰기
    //         await plcConnectUtil.writeTagValue({
    //           targetFacility: alwaysCallCountFacilityName,
    //           tagInfo: [
    //             { tagName: 'Call_Response', value: true },
    //             { tagName: 'Call_Response_Count', value: String(alwaysCallCountValue) },
    //           ],
    //         });
    //         const trackingLogSubject = 'CALL_RESPONSE';
    //         const trackingLogDetail = 'CALL_RESPONSE';
    //         const trackingLogState = 'PROCESSING';
    //         const trackingLogUpdateReqData: TrackingLogRedisUpdateParams = {
    //           callId: infoTrackingLogByCallId?.callId,
    //           subject: trackingLogSubject,
    //           detail: trackingLogDetail,
    //           state: trackingLogState,
    //           startFacility: null,
    //           transferId: null,
    //           destFacility: infoTrackingLogByCallId?.destFacility,
    //           assignedRobot: null,
    //           value: infoTrackingLogByCallId?.destFacility,
    //           description: `Call ID ${infoTrackingLogByCallId?.callId} responsed`,
    //         };
    //         await editTrackingLogRedis(trackingLogUpdateReqData, undefined, 'SUCCESS', remainCall.fromFacilityName);
    //         // 콜 응답 관련 데이터 쓰기
    //         await plcConnectUtil.writeTagValue({
    //           targetFacility: triggerCallCountFacilityName,
    //           tagInfo: [
    //             { tagName: 'Call_Response', value: true },
    //             { tagName: 'Call_Response_Count', value: String(triggerCallCountValue) },
    //           ],
    //         });
    //         const trackingLogUpdateResData: TrackingLogRedisUpdateParams = {
    //           callId: infoTrackingLogByCallId?.callId,
    //           subject: trackingLogSubject,
    //           detail: trackingLogDetail,
    //           state: trackingLogState,
    //           startFacility: null,
    //           transferId: null,
    //           destFacility: infoTrackingLogByCallId?.destFacility,
    //           assignedRobot: null,
    //           value: infoTrackingLogByCallId?.destFacility,
    //           description: `Call ID ${infoTrackingLogByCallId?.callId} responsed`,
    //         };
    //         await editTrackingLogRedis(
    //           trackingLogUpdateResData,
    //           undefined,
    //           'SUCCESS',
    //           remainCall.toFacilityName?.toString()
    //         );
    //         const infoPendingWorkOrder: PendingWorkOrderAttributes = {
    //           callId: remainCall.callId,
    //           eqpName: remainCall.eqpName,
    //           portName: remainCall.portName,
    //           type: remainCall?.type.toUpperCase() === 'IN' ? 'IN' : 'OUT',
    //           isMissionOrder: false,
    //           callPriority: remainCall.callPriority,
    //           callType: remainCall.callType || 'SKID',
    //           fromFacilityName:
    //             remainCall?.type.toUpperCase() === 'IN' ? remainCall.toFacilityName! : remainCall.fromFacilityName,
    //           toFacilityName:
    //             remainCall?.type.toUpperCase() === 'IN' ? remainCall.fromFacilityName : remainCall.toFacilityName,
    //           alwaysCallCount: remainCall.alwaysCallCount,
    //           triggerCallCount: remainCall.triggerCallCount,
    //         };
    //         // 작업지시 예정 레디스 저장
    //         redisUtil.hset(
    //           RedisKeys.InfoPendingWorkOrderByCallId,
    //           remainCall.callId || '',
    //           JSON.stringify(infoPendingWorkOrder)
    //         );
    //         // 작업지시 개수 증가
    //         await useMultiCallRegisterUtil().hsetWithIncrementCount(
    //           RedisKeys.InfoWorkOrderCountBySerial,
    //           triggerCallCountFacilityName
    //         );
    //         redisUtil.hdel(RedisKeys.InfoRemainCallById, remainCall.callId || '');
    //       }
    //     }
    //   }
    // }
  };
  return { callRegister, createFacilityModeWorkOrder, checkRemainEqpCall, createWorkOrderCode };
};
