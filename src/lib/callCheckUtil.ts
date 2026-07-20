import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import {
  RecentCallCountByFacilitySerialAttributes,
  RecentWorkOrderInfoByFacilitySerialAttributes,
  RecentWorkOrderListByFacilitySerialAttributes,
} from '../models/operation/workOrder';
import { EqpCallStats, useCallRegisterUtil } from './callRegisterUtil';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { initTrackingLogRedis } from './process/trackingLog';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { timestampToDate } from './usefullToolUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { logging } from './logging';
import { MarkerOccupancyParams } from './process/commonUtils';

const redisUtil = useRedisUtil();
const plcConnectUtil = usePlcConnectUtil();
const kepServerUtil = useKepServerUtil();

const calcWorkOrderCount = (
  facilityType: string,
  recentWorkOrderList: RecentWorkOrderListByFacilitySerialAttributes | null | undefined
): number => {
  if (facilityType === 'in') {
    return recentWorkOrderList?.count || 0;
  } else if (facilityType === 'out') {
    return (recentWorkOrderList?.workOrderList || []).filter(
      (workOrder) =>
        workOrder?.state === 'beforeRequest' ||
        workOrder?.state === 'beforeWorkOrder' ||
        workOrder?.state === 'workOrder' ||
        workOrder?.state === 'fromWorkOrder'
    ).length;
  }
  return 0;
};

const upsertRecentWorkOrderList = async (
  facilitySerial: string,
  facilityInfo: FacilityAttributesDeep,
  workOrderInfo: RecentWorkOrderInfoByFacilitySerialAttributes
): Promise<void> => {
  const existing = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
    RedisKeys.RecentWorkOrderListByFacilitySerial,
    facilitySerial
  );

  const params: RecentWorkOrderListByFacilitySerialAttributes = existing
    ? {
        facilitySerial,
        facilityInfo,
        count: existing.count + 1,
        workOrderList: [...existing.workOrderList, workOrderInfo],
      }
    : {
        facilitySerial,
        facilityInfo,
        count: 1,
        workOrderList: [workOrderInfo],
      };

  redisUtil.hset(RedisKeys.RecentWorkOrderListByFacilitySerial, facilitySerial, JSON.stringify(params));
};

