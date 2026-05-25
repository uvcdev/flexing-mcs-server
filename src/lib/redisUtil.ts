import redis, { RedisClient } from 'redis';
import { promisify } from 'util';
import { logging } from '../lib/logging';
import * as dotenv from 'dotenv';
// import { ChargerAttributes } from '../models/common/chargerModel';
dotenv.config();

// redis 접속 환경
type RedisConfig = {
  host: string;
  port: number;
  header: string;
};

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || '',
  port: Number(process.env.REDIS_PORT || 6379),
  header: process.env.REDIS_HEADER || 'MCS',
};

export enum RedisKeys {
  // 미사용
  // WorkerStatus = 'feedback_worker_status',
  // Instructions = 'res_get_task',
  // ComposeJobs = 'req_compose_job',
  // InfoChargerById = 'info_charger_by_id',
  // InfoChargerByResource = 'info_charger_by_resource',
  // AmrRecentTask = 'amr_recent_task',
  // AmrRecentTaskById = 'amr_recent_task_by_id',
  // AmrCurrentCharger = 'amr_current_charger',
  // AlarmBattery = 'alarm_battery',
  // WorkOrderById = 'work_order_by_id',
  // OrdersByFacilityId = 'orders_by_facility_id',
  // InfoFacility = 'info_facility',

