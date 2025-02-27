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