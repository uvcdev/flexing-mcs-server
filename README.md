# flexing-mcs-server

- `용도`: mcs-server
- `node버전`: node 18

# 업데이트 내역

## v0.0.1

- 기존 코드 삭제 및 초기 세팅

## v0.0.1-cyk

- facilityGroup, facility 입력/수정시 acs에도 동일하게 입력
- 알람 보관 주기 등록/수정 기능(로그 삭제 기능 포함)
- 작업지시 생성
  - `regWorkOrder` 통해 acs에도 작업지시 생성
  - 품목 없는 경우 품목 생성
  - 작업지시 코드 중복 제거
- 설비관리 검색조건 추가
  - 타입, 활성화
- 비밀번호 단순화 `hashUtil` (최소4자리)

## v0.0.2

- 버전승인: `v0.0.1-cyk`

## v0.0.2-cyk

- 설비 관리
  - 검색조건 일치하는 컬럼 추가(`uniqueName`)
- 설비그룹 관리
  - 검색조건 일치하는 컬럼 추가(`uniqueName`)
  - 설비그룹 코드 자동 채번 및 숨기기

## v0.0.3

- 버전승인: `v0.0.2-cyk`

## v0.0.3-cyk

- MCS에서 acs/logging mqtt 메세지 받아서 로그 저장
  (`itemLogDao`, `itemLogModel`, `mqttUtil`)

## v0.0.4

- itemLog 저장 방식 수정(토픽변경 등)

- facility에 zoneId, dockingZoneId 컬럼 삭제

```sql
ALTER TABLE public.facilities DROP CONSTRAINT facilities_zone_id_fkey;
ALTER TABLE public.facilities DROP COLUMN zone_id;
ALTER TABLE public.facilities DROP COLUMN docking_zone_id;
```

## v0.0.4-cyk

- iMCS 전용 insert 파라미터 추가(`ImcsWorkOrderInsertParams`)
- workOrder 등록 로직 수정(`regWorkOrder`)
- workOrder 테이블 수정
  - workroder.itemcode 컬럼 및 외래키 추가

```sql
ALTER TABLE public.work_orders ADD item_code varchar(255) NULL;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_fk FOREIGN KEY (item_code) REFERENCES public.items(code) ON DELETE SET NULL ON UPDATE CASCADE;
```

## v0.0.5

- 버전승인: `v0.0.4-cyk`

## v0.0.6

- 작업취소 추가

## v0.0.7

- 설비에 층정보 추가(`facility.floor`)

```sql
ALTER TABLE public.facilities ADD floor varchar(10) NULL;
ALTER TABLE public.facilities ALTER COLUMN facility_group_id DROP NOT NULL;

```

- 작업지시 테이블 수정

```sql
ALTER TABLE public.work_orders ADD is_closed bool DEFAULT false NULL;
ALTER TABLE public.work_orders ADD from_start_date timestamptz NULL;
ALTER TABLE public.work_orders ADD from_end_date timestamptz NULL;
ALTER TABLE public.work_orders ADD to_start_date timestamptz NULL;
ALTER TABLE public.work_orders ADD to_end_date timestamptz NULL;

```

- amr crud 추가
- 작업지시 실시간 상태에 따른 작업지시 데이터 업데이트(mqtt)

- 서버 시작시 설비별 금일 작업지시 상태 통계 데이터 세팅

## v0.0.8

- 금일 작업지시 상태 계산, mqtt 메세지 발송, 조회 api 추가 (`workOrderStatsUtil`, `WorkOrderService`)

## v0.0.8-a

- 모비스 로그 조회 api 추가 (라우터 `itemLog`, `itemLogService`)

## v0.0.8-b

- 모비스 로그 층 정보 입력을 위한 컬럼 추가

```sql
ALTER TABLE public.item_logs ADD floor varchar(10) NULL;
```

## v0.0.9

- 버전승인: `v0.0.8-b`
- 설비 테이블 층 컬럼 필수값 적용

```sql
ALTER TABLE public.facilities ALTER COLUMN floor SET NOT NULL;
```

- 설비 등록할 때 ACS 층별 분기 적용
  - process.env.FIRST_ACS_RESTAPI_HOST
  - process.env.SECOND_ACS_RESTAPI_HOST

## v0.0.9-a

- 버전승인: `v0.0.9`

## v0.0.9-b

- 버전승인: `v0.0.9-a`
- `imcs/mcs/recallworkorder` mqttUtil 추가

## v0.0.9-c

- `acs/recallworkorder` 변경

## v0.1.0

- `WROK_STATUS`작업 상태 로깅 추가

## v0.1.1

- `workOrderService.stateCheckAndEdit` code 값 예외처리

# MBS 서버 구분

## v0.2.0

