import { AttributeIds } from 'node-opcua-client';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { logging } from './logging';
import opcuaUtil from './opcuaUtil';
import { EqpCallStats, useCallRegisterUtil } from './callRegisterUtil';
import { useCallRemoveUtil } from './callRemoveUtil';
import { useDockingUtil } from './process/dockingUtil';
import { useCallCancelUtil } from './callCancelUtil';
import { useCallTypeUtil } from './callTypeUtil';
import { useMultiCallRegisterUtil } from './multiCallRegisterUtil';
import { useCallResponseUtil } from './callResponseUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { useCallPriorityUtil } from './callPriorityUtil';
import { sendMqtt } from './mqttUtil';
import { timestampToDate } from '../lib/usefullToolUtil';
import { FacilityAttributesDeep } from '../models/operation/facility';
import { initTrackingLogRedis } from './process/trackingLog';
import {
  RecentCallCountByFacilitySerialAttributes,
  RecentWorkOrderInfoByFacilitySerialAttributes,
  RecentWorkOrderListByFacilitySerialAttributes,
} from '../models/operation/workOrder';
import { usePlcConnectUtil } from './plcConnectUtil';

export interface EQP_WCS {
  EQP_ID: string;
  CALL_ID: string;
  EQP_CALL_ID: string;
  WCS_CALL_ID?: string;
}

