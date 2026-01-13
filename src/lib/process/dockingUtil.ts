import { AttributeIds, WriteValueOptions } from 'node-opcua-client';
import { RedisKeys, useRedisUtil } from '../redisUtil';
import opcuaUtil from '../opcuaUtil';
import { KepwareWriteParams } from '../../models/kepware/kepware';
import { parseAsciiToDecWord, TagValue, useKepServerUtil } from '../kepServerUtil';
import { logging, logToConsoleAndFile } from '../logging';
import { MqttTopics } from '../mqttUtil';
import { sendDockingAndLiftMqtt } from '../mqttUtil';
import { editTrackingLogRedis } from './trackingLog';
import { TrackingLogRedisAttributes, TrackingLogRedisUpdateParams } from '../../models/common/trackingLog';
import { FacilityAttributes, FacilityAttributesDeep } from '../../models/operation/facility';
import { AmrAttributes } from '../../models/common/amr';
import { useCallTypeUtil } from '../callTypeUtil';
import { usePlcConnectUtil } from '../plcConnectUtil';
import { timestampToDate } from '../usefullToolUtil';

enum EXC_CLS {
  AUTO = 'AUTO',
  CHARGE = 'CHARGE',
  MANUAL = 'MANUAL',
}

export interface AcsDockingRequestType {
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
}