- MBS용 KEPWARE 초기세팅
- 설비 데이터 실시간으로 불러와서 mqtt 발송하는 기능 추가(`kepServerUtil.readTagValues`)

## v0.2.0-ljk

- HEARTBEAT 로직 추가

  - 주기적으로 서버 가동 상태를 확인하는 HEARTBEAT 로직 추가
  - WMS Heartbeat 정보 수집 로직 추가 <span style="color:red"> - 동기화 로직은 추후 개발 예정 </span>

- 기본 구조 추가

  - MBS MQTT 관련하여 구독, 메세지 수신, 메시지 송신 로직 추가

- ACK 기능 추가
  - ACK 기본 기능들 추가 (`ack.ts`)
  - 각 메세지에 대한 세부 내용은 개발 중에 추가 예정

## v0.2.0-ssb

- KEPWARE - MCS 통신 로직 수정
- KEPWARE TAG정보 읽기 스크립트 추가
- KEPWARE 구독할 태그 선택 스크립트 추가
- KEPWARE WORD타입 태그 [DEC, ASCII] 분류 스크립트 추가
- WMS ACK heartbeat 설정값 추가
- KEPWARE heartbeat 함수 추가가

## v0.2.1

- 버전승인: `v0.2.0-ssb`
- 버전승인: `v0.2.0-ljk`

## v0.2.1-ljk

- trackingLog 테이블 추가

  - 기존에 timescale에서 작성하려는 의도와 다르게 빈번한 업데이트 때문에 RDB 에서 생성으로 변경
  - CRUD 기능 생성

- itemLog 테이블 컬럼 추가
  - itemLog 테이블이 trackingLog 하위 개념으로 포함되기 때문에 itemLog에 trackingLogId 컬럼 추가

## v0.2.1-cyk

- src\index.ts 구조 변경
- acs에서 설비 등록/수정 시 mcs 설비 데이터 연동
- 설비, 작업지시 테이블에 mission order 인지 컬럼 추가

```sql
ALTER TABLE public.facilities ADD is_mission_order_capable bool NULL DEFAULT false;
ALTER TABLE public.work_orders ADD is_mission_order bool NULL DEFAULT false;
```

- kepware `Call_Request` 값에 따른 처리 로직 적용
  - mission 결정지 작업지시 생성 로직 적용

```sql
ALTER TABLE public.work_orders ADD mission_start_date timestamptz NULL;
ALTER TABLE public.work_orders ADD mission_end_date timestamptz NULL;
```

- linked_eqp_ids 컬럼 추가
  - 콜이 발생되되는 설비 기준에서 EQP-EQP 통신인 경우 연결될 설비 id 지정하는 컬럼

```sql
ALTER TABLE public.facilities ADD linked_eqp_ids _int4 NULL;
```

## v0.2.2-ljk

- 설비 입고, 창고 출고 로직 마무리

  - TOPIC: PORT 관련 로직 추가
  - CALLINFO 코드 오류 수정

- Tracking Log

  - 물류 로그 기본 로직 구현
  - Tracking Log 테이블 수정

- Item Log
  - 하위 물류 로그 기본 로직 구현
  - Tracking Log 테이블 수정

## v0.2.1-ssb

- CPU 사용량(%), RAM 사용량(%) 체크 후 MQTT 전송 로직 추가
- 시스템관리 : 다국어처리 설정 타입 추가
- PLC 값 변경 API 추가

## 0.2.1-ljk

- Add Dock_Signal_Reset function

## v0.2.1-cyk

- call_type01 값 써질 때 call_type_response01~10 쓰기
- in/out 같은 포트일 때 in 작업에 도킹 관련 작업은 out 포트에도 데이터 써주기
- Update multi language setting from settingDao ( worker-ksm )
- Move Dock_Signal_Reset function
- acs로부터 same_pio mqtt 통신되면 in/out 포트에 맞는 데이터 써주기
- Update dockingParams.SERAIL_ID => PORT_ID

## v1.0.0

- Approve version v0.2.1-cyk
- Frist stage (2025/06/10)

## v1.0.0-ljk

- 설비 관리
  - cancelType 컬럼 추가
  ```sql
    ALTER TABLE public.facilities ADD cancel_type varchar(30) NULL;
  ```
  - mode 컬럼 추가
  ```sql
   ALTER TABLE public.facilities ADD "mode" varchar(20) DEFAULT 'auto' NULL;
  ```
- Cancel Type 정보 ACS에 전달(MQTT) 로직 추가
- 설비 수동/자동 모드 작업 진행 로직 추가
- MCS 알람 관리
  - MCS 알람 컬럼 변경 ( 거의 신규라서 SQL 문 미작성 )
- ErrorCode 관리
  - errorCode 관련 테이블 신규 작성