// Call Request를 보낼 지, 말 지 판단하는 함수
export const checkCallRequestCreate = async () => {
  const recentCallRequestByFacilitySerialList =
    (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
      RedisKeys.RecentCallRequestByFacilitySerial
    )) || [];

  for (let i = 0, length = recentCallRequestByFacilitySerialList.length; i < length; i++) {
    const recentCallRequestByFacilitySerialInfo = recentCallRequestByFacilitySerialList[i];
    const facilitySerial = recentCallRequestByFacilitySerialInfo.facilitySerial;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) continue;

    // 가상 설비는 PLC 태그 없으므로 스킵
    if (facilityInfo.isVirtual) continue;

    const isError = await kepServerUtil.isDeviceError(facilitySerial);
    const plcConnType = process.env.PLC_CONN_TYPE || '';
    if (isError && plcConnType === 'KEP') continue;

    const callCancelRequestValue = (await plcConnectUtil.getTagValue(facilitySerial, 'Call_Cancel_Request')) as boolean;
    if (callCancelRequestValue) {
      logging.ACTION_ERROR({
        filename: `callCheckUtil.ts - checkCallRequestCreate`,
        error: `${facilitySerial} Call_Cancel_Request 태그가 켜져있어서 콜 생성을 중단합니다.`,
        params: null,
        result: true,
      });
      continue;
    }

    const recentCallRequestMulti1ByFacilitySerial =
      await redisUtil.hgetObject<RecentCallCountByFacilitySerialAttributes>(
        RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
        facilitySerial
      );
    const recentCallRequestMulti2ByFacilitySerial =
      await redisUtil.hgetObject<RecentCallCountByFacilitySerialAttributes>(
        RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
        facilitySerial
      );

    const callRequest = recentCallRequestByFacilitySerialInfo.callRequest;
    const callRequestMulti1 = recentCallRequestMulti1ByFacilitySerial?.callRequestMulti1 || false;
    const callRequestMulti2 = recentCallRequestMulti2ByFacilitySerial?.callRequestMulti2 || false;

    const recentWorkOrderListByFacilitySerial =
      await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

    const workOrderCount = calcWorkOrderCount(facilityInfo.type, recentWorkOrderListByFacilitySerial);

    let maxWorkOrderCount = 0;
    if (callRequest === true) maxWorkOrderCount++;
    if (callRequestMulti1 === true) maxWorkOrderCount++;
    if (callRequestMulti2 === true) maxWorkOrderCount++;

    const reqWorkOrderCount = maxWorkOrderCount - workOrderCount;

    if (reqWorkOrderCount > 0) {
      for (let z = 0; z < reqWorkOrderCount; z++) {
        const facilityInfoDeep = await redisUtil.hgetObject<FacilityAttributesDeep>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );
        if (!facilityInfoDeep?.isActiveCallTrigger) continue;

        const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(facilitySerial, facilityInfoDeep, '');
        if (!eqpCallId) continue;

        await upsertRecentWorkOrderList(facilitySerial, facilityInfoDeep, {
          callId: eqpCallId,
          state: 'beforeRequest',
        });
      }
    }
  }

  // 가상 설비 쪽 데이터
  const markerOccupancyByVirtualFacilitySerialList =
    (await redisUtil.hgetAllObject<MarkerOccupancyParams>(RedisKeys.MarkerOccupancyByVirtualFacilitySerial)) || [];

  for (let i = 0, length = markerOccupancyByVirtualFacilitySerialList.length; i < length; i++) {
    const markerOccupancyByVirtualFacilitySerialInfo = markerOccupancyByVirtualFacilitySerialList[i];
    const facilitySerial = markerOccupancyByVirtualFacilitySerialInfo.facilitySerial;
    const markerStatus = markerOccupancyByVirtualFacilitySerialInfo.status;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
      RedisKeys.InfoFacilityBySerial,
      facilitySerial
    );
    if (!facilityInfo || !facilityInfo.isVirtual) continue;

    const recentWorkOrderListByFacilitySerial =
      await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

    const workOrderCount = calcWorkOrderCount(facilityInfo.type, recentWorkOrderListByFacilitySerial);
    const maxWorkOrderCount = markerStatus === 'empty' ? 1 : 0;
    const reqWorkOrderCount = maxWorkOrderCount - workOrderCount;

    if (reqWorkOrderCount > 0 && facilityInfo.isActiveCallTrigger) {
      const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(
        facilitySerial,
        facilityInfo,
        '',
        facilityInfo.isVirtual
      );
      if (!eqpCallId) continue;

      await upsertRecentWorkOrderList(facilitySerial, facilityInfo, {
        callId: eqpCallId,
        state: 'beforeRequest',
      });
    }
  }
};

