import { FacilityAttributes } from '../../models/operation/facility';
import { RecentWorkOrderListByFacilitySerialAttributes } from '../../models/operation/workOrder';
import { useCallTypeUtil } from '../callTypeUtil';
import { logging } from '../logging';
import { usePlcConnectUtil } from '../plcConnectUtil';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import { MqttBranchInfoDataFromAcs } from './wmsBranch';

const redisUtil = useRedisUtil();

export const routeMissionOrderMqttMessage = async (messageJson: MqttBranchInfoDataFromAcs) => {
  const mode = messageJson.mode;

  // 자동인 경우 미션 오더 처리
  // if (mode === 'auto') {
  //   const facilitySerial = messageJson.workOrderCode.substring(0, 4);

  //   if (!facilitySerial || facilitySerial.length < 4) {
  //     logging.ACTION_ERROR({
  //       filename: `call.ts - ackCancelCallInfo`,
  //       error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
  //       params: null,
  //       result: false,
  //     });
  //     return;
  //   }

  //   const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  //   const facilityLinckedList = facilityInfo?.linkedEqpIds || [];

  //   // EQP에 생긴 미션오더
  //   if (facilityLinckedList && facilityLinckedList.length > 0) {
  //     for (let i = 0, length = facilityLinckedList.length; i < length; i++) {
  //       // 모든 설비 데이터가
  //     }
  //     return {
  //       state: 'EQP',
  //       facilityInfo: facilityInfo,
  //     };
  //   }
  //   // WMS에 생긴 미션오더
  //   else {
  //     return {
  //       state: 'WMS',
  //       facilityInfo: facilityInfo,
  //     };
  //   }
  // }
  // // manual 인 경우
  // else {
  //   const facilitySerial = messageJson.fromFacilitySerial;

  //   if (!facilitySerial || facilitySerial.length < 4) {
  //     logging.ACTION_ERROR({
  //       filename: `call.ts - ackCancelCallInfo`,
  //       error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
  //       params: null,
  //       result: false,
  //     });
  //     return;
  //   }

  //   const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  //   return {
  //     state: 'EQP',
  //     facilityInfo: facilityInfo,
  //   };
  // }
  const facilitySerial = messageJson.fromFacilitySerial;

  if (!facilitySerial || facilitySerial.length < 4) {
    logging.ACTION_ERROR({
      filename: `call.ts - ackCancelCallInfo`,
      error: `[facilitySerial] facilitySerial ${facilitySerial} is invalid`,
      params: null,
      result: false,
    });
    return;
  }

  const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(RedisKeys.InfoFacilityBySerial, facilitySerial);

  return {
    state: 'EQP',
    facilityInfo: facilityInfo,
  };
};

// EQP 도킹 실행 시키는 함수 ( 파트장님이 원하는 위치로 옮기셔도 될 것 같습니다 ! )
export const setEqpMissionOrder = (messageJson: MqttBranchInfoDataFromAcs) => {};

export const acsWorkOrderCancel = async (messageJson: any) => {
  const plcConnectUtil = usePlcConnectUtil();
  const workOrderMode = messageJson?.mode;
  const canceledWorkOrderCallId = messageJson?.code || '';
  const fromFacilitySerial = messageJson?.FromFacility?.serial || '';
  const toFacilitySerial = messageJson?.ToFacility?.serial || '';

  const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
    RedisKeys.InfoFacilityById,
    fromFacilitySerial
  );
  let alwaysOnFacility = fromFacilitySerial;
  let triggerFacility = toFacilitySerial;

  if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
    alwaysOnFacility = toFacilitySerial;
    triggerFacility = fromFacilitySerial;
  }

  const recentWorkOrderListByFacilitySerial = await redisUtil.hgetObject<RecentWorkOrderListByFacilitySerialAttributes>(
    RedisKeys.RecentWorkOrderListByFacilitySerial,
    triggerFacility
  );

  const workOrderList = recentWorkOrderListByFacilitySerial?.workOrderList || [];

  const selectedWorkOrderInfo = workOrderList.find((workOrderInfo) => workOrderInfo.callId === canceledWorkOrderCallId);
  const selectedWorkOrderInfoState = selectedWorkOrderInfo?.state;

  const isMbs = process.env.SITE && process.env.SITE === 'MBS';
  const multiCallResetTags = isMbs
    ? [
        { tagName: 'Call_Response_Multi_1', value: false },
        { tagName: 'Call_Response_Multi_2', value: false },
      ]
    : [];

  if (selectedWorkOrderInfoState !== 'toWorkOrder') {
    if (fromFacilitySerial) {
      await plcConnectUtil.writeTagValue({
        targetFacility: fromFacilitySerial,
        tagInfo: [
          { tagName: 'Call_Response', value: false },
          { tagName: 'Call_Robot_Assigned', value: false },
          { tagName: 'Call_Response_Count', value: '0' },
          { tagName: 'Dock_Request', value: false },
          ...multiCallResetTags,
          { tagName: 'Call_Cancel_Response', value: false },
        ],
      });
      await useCallTypeUtil().callTypeResponseReset(fromFacilitySerial);
    }
  }
  if (toFacilitySerial) {
    await plcConnectUtil.writeTagValue({
      targetFacility: toFacilitySerial,
      tagInfo: [
        { tagName: 'Call_Response', value: false },
        { tagName: 'Call_Robot_Assigned', value: false },
        { tagName: 'Call_Response_Count', value: '0' },
        { tagName: 'Dock_Request', value: false },
        ...multiCallResetTags,
        { tagName: 'Call_Cancel_Response', value: false },
      ],
    });
    await useCallTypeUtil().callTypeResponseReset(toFacilitySerial);
  }
};