- WMS 동기화 로직 구현

## v1.0.0-cyk

- 설비(PLC)에서 쓰는 Call_Count 값은 저장만하고(CALL_COUNT) MCS에서 자체채번하는 기능 추가 (generated_call_count)
- createWorkOrderCode 함수 위치 이동
- generated_call_count 컬럼 추가 (작업지시코드 채번을 위한 설비별 작업순번 1 ~ 9999)
- is_active_call_trigger 컬럼 추가 (콜 생성 주체 설비 확인용)
- always_call_count 컬럼 추가 (항상 켜져있는 설비에 대한 Call_Count)
- trigger_call_count 컬럼 추가 (작업 생성 주체가 되는 설비에 대한 Call_Count)
- todo 250731 : MCS_info_work_order_count_by_serial 에 현재 진행중인 작업지시 업데이트 먼저해주기
- ACS 작업 취소로 인해 MCS 상황 판단해서 작업지시 재생성하는 로직 수정
- 멀티콜 로직 반영 (테스트 필요)
-
-

```sql
ALTER TABLE public.facilities ADD generated_call_count int4 NULL;
ALTER TABLE public.facilities ADD is_active_call_trigger bool NULL DEFAULT false;
ALTER TABLE public.work_orders ADD always_call_count int4 NULL;
ALTER TABLE public.work_orders ADD trigger_call_count int4 NULL;

```

## v1.0.0-ssb

- kepware 동기화 시 구독할 태그 기본값 추가
- callRegisterUtil함수 내 로직 isActiveCallTrigger 조건 추가
- 태그데이터(tagMap) 불러올 때 데이터 최신화하는 함수 추가

## v1.0.1-ljk

- 설비 관리
  - 미션 결정지 -> To 설비 이동 시, Priority가 높은 설비 우선 판단
  - 컬럼 추가 priority
  ```sql
  ALTER TABLE public.facilities ADD priority int4 DEFAULT 50 NULL;
  ```
- 세팅
  - portRetryTimeoutMinutes 추가 : Ack Call Info 할당 받았지만, 포트 배정을 받지 않아 재요청하는 시간
- 창고 로직
  - portRetryTimeoutMinutes 로직 추가
- 콜 우선순위 컬럼 추가

```sql
   ALTER TABLE public.work_orders ADD call_priority bool NULL DEFAULT false;
```

- 콜 우선순위값 변경 시 처리로직 추가
- PLC 아스키코드 변환 방식 수정(10진수 -> 16진수)
- checkMissionOrder() 리팩토링

```sql
  ALTER TABLE public.facilities ADD cancel_linked_eqp_ids _int4 NULL;
```

## v1.0.3

- 현장 코드 병합 ( cyk , ljk, ssb )

## v1.0.3-cyk

- linkedFacility 에 Call_Response 켜져 있는 경우에도 InfoRemainCallById 에 등록해주기
- checkRemainEqpCall 에 Call_Response_Count 써줄 때 Call_Count 로 써주기
- callRegister linkedEqpId 판단할 때 설비 우선순위에 따라 판단하는 기능 추가
- 서버가 꺼졌다 켜졌을 때 Call_Request 판단하는 기능 추가
- test completed 09/05 from here
- 작지가 없음에도 작업자가 Call_Cancel_Request 를 올린 경우에도 다음 콜이 생성되도록 해주도록 수정(callCancelUtil.callCancel)
- 링크드 설비인 경우 조회 조건 수정(callCancelUtil.callCancel)
- 단일 콜인 경우 RedisKeys.InfoRemainCallById 중복 생성 막는 기능(callRegisterUtil.callRegister)
- test completed 09/11

- trigger 설비와 always 설비의 call_type 이 같은 경우에만 작업 생성하는 기능 추가
- 250916 CallRegister 에서 매칭 안된 경우 remain redis 에 저장하던 기능 제거 => 매칭 안될 경우 CallRegister 에서 반복 통해 판단
- 250918 CallRegister 설비 자동인경우에만 생성되도록 수정
- usefullToolUtil.timestampToDate 통해 timestamp 값 날짜형식으로 변경
- mqttUtil에서 work-order-cancel 토픽으로 ACS 에서 취소된 작업 재생성
  - todo: ACS 설비 수동상태인경우는 빠져버림
- opcuaUtil에서 samplingInterval 수치 500 => 300 수정
- workOrderService 에서 이미 작업지시가 facailityCanceled 인 상태여도 Call_Cancel_Response에 True 값 작성

## v1.0.3-ljk

- Tracking Log 메세지 정보 추가

- Tracking Log 컬럼 추가

  - missionDestination 컬럼, processState 컬럼

  ```sql
  ALTER TABLE public.tracking_logs ADD mission_destination varchar(50) NULL;
  ALTER TABLE public.tracking_logs ADD process_state varchar(20) DEFAULT 'NORMAL' NULL;
  ```