// Call Request 로 실제 사용하는 함수
const processWorkOrderToCall = async (
  facilitySerial: string,
  filterRecentWorkOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[],
  recentWorkOrderListByFacilitySerial: RecentWorkOrderListByFacilitySerialAttributes | null | undefined,
  targetTagInfo?: { TAGGROUP: string; CHANNEL: string; DEVICE: string; DATA_TYPE: string }
) => {
  for (let i = 0; i < filterRecentWorkOrderList.length; i++) {
    const timezoneValue = process.env.TIME_ZONE || '';
    const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
      RedisKeys.InfoFacilityBySerial,
      facilitySerial
    );
    const eqpCallId = filterRecentWorkOrderList[i].callId;

    const callRegisterInfoBySerial = await redisUtil.hgetObject<TagValue>(
      RedisKeys.InfoCallRequestOnBySerial,
      facilitySerial
    );
    if (callRegisterInfoBySerial) break;

    const callRegisterList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
    const findExistCall = callRegisterList?.find((call) => call.DEVICE === facilitySerial);
    if (findExistCall) continue;

    const resolvedSerial = targetTagInfo
      ? facilitySerial
      : facilitySerial.endsWith('0')
        ? facilitySerial.slice(0, -1) + '1'
        : facilitySerial;
    const callType = await makeCallType(resolvedSerial);
    const createDateTime = timestampToDate(timezoneValue);

    if (facilityInfo?.system === 'WMS' && facilityInfo?.type === 'in' && callType === '') {
      console.log(`${facilitySerial} 콜타입을 가지고 있지 않으면 콜 인정X`);
      continue;
    }

    const targetEqpCallInfo: EqpCallStats = {
      EQ_CODE: facilitySerial,
      TAGGROUP: targetTagInfo?.TAGGROUP || '',
      CHANNEL: targetTagInfo?.CHANNEL || '',
      DEVICE: targetTagInfo?.DEVICE || facilitySerial,
      DATA_TYPE: targetTagInfo?.DATA_TYPE || '',
      EQP_CALL_ID: '',
      CALL_ID: eqpCallId,
      Call_Type: callType || 'SKID',
      Cargo_Type: callType || '',
      Caller: facilitySerial,
      Call_Quantity: 1,
      Call_Priority: '1',
      CREATE_TIME: createDateTime,
      IS_VIRTUAL: facilityInfo?.isVirtual || false,
    };
    await redisUtil.hset(RedisKeys.InfoCallRequestOnBySerial, facilitySerial, JSON.stringify(targetEqpCallInfo));

    const callInfo: EqpCallStats = {
      EQ_CODE: facilitySerial,
      EQP_CALL_ID: eqpCallId.slice(-4),
      CALL_ID: eqpCallId,
      Call_Type: callType || 'SKID',
      Cargo_Type: callType || '',
      Caller: facilitySerial,
      Call_Quantity: 1,
      Call_Priority: '1',
      DATA_TYPE: '',
      TRIGGER_CALL_COUNT: 0,
      ALWAYS_CALL_COUNT: -1,
    };
    await initTrackingLogRedis(callInfo);

    const updatedStateRecentWorkOrderListByFacilitySerial = {
      ...recentWorkOrderListByFacilitySerial,
      workOrderList: recentWorkOrderListByFacilitySerial?.workOrderList?.map((item) =>
        item.callId === eqpCallId ? { ...item, state: 'beforeWorkOrder' } : item
      ),
    };
    redisUtil.hset(
      RedisKeys.RecentWorkOrderListByFacilitySerial,
      facilitySerial,
      JSON.stringify(updatedStateRecentWorkOrderListByFacilitySerial)
    );
    break;
  }
};

export const checkCallCreate = async () => {
  const recentCallRequestByFacilitySerialList =
    (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
      RedisKeys.RecentCallRequestByFacilitySerial
    )) || [];

  for (let i = 0, length = recentCallRequestByFacilitySerialList.length; i < length; i++) {
    const recentCallRequestByFacilitySerialInfo = recentCallRequestByFacilitySerialList[i];
    const facilitySerial = recentCallRequestByFacilitySerialInfo.facilitySerial;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) continue;

    const recentWorkOrderListByFacilitySerial =
      await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

    const filterRecentWorkOrderList =
      recentWorkOrderListByFacilitySerial?.workOrderList.filter((workOrder) => workOrder.state === 'beforeRequest') ||
      [];

    const beforeWorkOrderInfo =
      recentWorkOrderListByFacilitySerial?.workOrderList.find((workOrder) => workOrder.state === 'beforeWorkOrder') ||
      null;

    if (!beforeWorkOrderInfo) {
      await processWorkOrderToCall(
        facilitySerial,
        filterRecentWorkOrderList,
        recentWorkOrderListByFacilitySerial,
        recentCallRequestByFacilitySerialInfo.targetTagInfo
      );
    }
  }

  const markerOccupancyByVirtualFacilitySerialList =
    (await redisUtil.hgetAllObject<MarkerOccupancyParams>(RedisKeys.MarkerOccupancyByVirtualFacilitySerial)) || [];

  for (let i = 0, length = markerOccupancyByVirtualFacilitySerialList.length; i < length; i++) {
    const markerOccupancyByVirtualFacilitySerialInfo = markerOccupancyByVirtualFacilitySerialList[i];
    const facilitySerial = markerOccupancyByVirtualFacilitySerialInfo.facilitySerial;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) continue;

    const recentWorkOrderListByFacilitySerial =
      await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

    const filterRecentWorkOrderList =
      recentWorkOrderListByFacilitySerial?.workOrderList.filter((workOrder) => workOrder.state === 'beforeRequest') ||
      [];

    const beforeWorkOrderInfo =
      recentWorkOrderListByFacilitySerial?.workOrderList.find((workOrder) => workOrder.state === 'beforeWorkOrder') ||
      null;

    if (!beforeWorkOrderInfo) {
      await processWorkOrderToCall(facilitySerial, filterRecentWorkOrderList, recentWorkOrderListByFacilitySerial);
    }
  }
};

