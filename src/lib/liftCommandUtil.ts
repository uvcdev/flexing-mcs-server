import { RedisKeys, useRedisUtil } from './redisUtil';
import { TagValue } from './kepServerUtil';
import { logging, logToConsoleAndFile } from './logging';
import { MqttTopics, sendDockingAndLiftMqtt } from './mqttUtil';
import { editTrackingLogRedis } from './process/trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../models/common/trackingLog';
import { FacilityAttributesDeep } from '../models/operation/facility';
import { AmrAttributes } from '../models/common/amr';
import { usePlcConnectUtil } from './plcConnectUtil';

enum EXC_CLS {
  AUTO = 'AUTO',
  CHARGE = 'CHARGE',
  MANUAL = 'MANUAL',
}

export interface AcsLiftCommandRequestType {
  TX_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  ZONE_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  EXC_CLS: 'AUTO' | 'MANUAL' | 'CHARGE';
  WORKER_ID: string;
  REPORT_ID: string;
  INSTRUCTION_ID: string;
  RESOURCE_ID: string;
  REQUEST_COUNT: number;
  SERIAL_ID: string;
  CALL_TYPE: string;
  CALL_FACILITY: string;
  SAME_PIO_SERIAL: string;
  LIFT_COMMAND_TYPE: 'lift_up' | 'lift_down';
}

export interface AcsLiftCommandRequestResponse extends AcsLiftCommandRequestType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export interface AcsLiftCommandCompleteType {
  TX_ID: string;
  TYPE: 'IN' | 'OUT' | 'MISSION'; // 반출 OUT, 반입 IN , 미션 MISSION
  ZONE_ID: string;
  EQP_CALL_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  WORKER_ID: string;
  REPORT_ID: string;
  INSTRUCTION_ID: string;
  RESOURCE_ID: string;
  SERIAL_ID: string;
  SAME_PIO_SERIAL: string;
}

export interface AcsLiftCommandCompleteResponse extends AcsLiftCommandCompleteType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export type liftType = 'up' | 'down'; // up (unload), down (load)