// 태블릿으로 plc 없는 작업 취소할 때
export const acsWorkOrderCartCancel = async (messageJson: any) => {
  const plcConnectUtil = usePlcConnectUtil();
  const fromFacilitySerial = messageJson?.FromFacility?.serial || '';
  const toFacilitySerial = messageJson?.ToFacility?.serial || '';

  const fromFacilityInfo = await useRedisUtil().hgetObject<FacilityAttributes>(
    RedisKeys.InfoFacilityById,
    fromFacilitySerial
  );
  let alwaysOnFacility = fromFacilitySerial; // LS1O
  let triggerFacility = toFacilitySerial; // LE1I

  if (fromFacilityInfo?.linkedEqpIds && fromFacilityInfo?.linkedEqpIds?.length > 0) {
    alwaysOnFacility = toFacilitySerial; // LE1I
    triggerFacility = fromFacilitySerial; // LS1O
  }
  console.log('🚀 ~ alwaysOnFacility, triggerFacility', alwaysOnFacility, triggerFacility);
  await plcConnectUtil.writeTagValue({
    targetFacility: alwaysOnFacility,
    tagInfo: [
      { tagName: 'Call_Request', value: false },
      { tagName: 'Call_Response', value: false },
      { tagName: 'Call_Robot_Assigned', value: false },
      { tagName: 'Call_Response_Count', value: '0' },
    ],
  });
  // await plcConnectUtil.writeTagValue({
  //   targetFacility: triggerFacility,
  //   tagInfo: [
  //     { tagName: 'Call_Response', value: false },
  //     { tagName: 'Call_Robot_Assigned', value: false },
  //     { tagName: 'Call_Response_Count', value: '0' },
  //     { tagName: 'Dock_Request', value: false },
  //     { tagName: 'Call_Cancel_Response', value: false },
  //   ],
  // });

  await plcConnectUtil.writeTagValue({
    targetFacility: triggerFacility,
    tagInfo: [{ tagName: 'Trans_Signal_Reset', value: true }],
  });

  setTimeout(() => {
    plcConnectUtil.writeTagValue({
      targetFacility: triggerFacility,
      tagInfo: [{ tagName: 'Trans_Signal_Reset', value: false }],
    });
  }, 500);
};

// xGenRecovery cascade: from 설비만 PLC 리셋. to 설비는 cascade로 살아있어야 하므로 절대 건드리지 않음
export const acsWorkOrderCartRecovery = async (messageJson: any) => {
  const plcConnectUtil = usePlcConnectUtil();
  const fromFacilitySerial = messageJson?.FromFacility?.serial || '';
  if (!fromFacilitySerial) return;

  await plcConnectUtil.writeTagValue({
    targetFacility: fromFacilitySerial,
    tagInfo: [
      { tagName: 'Call_Request', value: false },
      { tagName: 'Call_Response', value: false },
      { tagName: 'Call_Robot_Assigned', value: false },
      { tagName: 'Call_Response_Count', value: '0' },
    ],
  });
};