// 기존 코드 10월 30일 이전

// export const checkCallCreates = async () => {
//   const recentCallCountByFacilitySerialList =
//     (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
//       RedisKeys.RecentCallCountByFacilitySerial
//     )) || [];
//   for (let i = 0, length = recentCallCountByFacilitySerialList.length; i < length; i++) {
//     const recentCallCountByFacilitySerialInfo = recentCallCountByFacilitySerialList[i];

//     const facilitySerial = recentCallCountByFacilitySerialInfo.facilitySerial;
//     const targetKey = recentCallCountByFacilitySerialInfo.targetKey;

//     const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
//     if (!facilityInfo) {
//       // 에러처리
//       return;
//     }

//     const callRequest = recentCallCountByFacilitySerialInfo.callRequest;
//     const callRequestMulti1 = recentCallCountByFacilitySerialInfo.callRequestMulti1;
//     const callRequestMulti2 = recentCallCountByFacilitySerialInfo.callRequestMulti2;

//     const recentWorkOrderListByFacilitySerial =
//       await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
//         RedisKeys.RecentWorkOrderListByFacilitySerial,
//         facilitySerial
//       );

//     let workOrderCount: number = 0;
//     if (facilityInfo.type === 'in') {
//       workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;
//     } else if (facilityInfo.type === 'out') {
//       let pendingWorkOrderCount = 0;
//       let allWorkOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;

//       for (let i = 0; i < allWorkOrderCount; i++) {
//         const workOrderInfo = recentWorkOrderListByFacilitySerial?.workOrderList[i];

//         // 작업 상태가 To 가 아닌 경우
//         if (
//           workOrderInfo?.state === 'beforeRequest' ||
//           workOrderInfo?.state === 'beforeWorkOrder' ||
//           workOrderInfo?.state === 'workOrder' ||
//           workOrderInfo?.state === 'fromWorkOrder'
//         ) {
//           pendingWorkOrderCount = pendingWorkOrderCount + 1;
//         }
//       }
//       workOrderCount = pendingWorkOrderCount;
//     }

//     // const workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;

//     let maxWorkOrderCount = 0;
//     if (callRequest === true) {
//       maxWorkOrderCount = maxWorkOrderCount + 1;
//     }
//     if (callRequestMulti1 === true) {
//       maxWorkOrderCount = maxWorkOrderCount + 1;
//     }
//     if (callRequestMulti2 === true) {
//       maxWorkOrderCount = maxWorkOrderCount + 1;
//     }

//     const reqWorkOrderCount = maxWorkOrderCount - workOrderCount;
//     if (reqWorkOrderCount > 0) {
//       for (let i = 0; i < reqWorkOrderCount; i++) {
//         const timezoneValue = process.env.TIME_ZONE || '';
//         const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
//           RedisKeys.InfoFacilityBySerial,
//           facilitySerial
//         );
//         if (facilityInfo && facilityInfo.isActiveCallTrigger) {
//           const callRegisterInfoBySerial = await redisUtil.hgetObject<TagValue>(
//             RedisKeys.InfoCallRequestOnBySerial,
//             targetKey
//           );
//           if (callRegisterInfoBySerial) {
//             // 해당 정보가 있다면 이 정보를 처리한 후 그 다음 작업을 생성할 수 있도록 Continue 한다. ( Break 해도 문제는 없을 것 같긴 한데 ... )
//             continue;
//           }

