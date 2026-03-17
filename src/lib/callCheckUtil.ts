import { FacilityAttributes, FacilityAttributesDeep } from '../models/operation/facility';
import {
  RecentCallCountByFacilitySerialAttributes,
  RecentWorkOrderInfoByFacilitySerialAttributes,
  RecentWorkOrderListByFacilitySerialAttributes,
} from '../models/operation/workOrder';
import { EqpCallStats, useCallRegisterUtil } from './callRegisterUtil';
import { makeCallType, TagValue } from './kepServerUtil';
import { initTrackingLogRedis } from './process/trackingLog';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { timestampToDate } from './usefullToolUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { logging } from './logging';

const redisUtil = useRedisUtil();
const plcConnectUtil = usePlcConnectUtil();
// Call Request를 보낼 지, 말 지 판단하는 함수
export const checkCallRequestCreate = async () => {
  // recentCallCountByFacilitySerial : 설비의 CallRequest, Multi1, Multi2 신호 값 on 여부 판단 레디스
  const recentCallRequestByFacilitySerialList =
    (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
      RedisKeys.RecentCallRequestByFacilitySerial
    )) || [];

  // 설비에서 on / off가 있었던 설비들 ( isActiveCallTrigger === true 설비들 ) 반복
  for (let i = 0, length = recentCallRequestByFacilitySerialList.length; i < length; i++) {
    const recentCallRequestByFacilitySerialInfo = recentCallRequestByFacilitySerialList[i];

    const facilitySerial = recentCallRequestByFacilitySerialInfo.facilitySerial;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) {
      // 에러처리
      return;
    }
    const callCancelRequestValue = (await plcConnectUtil.getTagValue(facilitySerial, 'Call_Cancel_Request')) as boolean;
    if (callCancelRequestValue) {
      logging.ACTION_ERROR({
        filename: `callCheckUtil.ts - checkCallRequestCreate`,
        error: `${facilitySerial} Call_Cancel_Request 태그가 켜져있어서 콜 생성을 중단합니다.`,
        params: null,
        result: true,
      });
      return;
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

    let workOrderCount: number = 0;
    // 설비의 타입이 In 인 경우, Out 인 경우에 따라 기준 WorkOrder Count가 다름
    // 설비 In => 작업 끝나는 시간까지
    // 설비 Out => From 작업 끝나는 시간까지
    if (facilityInfo.type === 'in') {
      workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;
    } else if (facilityInfo.type === 'out') {
      let pendingWorkOrderCount = 0;
      let allWorkOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;

      for (let j = 0; j < allWorkOrderCount; j++) {
        const workOrderInfo = recentWorkOrderListByFacilitySerial?.workOrderList[j];

        // 작업 상태가 To 가 아닌 경우
        if (
          workOrderInfo?.state === 'beforeRequest' ||
          workOrderInfo?.state === 'beforeWorkOrder' ||
          workOrderInfo?.state === 'workOrder' ||
          workOrderInfo?.state === 'fromWorkOrder'
        ) {
          pendingWorkOrderCount = pendingWorkOrderCount + 1;
        }
      }
      workOrderCount = pendingWorkOrderCount;
    }

    // const workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;

    // maxWorkOrderCount = 작지를 만들 수 있는 최대 개수
    let maxWorkOrderCount = 0;
    if (callRequest === true) {
      maxWorkOrderCount = maxWorkOrderCount + 1;
    }
    if (callRequestMulti1 === true) {
      maxWorkOrderCount = maxWorkOrderCount + 1;
    }
    if (callRequestMulti2 === true) {
      maxWorkOrderCount = maxWorkOrderCount + 1;
    }

    const reqWorkOrderCount = maxWorkOrderCount - workOrderCount;

    // [ 만들 수 있는 최대 개수 - 진행 중인 작업 개수 (in/out 차이 o) ]
    if (reqWorkOrderCount > 0) {
      for (let z = 0; z < reqWorkOrderCount; z++) {
        const timezoneValue = process.env.TIME_ZONE || '';
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );
        if (facilityInfo && facilityInfo.isActiveCallTrigger) {
          const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(facilitySerial, facilityInfo, '');
          if (!eqpCallId) return;

          // check call request create 함수에서는 Request를 쓰기 바로 전 단계를 판단하는 것이라서 beforeRequest 상태 사용
          const workOrderState = 'beforeRequest';
          const workOrderInfo = {
            callId: eqpCallId,
            state: workOrderState,
          };
          const RecentWorkOrderListByFacilityInfo =
            await useRedisUtil().hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              facilitySerial
            );
          if (!RecentWorkOrderListByFacilityInfo) {
            // 해당 정보가 없을 경우 신규 등록
            const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
              facilitySerial: facilitySerial,
              facilityInfo: facilityInfo,
              count: 1,
              workOrderList: [workOrderInfo],
            };
            useRedisUtil().hset(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              facilitySerial,
              JSON.stringify(recentWorkOrderListByFacilitySerialParams)
            );
          } else {
            // 있을 경우 기존 데이터에 해당 데이터 추가
            const newCount = RecentWorkOrderListByFacilityInfo.count + 1;
            const newWorkOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[] =
              RecentWorkOrderListByFacilityInfo.workOrderList;
            newWorkOrderList.push(workOrderInfo);
            const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
              facilitySerial: facilitySerial,
              facilityInfo: facilityInfo,
              count: newCount,
              workOrderList: newWorkOrderList,
            };
            useRedisUtil().hset(
              RedisKeys.RecentWorkOrderListByFacilitySerial,
              facilitySerial,
              JSON.stringify(recentWorkOrderListByFacilitySerialParams)
            );
          }
        }
      }
    }
  }
};

