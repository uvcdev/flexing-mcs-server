import { FacilityAttributes } from '../models/operation/facility';
import { makeCallType } from './kepServerUtil';
import { sendMqtt } from './mqttUtil';
import { routeMissionOrderMqttMessage } from './process/commonUtils';
import { MqttBranchInfoDataFromAcs } from './process/wmsBranch';
import { RedisKeys, RedisSettingKeys, useRedisUtil } from './redisUtil';
import { useCallTypeUtil } from './callTypeUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { editTrackingLogRedis } from './process/trackingLog';

export const checkMissionOrder = async () => {
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  const missionOrderList =
    (await redisUtil.hgetAllObject<MqttBranchInfoDataFromAcs>(RedisKeys.InfoMissionOrderByWorkOrderCode)) || [];

  for (let i = 0, length = missionOrderList.length; i < length; i++) {
    const missionOrderMqttInfo = missionOrderList[i];
    const missionOrderType = await routeMissionOrderMqttMessage(missionOrderMqttInfo);
    const mqttCallId = missionOrderMqttInfo.workOrderCode;
    const missionFacilitySerials = missionOrderMqttInfo.facilitySerials || [];
    // if (missionOrderType) {
    // const missionFromfacilityInfo = missionOrderType.facilityInfo;

    // if (missionFromfacilityInfo) {
    // let linkedEqpIds: number[] = [];
    // if (missionFromfacilityInfo?.type === 'in') {
    //   // 취소 후 미션 오더 처리
    //   // linkedEqpIds = missionFromfacilityInfo?.cancelLinkedEqpIds || [];
    // } else {
    //   // 회수 작업 미션 오더 처리
    //   // linkedEqpIds = missionFromfacilityInfo?.linkedEqpIds || [];
    // }

    const newFacilityArray = [];

    // if (linkedEqpIds && linkedEqpIds.length > 0) {
    if (missionFacilitySerials && missionFacilitySerials.length > 0) {
      // for (let i = 0, length = linkedEqpIds.length; i < length; i++) {
      for (let i = 0, length = missionFacilitySerials.length; i < length; i++) {
        // const linkedEqpId = linkedEqpIds[i];
        const linkedEqpSerial = missionFacilitySerials[i];
        // const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
        //   RedisKeys.InfoFacilityById,
        //   linkedEqpId.toString() || ''
        // );
        // newFacilityArray.push(linkedFacilityInfo);

        const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
          RedisKeys.InfoFacilityBySerial,
          linkedEqpSerial.toString() || ''
        );
        newFacilityArray.push(linkedFacilityInfo);
      }

      newFacilityArray.sort((a, b) => (b?.priority ?? 0) - (a?.priority ?? 0));

      for (let i = 0; i < newFacilityArray.length; i++) {
        // const linkedEqpId = linkedEqpIds[i];
        // const linkedFacilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
        //   RedisKeys.InfoFacilityById,
        //   linkedEqpId.toString() || ''
        // );
        const sortLinkedFacilityInfo = newFacilityArray[i];

        const targetCode = sortLinkedFacilityInfo?.serial;
        if (!targetCode) continue;
        const eqAutoValue = (await plcConnectUtil.getTagValue(targetCode, 'EQ_Auto')) as boolean;
        const callRequestValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Request')) as boolean;
        const callCountValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Count')) as number;
        const dockEqStatusValue = (await plcConnectUtil.getTagValue(targetCode, 'Dock_EQ_Status')) as boolean;
        const callResponseValue = (await plcConnectUtil.getTagValue(targetCode, 'Call_Response')) as boolean;
        // const dockDisableValue = (await plcConnectUtil.getTagValue(targetCode, 'Dock_Disable')) as boolean;
        const dockOutPermitValue = (await plcConnectUtil.getTagValue(targetCode, 'Dock_Out_Permit')) as boolean;
        const dockPermitValue = (await plcConnectUtil.getTagValue(targetCode, 'Dock_Permit')) as boolean;
        const dockRequestValue = (await plcConnectUtil.getTagValue(targetCode, 'Dock_Request')) as boolean;
        const CallTypeValue = await makeCallType(targetCode);
        // 콜 카운트 없어도 되나욤 ?
        if (
          eqAutoValue === true &&
          callRequestValue === true &&
          // callCountValue > 0 &&
          dockEqStatusValue === false &&
          callResponseValue === false &&
          // dockDisableValue === false &&
          dockOutPermitValue === false &&
          dockPermitValue === false &&
          dockRequestValue === false
          // &&
          // (sortLinkedFacilityInfo?.system === 'WMS' ||
          //   missionOrderMqttInfo.mode === 'manual' ||
          //   CallTypeValue === missionOrderMqttInfo.callType)
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
            // await plcConnectUtil.writeTagValue({
            //   targetFacility: missionFromfacilityInfo.serial || '',
            //   tagInfo: [{ tagName: 'Call_Response', value: true }],
            // });
            // call_response 작성
            await plcConnectUtil.writeTagValue({
              targetFacility: sortLinkedFacilityInfo.serial || '',
              tagInfo: [
                { tagName: 'Call_Response', value: true },
                { tagName: 'Call_Response_Count', value: String(callCountValue) }
              ],
            });

            await useCallTypeUtil().callTypeResponse(sortLinkedFacilityInfo.serial || '');
            redisUtil.hdel(RedisKeys.InfoMissionOrderByWorkOrderCode, mqttCallId);

            // 트래킹 로그에 To 도착지 변경
            // 물류 로그 저장
            if (mqttCallId.split('_').length !== 4) {
              const trackingLogSubject = 'MISSION_DECIDED';
              const trackingLogDetail = 'MISSION_DECIDED';
              const trackingLogState = 'PROCESSING';
              const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                callId: mqttCallId.split('$')[0] || '',
                subject: trackingLogSubject,
                detail: trackingLogDetail,
                state: trackingLogState,
                transferId: null,
                startFacility: null,
                destFacility: sortLinkedFacilityInfo.serial,
                assignedRobot: null,
                value: sortLinkedFacilityInfo.serial || '',
                description: `Mission Decided : ${sortLinkedFacilityInfo.serial}`,
                missionDestination: null,
              };

              await editTrackingLogRedis(trackingLogUpdateData, '', 'SUCCESS', 'ACS');
            }

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
    // }
    // }
  }
};