export interface AcsDockingRequestResponse extends AcsDockingRequestType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export interface AcsDockingCompleteType {
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

export interface AcsDockingCompleteResponse extends AcsDockingCompleteType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export interface AcsDockingDetachType {
  TX_ID: string;
  ZONE_ID: string;
  PORT_ID: string;
  CALL_ID: string;
  WORKER_ID: string;
  RESOURCE_ID: string;
  SERIAL_ID: string;
}

export interface AcsDockingDetachResponse extends AcsDockingDetachType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export const useDockingUtil = () => {
  const redisUtil = useRedisUtil();
  const plcConnectUtil = usePlcConnectUtil();
  // 설비에서 도킹허가 응답이 왔을 때 처리하는 함수
  const dockingStart = async (targetTagInfo: TagValue) => {
    // 도킹 요청에 대한 허가 응답이 온 경우
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `서버 처음 시작 했을 때 prevValue가 없는 경우`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹허가 0으로 내림
      logToConsoleAndFile(`설비가 도킹허가 0으로 내림`, 'green');
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `설비가 도킹허가 0으로 내림`,
      });
      return;
    }
    try {
      // 설비추출해서 도킹요청 데이터 추출
      // const targetKey = targetTagInfo.TAGGROUP
      //   ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      //   : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const facilitySerialId = targetTagInfo.EQ_CODE;

      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(
        RedisKeys.DockingRequestBySerialId,
        facilitySerialId
      );
      if (!dockingRequestInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: targetTagInfo,
          result: 'No docking request record',
          error: 'No docking request record',
        });
        return;
      }

      const dockingResponse: AcsDockingRequestResponse = {
        ...dockingRequestInfo,
        RESULT: 'True',
        RESULT_MESSAGE: '도킹 가능',
      };

      redisUtil.hset(RedisKeys.DockingRequestBySerialId, facilitySerialId, JSON.stringify(dockingResponse));

      sendDockingAndLiftMqtt(MqttTopics.ImcsEqpDockingRequest, JSON.stringify(dockingResponse));

      // TODO: [트래킹로그]도킹허가 응답에 대한 트래킹로그 저장 (도킹허가 초록표시)
      const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
        RedisKeys.InfoTrackingLogByCallId,
        dockingRequestInfo.CALL_ID
      );
      if (!infoTrackingLogByCallId) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: dockingRequestInfo,
          result: 'No infoTrackingLogByCallId record',
          error: 'No infoTrackingLogByCallId record',
        });
        return;
      }

      const trackingLogSubject =
        infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogDetail =
        infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogState = 'PROCESSING';
      const trackingLogProcessState = 'NORMAL';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: dockingRequestInfo.CALL_ID,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        transferId: null,
        startFacility: null,
        destFacility: null,
        assignedRobot: null,
        value: dockingRequestInfo.SERIAL_ID,
        description: `Call ID ${infoTrackingLogByCallId.callId} sent ${trackingLogSubject} to ACS(${dockingRequestInfo.SERIAL_ID})`,
        processState: trackingLogProcessState,
      };
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', dockingRequestInfo.SERIAL_ID);
    } catch (error) {
      console.log('🚀 ~ dockingStart ~ error:', error);
      logging.MQTT_ERROR({
        title: 'Docking Start',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  };

  // 설비에서 도킹아웃허가 응답이 왔을 때 처리하는 함수
  const dockingOutStart = async (targetTagInfo: TagValue) => {
    // 도킹 요청에 대한 허가 응답이 온 경우
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `도킹아웃허가 응답이 왔을 때 prevValue가 없는 경우`,
      });
      return;
    }
    // if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
    //   // 설비가 도킹허가 0으로 내림
    //   logToConsoleAndFile(`설비가 도킹허가 0으로 내림`, "green");
    //   logging.KEPWARE_DEBUG({
    //     action: 'TAG_READ',
    //     tag: targetTagInfo.TAG_NAME,
    //     value: JSON.parse(JSON.stringify(targetTagInfo)),
    //     message: `설비가 도킹허가 0으로 내림`,
    //   });
    //   return;
    // }
    try {
      // 설비추출해서 도킹요청 데이터 추출
      // const targetKey = targetTagInfo.TAGGROUP
      //   ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
      //   : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const facilitySerialId = targetTagInfo.EQ_CODE;

      const dockingOutRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(
        RedisKeys.DockingOutRequestBySerialId,
        facilitySerialId
      );
      if (!dockingOutRequestInfo) {
        console.log('🚀 ~ dockingStart ~ dockingOutRequestInfo:', dockingOutRequestInfo);
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: targetTagInfo,
          result: 'No docking out request record',
          error: 'No docking out request record',
        });
        return;
      }

      const dockingOutResponse: AcsDockingRequestResponse = {
        ...dockingOutRequestInfo,
        RESULT: 'True',
        RESULT_MESSAGE: '도킹 아웃 가능',
      };

      redisUtil.hset(RedisKeys.DockingOutRequestBySerialId, facilitySerialId, JSON.stringify(dockingOutResponse));

      sendDockingAndLiftMqtt(MqttTopics.ImcsEqpDockingOutRequest, JSON.stringify(dockingOutResponse));

      // TODO: [트래킹로그]도킹허가 응답에 대한 트래킹로그 저장 (도킹허가 초록표시)
      /*
            const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(RedisKeys.InfoTrackingLogByCallId, dockingRequestInfo.EQP_CALL_ID);
            if (!infoTrackingLogByCallId) {
              logging.ACTION_ERROR({
                filename: `src/lib/process/dockingUtil.ts`,
                params: dockingRequestInfo,
                result: 'No infoTrackingLogByCallId record',
                error: 'No infoTrackingLogByCallId record',
              });
              return;
            }
      
            const trackingLogSubject = infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID ? 'FROM_DOCKING_PERMIT' : 'TO_DOCKING_PERMIT';
            const trackingLogDetail = infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID ? 'FROM_DOCKING_PERMIT' : 'TO_DOCKING_PERMIT';
            const trackingLogState = 'PROCESSING';
            const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
              callId: dockingRequestInfo.EQP_CALL_ID,
              subject: trackingLogSubject,
              detail: trackingLogDetail,
              state: trackingLogState,
              transferId: null,
              startFacility: null,
              destFacility: null,
              assignedRobot: dockingRequestInfo.WORKER_ID,
              value: dockingRequestInfo.SERIAL_ID,
              description: `Call ID ${dockingRequestInfo.EQP_CALL_ID} received ${trackingLogSubject} from ACS(${dockingRequestInfo.SERIAL_ID}) `
            }
            await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', dockingRequestInfo.SERIAL_ID);
            */
    } catch (error) {
      console.log('🚀 ~ dockingOutStart ~ error:', error);
      logging.MQTT_ERROR({
        title: 'Docking OUT Start',
        topic: MqttTopics.ImcsEqpDockingOutRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  };

  // 설비에서 도킹불가 응답이 왔을 때 처리하는 함수
  const dockingFailed = async (targetTagInfo: TagValue) => {
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `도킹불가 응답이 왔을 때 prevValue가 없는 경우`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹불가 0으로 내림
      logToConsoleAndFile(`설비가 도킹불가 0으로 내림`, 'green');
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `설비가 도킹불가 0으로 내림`,
      });
      return;
    }
    try {
      // 설비추출해서 도킹요청 redis데이터 추출
      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const facilitySerialId = targetTagInfo.EQ_CODE;
      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(
        RedisKeys.DockingRequestBySerialId,
        facilitySerialId
      );
      if (!dockingRequestInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: targetTagInfo,
          result: 'No docking request record',
          error: 'No docking request record',
        });
        return;
      }

      const dockingResponse: AcsDockingRequestResponse = {
        ...dockingRequestInfo,
        RESULT: 'False',
        RESULT_MESSAGE: '도킹 불가',
      };

      sendDockingAndLiftMqtt(MqttTopics.ImcsEqpDockingRequest, JSON.stringify(dockingResponse));

      redisUtil.hset(RedisKeys.DockingRequestBySerialId, facilitySerialId, JSON.stringify(dockingResponse));

      // Dock_AMR_Status PLC 쓰기
      await plcConnectUtil.writeTagValue({
        targetFacility: targetTagInfo.EQ_CODE,
        tagInfo: [{ tagName: 'Dock_AMR_Status', value: true }],
      });

      // TODO: [트래킹로그]도킹불가 응답에 대한 트래킹로그 저장 (도킹허가 빨강표시)
      const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
        RedisKeys.InfoTrackingLogByCallId,
        dockingRequestInfo.EQP_CALL_ID
      );
      if (!infoTrackingLogByCallId) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: dockingRequestInfo,
          result: 'No infoTrackingLogByCallId record',
          error: 'No infoTrackingLogByCallId record',
        });
        return;
      }

      const amrInfo = await redisUtil.hgetObject<AmrAttributes>(RedisKeys.InfoAmr, dockingRequestInfo.WORKER_ID);
      if (!amrInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: dockingRequestInfo,
          result: 'No amrInfo record',
          error: 'No amrInfo record',
        });
        return;
      }

      const trackingLogSubject =
        infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogDetail =
        infoTrackingLogByCallId.startFacility === dockingRequestInfo.SERIAL_ID
          ? 'FROM_DOCKING_PERMIT'
          : 'TO_DOCKING_PERMIT';
      const trackingLogState = 'ABORTED';
      const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
        callId: dockingRequestInfo.EQP_CALL_ID,
        subject: trackingLogSubject,
        detail: trackingLogDetail,
        state: trackingLogState,
        transferId: null,
        startFacility: null,
        destFacility: null,
        assignedRobot: amrInfo.name,
        value: dockingRequestInfo.SERIAL_ID,
        description: `Call ID ${dockingRequestInfo.EQP_CALL_ID} received ${trackingLogSubject} from ACS(${dockingRequestInfo.SERIAL_ID}) `,
      };
      await editTrackingLogRedis(trackingLogUpdateData, undefined, 'ABORTED', dockingRequestInfo.SERIAL_ID);
    } catch (error) {
      logging.MQTT_ERROR({
        title: 'Docking Failed',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  };

  // 설비에서 도킹완료 응답이 왔을 때 처리하는 함수
  const dockingComplete = async (targetTagInfo: TagValue) => {
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `도킹완료 응답이 왔을 때 prevValue가 없는 경우`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹완료 0으로 내림
      logToConsoleAndFile(`설비가 도킹완료 0으로 내림`, 'green');
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `설비가 도킹완료 0으로 내림`,
      });
      return;
    }

    try {
      // 어떤 설비인지 추출하고 그 설비의 도킹완료redis데이터 추출
      const targetKey = targetTagInfo.TAGGROUP
        ? `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}.${targetTagInfo.TAGGROUP}`
        : `${targetTagInfo.CHANNEL}.${targetTagInfo.DEVICE}`;

      const facilitySerialId = targetTagInfo.EQ_CODE;
      const dockingCompleteInfo = await redisUtil.hgetObject<AcsDockingCompleteResponse>(
        RedisKeys.DockingCompleteBySerialId,
        facilitySerialId
      );
      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestResponse>(
        RedisKeys.DockingRequestBySerialId,
        facilitySerialId
      );
      if (!dockingRequestInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: targetTagInfo,
          result: 'No docking request record',
          error: 'No docking request record',
        });
        return;
      }
      // 도킹불가에 의한 완료인 경우
      if (dockingRequestInfo.RESULT === 'False' && !dockingCompleteInfo) {
        // 도킹 완료 요청, 일반도킹 | 충전도킹 | 수동도킹 요청 내리기
        await plcConnectUtil.writeTagValue({
          targetFacility: dockingRequestInfo.SERIAL_ID,
          tagInfo: [
            { tagName: 'Dock_AMR_Status', value: false },
            { tagName: 'Dock_Request', value: false },
            { tagName: 'Dock_Request_Charge', value: false },
            { tagName: 'Dock_Request_Force', value: false },
          ],
        });
        // 콜 취소 유무
        const callCancelTagValue = (await plcConnectUtil.getTagValue(targetTagInfo.EQ_CODE, 'Call_Cancel')) as boolean;

        if (callCancelTagValue === true) {
          // 콜 취소로 인한 도킹 불허
          // 시퀀스 상으로 [콜 취소 완료 요청]을 응답해줘야 함
          // Call_Cancel_Response
          await plcConnectUtil.writeTagValue({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [{ tagName: 'Call_Cancel_Response', value: true }],
          });
        } else {
          // 알수 없는 이유로 도킹 불허
        }

        // 이후 설비도 도킹완료, 도킹불가 내림.

        return;
      }

      // 도킹허가에 의한 완료인 경우
      if (dockingRequestInfo.RESULT === 'True' && dockingCompleteInfo) {
        if (!dockingCompleteInfo) {
          logging.ACTION_ERROR({
            filename: `src/lib/process/dockingUtil.ts`,
            params: targetTagInfo,
            result: 'No docking complete record',
            error: 'No docking complete record',
          });
          return;
        }

        if (dockingRequestInfo.EXC_CLS === EXC_CLS.AUTO) {
          // 일반도킹요청 내리기
          await plcConnectUtil.writeTagValue({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [{ tagName: 'Dock_Request', value: false }],
          });
        } else if (dockingRequestInfo.EXC_CLS === EXC_CLS.CHARGE) {
          // 충전도킹요청 내리기
          await plcConnectUtil.writeTagValue({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [
              { tagName: 'Dock_Request_Charge', value: false },
              { tagName: 'Dock_Request', value: false },
            ],
          });
        } else if (dockingRequestInfo.EXC_CLS === EXC_CLS.MANUAL) {
          // 수동도킹요청 내리기
          await plcConnectUtil.writeTagValue({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [
              { tagName: 'Dock_Request_Force', value: false },
              { tagName: 'Dock_Request', value: false },
            ],
          });
        }

        dockingCompleteInfo.RESULT = 'True';
        dockingCompleteInfo.RESULT_MESSAGE = '도킹 완료';
        redisUtil.hset(RedisKeys.DockingCompleteBySerialId, facilitySerialId, JSON.stringify(dockingCompleteInfo));
        // 이후 설비도 도킹완료, 도킹허가 내림.
      }
    } catch (error) {
      console.log('🚀 ~ dockingComplete ~ error:', error);
      logging.MQTT_ERROR({
        title: 'Docking Complete',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
      throw error;
    }
  };

  // acs에서 도킹요청이 왔을 때, 설비에 도킹요청하는 함수
  const sendAcsDockingRequest = async (dockingParams: AcsDockingRequestType) => {
    // 시리얼로 들어오는 경우(BS12)
    const facilityInfoList = await redisUtil.hgetAllObject<FacilityAttributesDeep>(RedisKeys.InfoFacilityById);
    if (!facilityInfoList) {
      logging.ACTION_ERROR({
        filename: 'dockingUtil.ts',
        error: 'redis에 info_facility 데이터가 없습니다.',
        params: null,
        result: false,
      });
      return;
    }
    const usageFacilitylist = facilityInfoList.filter(
      (facility) => dockingParams.PORT_ID === facility.serial || dockingParams.SAME_PIO_SERIAL === facility.serial
    );
    if (usageFacilitylist && usageFacilitylist.length > 0) {
      for (const facility of usageFacilitylist) {
        const paramsSerial = facility.serial || '';
        redisUtil.hdel(RedisKeys.DockingRequestBySerialId, paramsSerial);
        redisUtil.hdel(RedisKeys.DockingCompleteBySerialId, paramsSerial);
        redisUtil.hdel(RedisKeys.DockingDetachBySerialId, paramsSerial);
        // 도킹요청 들어온 것에 대한 redis 저장
        const dockingParamsInfo = {
          TX_ID: '',
          TYPE: facility.type,
          ZONE_ID: '1F',
          EQP_CALL_ID: dockingParams.EQP_CALL_ID,
          PORT_ID: facility.serial,
          CALL_ID: dockingParams.CALL_ID,
          EXC_CLS: dockingParams.EXC_CLS,
          WORKER_ID: dockingParams.WORKER_ID,
          REPORT_ID: dockingParams.REPORT_ID,
          INSTRUCTION_ID: dockingParams.INSTRUCTION_ID,
          RESOURCE_ID: dockingParams.RESOURCE_ID,
          REQUEST_COUNT: dockingParams.REQUEST_COUNT,
          SERIAL_ID: facility.serial,
          CALL_TYPE: dockingParams.CALL_TYPE,
          CALL_FACILITY: dockingParams.CALL_FACILITY,
          SAME_PIO_SERIAL: dockingParams.SAME_PIO_SERIAL,
        };
        redisUtil.hset(RedisKeys.DockingRequestBySerialId, paramsSerial, JSON.stringify(dockingParamsInfo));

        // 도킹 재요청 전 데이터 초기화 처리
        try {
          await plcConnectUtil.writeTagValue({
            targetFacility: paramsSerial,
            tagInfo: [
              { tagName: 'Dock_Request', value: false },
              { tagName: 'Dock_Request_Charge', value: false },
              { tagName: 'Dock_Request_Force', value: false },
              { tagName: 'Dock_AMR_Status', value: false },
              { tagName: 'Trans_Signal_Reset', value: true },
            ],
          });
          logToConsoleAndFile(`Successfully initialized before retry docking request`, 'green');
        } catch (error) {
          logToConsoleAndFile(`Error initializing before retry docking request: ${error}`, 'red');
          // 로깅
          logging.ACTION_ERROR({
            filename: `src/lib/process/dockingUtil.ts`,
            params: dockingParamsInfo,
            result: 'fail docking request',
            error: error,
          });
          throw error;
        }
        switch (dockingParams.EXC_CLS) {
          case EXC_CLS.AUTO: //일반도킹
            await plcConnectUtil.writeTagValue({
              targetFacility: paramsSerial,
              tagInfo: [{ tagName: 'Dock_Request', value: true }],
            });
            if (dockingParams.PORT_ID === paramsSerial) {
              // [트래킹로그]도킹요청 들어온 것에 대한 트래킹로그 저장
              const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
                RedisKeys.InfoTrackingLogByCallId,
                dockingParams.CALL_ID
              );
              if (!infoTrackingLogByCallId) {
                logging.ACTION_ERROR({
                  filename: `src/lib/process/dockingUtil.ts`,
                  params: dockingParams,
                  result: 'No infoTrackingLogByCallId record',
                  error: 'No infoTrackingLogByCallId record',
                });
                break;
              }
              const trackingLogSubject =
                infoTrackingLogByCallId.startFacility === paramsSerial ? 'FROM_DOCKING_REQ' : 'TO_DOCKING_REQ';
              const trackingLogDetail =
                infoTrackingLogByCallId.startFacility === paramsSerial ? 'FROM_DOCKING_REQ' : 'TO_DOCKING_REQ';
              const trackingLogState = 'PROCESSING';
              const trackingLogProcessState = 'NORMAL';
              const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
                callId: infoTrackingLogByCallId.callId,
                subject: trackingLogSubject,
                detail: trackingLogDetail,
                state: trackingLogState,
                transferId: null,
                startFacility: null,
                destFacility: null,
                assignedRobot: null,
                value: paramsSerial,
                description: `Call ID ${infoTrackingLogByCallId.callId} received ${trackingLogSubject} from ACS(${paramsSerial}) `,
                processState: trackingLogProcessState,
              };
              await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', paramsSerial);
            }

            break;

          case EXC_CLS.CHARGE: //충전도킹
            // 충전 도킹 요청 PLC 쓰기
            // 도킹 요청 ID/기종 확인 안함

            // await plcConnectUtil.writeTagValue({
            //   targetFacility: paramsSerial,
            //   tagInfo: [
            //     { tagName: 'Dock_Signal_Reset', value: true },
            //   ],
            // });
            // setTimeout(() => {
            //   plcConnectUtil.writeTagValue({
            //     targetFacility: paramsSerial,
            //     tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
            //   });
            // }, 500);
            await plcConnectUtil.writeTagValue({
              targetFacility: paramsSerial,
              tagInfo: [{ tagName: 'Dock_Request', value: true }],
            });
            break;

          case EXC_CLS.MANUAL: //수동도킹
            // TODO: 수동 도킹 기종(callType) 확인(ACS에서 보내줘야함)
            // callType이 있다면 ? 없다면 ?
            // todo: 250604 Dock_EQ_Status 값 내리기 위해 드라이런용 reset 추가
            await plcConnectUtil.writeTagValue({
              targetFacility: paramsSerial,
              tagInfo: [
                { tagName: 'Trans_Signal_Reset', value: true },
                { tagName: 'Dock_Signal_Reset', value: true },
                { tagName: 'Dock_Request', value: true },
              ],
            });

            setTimeout(() => {
              plcConnectUtil.writeTagValue({
                targetFacility: paramsSerial,
                tagInfo: [
                  { tagName: 'Dock_Signal_Reset', value: false },
                  { tagName: 'Trans_Signal_Reset', value: false },
                ],
              });
            }, 500);

            break;
        }
      }
    }

    // 도킹 요청 후 x초가 지나면 재도킹 요청해야함, 여기서 시간을 시작하고 다른 함수에서 10초가 지나면 해당 요청을 취소하고 재요청해야함
    // const dockingRequestTime = new Date();
    // const dockingRequestTimeout = setTimeout(() => {
    //   // 도킹 요청에 대해 응답을 받았는지 확인하는 함수
    //   checkDockingResponse(params);
    // }, parseInt(process.env.DOCKING_RESPONSE_TIMEOUT_MS || '10000'));
  };

  // acs에서 도킹아웃요청이 왔을 때, 설비에 도킹아웃요청하는 함수
  const sendAcsDockingOutRequest = async (dockingParams: AcsDockingRequestType) => {
    try {
      const facilityInfoList = await redisUtil.hgetAllObject<FacilityAttributesDeep>(RedisKeys.InfoFacilityById);
      if (!facilityInfoList) {
        logging.ACTION_ERROR({
          filename: 'dockingUtil.ts',
          error: 'redis에 info_facility 데이터가 없습니다.',
          params: null,
          result: false,
        });
        return;
      }
      const usageFacilitylist = facilityInfoList.filter(
        (facility) => dockingParams.PORT_ID === facility.serial || dockingParams.SAME_PIO_SERIAL === facility.serial
      );
      if (usageFacilitylist && usageFacilitylist.length > 0) {
        for (const facility of usageFacilitylist) {
          const paramsSerial = facility.serial || '';
          // const dockOutPermitValue = (await plcConnectUtil.getTagValue(paramsSerial, 'Dock_Out_Permit')) as boolean;
          // // dock_out_permit 이 켜있으면 그냥 허가
          // if (dockOutPermitValue === true) {
          //   const timezoneValue = process.env.TIME_ZONE || '';
          //   const tag = useKepServerUtil().getTargetTag(paramsSerial, 'Dock_Out_Permit');
          //   const targetTagInfo: TagValue = {
          //     value: true,
          //     prevValue: '',
          //     timestamp: Date.now(),
          //     createTime: timestampToDate(timezoneValue),
          //     CHANNEL: tag?.CHANNEL || '',
          //     DEVICE: paramsSerial,
          //     TAGGROUP: '',
          //     TAG_NAME: tag?.TAG_NAME || '',
          //     DATA_TYPE: 'Boolean',
          //     INPUT_TYPE: 'Bool',
          //     NODE_ID: tag?.NODE_ID || '',
          //     EQ_CODE: paramsSerial,
          //     reRegister: 'Dock_Out_Permit',
          //   };
          //   await useDockingUtil().dockingOutStart(targetTagInfo);
          // } else {
          // 도킹 아웃 요청 들어온 것에 대한 redis 저장
          const dockingParamsInfo = {
            TX_ID: '',
            TYPE: facility.type,
            ZONE_ID: '1F',
            EQP_CALL_ID: dockingParams.EQP_CALL_ID,
            PORT_ID: facility.serial,
            CALL_ID: dockingParams.CALL_ID,
            EXC_CLS: dockingParams.EXC_CLS,
            WORKER_ID: dockingParams.WORKER_ID,
            REPORT_ID: dockingParams.REPORT_ID,
            INSTRUCTION_ID: dockingParams.INSTRUCTION_ID,
            RESOURCE_ID: dockingParams.RESOURCE_ID,
            REQUEST_COUNT: dockingParams.REQUEST_COUNT,
            SERIAL_ID: facility.serial,
            CALL_TYPE: dockingParams.CALL_TYPE,
            CALL_FACILITY: dockingParams.CALL_FACILITY,
            SAME_PIO_SERIAL: dockingParams.SAME_PIO_SERIAL,
          };
          redisUtil.hset(RedisKeys.DockingOutRequestBySerialId, paramsSerial, JSON.stringify(dockingParamsInfo));

          await plcConnectUtil.writeTagValue({
            targetFacility: paramsSerial || '',
            tagInfo: [{ tagName: 'Dock_Out_Request', value: false }],
          });
          // await plcConnectUtil.writeTagValue({
          //   targetFacility: paramsSerial || '',
          //   tagInfo: [{ tagName: 'Dock_Signal_Reset', value: true }],
          // });
          setTimeout(() => {
            plcConnectUtil.writeTagValue({
              targetFacility: paramsSerial || '',
              tagInfo: [{ tagName: 'Dock_Out_Request', value: true }],
            });
            // plcConnectUtil.writeTagValue({
            //   targetFacility: paramsSerial || '',
            //   tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
            // });
          }, 500);
        }
      }
      // }
    } catch (error) {
      throw error;
    }
  };

  // acs에서 도킹완료 응답이 왔을 때, 설비에 도킹완료 응답하는 함수
  const sendAcsDockingComplete = async (dockingParams: AcsDockingCompleteType) => {
    try {
      const facilityInfoList = await redisUtil.hgetAllObject<FacilityAttributesDeep>(RedisKeys.InfoFacilityById);
      if (!facilityInfoList) {
        logging.ACTION_ERROR({
          filename: 'dockingUtil.ts',
          error: 'redis에 info_facility 데이터가 없습니다.',
          params: null,
          result: false,
        });
        return;
      }
      // if (dockingParams.PORT_ID === 'BS11') {
      //   dockingParams.SAME_PIO_SERIAL = 'BS12';
      // } else if (dockingParams.PORT_ID === 'BS12') {
      //   dockingParams.SAME_PIO_SERIAL = 'BS11';
      // }
      const usageFacilitylist = facilityInfoList.filter(
        (facility) => dockingParams.PORT_ID === facility.serial || dockingParams.SAME_PIO_SERIAL === facility.serial
      );
      if (usageFacilitylist && usageFacilitylist.length > 0) {
        for (const facility of usageFacilitylist) {
          const paramsSerial = facility.serial || '';

          redisUtil.hset(RedisKeys.DockingCompleteBySerialId, paramsSerial, JSON.stringify(dockingParams));

          // Dock_AMR_Status PLC 쓰기
          await plcConnectUtil.writeTagValue({
            targetFacility: paramsSerial,
            tagInfo: [{ tagName: 'Dock_AMR_Status', value: true }],
          });

          // [트래킹로그]도킹완료에 대한 트래킹로그 저장
          if (dockingParams.PORT_ID === paramsSerial) {
            const infoTrackingLogByCallId = await redisUtil.hgetObject<TrackingLogRedisAttributes>(
              RedisKeys.InfoTrackingLogByCallId,
              dockingParams.CALL_ID
            );
            if (!infoTrackingLogByCallId) {
              logging.ACTION_ERROR({
                filename: `src/lib/process/dockingUtil.ts`,
                params: dockingParams,
                result: 'No infoTrackingLogByCallId record',
                error: 'No infoTrackingLogByCallId record',
              });
              return;
            }

            const trackingLogSubject =
              infoTrackingLogByCallId.startFacility === dockingParams.PORT_ID
                ? 'FROM_DOCKING_COMPLETED'
                : 'TO_DOCKING_COMPLETED';
            const trackingLogDetail =
              infoTrackingLogByCallId.startFacility === dockingParams.PORT_ID
                ? 'FROM_DOCKING_COMPLETED'
                : 'TO_DOCKING_COMPLETED';
            const trackingLogState = 'PROCESSING';
            const trackingLogProcessState = 'NORMAL';
            const trackingLogUpdateData: TrackingLogRedisUpdateParams = {
              callId: dockingParams.CALL_ID,
              subject: trackingLogSubject,
              detail: trackingLogDetail,
              state: trackingLogState,
              transferId: null,
              startFacility: null,
              destFacility: null,
              assignedRobot: null,
              value: dockingParams.PORT_ID,
              description: `Call ID ${dockingParams.CALL_ID} received ${trackingLogSubject} from ACS(${dockingParams.PORT_ID})`,
              processState: trackingLogProcessState,
            };
            await editTrackingLogRedis(trackingLogUpdateData, undefined, 'SUCCESS', dockingParams.PORT_ID);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  };

  // acs에서 도킹진출완료 응답이 왔을 때, 설비에 도킹진출완료 응답하는 함수
  const sendAcsDockingDetach = async (params: AcsDockingDetachType) => {
    try {
      params.SERIAL_ID = params.PORT_ID;
      const dockingResponse: AcsDockingDetachResponse = {
        ...params,
        RESULT: 'True',
        RESULT_MESSAGE: '도킹 진출완료',
      };
      redisUtil.hset(RedisKeys.DockingDetachBySerialId, params.SERIAL_ID, JSON.stringify(dockingResponse));

      await plcConnectUtil.writeTagValue({
        targetFacility: params.SERIAL_ID,
        tagInfo: [
          { tagName: 'Dock_Signal_Reset', value: true },
          { tagName: 'Dock_AMR_Status', value: false },
          { tagName: 'Dock_Request', value: false },
          { tagName: 'Dock_Out_Request', value: false },
        ],
      });
      setTimeout(() => {
        plcConnectUtil.writeTagValue({
          targetFacility: params.SERIAL_ID,
          tagInfo: [{ tagName: 'Dock_Signal_Reset', value: false }],
        });
      }, 500);
      // 도킹 아웃 요청 켜 있으면 꺼주고 레디스 삭제
      const dockingOutRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(
        RedisKeys.DockingOutRequestBySerialId,
        params.SERIAL_ID
      );
      if (!dockingOutRequestInfo) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: params,
          result: 'No dockingOutRequestInfo record',
          error: 'No dockingOutRequestInfo record',
        });
        return;
      }

      const dockOutRequestValue = (await plcConnectUtil.getTagValue(params.SERIAL_ID, 'Dock_Out_Request')) as boolean;
      if (dockingOutRequestInfo && dockOutRequestValue === true) {
        await plcConnectUtil.writeTagValue({
          targetFacility: params.SERIAL_ID || '',
          tagInfo: [{ tagName: 'Dock_Out_Request', value: false }],
        });
        redisUtil.hdel(RedisKeys.DockingOutRequestBySerialId, params.SERIAL_ID);
      }
    } catch (error) {
      throw error;
    }
  };

  // 도킹 요청에 대해 응답을 받았는지 확인하는 함수
  const checkDockingResponse = async (params: AcsDockingRequestType) => {
    const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestResponse>(
      RedisKeys.DockingRequestBySerialId,
      params.SERIAL_ID
    );
    // 초기화, 재시도 로직으로 인해 도킹요청 데이터가 없어진 경우, 없을 수 있음(현재까진 무조건 오류가 아닐 수 있음.)
    if (!dockingRequestInfo) {
      logging.ACTION_ERROR({
        filename: `src/lib/process/dockingUtil.ts, checkDockingResponse`,
        params: params,
        result: 'No docking request record',
        error: 'No docking request record',
      });
      return;
    }
    if (!dockingRequestInfo.RESULT) {
      // 도킹 요청에 대해 응답을 받지 못했으므로 도킹 요청을 취소하고 재요청해야함
      params.REQUEST_COUNT = params.REQUEST_COUNT + 1;
      // TODO: 재시도 알람 발생
      sendAcsDockingRequest(params);
    }
  };

  return {
    sendAcsDockingRequest,
    sendAcsDockingOutRequest,
    dockingStart,
    dockingOutStart,
    dockingFailed,
    dockingComplete,
    sendAcsDockingComplete,
    sendAcsDockingDetach,
  };
};
