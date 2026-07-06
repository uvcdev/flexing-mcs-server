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

## v0.1.1-ljk

- Detail Log Table 기본 기능 및 구조 생성
- Tracking Log Table 기본 기능 및 구조 생성
- route 정보 , model 정보 추가 - [MCS Call 이력 조회 및 관리] 서버 작업 완료
- Setting에 `LogDurationSetting` 정보 추가
- Tracking Log 대시보드 데이터 가공 함수 생성 `fixTrackingLogList()`
- Tracking Log 관련 비정상 시나리오 해결

## v0.1.2-ljk

- 포트 배정 로직 추가

## v0.2.0

- 서버 디스크 사용률 MQTT 발송 추가
  - `diskUtil.getRootDiskUsagePercent()` 신설 (루트 파티션 `/` 사용률 %, `systeminformation` 사용)
  - `mqttUtil`에서 1초 주기로 `mcs/disk` 토픽에 정수 문자열로 발행 (ACS 구독)
  - 컨테이너 환경에서는 overlay가 호스트 루트 디스크를 반영하므로 `/`를 기준으로 측정, Windows 등 로컬 환경에서는 첫 번째 드라이브로 폴백
- 의존성 추가: `systeminformation`
- 패키지 매니저 일원화 (pnpm)
  - `package-lock.json` 제거, `pnpm-lock.yaml` 만 유지
- Docker 빌드 개편
  - `Dockerfile` 멀티스테이지 구성으로 정리, `pnpm@10 install --frozen-lockfile` 로 재현 가능한 빌드
  - 최종 이미지에는 `package.json`, `build/`, `node_modules/`, `src/swagger.json` 만 포함
  - `.dockerignore` 추가 (`node_modules`, `build`, `obfuscated`, `.git`, `.env`, `*.log`)
  - `dockerBuild.sh` 이미지 태그 `0.2.0` 으로 갱신
