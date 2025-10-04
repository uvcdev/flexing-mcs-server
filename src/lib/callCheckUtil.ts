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

const redisUtil = useRedisUtil();

export const checkCallCreate = async () => {
  const recentCallCountByFacilitySerialList =
    (await redisUtil.hgetAllObject<RecentCallCountByFacilitySerialAttributes>(
      RedisKeys.RecentCallCountByFacilitySerial
    )) || [];
  for (let i = 0, length = recentCallCountByFacilitySerialList.length; i < length; i++) {
    const recentCallCountByFacilitySerialInfo = recentCallCountByFacilitySerialList[i];

    const facilitySerial = recentCallCountByFacilitySerialInfo.facilitySerial;
    const targetKey = recentCallCountByFacilitySerialInfo.targetKey;

    const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);
    if (!facilityInfo) {
      // 에러처리
      return;
    }

    const callRequest = recentCallCountByFacilitySerialInfo.callRequest;
    const callRequestMulti1 = recentCallCountByFacilitySerialInfo.callRequestMulti1;
    const callRequestMulti2 = recentCallCountByFacilitySerialInfo.callRequestMulti2;

    const recentWorkOrderListByFacilitySerial =
      await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
        RedisKeys.RecentWorkOrderListByFacilitySerial,
        facilitySerial
      );

    const workOrderCount = recentWorkOrderListByFacilitySerial?.count || 0;

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

    if (reqWorkOrderCount > 0) {
      for (let i = 0; i < reqWorkOrderCount; i++) {
        const timezoneValue = process.env.TIME_ZONE || '';
        const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
          RedisKeys.InfoFacilityBySerial,
          facilitySerial
        );
        if (facilityInfo && facilityInfo.isActiveCallTrigger) {
          const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(targetKey, facilityInfo, '');
          if (!eqpCallId) return;

          // InfoCallRequestOnBySerial 중복 등록 방지
          const callRegisterList = await useRedisUtil().hgetAllObject<TagValue>(RedisKeys.InfoCallRequestOnBySerial);
          const findExistCall = callRegisterList?.find((call) => call.DEVICE === facilitySerial);
          if (!findExistCall) {
            const callType = await makeCallType(facilitySerial);
            const createDateTime = timestampToDate(timezoneValue);

            const targetEqpCallInfo: EqpCallStats = {
              // ...targetTagInfo,
              EQ_CODE: facilitySerial,
              TAGGROUP: recentCallCountByFacilitySerialInfo.targetTagInfo.TAGGROUP,
              CHANNEL: recentCallCountByFacilitySerialInfo.targetTagInfo.CHANNEL,
              DEVICE: recentCallCountByFacilitySerialInfo.targetTagInfo.DEVICE,
              DATA_TYPE: recentCallCountByFacilitySerialInfo.targetTagInfo.DATA_TYPE,
              EQP_CALL_ID: '',
              CALL_ID: eqpCallId,
              Call_Type: callType || 'SKID',
              Caller: facilitySerial,
              Call_Quantity: 1,
              Call_Priority: '1',
              CREATE_TIME: createDateTime,
            };
            // await useRedisUtil().hset(
            //   RedisKeys.InfoCallRequestOnBySerial,
            //   facilitySerial,
            //   JSON.stringify(targetEqpCallInfo)
            // );

            const callInfo: EqpCallStats = {
              EQ_CODE: facilitySerial,
              EQP_CALL_ID: eqpCallId.slice(-4), // 뒤의 4자리
              CALL_ID: eqpCallId,
              Call_Type: callType || 'SKID',
              Caller: facilitySerial, // 앞의 4자리
              Call_Quantity: 1,
              Call_Priority: '1',
              DATA_TYPE: '',
              TRIGGER_CALL_COUNT: 0,
              ALWAYS_CALL_COUNT: -1,
            };
            // await initTrackingLogRedis(callInfo);

            const workOrderState = 'beforeWorkOrder';
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
                count: 1,
                workOrderList: [workOrderInfo],
              };
              // useRedisUtil().hset(
              //   RedisKeys.RecentWorkOrderListByFacilitySerial,
              //   facilitySerial,
              //   JSON.stringify(recentWorkOrderListByFacilitySerialParams)
              // );
            } else {
              const newCount = RecentWorkOrderListByFacilityInfo.count + 1;
              const newWorkOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[] =
                RecentWorkOrderListByFacilityInfo.workOrderList;
              newWorkOrderList.push(workOrderInfo);
              const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
                count: newCount,
                workOrderList: newWorkOrderList,
              };
              // useRedisUtil().hset(
              //   RedisKeys.RecentWorkOrderListByFacilitySerial,
              //   facilitySerial,
              //   JSON.stringify(recentWorkOrderListByFacilitySerialParams)
              // );
            }
          }
        }
      }
    }
  }
};