- Tracking Log 도킹 관련 내용 수정

  - 도킹 관련 Tracking Log 누락 내용들 수정 완료 ( 도킹 요청 , 허가, 완료 )
  - 도킹 관련 Tracking Log 재수정
  - ACS 작업 취소에 대한 처리 로직 추가
  - 완료 상태 로그 삭제 처리 기능 추가
  - 트래킹 로그 del 상태 변경
  - AMR Alive 상태 1개 더 추가
  - ACS 작업 취소 트래킹 로그 추가

- To 설비에 Robot_Assigned 추가

## v1.0.4

- 현장 코드 병합 ( cyk , ljk )

## v1.0.4-ljk

- WMS 쪽 토픽 변경 ( MCS -> MS01)
- rollback MCS Topci ( MS01 -> MCS )
- ACK_CALL_INFO - hcack = 51 / 52 응답 내용 수정

  - hcack = 52 재고 없음 실행 예정은 사용하지 않고 hcack=51 : 재고 없음 실행 불가만 사용한다. 이유: 재고가 언제 들어오는 지는 창고도 알 수 없음
  - hcack = 51 도 재고 없음 실행 불가지만, 해당 응답이 온 경우에는 로깅 후, 몇 분 뒤에 해당 정보 그대로 (cmdId 만 변경) 재 요청한다.

- PORT_PRESENSE 시, 창고 수동작업지시 (재고순환) 로직 수정

## v1.0.4-cyk

- callRegister 에서 작업지시코드 만들던 방식에서 eqpCheckUtil 에서 Call_Request 인지될 때 생성으로 변경
- Add createTime from kepServerUtil TagValue interface

## v1.0.5

- 현장 코드 반영 ( cyk ) : linked 작업 취소 관련, WMS connection
- 코드 반영 ( ljk )

## v1.0.6

- 버전승인: `v0.0.4-cyk`

## v1.0.6-ljk

- WMS
  - CALL_REQUEST 콜 응답 부분 내용 수정 ( 로직 점검 필요 )
  - transfer_abort_completed , transfer_cancel_completed 로직 수정
    - 바로 기존 CALL_ID로 재요청
- 트래킹 로그
  - 트래킹 로그 init 시점 변경

## v1.0.7

- 버전승인: `v1.0.6-ljk`

## v1.0.7-cyk

- callTypeResponse() 호출 시 파라미터 타입 Tagvalue => string 으로 변경
- eqpCheckUtil 에서 Call_Type_01 구독할 때 저장하는 부분 주석처리
- Call_Response 할 때 callTypeResponse() 호출해서 call_type 써주기
- pio complete 났을 때 Dock_AMR_Status 꺼주는 로직에서 dockingUtil.dockingComplete() 에서 Dock_EQ_Status 꺼질 때로 이동
- BS12 작업할 때 Dock_Request ON 해서 pio 진행하도록 수정

## v1.0.8

- 버전승인: `v1.0.7-cyk`

## v1.0.8-ljk

- MCS 동기화 로직 
  - ACK_REQ_PORT_STATE_LIST 기능 추가
  - ACK_REQ_CALL_INFO_LIST 기능 개선
  - edit syncronization Logic - PORT , CALL
  - edit call Count in WMS
  - edit CANCEL_CALL_INFO - HCACK = 2
  - edit TRANSFER_CANCEL_COMPLETED, TRANSFER_ABORT_COMPLETED
  - edit syncronization Logic - CALL ( CALL_INFO 호출 부 재수정 )

- 재고 없음 로직
  - 재고 없음 발생 시, 트래킹 로그 물류 상태에 `재고 없음 표시` 

- 창고 취소 로직 
  - process / index 에 창고 취소 로직 주석 처리
  - call cancel util에 창고 부분 내용 수정

- Dock_Disable 처리 로직
  - Dock Disable 신호 감지 처리

- 창고 로직 중 취소로직 내용 수정

- ACK_CANCEL_CALL_INFO 버그 수정

- 재고없음 , 트래킹로그 , Abort 로직 버그 수정

- 미션 결정지에서 Dock_Disable === False 인 경우에만 진입 가능

- 트래킹 로그 문제 수정
  - ABORTED 상태는 다시 조회 가능하도록
  - ACS 작업 취소를 CANCELED 상태로 재변경
  - ACK_CALL_INFO에서 출발지 정보 기입되는 버그수정

- 창고 수동 작업 지시 트래킹 로그 생성

- ACK_CALL_INFO HCACK=0 추가 로직 구현

- 미션 결정지 오류 수정

- WMS 콜 캔슬 로직 수정