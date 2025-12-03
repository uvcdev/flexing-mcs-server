import { FacilityAttributes } from '../../models/operation/facility';
import { useKepServerUtil } from '../kepServerUtil';
import { logging } from '../logging';
import opcuaUtil from '../opcuaUtil';
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
export const setEqpMissionOrder = (messageJson: MqttBranchInfoDataFromAcs) => { };

// 데이터 보정 함수
export const fixEqpData = async () => {
  const plcConnectUtil = usePlcConnectUtil();
  const facilityList = (await redisUtil.hgetAllObject<FacilityAttributes>(RedisKeys.InfoFacilityById)) || [];

  // Call_Cancel_Response 데이터 보정
  for (let i = 0; i < facilityList.length; i++) {
    const facilityInfo = facilityList[i];
    const facilitySerial = facilityInfo.serial;

    if (!facilitySerial) {
      continue;
    }

    const callCancelRequestValue = (await plcConnectUtil.getTagValue(facilitySerial, 'Call_Cancel_Request')) as boolean;
    const callCancelResponseValue = (await plcConnectUtil.getTagValue(
      facilitySerial,
      'Call_Cancel_Response'
    )) as boolean;

    if (callCancelRequestValue === false && callCancelResponseValue === true) {
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Call_Cancel_Response', value: false }],
      });
    }
  }
};