  // 기존
  InfoAmr = 'info_amr',
  InfoAmrById = 'info_amr_by_id',
  AlarmStatusToggle = 'alarm_status_toggle',
  Setting = 'setting',
  InfoFacilityById = 'info_facility_by_id',
  InfoFacilityBySerial = 'info_facility_by_serial',
  InfoFacilityByResource = 'info_facility_by_resource',
  // MBS
  WorkOrderCount = 'work_order_count', // MBS 설비별 자체 작업지시 카운트
  Heartbeat = 'heartbeat', // HEARTBEAT 리스트
  ReceivedAckCommandBySubjectCmdId = 'received_ack_command_by_subject_cmd_id', // MQTT로 받은 WMS 데이터
  RemainingAckCommandBySubjectCmdId = 'remaining_ack_command_by_subject_cmd_id', // MQTT로 WMS에 보낸 데이터 ( ACK 판단 유무 )
  IntervalCommandForRetryBySubjectCmdId = 'Interval_command_for_retry_by_subject_cmd_id', // ACK 리밋 횟수 초과 시, n 분 뒤에 재전송 할 Command
  AbortedCommandForRetryBySubjectCmdId = 'aborted_command_for_retry_by_subject_cmd_id', // 특정 이유로 n 분 뒤에 재전송 할 Command
  InfoOutCallByCallId = 'info_out_call_by_call_id', // out 설비에서 발생한 콜이 미션 결정지를 가지 않고 바로 창고 포트로 들어가는 경우
  InfoAckOutCallByCallId = 'info_ack_out_call_by_call_id', // out 설비 콜 중 WMS에서 ACK_BRANCH_INFO_REQ 받은 콜
  InfoInCallByCallId = 'info_in_call_by_call_id', // in 설비에서 발생한 콜 ( WMS에 CALLINFO 요청 전 )
  InfoAckInCallByCallId = 'info_ack_in_call_by_call_id', // in 설비 콜 중 WMS에서 ACK_CALLINFO를 받은 콜 ( ACK 수신 후 부터 PORT 배정 전까지 살아있음 )
  InfoCancelCallByCallId = 'info_cancel_call_by_call_id', // 설비에서 CALL 취소 발생한 목록
  InfoMissionCallByCallId = 'info_mission_call_by_call_id', // out 설비에서 발생한 콜 ( WMS에 Branch 요청 전 - 미션 결정지에 도착 후 ACS가 요청 )
  InfoAckMissionCallByCallId = 'info_ack_mission_call_by_call_id', // out 설비 콜 중 WMS에서 ACK_BRANCH_INFO_REQ를 받은 콜
  InfoPendingWorkOrderByCallId = 'info_pending_work_order_by_call_id', // 작업지시 만들 데이터 목록
  InfoChangedTagById = 'info_changed_tag_by_id', // PLC tag 값 변경된 값
  InfoTrackingLogByFacilityCode = 'info_tracking_log_by_facility_code', // 물류 현황 redis 데이터 by facility code
  InfoTrackingLogByCallId = 'info_tracking_log_by_call_id', // 물류 현황 redis 데이터 by Call Id => 해당 내용은 사용하고 나서 지워줘야함 ( 콜 생성 시점에서 )
  RecentCallInfoTaskByCmdId = 'recent_call_info_task_by_cmd_id', // recent call info 정보 ( CALLINFO 부터 PORT 배정까지 : 창고 입고)
  InfoInCallByNodeId = 'info_in_call_by_node_id', // in 설비에서 발생한 콜에 해당하는 node 정보
  InfoOutCallByNodeId = 'info_out_call_by_node_id', // out 설비에서 발생한 콜에 해당하는 node 정보
  DockingRequestByPortId = 'docking_request_by_port_id',
  DockingCompleteByPortId = 'docking_complete_by_port_id',
  AbnormalCompletedCallInfoTaskByCallId = 'abnormal_completed_call_info_task_by_call_id', // 비정상 완료된 Call Id
  CheckRetryCallInfoByCallId = 'check_retry_call_info_by_call_id', // TRANSFER_CANCEL_COMPLETED, TRANSFER_ABORT_COMPLETED 등의 이유로 설비 Call 정보를 확인 후 Call Info를 재 송부 해야 하는 경우
  DockingDetachByPortId = 'docking_detach_by_port_id',
  DockingRequestBySerialId = 'docking_request_by_serial_id', // acs로부터 온 도킹요청정보와 imcs가 acs로 보내는 도킹요청응답정보
  DockingOutRequestBySerialId = 'docking_out_request_by_serial_id', // acs로부터 온 도킹요청정보와 imcs가 acs로 보내는 도킹아웃요청응답정보
  DockingCompleteBySerialId = 'docking_complete_by_serial_id', // acs로부터 온 도킹완료정보와 imcs가 acs로 보내는 도킹완료응답정보
  DockingDetachBySerialId = 'docking_detach_by_serial_id', // acs로부터 온 도킹해제정보와 imcs가 acs로 보내는 도킹해제응답정보
  InfoPlcBySerial = 'info_plc_by_serial',
  // InfoRemainCallById = 'info_remain_call_by_id',   // 250916 remove remain
  InfoWorkOrderCountBySerial = 'info_work_order_count_by_serial', // 멀티콜을 위한 현재 작업 중인 작업 개수
  InfoFacilityModeBySerial = 'info_facility_mode_by_searial', // 설비 시리얼로 설비 모드 조회
  InfoCallRequestOnBySerial = 'info_call_request_on_by_serial', // Call_Request ON 인 작업 데이터
  InfoMultiCallRequestOnBySerial = 'info_multi_call_request_on_by_serial', // Call_Request ON 인 작업 데이터
  InfoWorkOrderCreatedByCallId = 'info_work_order_created_by_call_id', // 작업지시 생성 및 ACS에 전송 유무 확인용
  ReinboundIfPortAssignedForFacilityCancelByCallId = 'reinbound_if_port_assigned_for_facility_cancel_by_call_id', // 설비취소 작업에 대해 창고의 포트 배정 시 일반작업지시가 아닌 재반입작업지시로 만들기 위한 키
  InfoMissionOrderByWorkOrderCode = 'info_mission_order_by_work_order_code', // ACS에서 MCS로 전달한 미션 오더 정보
  InfoCallKey = 'info_call_key', // 서버 재부팅시 기존에 있던 데이터인지 추가해줄 데이터인지 확인하는 정보
  RecentWorkOrderListByFacilitySerial = 'recent_work_order_list_by_facility_serial', // 현재 진행 중인 작업 지시 카운트
  RecentCallCountByFacilitySerial = 'recent_call_count_by_facility_serail', // Call_Request, Mutil Call 1 , Mutil Call 2 on 상태
  // 콜이 중복으로 켜질 경우 해당 레디스 값이 중복 사용되어 문제 발생함
  RecentCallRequestByFacilitySerial = 'recent_call_request_by_facility_serail', // Call_Request, Mutil Call 1 , Mutil Call 2 on 상태
  RecentCallRequestMulti1ByFacilitySerial = 'recent_call_request_multi1_by_facility_serail', // Call_Request, Mutil Call 1 , Mutil Call 2 on 상태
  RecentCallRequestMulti2ByFacilitySerial = 'recent_call_request_multi2_by_facility_serail', // Call_Request, Mutil Call 1 , Mutil Call 2 on 상태
  // SmartConnector
  PlcRealtimeData = 'plc_realtime_data', // PLC 실시간 데이터
  SmartConnectorWriteTag = 'smart_connector_write_tag', // SmartConnector에 쓰기 요청 후 응답 처리 키
  TempForCallCancelResponseReset = 'temp_for_call_cancel_response_reset', // to작업중 facility cancel 발생 시 해당 설비의 콜응답 PLC 초기화를 위한 임시키
  // 2026.05.22 - WMS 자재검증
  CheckPortPresenceListMatchByCmdId = 'check_port_presence_list_match_by_cmd_id', // 들려는 자재와 창고 자재가 같은지 검증
}
export enum RedisSettingKeys {
  // AmrSetting = 'amrSetting', // amr(로봇) 충전 관련 설정
  // LogRetentionPeriod = `logRetentionPeriod`, // 로그 저장 기간, mcslog, acslog
  // AssignmentPrioriry = 'assignmentPrioriry', // 작업-로봇 할당 우선 순위 설정 (작업레벨 우선: workLevel(1), 배터리 우선: batteryLevel(2), 거리 우선: distance(3))
  // WorkPriorityBoost = `workPriorityBoost`, //작업 우선 순위 상향 설정 (기준시간: priorityBoostTimeLimit)
  // DailyStartEndSchedule = `dailyStartEndSchedule`, // 주간 시업/종업
  // NightlyStartEndSchedule = `nightlyStartEndSchedule`, // 야간 시업/종업
  WmsCommandSetting = 'wmsCommandSetting', // WMS 통신 관련 설정
  LanguageSetting = 'languageSetting', // 언어 설정
  DryrunSetting = 'dryrunSetting', // 드라이런 모드 설정
}

