import { FacilityAttributes } from '../models/operation/facility';
import { makeCallType, TagValue, useKepServerUtil } from './kepServerUtil';
import { sendMqtt } from './mqttUtil';
import { routeMissionOrderMqttMessage } from './process/commonUtils';
import { MqttBranchInfoDataFromAcs } from './process/wmsBranch';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import opcuaUtil from './opcuaUtil';
import { useCallTypeUtil } from './callTypeUtil';

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

      if (missionFromfacilityInfo) {
        let linkedEqpIds: number[] = [];
        if (missionFromfacilityInfo?.type === 'in') {
          // 취소 후 미션 오더 처리
          linkedEqpIds = missionFromfacilityInfo?.cancelLinkedEqpIds || [];
        } else {
          // 회수 작업 미션 오더 처리
          linkedEqpIds = missionFromfacilityInfo?.linkedEqpIds || [];
        }

        const newFacilityArray = [];

        if (linkedEqpIds && linkedEqpIds.length > 0) {
          for (let i = 0, length = linkedEqpIds.length; i < length; i++) {
            const linkedEqpId = linkedEqpIds[i];
            const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoFacilityById,
              linkedEqpId.toString() || ''
            );
            newFacilityArray.push(linkedFacilityInfo)
          }

          newFacilityArray.sort((a, b) => (b?.priority ?? 0) - (a?.priority ?? 0))

          for (let i = 0; i < newFacilityArray.length; i++) {
            // const linkedEqpId = linkedEqpIds[i];
            // const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
            //   RedisKeys.InfoFacilityById,
            //   linkedEqpId.toString() || ''
            // );
            const sortLinkedFacilityInfo = newFacilityArray[i];
            const plcInfo = await redisUtil.hgetObject<FacilityAttributes>(
              RedisKeys.InfoPlcBySerial,
              sortLinkedFacilityInfo?.serial?.toString() || ''
            );
            const plcInfoToJson = JSON.parse(JSON.stringify(plcInfo));

            const targetCode = sortLinkedFacilityInfo?.serial;

            const targetKey = kepServerUtil.getTargetKey(targetCode || '');
            await kepServerUtil.updateTagMapValues(targetKey, targetCode || '', [
              'EQ_Auto',
              'Call_Request',
              'Call_Count',
              'Dock_EQ_Status',
              'Call_Response',
              'Dock_Disable',
              'Dock_Out_Permit',
              'Dock_Permit',
            ]);

            const eqAuto = opcuaUtil.tagMap.get(`${targetCode}.EQ_Auto`);
            const callRequest = opcuaUtil.tagMap.get(`${targetCode}.Call_Request`);
            const callCount = opcuaUtil.tagMap.get(`${targetCode}.Call_Count`);
            const dockEqStatus = opcuaUtil.tagMap.get(`${targetCode}.Dock_EQ_Status`);
            const callResponse = opcuaUtil.tagMap.get(`${targetCode}.Call_Response`);
            const dockDisable = opcuaUtil.tagMap.get(`${targetCode}.Dock_Disable`);
            const dockOutPermit = opcuaUtil.tagMap.get(`${targetCode}.Dock_Out_Permit`);
            const dockPermit = opcuaUtil.tagMap.get(`${targetCode}.Dock_Permit`);

            const eqAutoValue = (eqAuto?.value as boolean) || false;
            const callRequestValue = (callRequest?.value as boolean) || false;
            const callCountValue = (Number(callCount?.value) as number) || 0;
            const dockEqStatusValue = (dockEqStatus?.value as boolean) || false;
            const callResponseValue = (callResponse?.value as boolean) || false;
            const dockDisableValue = (dockDisable?.value as boolean) || false;
            const dockOutPermitValue = (dockOutPermit?.value as boolean) || false;
            const dockPermitValue = (dockPermit?.value as boolean) || false;

            // 콜 카운트 없어도 되나욤 ?
            if (
              eqAutoValue === true &&
              callRequestValue === true &&
              // callCountValue > 0 &&
              dockEqStatusValue === false &&
              callResponseValue === false &&
              dockDisableValue === false &&
              dockOutPermitValue === false &&
              dockPermitValue === false
            ) {
              const missionOrderMqttMessage = {
                EQP_CALL_ID: missionOrderMqttInfo.missionOrderCode.slice(-4),
                TYPE: 'MISSION',
                WORK_ORDER_ID: missionOrderMqttInfo.workOrderId,
                EQP_ID: sortLinkedFacilityInfo?.serial,
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
              if (sortLinkedFacilityInfo) {
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
                  targetFacility: sortLinkedFacilityInfo.serial || '',
                  tagName: 'Call_Response',
                  value: true,
                });

                await useCallTypeUtil().callTypeResponse(sortLinkedFacilityInfo.serial || '');
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
