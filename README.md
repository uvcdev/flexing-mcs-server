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

## v0.2.1-cyk
- call_type01 값 써질 때 call_type_response01~10 쓰기

## 0.2.1-ljk
- Add Dock_Signal_Reset function

## v0.2.1-cyk
- call_type01 값 써질 때 call_type_response01~10 쓰기기
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
- 설비(PLC)에서 쓰는 Call_Count 값은 저장만하고(CALL_COUNT) MCS에서 자체채번 (generated_call_count)
- generated_call_count 컬럼 추가 (작업지시코드 채번을 위한 설비별 작업순번 1 ~ 9999)
- is_active_call_trigger 컬럼 추가 (콜 생성 주체 설비 확인용)
- always_call_count 컬럼 추가 (항상 켜져있는 설비에 대한 Call_Count)
- trigger_call_count 컬럼 추가 (작업 생성 주체가 되는 설비에 대한 Call_Count)
- todo 250731 : MCS_info_work_order_count_by_serial 에 현재 진행중인 작업지시 업데이트 먼저해주기
```sql
ALTER TABLE public.facilities ADD generated_call_count int4 NULL;
ALTER TABLE public.facilities ADD is_active_call_trigger bool NULL DEFAULT false;
ALTER TABLE public.work_orders ADD always_call_count int4 NULL;
ALTER TABLE public.work_orders ADD trigger_call_count int4 NULL;

```