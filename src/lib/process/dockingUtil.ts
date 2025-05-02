import { AttributeIds, WriteValueOptions } from "node-opcua-client";
import { RedisKeys, useRedisUtil } from "../redisUtil";
import opcuaUtil from "../opcuaUtil";
import { KepwareWriteParams } from "../../models/kepware/kepware";
import { TagValue, useKepServerUtil } from "../kepServerUtil";
import { logging, logToConsoleAndFile } from "../logging";
import { MqttTopics } from "../mqttUtil";
import { sendDockingMqtt } from "../mqttUtil";

enum EXC_CLS {
  AUTO = "AUTO",
  CHARGE = "CHARGE",
  MANUAL = "MANUAL",
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
};

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
};

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
};

export interface AcsDockingDetachResponse extends AcsDockingDetachType {
  RESULT: string;
  RESULT_MESSAGE: string;
}

export const useDockingUtil = () => {
  const redisUtil = useRedisUtil();

  // 설비에서 도킹허가 응답이 왔을 때 처리하는 함수
  const dockingStart = async (targetTagInfo: TagValue) => {
    console.log("🚀 ~ dockingStart ~ targetTagInfo:", targetTagInfo)
    // 도킹 요청에 대한 허가 응답이 온 경우
    // TODO: [트래킹로그]도킹허가 응답에 대한 트래킹로그 저장 (도킹허가 초록표시)
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `Error reading value from kepServerUtil.readTagsValue`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹허가 0으로 내림
      logToConsoleAndFile(`설비가 도킹허가 0으로 내림`, "green");
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

      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(RedisKeys.DockingRequestBySerialId, facilitySerialId);
      if (!dockingRequestInfo) {
        console.log("🚀 ~ dockingStart ~ dockingRequestInfo:", dockingRequestInfo)
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

      sendDockingMqtt(MqttTopics.ImcsEqpDockingRequest, JSON.stringify(dockingResponse));
    } catch (error) {
      console.log("🚀 ~ dockingStart ~ error:", error)
      logging.MQTT_ERROR({
        title: 'Docking Start',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
    }

  }

  // 설비에서 도킹불가 응답이 왔을 때 처리하는 함수
  const dockingFailed = async (targetTagInfo: TagValue) => {
    console.log("🚀 ~ dockingFailed ~ targetTagInfo:", targetTagInfo)
    // TODO: [트래킹로그]도킹불가 응답에 대한 트래킹로그 저장 (도킹허가 빨강표시)
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `Error reading value from kepServerUtil.readTagsValue`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹불가 0으로 내림
      logToConsoleAndFile(`설비가 도킹불가 0으로 내림`, "green");
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
      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestType>(RedisKeys.DockingRequestBySerialId, facilitySerialId);
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

      sendDockingMqtt(MqttTopics.ImcsEqpDockingRequest, JSON.stringify(dockingResponse));

      redisUtil.hset(RedisKeys.DockingRequestBySerialId, facilitySerialId, JSON.stringify(dockingResponse));

      // Dock_AMR_Status PLC 쓰기 
      const dockAMRStatus = opcuaUtil.tagMap.get(`${targetKey}.Dock_AMR_Status`);
      if (!dockAMRStatus) {
        logging.ACTION_ERROR({
          filename: `src/lib/process/dockingUtil.ts`,
          params: targetTagInfo,
          result: 'No dockAMRStatus record',
          error: 'No dockAMRStatus record',
        });
        return;
      }
      await useKepServerUtil().writeTagsValue([
        {
          nodeId: dockAMRStatus.NODE_ID,
          attributeId: AttributeIds.Value,
          value: {
            value: {
              dataType: dockAMRStatus.DATA_TYPE,
              value: true
            }
          }
        }
      ]);

    } catch (error) {
      console.log("🚀 ~ dockingFailed ~ error:", error)
      logging.MQTT_ERROR({
        title: 'Docking Failed',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  }

  // 설비에서 도킹완료 응답이 왔을 때 처리하는 함수
  const dockingComplete = async (targetTagInfo: TagValue) => {
    console.log("🚀 ~ dockingComplete ~ targetTagInfo:", targetTagInfo)
    if (targetTagInfo.value !== true && !targetTagInfo.prevValue) {
      logging.KEPWARE_DEBUG({
        action: 'TAG_READ',
        tag: targetTagInfo.TAG_NAME,
        value: JSON.parse(JSON.stringify(targetTagInfo)),
        message: `Error reading value from kepServerUtil.readTagsValue`,
      });
      return;
    }
    if (targetTagInfo.value === false && targetTagInfo.prevValue === true) {
      // 설비가 도킹완료 0으로 내림
      logToConsoleAndFile(`설비가 도킹완료 0으로 내림`, "green");
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
      const dockingCompleteInfo = await redisUtil.hgetObject<AcsDockingCompleteResponse>(RedisKeys.DockingCompleteBySerialId, facilitySerialId);
      const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestResponse>(RedisKeys.DockingRequestBySerialId, facilitySerialId);
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
        const dockingFailedCompleteTags = await useKepServerUtil().makeWriteDatas({
          targetFacility: dockingRequestInfo.RESOURCE_ID,
          tagInfo: [
            {
              tagName: 'Dock_AMR_Status',
              value: false
            },
            {
              tagName: 'Dock_Request',
              value: false
            },
            {
              tagName: 'Dock_Request_Charge',
              value: false
            },
            {
              tagName: 'Dock_Request_Force',
              value: false
            }
          ]
        });
        await useKepServerUtil().writeTagsValue(dockingFailedCompleteTags);

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
          const dockingRequestTag = await useKepServerUtil().makeWriteDatas({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [
              {
                tagName: 'Dock_Request',
                value: false
              }
            ]
          });
          await useKepServerUtil().writeTagsValue(dockingRequestTag);
        } else if (dockingRequestInfo.EXC_CLS === EXC_CLS.CHARGE) {
          // 충전도킹요청 내리기
          const dockingRequestChargeTag = await useKepServerUtil().makeWriteDatas({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [
              {
                tagName: 'Dock_Request_Charge',
                value: false
              }
            ]
          });
          await useKepServerUtil().writeTagsValue(dockingRequestChargeTag);
        } else if (dockingRequestInfo.EXC_CLS === EXC_CLS.MANUAL) {
          // 수동도킹요청 내리기
          const dockingRequestForceTag = await useKepServerUtil().makeWriteDatas({
            targetFacility: dockingRequestInfo.SERIAL_ID,
            tagInfo: [
              {
                tagName: 'Dock_Request_Force',
                value: false
              }
            ]
          });
          await useKepServerUtil().writeTagsValue(dockingRequestForceTag);
        }

        dockingCompleteInfo.RESULT = 'True';
        dockingCompleteInfo.RESULT_MESSAGE = '도킹 완료';
        redisUtil.hset(RedisKeys.DockingCompleteBySerialId, facilitySerialId, JSON.stringify(dockingCompleteInfo));
        // 이후 설비도 도킹완료, 도킹허가 내림.
      }
    } catch (error) {
      console.log("🚀 ~ dockingComplete ~ error:", error)
      logging.MQTT_ERROR({
        title: 'Docking Complete',
        topic: MqttTopics.ImcsEqpDockingRequest,
        message: targetTagInfo,
        error: error,
      });
    }
  }

  // acs에서 도킹요청이 왔을 때, 설비에 도킹요청하는 함수
  const sendAcsDockingRequest = async (params: AcsDockingRequestType) => {
    redisUtil.hdel(RedisKeys.DockingRequestBySerialId, params.SERIAL_ID);
    redisUtil.hdel(RedisKeys.DockingCompleteBySerialId, params.SERIAL_ID);
    redisUtil.hdel(RedisKeys.DockingDetachBySerialId, params.SERIAL_ID);
    // 도킹요청 들어온 것에 대한 redis 저장
    redisUtil.hset(RedisKeys.DockingRequestBySerialId, params.SERIAL_ID, JSON.stringify(params));

    // 도킹 재요청 전 데이터 초기화 처리
    try {
      const writeDatas = await useKepServerUtil().makeWriteDatas({
        targetFacility: params.SERIAL_ID,
        tagInfo: [
          {
            tagName: 'Dock_Request',
            value: false
          },
          {
            tagName: 'Dock_Request_Charge',
            value: false
          },
          {
            tagName: 'Dock_Request_Force',
            value: false
          },
          {
            tagName: 'Dock_AMR_Status',
            value: false
          },
          // TODO: 도킹관련설비 신호 리셋 필요
        ]
      });
      const result = await useKepServerUtil().writeTagsValue(writeDatas);
      logToConsoleAndFile(`Successfully initialized before retry docking request: ${result}`, "green");
    } catch (error) {
      logToConsoleAndFile(`Error initializing before retry docking request: ${error}`, "red");
      // 로깅
      logging.ACTION_ERROR({
        filename: `src/lib/process/dockingUtil.ts`,
        params: params,
        result: 'fail docking request',
        error: error,
      });
    }

    // TODO: 하위 로직에서 도킹요청을 한다.
    // 일반 도킹요청은 callId/callType을 보고 설비가 알아서 허가응답을 해줄 것이다.
    // 수동 도킹요청은 아직 모르므로 설비에서 불허해주는 이유를 보고 처리해야한다.
    // 충전 도킹요청은 callId/callType을 안보기 때문에 허가가 날 것이다.
    // 테스트 시 아래 요청에 대해 설비가 허가를 해줬다고 본다.
    switch (params.EXC_CLS) {
      case EXC_CLS.AUTO:  //일반도킹
        // TODO: [트래킹로그]도킹요청 들어온 것에 대한 트래킹로그 저장
        // TODO: 도킹 요청 ID/기종 확인(ID/기종은 콜 호출응답 시 기록되어있어야함)
        // const CallId = params.CALL_ID;
        // const CallIdRedisInfo = await redisUtil.hgetObject<CallIdRedisInfo>(RedisKeys.CallIdRedisInfo, CallId);
        // const CallType = CallIdRedisInfo.Call_Type;
        // const callTypeResponseTag = await useKepServerUtil().makeWriteDatas({
        //   targetFacility: params.SERIAL_ID,
        //   tagInfo: [
        //     {
        //       tagName: 'Call_Type_Response_01',
        //       value: params.CALL_TYPE
        //     }
        //   ]
        // });
        // await useKepServerUtil().writeTagsValue(callTypeResponseTag);
        // 일반 도킹 요청 PLC 쓰기
        const dockingRequestTag = await useKepServerUtil().makeWriteDatas({
          targetFacility: params.SERIAL_ID,
          tagInfo: [
            {
              tagName: 'Dock_Request',
              value: true
            }
          ]
        });
        console.log("🚀 ~ dockingRequestTag ~ dockingRequestTag:", dockingRequestTag)
        await useKepServerUtil().writeTagsValue(dockingRequestTag);
        break;

      case EXC_CLS.CHARGE:  //충전도킹
        // 충전 도킹 요청 PLC 쓰기
        // 도킹 요청 ID/기종 확인 안함
        const dockingChargeRequestTag = await useKepServerUtil().makeWriteDatas({
          targetFacility: params.SERIAL_ID,
          tagInfo: [
            {
              tagName: 'Dock_Request_Charge',
              value: true
            }
          ]
        });
        await useKepServerUtil().writeTagsValue(dockingChargeRequestTag);
        break;

      case EXC_CLS.MANUAL:  //수동도킹
        // TODO: 수동 도킹 기종(callType) 확인(ACS에서 보내줘야함)
        // callType이 있다면 ? 없다면 ?
        // 수동 도킹 요청 PLC 쓰기
        const dockingManualRequestTag = await useKepServerUtil().makeWriteDatas({
          targetFacility: params.SERIAL_ID,
          tagInfo: [
            {
              tagName: 'Dock_Request_Force',
              value: true
            }
          ]
        });
        await useKepServerUtil().writeTagsValue(dockingManualRequestTag);
        break;
    }

    // 도킹 요청 후 x초가 지나면 재도킹 요청해야함, 여기서 시간을 시작하고 다른 함수에서 10초가 지나면 해당 요청을 취소하고 재요청해야함
    const dockingRequestTime = new Date();
    const dockingRequestTimeout = setTimeout(() => {
      // 도킹 요청에 대해 응답을 받았는지 확인하는 함수
      checkDockingResponse(params);
    }, parseInt(process.env.DOCKING_RESPONSE_TIMEOUT_MS || '10000'));
  };

  // acs에서 도킹완료 응답이 왔을 때, 설비에 도킹완료 응답하는 함수
  const sendAcsDockingComplete = async (params: AcsDockingCompleteType) => {
    console.log("🚀 ~ sendAcsDockingComplete ~ params:", params)

    redisUtil.hset(RedisKeys.DockingCompleteBySerialId, params.SERIAL_ID, JSON.stringify(params));

    // TODO: [트래킹로그]도킹완료에 대한 트래킹로그 저장

    // Dock_AMR_Status PLC 쓰기 
    const dockAMRStatusTag = await useKepServerUtil().makeWriteDatas({
      targetFacility: params.SERIAL_ID,
      tagInfo: [
        {
          tagName: 'Dock_AMR_Status',
          value: true
        }
      ]
    });
    console.log("🚀 ~ dockAMRStatusTag ~ dockAMRStatusTag:", dockAMRStatusTag)
    await useKepServerUtil().writeTagsValue(dockAMRStatusTag);

  }

  // acs에서 도킹진출완료 응답이 왔을 때, 설비에 도킹진출완료 응답하는 함수
  const sendAcsDockingDetach = async (params: AcsDockingDetachType) => {
    console.log("🚀 ~ sendAcsDockingDetach ~ params:", params)

    const dockingResponse: AcsDockingDetachResponse = {
      ...params,
      RESULT: 'True',
      RESULT_MESSAGE: '도킹 진출완료',
    };
    redisUtil.hset(RedisKeys.DockingDetachBySerialId, params.SERIAL_ID, JSON.stringify(dockingResponse));

    // Dock_AMR_Status PLC 쓰기 
    const dockAMRStatusTag = await useKepServerUtil().makeWriteDatas({
      targetFacility: params.SERIAL_ID,
      tagInfo: [
        {
          tagName: 'Dock_AMR_Status',
          value: false
        }
      ]
    });
    await useKepServerUtil().writeTagsValue(dockAMRStatusTag);
  }

  // 도킹 요청에 대해 응답을 받았는지 확인하는 함수
  const checkDockingResponse = async (params: AcsDockingRequestType) => {
    console.log("🚀 ~ checkDockingResponse ~ params:", params)
    const dockingRequestInfo = await redisUtil.hgetObject<AcsDockingRequestResponse>(RedisKeys.DockingRequestBySerialId, params.SERIAL_ID);
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

  }

  return {
    sendAcsDockingRequest,
    dockingStart,
    dockingFailed,
    dockingComplete,
    sendAcsDockingComplete,
    sendAcsDockingDetach,
  };
};
