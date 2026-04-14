import { smartConnectorEventEmitter } from '../events/smartConnectorEvents';
import { FacilityAttributesDeep } from '../models/operation/facility';
import { logging } from './logging';
import { RedisKeys, useRedisUtil } from './redisUtil';

const VIRTUAL_PLC_RESPONSE_DELAY_MS = 300;

interface TagWriteInfo {
  tagName: string;
  value: boolean | string | number;
}

/**
 * 태그별 PLC 응답 시뮬레이션 핸들러 타입.
 * facilitySerial을 받아서 해당 태그에 대한 PLC 후속 반응을 시뮬레이션한다.
 */
type VirtualPlcHandler = (facilitySerial: string) => Promise<void>;

/**
 * 태그별 PLC 응답 시뮬레이션 핸들러 맵.
 * key: `${tagName}:${value}` 형식 (예: 'Complete:true')
 * 새로운 태그 시뮬레이션이 필요하면 여기에 핸들러를 추가하면 됨.
 */
const virtualPlcHandlers: Map<string, VirtualPlcHandler> = new Map([['Complete:true', handleCompleteOn]]);

/**
 * Complete ON 시 PLC 후속 응답 시뮬레이션.
 * Complete ON → PLC가 Call_Request OFF, Dock_Permit/Load_Permit은 가상설비 미사용
 * → MCS callRemove()로 리셋 → 작업 종료
 */
async function handleCompleteOn(facilitySerial: string): Promise<void> {
  const redisUtil = useRedisUtil();
  const redisKey = `${RedisKeys.PlcRealtimeData}:${facilitySerial}`;

  // Redis PlcRealtimeData 업데이트: Call_Request OFF
  redisUtil.hSetPlcTag(redisKey, 'Call_Request', '0');

  // smartConnectorEventEmitter로 Call_Request OFF 이벤트 발생
  // → smartConnectorEventsHandlers의 Call_Request 핸들러가 처리
  // → eqpCheckUtil.eqpTaskStatus() → callRemove() → 작업 정상 종료
  smartConnectorEventEmitter.emit('Call_Request', {
    facilityName: facilitySerial,
    tag: 'Call_Request',
    old: '1',
    new: '0',
  });

  logging.SYSTEM_LOG({
    title: '[VirtualPLC] Complete ON → Call_Request OFF 시뮬레이션 완료',
    message: `가상설비 ${facilitySerial}`,
  });
}

/**
 * 가상설비용 PLC 시뮬레이터.
 * 실제 PLC가 없는 가상설비에서 MCS가 태그를 쓴 후:
 * 1. 쓴 값 자체를 Redis/이벤트에 반영 (PLC → smartConnector → data 경로 대체)
 * 2. PLC가 해줘야 할 후속 응답을 시뮬레이션 (virtualPlcHandlers)
 *
 * 새로운 태그 시뮬레이션 추가 방법:
 * 1. 핸들러 함수 작성 (예: handleDockRequestOn)
 * 2. virtualPlcHandlers Map에 등록 (예: ['Dock_Request:true', handleDockRequestOn])
 */
export const simulatePlcResponse = async (facilitySerial: string, tagInfo: TagWriteInfo[]) => {
  try {
    const redisUtil = useRedisUtil();
    const facilityInfo = await redisUtil.hgetObject<FacilityAttributesDeep>(
      RedisKeys.InfoFacilityBySerial,
      facilitySerial
    );

    if (!facilityInfo || !facilityInfo.isVirtual) {
      return;
    }

    // 가상설비는 실제 PLC가 없어서 쓴 값이 돌아오지 않으므로
    // Redis PlcRealtimeData에 직접 반영 + 이벤트 발생시켜서 tagMap/핸들러 체인 동작하게 함
    const redisKey = `${RedisKeys.PlcRealtimeData}:${facilitySerial}`;
    for (const tag of tagInfo) {
      const valueStr = tag.value.toString();
      const oldValue = (await redisUtil.hGetPlcTag(redisKey, tag.tagName)) ?? '';
      redisUtil.hSetPlcTag(redisKey, tag.tagName, valueStr);

      // 값이 실제로 변경된 경우에만 이벤트 발생
      if (oldValue !== valueStr) {
        smartConnectorEventEmitter.emit(tag.tagName, {
          facilityName: facilitySerial,
          tag: tag.tagName,
          old: oldValue,
          new: valueStr,
        });
      }
    }

    // 쓰여진 태그 중 시뮬레이션 핸들러가 등록된 것만 수집 (PLC 후속 반응)
    const matchedHandlers: VirtualPlcHandler[] = [];
    for (const tag of tagInfo) {
      const handlerKey = `${tag.tagName}:${tag.value}`;
      const handler = virtualPlcHandlers.get(handlerKey);
      if (handler) {
        matchedHandlers.push(handler);
      }
    }

    if (matchedHandlers.length === 0) {
      return;
    }

    logging.SYSTEM_LOG({
      title: '[VirtualPLC] 시뮬레이션 시작',
      message: `가상설비 ${facilitySerial} | 태그: ${tagInfo.map((t) => `${t.tagName}=${t.value}`).join(', ')}`,
    });

    // 딜레이 후 핸들러 실행
    setTimeout(async () => {
      try {
        for (const handler of matchedHandlers) {
          await handler(facilitySerial);
        }
      } catch (error) {
        logging.ACTION_ERROR({
          filename: 'virtualPlcSimulator.ts',
          params: { facilitySerial },
          result: null,
          error: new Error('가상설비 PLC 시뮬레이션 중 에러: ' + (error as Error).message),
        });
      }
    }, VIRTUAL_PLC_RESPONSE_DELAY_MS);
  } catch (error) {
    logging.ACTION_ERROR({
      filename: 'virtualPlcSimulator.ts',
      params: { facilitySerial, tagInfo },
      result: null,
      error: new Error('가상설비 판단 중 에러: ' + (error as Error).message),
    });
  }
};