// export type AmrCurrentChargerTypes = {
//   id: number;
//   chargerId: number;
//   amrId: number;
//   chargerState: ChargerAttributes['state'];
//   startBattery: number | null;
//   endBattery: number | null;
//   startDate: Date | null;
//   endDate: Date | null;
// };

let redisClient: RedisClient | null = null;
export const useRedisUtil = () => {
  if (redisConfig.host && !redisClient) {
    redisClient = redis.createClient(redisConfig.port, redisConfig.host);
    redisClient.on('error', (error) => {
      logging.SYSTEM_ERROR(
        {
          title: 'redis error',
          message: null,
        },
        error
      );
    });
  }

  const makeKey = (key: string): string => {
    return `${redisConfig.header}_${key}`;
  };

  const keys = async (pattern: string): Promise<string[]> => {
    if (!redisClient) return [];
    const asyncKeys = promisify(redisClient.keys).bind(redisClient);
    return asyncKeys(makeKey(pattern));
  };

  const hkeys = async (key: string): Promise<string[]> => {
    if (!redisClient) return [];
    const asyncHkeys = promisify(redisClient.hkeys).bind(redisClient);
    return asyncHkeys(makeKey(key));
  };

  const set = (key: string, value: string): void => {
    if (redisClient) redisClient.set(makeKey(key), value);
  };

  const get = async (key: string): Promise<string | null> => {
    if (!redisClient) return null;
    const asyncGet = promisify(redisClient.get).bind(redisClient);
    return asyncGet(makeKey(key));
  };

  const hset = (key: string, field: string, value: string): void => {
    if (redisClient) {
      const result = redisClient.hset(makeKey(key), field, value);
    }
  };

  const hget = async (key: string, field: string): Promise<string | null> => {
    if (!redisClient) return null;
    const asyncHget = promisify(redisClient.hget).bind(redisClient);
    return asyncHget(makeKey(key), field);
  };
  const hgetObject = async <T>(key: string, field: string): Promise<T | null> => {
    const stringValue = await hget(key, field);
    if (!stringValue) {
      // 에러 로깅 또는 추가적인 처리
      return null;
    }
    try {
      const objectValue: T = JSON.parse(stringValue);
      return objectValue;
    } catch (error) {
      console.error('JSON parsing error:', error);
      return null;
    }
  };
  const hgetAll = async (key: string): Promise<{ [key: string]: string }> => {
    if (!redisClient) return {};

    // 모든 키 가져오기
    const fields = await hkeys(key);
    const asyncHget = promisify(redisClient.hget).bind(redisClient);

    const results: { [key: string]: string } = {};
    for (const field of fields) {
      const value = await asyncHget(makeKey(key), field);
      results[field] = value;
    }

    return results;
  };

  const hgetAllObject = async <T>(key: string): Promise<T[] | null> => {
    if (!redisClient) return [];

    // 모든 키 가져오기
    const fields = await hkeys(key);
    const asyncHget = promisify(redisClient.hget).bind(redisClient);

    const results = [] as T[];
    for (const field of fields) {
      const value = await asyncHget(makeKey(key), field);
      results.push(JSON.parse(value));

      // Parse when received as a string
      // try {
      //   const parsed = (typeof value === 'string') ? JSON.parse(value) : value
      //   if (parsed === null) {
      //     return results
      //   }
      //   results.push(parsed);
      // } catch (e) {
      //   console.error("JSON ERROR ", value)
      //   results.push(JSON.parse(value));
      // }
    }

    return results;
  };
  const flushall = (): void => {
    if (redisClient) redisClient.flushall();
  };

  const del = (key: string): void => {
    if (redisClient) redisClient.del(makeKey(key));
  };

  const hdel = (key: string, field: string): void => {
    if (redisClient) redisClient.hdel(makeKey(key), field);
  };

  const hdelAsync = async (key: string, field: string): Promise<void> => {
    if (redisClient) await redisClient.hdel(makeKey(key), field);
  };

  /**
   * [SmartConnector용] 특정 Hash의 모든 필드와 값을 객체로 가져옴.
   * @param key Redis 키 (예: "plc_realtime_data:BM3I")
   */
  const hGetPlcAllTags = async (key: string): Promise<{ [key: string]: string } | null> => {
    if (!redisClient) return null;
    const asyncHgetAll = promisify(redisClient.hgetall).bind(redisClient);
    return asyncHgetAll(makeKey(key));
  };

  /**
   * [SmartConnector용] 객체를 받아 Hash에 여러 필드를 한번에 저장.
   * @param key Redis 키 (예: "plc_realtime_data:BM3I")
   * @param data 저장할 데이터 객체
   */
  const hSetPlcAllTags = (key: string, data: { [key: string]: string }): void => {
    if (redisClient) {
      const args = Object.entries(data).flat();
      if (args.length === 0) return;

      redisClient.hmset(makeKey(key), args, (err, reply) => {
        if (err) {
          logging.SYSTEM_ERROR(
            {
              title: 'redis hmset error for plc state',
              message: `key: ${key}`,
            },
            err
          );
        }
      });
    }
  };

  /**
   * [SmartConnector용] 특정 Hash에서 단일 필드(태그)의 값을 가져옴. (hget)
   * @param key Redis 키 (예: "plc_realtime_data:BM3I")
   * @param field 가져올 필드(태그) 이름
   */
  const hGetPlcTag = async (key: string, field: string): Promise<string | null> => {
    if (!redisClient) return null;
    // 기존의 hget 함수와 동일한 로직이지만, 명확한 구분을 위해 새로 만듭니다.
    const asyncHget = promisify(redisClient.hget).bind(redisClient);
    return asyncHget(makeKey(key), field);
  };

  /**
   * [SmartConnector용] 특정 Hash에 단일 필드(태그)와 값을 저장. (hset)
   * @param key Redis 키 (예: "plc_realtime_data:BM3I")
   * @param field 저장할 필드(태그) 이름
   * @param value 저장할 값
   */
  const hSetPlcTag = (key: string, field: string, value: string): void => {
    if (redisClient) {
      // 기존의 hset 함수와 동일한 로직이지만, 명확한 구분을 위해 새로 만듭니다.
      redisClient.hset(makeKey(key), field, value);
    }
  };
  return {
    keys,
    hkeys,
    set,
    hset,
    get,
    hget,
    hgetObject,
    hgetAll,
    hgetAllObject,
    flushall,
    del,
    hdel,
    hdelAsync,
    hGetPlcAllTags,
    hSetPlcAllTags,
    hGetPlcTag,
    hSetPlcTag,
  };
};
