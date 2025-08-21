import { FacilityAttributes } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { sendMqtt } from './mqttUtil';
import { routeMissionOrderMqttMessage } from './process/commonUtils';
import { MqttBranchInfoDataFromAcs } from './process/wmsBranch';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import opcuaUtil from './opcuaUtil';

export const checkMissionOrder = async () => {
  const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();

  const missionOrderList =
    (await redisUtil.hgetAllObject<MqttBranchInfoDataFromAcs>(RedisKeys.InfoMissionOrderByWorkOrderCode)) || [];

  for (let i = 0, length = missionOrderList.length; i < length; i++) {
    const missionOrderMqttInfo = missionOrderList[i];
    const missionOrderType = await routeMissionOrderMqttMessage(missionOrderMqttInfo);
    const mqttCallId = missionOrderMqttInfo.workOrderCode;

    if (missionOrderType) {
      const missionFromfacilityInfo = missionOrderType.facilityInfo;

      // 콜 취소 시나리오
      if (missionFromfacilityInfo?.type === 'in') {
        if (missionFromfacilityInfo?.cancelLinkedEqpIds && missionFromfacilityInfo?.cancelLinkedEqpIds.length > 0) {
          const newCancelLinkedEqpFacilityList: Array<FacilityAttributes> = [];
          for (let i = 0; i < missionFromfacilityInfo.cancelLinkedEqpIds.length; i++) {
            const linkedEqpId = missionFromfacilityInfo.cancelLinkedEqpIds[i];
            const linkedFacilityRedisInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              linkedEqpId.toString() || ''
            );
            if (linkedFacilityRedisInfo) {
              newCancelLinkedEqpFacilityList.push(linkedFacilityRedisInfo);
            }
          }

          const filteredPriorirtyFacilityList = newCancelLinkedEqpFacilityList.sort(
            (facility1, facility2) => Number(facility2.priority) - Number(facility1.priority)
          );
          for (let i = 0; i < filteredPriorirtyFacilityList.length; i++) {
            const linkedFacilityInfo = filteredPriorirtyFacilityList[i];
            const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoPlcBySerial,
              linkedFacilityInfo?.serial?.toString() || ''
            );
            const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo));

            const targetCode = linkedFacilityInfo?.serial;

            const targetKey = kepServerUtil.getTargetKey(targetCode || '');
            await kepServerUtil.updateTagMapValues(targetKey, targetCode || '', [
              'EQ_Auto',
              'Call_Request',
              'Call_Count',
              'Dock_EQ_Status',
              'Call_Response',
            ]);

            const eqAuto = opcuaUtil.tagMap.get(`${targetCode}.EQ_Auto`);
            const callRequest = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`);
            const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
            const dockEqStatus = opcuaUtil.tagMap.get(`${targetCode}.Dock_EQ_Status`);
            const callResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Response`);

            const eqAutoValue = (eqAuto?.value as boolean) || false;
            const callRequestValue = (callRequest?.value as boolean) || false;
            const callCountValue = (Number(callCount?.value) as number) || 0;
            const dockEqStatusValue = (dockEqStatus?.value as boolean) || false;
            const callResponseValue = (callResponse?.value as boolean) || false;

            // 콜 카운트 없어도 되나욤 ?
            if (
              eqAutoValue === true &&
              callRequestValue === true &&
              // callCountValue > 0 &&
              dockEqStatusValue === false &&
              callResponseValue === false
            ) {
              const missionOrderMqttMessage = {
                EQP_CALL_ID: missionOrderMqttInfo.missionOrderCode.slice(-4),
                TYPE: 'MISSION',
                WORK_ORDER_ID: missionOrderMqttInfo.workOrderId,
                EQP_ID: linkedFacilityInfo?.serial,
                AMR_ID: missionOrderMqttInfo.amrName,
                AMR_DB_ID: Number(missionOrderMqttInfo.amrId) || 0,
                CALL_TYPE: missionOrderMqttInfo.callType,
                CALL_ID: missionOrderMqttInfo.missionOrderCode,
                IS_MISSION_ORDER: 'TRUE',
                TX_ID: '',
                TAG_ID: '',
                CALL_PRIORITY: missionOrderMqttInfo.callPriority,
              };

              // if (plcInfoToJson.Call_Request && linkedFacilityInfo) {
              if (linkedFacilityInfo) {
                // 링크된 설비 콜이 떠 있는 경우 작업 생성
                sendMqtt('acs/missionorder', JSON.stringify(missionOrderMqttMessage));

                // // 콜 기준 설비 call_response 작성
                // await useKepServerUtil().writeSimpleTagValue({
                //   targetFacility: missionFromfacilityInfo.serial || '',
                //   tagName: 'Call_Response',
                //   value: true,
                // });
                // call_response 작성
                await useKepServerUtil().writeSimpleTagValue({
                  targetFacility: linkedFacilityInfo.serial || '',
                  tagName: 'Call_Response',
                  value: true,
                });

                redisUtil.hdel(RedisKeys.InfoMissionOrderByWorkOrderCode, mqttCallId);
                break;
              }
            }

            // else if (!plcInfoToJson.Call_Request && linkedFacilityInfo) {
            //   // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
            //   redisUtil.hset(RedisKeys.InfoRemainCallById, missionOrderMqttInfo.missionOrderCode, JSON.stringify({
            //     ...missionOrderMqttMessage,
            //     fromFacilityName: missionFromfacilityInfo.serial,
            //     toFacilityName: linkedFacilityInfo.serial
            //   }))
            // }
          }
        }
      }
      // 정상 시나리오
      else {
        if (missionFromfacilityInfo?.linkedEqpIds && missionFromfacilityInfo?.linkedEqpIds.length > 0) {
          const newCancelLinkedEqpFacilityList: Array<FacilityAttributes> = [];
          for (let i = 0; i < missionFromfacilityInfo.linkedEqpIds.length; i++) {
            const linkedEqpId = missionFromfacilityInfo.linkedEqpIds[i];
            const linkedFacilityRedisInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              linkedEqpId.toString() || ''
            );
            if (linkedFacilityRedisInfo) {
              newCancelLinkedEqpFacilityList.push(linkedFacilityRedisInfo);
            }
          }

          const filteredPriorirtyFacilityList = newCancelLinkedEqpFacilityList.sort(
            (facility1, facility2) => Number(facility2.priority) - Number(facility1.priority)
          );
          for (let i = 0; i < filteredPriorirtyFacilityList.length; i++) {
            const linkedFacilityInfo = filteredPriorirtyFacilityList[i];
            const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoPlcBySerial,
              linkedFacilityInfo?.serial?.toString() || ''
            );
            const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo));

            const targetCode = linkedFacilityInfo?.serial;

            const targetKey = kepServerUtil.getTargetKey(targetCode || '');
            await kepServerUtil.updateTagMapValues(targetKey, targetCode || '', [
              'EQ_Auto',
              'Call_Request',
              'Call_Count',
              'Dock_EQ_Status',
              'Call_Response',
            ]);

            const eqAuto = opcuaUtil.tagMap.get(`${targetCode}.EQ_Auto`);
            const callRequest = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`);
            const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
            const dockEqStatus = opcuaUtil.tagMap.get(`${targetCode}.Dock_EQ_Status`);
            const callResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Response`);

            const eqAutoValue = (eqAuto?.value as boolean) || false;
            const callRequestValue = (callRequest?.value as boolean) || false;
            const callCountValue = (Number(callCount?.value) as number) || 0;
            const dockEqStatusValue = (dockEqStatus?.value as boolean) || false;
            const callResponseValue = (callResponse?.value as boolean) || false;

            // 콜 카운트 없어도 되나욤 ?
            if (
              eqAutoValue === true &&
              callRequestValue === true &&
              // callCountValue > 0 &&
              dockEqStatusValue === false &&
              callResponseValue === false
            ) {
              const missionOrderMqttMessage = {
                EQP_CALL_ID: missionOrderMqttInfo.missionOrderCode.slice(-4),
                TYPE: 'MISSION',
                WORK_ORDER_ID: missionOrderMqttInfo.workOrderId,
                EQP_ID: linkedFacilityInfo?.serial,
                AMR_ID: missionOrderMqttInfo.amrName,
                AMR_DB_ID: Number(missionOrderMqttInfo.amrId) || 0,
                CALL_TYPE: missionOrderMqttInfo.callType,
                CALL_ID: missionOrderMqttInfo.missionOrderCode,
                IS_MISSION_ORDER: 'TRUE',
                TX_ID: '',
                TAG_ID: '',
                CALL_PRIORITY: missionOrderMqttInfo.callPriority,
              };

              // if (plcInfoToJson.Call_Request && linkedFacilityInfo) {
              if (linkedFacilityInfo) {
                // 링크된 설비 콜이 떠 있는 경우 작업 생성
                sendMqtt('acs/missionorder', JSON.stringify(missionOrderMqttMessage));

                // // 콜 기준 설비 call_response 작성
                // await useKepServerUtil().writeSimpleTagValue({
                //   targetFacility: missionFromfacilityInfo.serial || '',
                //   tagName: 'Call_Response',
                //   value: true,
                // });
                // call_response 작성
                await useKepServerUtil().writeSimpleTagValue({
                  targetFacility: linkedFacilityInfo.serial || '',
                  tagName: 'Call_Response',
                  value: true,
                });

                redisUtil.hdel(RedisKeys.InfoMissionOrderByWorkOrderCode, mqttCallId);
                break;
              }
            }

            // else if (!plcInfoToJson.Call_Request && linkedFacilityInfo) {
            //   // 반대쪽에 콜이 떠 있지 않은 경우 반복해서 판단하는 redis에 저장
            //   redisUtil.hset(RedisKeys.InfoRemainCallById, missionOrderMqttInfo.missionOrderCode, JSON.stringify({
            //     ...missionOrderMqttMessage,
            //     fromFacilityName: missionFromfacilityInfo.serial,
            //     toFacilityName: linkedFacilityInfo.serial
            //   }))
            // }
          }
        }
      }
    }
  }
};