export const useLiftCommandUtil = () => {
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();

  // 설비에서 차상 허가 응답이 왔을 때 처리하는 함수
  const liftStart = async (targetTagInfo: TagValue, liftCommandType: liftType) => {
    const facilitySerial = targetTagInfo.EQ_CODE;
    // 차상 작업에 대한 허가 응답이 온 경우
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `서버 처음 시작 했을 때 prevValue가 없는 경우`,
      });
      return;
    }

    // if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
    //   const validType = liftCommandType === 'down' ? 'Load Valid' : 'UnLoad Valid';
    //   // await plcConnectUtil.writeTagValue({
    //   //   targetFacility: facilitySerial,
    //   //   tagInfo: [
    //   //     { tagName: validType, value: false },
    //   //     // { tagName: 'Complete', value: false },
    //   //   ],
    //   // });
    //   logToConsoleAndFile(`설비가 ${targetTagInfo.TAG_NAME} 허가 0으로 내림`, 'green');
    //   logging.KEPWARE_DEBUG({
    //     action: 'TAG_READ',
    //     tag: targetTagInfo.TAG_NAME,
    //     value: JSON.parse(JSON.stringify(targetTagInfo)),
    //     message: `설비가 ${targetTagInfo.TAG_NAME} 허가 0으로 내림`,
    //   });
    //   return;
    // }
    try {
      const liftCommandRequestInfo = await redisUtil.hgetObject<AcsLiftCommandRequestType>(
        RedisKeys.LiftCommandRequestBySerialId,
        facilitySerial
      );
      if (!liftCommandRequestInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/liftCommandUtil.ts`,
          params: targetTagInfo,
          result: 'No liftCommand request record',
          error: 'No liftCommand request record',
        });
        return;
      }

      const liftCommandResponse: AcsLiftCommandRequestResponse = {
        ...liftCommandRequestInfo,
        RESULT: 'True',
        RESULT_MESSAGE: 'lift 가능',
      };

      redisUtil.hset(RedisKeys.LiftCommandRequestBySerialId, facilitySerial, JSON.stringify(liftCommandResponse));

      sendDockingAndLiftMqtt(MqttTopics.McsLiftCommandRequest, JSON.stringify(liftCommandResponse));

      // TODO: [트래킹로그]도킹허가 응답에 대한 트래킹로그 저장 (도킹허가 초록표시)
      /* todo: 251202 lift_command 트래킹로그 추가 필요 
      const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
        RedisKeys.InfoTrackingLogByCallId,
        liftCommandRequestInfo.CALL_ID
      );
      if (!infoTrackingLogByCallId) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: liftCommandRequestInfo,
          result: 'No infoTrackingLogByCallId record',
          error: 'No infoTrackingLogByCallId record',
        });
        return;
      }

      const trackingLogSubject =
        infoTrackingLogByCallId.startFacility === liftCommandRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogDetail =
        infoTrackingLogByCallId.startFacility === liftCommandRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogState = 'PROCESSING';
      const trackingLogProcessState = 'NORMAL';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: liftCommandRequestInfo.CALL_ID,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        transferId: null,
        startFacility: null,
        destFacility: null,
        assignedRobot: null,
        value: liftCommandRequestInfo.SERIAL_ID,
        description: `Call ID ${infoTrackingLogByCallId.callId} sent ${trackingLogSubject} to ACS(${liftCommandRequestInfo.SERIAL_ID})`,
        processState: trackingLogProcessState,
      };
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', liftCommandRequestInfo.SERIAL_ID);
      */
    } catch (error) {
      console.log('🚀 ~ liftStart ~ error:', error);
      logging.MQTT_ERROR({
        title: 'Lift Start',
        topic: MqttTopics.McsLiftCommandRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  };

  // acs에서 lift_command 요청이 왔을 때, 설비에 lift_command 요청하는 함수
  const sendAcsLiftCommandRequest = async (liftCommandParams: AcsLiftCommandRequestType) => {
    try {
      const facilitySerial = liftCommandParams.PORT_ID;
      const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
        RedisKeys.InfoFacilityBySerial,
        facilitySerial
      );
      if (facilityInfo) {
        redisUtil.hdel(RedisKeys.LiftCommandRequestBySerialId, facilitySerial);
        // 도킹요청 들어온 것에 대한 redis 저장
        const liftCommandParamsInfo = {
          TX_ID: '',
          ZONE_ID: '1F',
          EQP_CALL_ID: liftCommandParams.EQP_CALL_ID,
          PORT_ID: facilityInfo.serial,
          CALL_ID: liftCommandParams.CALL_ID,
          WORKER_ID: liftCommandParams.WORKER_ID,
          REPORT_ID: liftCommandParams.REPORT_ID,
          INSTRUCTION_ID: liftCommandParams.INSTRUCTION_ID,
          RESOURCE_ID: liftCommandParams.RESOURCE_ID,
          REQUEST_COUNT: liftCommandParams.REQUEST_COUNT,
          SERIAL_ID: facilityInfo.serial,
          CALL_TYPE: liftCommandParams.CALL_TYPE,
          CALL_FACILITY: liftCommandParams.CALL_FACILITY,
          SAME_PIO_SERIAL: liftCommandParams.SAME_PIO_SERIAL,
          LIFT_COMMAND_TYPE: liftCommandParams.LIFT_COMMAND_TYPE,
        };
        redisUtil.hset(RedisKeys.LiftCommandRequestBySerialId, facilitySerial, JSON.stringify(liftCommandParamsInfo));

        const liftCommandType = liftCommandParamsInfo.LIFT_COMMAND_TYPE === 'lift_up' ? 'UnLoad Valid' : 'Load Valid';
        await plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [{ tagName: liftCommandType, value: true }],
        });
      }
    } catch (error) {
      logging.ACTION_ERROR({
        filename: `src/lib/process/liftCommandUtil.ts`,
        params: liftCommandParams,
        result: 'fail liftCommand request',
        error: error,
      });
      throw error;
    }
    // 도킹 요청 후 x초가 지나면 재도킹 요청해야함, 여기서 시간을 시작하고 다른 함수에서 10초가 지나면 해당 요청을 취소하고 재요청해야함
    // const dockingRequestTime = new Date();
    // const dockingRequestTimeout = setTimeout(() => {
    //   // 도킹 요청에 대해 응답을 받았는지 확인하는 함수
    //   checkDockingResponse(params);
    // }, parseInt(process.env.DOCKING_RESPONSE_TIMEOUT_MS || '10000'));
  };

  // acs에서 lift_command 완료 응답 왔을 때
  const sendAcsLiftCommandComplete = async (liftCommandParams: AcsLiftCommandCompleteType) => {
    try {
      const facilitySerial = liftCommandParams.PORT_ID;
      console.log('🚀 ~ sendAcsLiftCommandComplete ~ facilitySerial:', facilitySerial);
      const facilityInfo = await useRedisUtil().hgetObject<FacilityAttributesDeep>(
        RedisKeys.InfoFacilityBySerial,
        facilitySerial
      );
      if (!facilityInfo) {
        logging.ACTION_ERROR({
          filename: 'liftCommandUtil.ts',
          error: 'redis에 info_facility 데이터가 없습니다.',
          params: null,
          result: false,
        });
        return;
      }
      redisUtil.hset(RedisKeys.LiftCommandCompleteBySerialId, facilitySerial, JSON.stringify(liftCommandParams));

      // Complete PLC 쓰기
      await plcConnectUtil.writeTagValue({
        targetFacility: facilitySerial,
        tagInfo: [{ tagName: 'Complete', value: true }],
      });
    } catch (error) {
      throw error;
    }
  };

  // valid 초기화 하는 함수
  const transSignalReset = async (targetTagInfo: TagValue) => {
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `리셋 요청했을 때 prevValue가 없는 경우`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 리셋 요청 0으로 내림
      logToConsoleAndFile(`설비가 리셋 요청 0으로 내림`, 'green');
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `설비가 리셋 요청 0으로 내림`,
      });
      return;
    }

    try {
      const facilitySerial = targetTagInfo.EQ_CODE;
      setTimeout(() => {
        plcConnectUtil.writeTagValue({
          targetFacility: facilitySerial,
          tagInfo: [
            { tagName: 'Load Valid', value: false },
            { tagName: 'UnLoad Valid', value: false },
            { tagName: 'Trans_Signal_Reset', value: false },],
        });
      }, 500);
    } catch (error) {
      console.log('🚀 ~ transSignalResetComplete ~ error:', error);
      logging.ACTION_ERROR({
        filename: `src/lib/process/liftCommandUtil.ts`,
        params: targetTagInfo,
        result: 'fail transSignalReset',
        error: error,
      });
      throw error;
    }
  };

  return {
    liftStart,
    sendAcsLiftCommandRequest,
    sendAcsLiftCommandComplete,
    transSignalReset,
  };
};