// Call Request 로 실제 사용하는 함수
export const checkCallCreate = async () => {
  const recentCallRequestByFacilitySerialList =
    (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
      RedisKeys.RecentCallRequestByFacilitySerial
    )) || [];
  for (let i = 0, length = recentCallRequestByFacilitySerialList.length; i < length; i++) {
    const recentCallRequestByFacilitySerialInfo = recentCallRequestByFacilitySerialList[i];

    const facilitySerial = recentCallRequestByFacilitySerialInfo.facilitySerial;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) {
      // 에러처리
      return;
    }

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
      for (let j = 0; j < filterRecentWorkOrderList.length; j++) {
        const timezoneValue = process.env.TIME_ZONE || '';
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );
        const eqpCallId = filterRecentWorkOrderList[j].callId;

        const callRegisterInfoBySerial = await redisUtil.hgetObject<TagValue>(
          RedisKeys.InfoCallRequestOnBySerial,
          facilitySerial
        );
        if (callRegisterInfoBySerial) {
          // 해당 정보가 있다면 이 정보를 처리한 후 그 다음 작업을 생성할 수 있도록 Break 한다.
          break;
        }

        const callRegisterList = await useRedisUtil().hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
        const findExistCall = callRegisterList?.find((call) => call.DEVICE === facilitySerial);

        if (!findExistCall) {
          const callType = await makeCallType(facilitySerial);
          const createDateTime = timestampToDate(timezoneValue);

          // todo[ssb] 260228 ignore callType
          // if (
          //   callType === ''
          //   // && facilityInfo?.system === 'WMS'
          // ) {
          //   continue;
          // }

          const targetEqpCallInfo: EqpCallStats = {
            // ...targetTagInfo,
            EQ_CODE: facilitySerial,
            TAGGROUP: recentCallRequestByFacilitySerialInfo.targetTagInfo.TAGGROUP,
            CHANNEL: recentCallRequestByFacilitySerialInfo.targetTagInfo.CHANNEL,
            DEVICE: recentCallRequestByFacilitySerialInfo.targetTagInfo.DEVICE,
            DATA_TYPE: recentCallRequestByFacilitySerialInfo.targetTagInfo.DATA_TYPE,
            EQP_CALL_ID: '',
            CALL_ID: eqpCallId,
            Call_Type: callType || 'SKID',
            Cargo_Type: callType || '',
            Caller: facilitySerial,
            Call_Quantity: 1,
            Call_Priority: '1',
            CREATE_TIME: createDateTime,
          };
          await useRedisUtil().hset(
            RedisKeys.InfoCallRequestOnBySerial,
            facilitySerial,
            JSON.stringify(targetEqpCallInfo)
          );

          const callInfo: EqpCallStats = {
            EQ_CODE: facilitySerial,
            EQP_CALL_ID: eqpCallId.slice(-4), // 뒤의 4자리
            CALL_ID: eqpCallId,
            Call_Type: callType || 'SKID',
            Cargo_Type: callType || '',
            Caller: facilitySerial, // 앞의 4자리
            Call_Quantity: 1,
            Call_Priority: '1',
            DATA_TYPE: '',
            TRIGGER_CALL_COUNT: 0,
            ALWAYS_CALL_COUNT: -1,
          };

          await initTrackingLogRedis(callInfo);

          // // 리스트 중 1개만 해도 일단 break
          // break;

          const workOrderState = 'beforeWorkOrder';

          const copiedRecentWorkOrderListByFacilitySerial = { ...recentWorkOrderListByFacilitySerial };

          const updatedStateRecentWorkOrderListByFacilitySerial = {
            ...copiedRecentWorkOrderListByFacilitySerial,
            workOrderList: copiedRecentWorkOrderListByFacilitySerial?.workOrderList?.map((item) =>
              item.callId === eqpCallId ? { ...item, state: workOrderState } : item
            ),
          };

          useRedisUtil().hset(
            RedisKeys.RecentWorkOrderListByFacilitySerial,
            facilitySerial,
            JSON.stringify(updatedStateRecentWorkOrderListByFacilitySerial)
          );

          // 리스트 중 1개만 해도 일단 break
          break;
        }
      }
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