//           const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(targetKey, facilityInfo, '');
//           if (!eqpCallId) return;

//           // InfoCallRequestOnBySerial 중복 등록 방지
//           const callRegisterList = await useRedisUtil().hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
//           const findExistCall = callRegisterList?.find((call) => call.DEVICE === facilitySerial);
//           if (!findExistCall) {
//             const callType = await makeCallType(facilitySerial);
//             const createDateTime = timestampToDate(timezoneValue);

//             const targetEqpCallInfo: EqpCallStats = {
//               // ...targetTagInfo,
//               EQ_CODE: facilitySerial,
//               TAGGROUP: recentCallCountByFacilitySerialInfo.targetTagInfo.TAGGROUP,
//               CHANNEL: recentCallCountByFacilitySerialInfo.targetTagInfo.CHANNEL,
//               DEVICE: recentCallCountByFacilitySerialInfo.targetTagInfo.DEVICE,
//               DATA_TYPE: recentCallCountByFacilitySerialInfo.targetTagInfo.DATA_TYPE,
//               EQP_CALL_ID: '',
//               CALL_ID: eqpCallId,
//               Call_Type: callType || 'SKID',
//               Caller: facilitySerial,
//               Call_Quantity: 1,
//               Call_Priority: '1',
//               CREATE_TIME: createDateTime,
//             };
//             await useRedisUtil().hset(
//               RedisKeys.InfoCallRequestOnBySerial,
//               facilitySerial,
//               JSON.stringify(targetEqpCallInfo)
//             );

//             const callInfo: EqpCallStats = {
//               EQ_CODE: facilitySerial,
//               EQP_CALL_ID: eqpCallId.slice(-4), // 뒤의 4자리
//               CALL_ID: eqpCallId,
//               Call_Type: callType || 'SKID',
//               Caller: facilitySerial, // 앞의 4자리
//               Call_Quantity: 1,
//               Call_Priority: '1',
//               DATA_TYPE: '',
//               TRIGGER_CALL_COUNT: 0,
//               ALWAYS_CALL_COUNT: -1,
//             };
//             await initTrackingLogRedis(callInfo);

//             const workOrderState = 'beforeWorkOrder';
//             const workOrderInfo = {
//               callId: eqpCallId,
//               state: workOrderState,
//             };
//             const RecentWorkOrderListByFacilityInfo =
//               await useRedisUtil().hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
//                 RedisKeys.RecentWorkOrderListByFacilitySerial,
//                 facilitySerial
//               );
//             if (!RecentWorkOrderListByFacilityInfo) {
//               // 해당 정보가 없을 경우 신규 등록
//               const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
//                 count: 1,
//                 workOrderList: [workOrderInfo],
//               };
//               useRedisUtil().hset(
//                 RedisKeys.RecentWorkOrderListByFacilitySerial,
//                 facilitySerial,
//                 JSON.stringify(recentWorkOrderListByFacilitySerialParams)
//               );
//             } else {
//               const newCount = RecentWorkOrderListByFacilityInfo.count + 1;
//               const newWorkOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[] =
//                 RecentWorkOrderListByFacilityInfo.workOrderList;
//               newWorkOrderList.push(workOrderInfo);
//               const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
//                 count: newCount,
//                 workOrderList: newWorkOrderList,
//               };
//               useRedisUtil().hset(
//                 RedisKeys.RecentWorkOrderListByFacilitySerial,
//                 facilitySerial,
//                 JSON.stringify(recentWorkOrderListByFacilitySerialParams)
//               );
//             }
//           }
//         }
//       }
//     }
//   }
// };