export const useEqpCheckUtil = () => {
  const eqpTaskStatus = async (targetTagInfo: TagValue, newValue: boolean) => {
    const plcConnectUtil = usePlcConnectUtil();
    try {
      // TAG_NAME에 따라 다른 함수 실행
      switch (targetTagInfo.TAG_NAME) {
        case 'Call_Request':
          // 서버 연동을 위한 Call_Request 판단
          if (targetTagInfo.value === true) {
            const facilitySerial = targetTagInfo.EQ_CODE;
            const timezoneValue = process.env.TIME_ZONE || '';
            const targetKey = targetTagInfo.TAGGROUP
              ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
              : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
            const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
              RedisKeys.InfoFacilityBySerial,
              facilitySerial
            );
            if (
              facilityInfo &&
              // facilityInfo.system === 'WMS' &&
              // facilityInfo.type === 'in' &&
              facilityInfo.isActiveCallTrigger
            ) {
              const recentCallRequestByFacilitySerialInfo =
                await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial
                );
              if (!recentCallRequestByFacilitySerialInfo) {
                // 해당 정보가 없을 경우 신규 등록
                const recentCallRequestByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                  targetTagInfo: targetTagInfo,
                  facilitySerial: facilitySerial,
                  targetKey: targetKey,
                  callRequest: true,
                  callRequestMulti1: false,
                  callRequestMulti2: false,
                };
                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestByFacilitySerialParams)
                );
              } else {
                recentCallRequestByFacilitySerialInfo.callRequest = true;

                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestByFacilitySerialInfo)
                );
              }
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

                  count: 0,
                  workOrderList: [],
                };
                useRedisUtil().hset(
                  RedisKeys.RecentWorkOrderListByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentWorkOrderListByFacilitySerialParams)
                );
              }
              return;
            }
            // if (facilityInfo && facilityInfo.isActiveCallTrigger) {
            //   const eqpCallId = await useCallRegisterUtil().createWorkOrderCode(
            //     targetKey,
            //     facilityInfo,
            //     targetTagInfo.reRegister
            //   );
            //   if (!eqpCallId) return;

            //   // InfoCallRequestOnBySerial 중복 등록 방지
            //   const callRegisterList = await useRedisUtil().hgetAllObject<TagValue>(
            //     RedisKeys.InfoCallRequestOnBySerial
            //   );
            //   const findExistCall = callRegisterList?.find((call) => call.DEVICE === facilitySerial);
            //   if (!findExistCall) {
            //     const callType = await makeCallType(facilitySerial);
            //     const createDateTime = timestampToDate(timezoneValue);

            //     const targetEqpCallInfo: EqpCallStats = {
            //       ...targetTagInfo,
            //       EQP_CALL_ID: '',
            //       CALL_ID: eqpCallId,
            //       Call_Type: callType || 'SKID',
            //       Caller: facilitySerial,
            //       Call_Quantity: 1,
            //       Call_Priority: '1',
            //       CREATE_TIME: createDateTime,
            //     };
            //     await useRedisUtil().hset(
            //       RedisKeys.InfoCallRequestOnBySerial,
            //       facilitySerial,
            //       JSON.stringify(targetEqpCallInfo)
            //     );

            //     const callInfo: EqpCallStats = {
            //       EQP_CALL_ID: eqpCallId.slice(-4), // 뒤의 4자리
            //       CALL_ID: eqpCallId,
            //       Call_Type: callType || 'SKID',
            //       Caller: facilitySerial, // 앞의 4자리
            //       Call_Quantity: 1,
            //       Call_Priority: '1',
            //       DATA_TYPE: targetTagInfo.DATA_TYPE,
            //       TRIGGER_CALL_COUNT: 0,
            //       ALWAYS_CALL_COUNT: -1,
            //     };
            //     await initTrackingLogRedis(callInfo);

            //     if (facilityInfo.system === 'WMS' && facilityInfo.type === 'in') {
            //       const workOrderState = 'beforeWorkOrder';
            //       const workOrderInfo = {
            //         callId: eqpCallId,
            //         state: workOrderState,
            //       };
            //       const RecentWorkOrderListByFacilityInfo =
            //         await useRedisUtil().hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
            //           RedisKeys.RecentWorkOrderListByFacilitySerial,
            //           facilitySerial
            //         );
            //       if (!RecentWorkOrderListByFacilityInfo) {
            //         // 해당 정보가 없을 경우 신규 등록
            //         const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
            //           count: 1,
            //           workOrderList: [workOrderInfo],
            //         };
            //         useRedisUtil().hset(
            //           RedisKeys.RecentWorkOrderListByFacilitySerial,
            //           facilitySerial,
            //           JSON.stringify(recentWorkOrderListByFacilitySerialParams)
            //         );
            //       } else {
            //         const newCount = RecentWorkOrderListByFacilityInfo.count + 1;
            //         const newWorkOrderList: RecentWorkOrderInfoByFacilitySerialAttributes[] =
            //           RecentWorkOrderListByFacilityInfo.workOrderList;
            //         newWorkOrderList.push(workOrderInfo);
            //         const recentWorkOrderListByFacilitySerialParams: RecentWorkOrderListByFacilitySerialAttributes = {
            //           count: newCount,
            //           workOrderList: newWorkOrderList,
            //         };
            //         useRedisUtil().hset(
            //           RedisKeys.RecentWorkOrderListByFacilitySerial,
            //           facilitySerial,
            //           JSON.stringify(recentWorkOrderListByFacilitySerialParams)
            //         );
            //       }
            //     }
            //   }
            // }
          } else {
            await useCallRemoveUtil().callRemove(targetTagInfo);
            // await useRedisUtil().hdel(RedisKeys.InfoCallKey, facilitySerial);
            const facilitySerial = targetTagInfo.EQ_CODE;
            const timezoneValue = process.env.TIME_ZONE || '';
            const targetKey = targetTagInfo.TAGGROUP
              ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
              : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
            const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
              RedisKeys.InfoFacilityBySerial,
              facilitySerial
            );
            if (
              facilityInfo &&
              // facilityInfo.system === 'WMS' &&
              // facilityInfo.type === 'in' &&
              facilityInfo.isActiveCallTrigger
            ) {
              const recentCallRequestByFacilitySerialInfo =
                await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial
                );
              if (!recentCallRequestByFacilitySerialInfo) {
                // 해당 정보가 없을 경우 신규 등록
                const recentCallRequestByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                  targetTagInfo: targetTagInfo,
                  facilitySerial: facilitySerial,
                  targetKey: targetKey,
                  callRequest: false,
                  callRequestMulti1: false,
                  callRequestMulti2: false,
                };
                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestByFacilitySerialParams)
                );
              } else {
                recentCallRequestByFacilitySerialInfo.callRequest = false;

                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestByFacilitySerialInfo)
                );
              }
            }
          }
          break;

        case 'Call_Response':
          console.log(`Changed Call_Response`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === false) {
            await useMultiCallRegisterUtil().hsetWithDecrementCount(
              RedisKeys.InfoWorkOrderCountBySerial,
              targetTagInfo.EQ_CODE
            );
            // await useCallResponseUtil().callReRegister(targetTagInfo);
          }
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
          if (targetTagInfo.value === true) {
            await useDockingUtil().dockingOutStart(targetTagInfo);
          }
          break;

        case 'Call_Type_01':
          // console.log(`Changed Call_Type_01`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          // await useCallTypeUtil().callTypeResponse(targetTagInfo.EQ_CODE);
          break;

        case 'Complete':
          console.log(`Changed Complete`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          // await useCallTypeUtil().callTypeResponse(targetTagInfo);
          await plcConnectUtil.writeTagValue({
            targetFacility: targetTagInfo.EQ_CODE,
            tagInfo: [
              { tagName: 'Dock_Request', value: false },
              // { tagName: 'Dock_Signal_Reset', value: true }],
              // { tagName: 'Dock_AMR_Status', value: false },
            ],
          });

          // setTimeout(() => {
          // await plcConnectUtil.writeTagValue({
          //   targetFacility: targetTagInfo.EQ_CODE,
          //   tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
          // });
          // }, 1000);
          break;

        case 'Call_Request_Multi_1':
          console.log(`Changed Call_Request_Multi_1`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === true) {
            await plcConnectUtil.writeTagValue({
              targetFacility: targetTagInfo.EQ_CODE,
              tagInfo: [{ tagName: 'Call_Response_Multi_1', value: true }],
            });
            if (targetTagInfo.value === true) {
              const facilitySerial = targetTagInfo.EQ_CODE;
              const targetKey = targetTagInfo.TAGGROUP
                ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
                : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
              const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
                RedisKeys.InfoFacilityBySerial,
                facilitySerial
              );
              if (
                facilityInfo &&
                // facilityInfo.system === 'WMS' &&
                // facilityInfo.type === 'in' &&
                facilityInfo.isActiveCallTrigger
              ) {
                const recentCallRequestMulti1ByFacilitySerialInfo =
                  await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                    RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                    facilitySerial
                  );
                if (!recentCallRequestMulti1ByFacilitySerialInfo) {
                  // 해당 정보가 없을 경우 신규 등록
                  const recentCallRequestMulti1ByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                    targetTagInfo: targetTagInfo,
                    facilitySerial: facilitySerial,
                    targetKey: targetKey,
                    callRequest: false,
                    callRequestMulti1: true,
                    callRequestMulti2: false,
                  };
                  useRedisUtil().hset(
                    RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                    facilitySerial,
                    JSON.stringify(recentCallRequestMulti1ByFacilitySerialParams)
                  );
                } else {
                  recentCallRequestMulti1ByFacilitySerialInfo.callRequestMulti1 = true;

                  useRedisUtil().hset(
                    RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                    facilitySerial,
                    JSON.stringify(recentCallRequestMulti1ByFacilitySerialInfo)
                  );
                }
              }
            }
          } else if (targetTagInfo.value === false) {
            await plcConnectUtil.writeTagValue({
              targetFacility: targetTagInfo.EQ_CODE,
              tagInfo: [{ tagName: 'Call_Response_Multi_1', value: false }],
            });
            const facilitySerial = targetTagInfo.EQ_CODE;
            const targetKey = targetTagInfo.TAGGROUP
              ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
              : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
            const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
              RedisKeys.InfoFacilityBySerial,
              facilitySerial
            );
            if (
              facilityInfo &&
              // facilityInfo.system === 'WMS' &&
              // facilityInfo.type === 'in' &&
              facilityInfo.isActiveCallTrigger
            ) {
              const recentCallRequestMulti1ByFacilitySerialInfo =
                await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                  RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                  facilitySerial
                );
              if (!recentCallRequestMulti1ByFacilitySerialInfo) {
                // 해당 정보가 없을 경우 신규 등록
                const recentCallRequestMulti1ByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                  targetTagInfo: targetTagInfo,
                  facilitySerial: facilitySerial,
                  targetKey: targetKey,
                  callRequest: false,
                  callRequestMulti1: false,
                  callRequestMulti2: false,
                };
                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestMulti1ByFacilitySerialParams)
                );
              } else {
                recentCallRequestMulti1ByFacilitySerialInfo.callRequestMulti1 = false;

                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestMulti1ByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestMulti1ByFacilitySerialInfo)
                );
              }
            }
          }
          break;

        case 'Call_Request_Multi_2':
          console.log(`Changed Call_Request_Multi_2`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          if (targetTagInfo.value === true) {
            await plcConnectUtil.writeTagValue({
              targetFacility: targetTagInfo.EQ_CODE,
              tagInfo: [{ tagName: 'Call_Response_Multi_2', value: true }],
            });
            if (targetTagInfo.value === true) {
              const facilitySerial = targetTagInfo.EQ_CODE;
              const targetKey = targetTagInfo.TAGGROUP
                ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
                : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
              const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
                RedisKeys.InfoFacilityBySerial,
                facilitySerial
              );
              if (
                facilityInfo &&
                // facilityInfo.system === 'WMS' &&
                // facilityInfo.type === 'in' &&
                facilityInfo.isActiveCallTrigger
              ) {
                const recentCallRequestMulti2ByFacilitySerialInfo =
                  await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                    RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                    facilitySerial
                  );
                if (!recentCallRequestMulti2ByFacilitySerialInfo) {
                  // 해당 정보가 없을 경우 신규 등록
                  const recentCallRequestMulti2ByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                    targetTagInfo: targetTagInfo,
                    facilitySerial: facilitySerial,
                    targetKey: targetKey,
                    callRequest: false,
                    callRequestMulti1: false,
                    callRequestMulti2: true,
                  };
                  useRedisUtil().hset(
                    RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                    facilitySerial,
                    JSON.stringify(recentCallRequestMulti2ByFacilitySerialParams)
                  );
                } else {
                  recentCallRequestMulti2ByFacilitySerialInfo.callRequestMulti2 = true;

                  useRedisUtil().hset(
                    RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                    facilitySerial,
                    JSON.stringify(recentCallRequestMulti2ByFacilitySerialInfo)
                  );
                }
              }
            }
          } else if (targetTagInfo.value === false) {
            await plcConnectUtil.writeTagValue({
              targetFacility: targetTagInfo.EQ_CODE,
              tagInfo: [{ tagName: 'Call_Response_Multi_2', value: false }],
            });
            const facilitySerial = targetTagInfo.EQ_CODE;
            const targetKey = targetTagInfo.TAGGROUP
              ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
              : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;
            const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
              RedisKeys.InfoFacilityBySerial,
              facilitySerial
            );
            if (
              facilityInfo &&
              // facilityInfo.system === 'WMS' &&
              // facilityInfo.type === 'in' &&
              facilityInfo.isActiveCallTrigger
            ) {
              const recentCallRequestMulti2ByFacilitySerialInfo =
                await useRedisUtil().hgetObject<RecentCallCountByFacilitySerialAttributes>(
                  RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                  facilitySerial
                );
              if (!recentCallRequestMulti2ByFacilitySerialInfo) {
                // 해당 정보가 없을 경우 신규 등록
                const recentCallRequestMulti2ByFacilitySerialParams: RecentCallCountByFacilitySerialAttributes = {
                  targetTagInfo: targetTagInfo,
                  facilitySerial: facilitySerial,
                  targetKey: targetKey,
                  callRequest: false,
                  callRequestMulti1: false,
                  callRequestMulti2: false,
                };
                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestMulti2ByFacilitySerialParams)
                );
              } else {
                recentCallRequestMulti2ByFacilitySerialInfo.callRequestMulti2 = false;

                useRedisUtil().hset(
                  RedisKeys.RecentCallRequestMulti2ByFacilitySerial,
                  facilitySerial,
                  JSON.stringify(recentCallRequestMulti2ByFacilitySerialInfo)
                );
              }
            }
          }
          break;

        case 'Call_Priority':
          console.log(`Changed Call_Priority`, targetTagInfo.EQ_CODE, targetTagInfo.value);
          await useCallPriorityUtil().onCallPriority(targetTagInfo);
          break;

        // case 'EQ_Auto':
        //   console.log(`Changed EQ_Auto`, targetTagInfo.EQ_CODE, targetTagInfo.value);
        //   if (targetTagInfo.value === true && targetTagInfo.prevValue === false) {
        //     const eqpModeInfo = {
        //       EQP_ID: targetTagInfo.EQ_CODE,
        //       EQP_MODE: 'AUTO',
        //     }
        //     sendMqtt('acs/eqp_mode', JSON.stringify(eqpModeInfo));
        //   }
        //   break;
        // case 'EQ_Manual':
        //   console.log(`Changed EQ_Manual`, targetTagInfo.EQ_CODE, targetTagInfo.value);
        //   if (targetTagInfo.value === true && targetTagInfo.prevValue === false) {
        //     const eqpModeInfo = {
        //       EQP_ID: targetTagInfo.EQ_CODE,
        //       EQP_MODE: 'MANUAL',
        //     }
        //     sendMqtt('acs/eqp_mode', JSON.stringify(eqpModeInfo));
        //   }
        //   break;
        case 'Dock_Disable':
          if (!targetTagInfo.value && !targetTagInfo.prevValue) break;
          const changed = targetTagInfo.value !== targetTagInfo.prevValue;
          if (changed) {
            const eqpModeInfo = {
              EQP_ID: targetTagInfo.EQ_CODE,
              EQP_MODE: targetTagInfo.value ? 'MANUAL' : 'AUTO',
            };
            sendMqtt('acs/eqp_mode', JSON.stringify(eqpModeInfo));
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
      const plcConnectUtil = usePlcConnectUtil();
      // 설비코드 1 + 설비코드 2 + 콜 ID 시간1(년도) + 콜 ID시간2(월,일) + 콜ID(0~9999)
      // const EQCode01 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_01`);
      // const EQCode02 = opcuaUtil.tagMap.get(`${targetKey}.EQ_Code_02`);
      // const callTimeYear = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_Year`);
      // const callTimeMonthDay = opcuaUtil.tagMap.get(`${targetKey}.Call_Time_MonthDay`);

      // // 필요한 모든 nodeId들을 배열로 모음
      // const needNodeIds = [
      //   EQCode01?.NODE_ID,
      //   EQCode02?.NODE_ID,
      //   callTimeYear?.NODE_ID,
      //   callTimeMonthDay?.NODE_ID,
      // ].filter((nodeId): nodeId is string => nodeId !== undefined);

      // const readDatas = await useKepServerUtil().readTagsValue(needNodeIds);
      // console.log('🚀 ~ createEQPCallId ~ readDatas:', readDatas);

      // const needKeys = [
      //   EQCode01?.TAG_NAME,
      //   EQCode02?.TAG_NAME,
      //   callTimeYear?.TAG_NAME,
      //   callTimeMonthDay?.TAG_NAME,
      // ].filter((tagName): tagName is string => tagName !== undefined);

      // for (let i = 0; i < needKeys.length; i++) {
      //   useKepServerUtil().updateTagValue(`${targetKey}.${needKeys[i]}`, readDatas[i]);
      // }
      const targetCode = useKepServerUtil().getTagCode(targetKey);
      const EQCode01Value = (await plcConnectUtil.getTagValue(targetCode, 'EQ_Code_01')) as string;
      const EQCode02Value = (await plcConnectUtil.getTagValue(targetCode, 'EQ_Code_02')) as string;
      const callTimeYearValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Time_Year')) as string;
      const callTimeMonthDayValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Time_MonthDay')) as string;

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
