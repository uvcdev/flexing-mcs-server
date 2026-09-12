/**
 * Interface 연동정의서 - 시트 서식 일괄 적용 스크립트
 *
 * [사용법]
 *  1. CSV 4개를 Google Sheets 에 시트로 가져오기 (파일 > 가져오기 > 업로드 > 새 시트 삽입)
 *  2. 확장 프로그램 > Apps Script 열기
 *  3. 이 파일 내용을 붙여넣고 아래 CONFIG 의 시트 이름을 실제 탭 이름과 맞춘다
 *  4. applyInterfaceFormat 함수 실행
 *
 * 색상값을 하드코딩하지 않고 SOURCE_SHEET(설비 그룹 관리)의 서식을 그대로 복사하므로
 * 배경색 / 글꼴 / 테두리 / 병합 이 원본과 동일하게 적용된다.
 */

var CONFIG = {
  // 서식의 기준이 되는 시트 (설비그룹 관리 예시 시트)
  SOURCE_SHEET: '설비 그룹 관리',

  // 서식을 적용할 시트들 (실제 탭 이름으로 수정할 것)
  TARGET_SHEETS: ['시스템 옵션 관리', '에러코드 관리', '알람 관리', '로그 조회'],

  // 정의서가 사용하는 컬럼 수
  COL_COUNT: 12,
};

/** 행의 종류를 판별한다. A열 라벨 기준. */
function classifyRow(rowValues, rowIndex) {
  var a = String(rowValues[0] || '').trim();

  if (rowIndex === 0) return 'TITLE'; // 1행: 프로그램 명
  if (a === '') return 'EMPTY';

  switch (a) {
    case 'Function Id':
      return 'FUNCTION_ID';
    case 'Subject':
      return 'SUBJECT';
    case 'Description':
      return 'DESCRIPTION';
    case 'Type':
      return 'TYPE';
    case 'Url':
      return 'URL';
    case 'Request Body':
      return 'REQUEST_BODY';
    case 'Response Body':
      return 'RESPONSE_BODY';
    case 'Parameter':
      return 'PARAM_HEADER';
    case 'e.g.':
      return 'EG';
    default:
      return 'PARAM'; // 실제 파라미터 행
  }
}

/** SOURCE_SHEET 에서 행 종류별 대표 행 번호(1-based)를 수집한다. */
function collectTemplateRows(sourceSheet) {
  var lastRow = sourceSheet.getLastRow();
  var values = sourceSheet.getRange(1, 1, lastRow, CONFIG.COL_COUNT).getValues();

  var template = {};
  for (var i = 0; i < values.length; i++) {
    var key = classifyRow(values[i], i);
    if (!template[key]) {
      template[key] = i + 1; // 최초 등장 행을 대표 서식으로 사용
    }
  }
  return template;
}

/** 연속된 동일 종류 행을 묶어서 서식을 복사한다. */
function applyToSheet(sourceSheet, targetSheet, template) {
  var lastRow = targetSheet.getLastRow();
  if (lastRow === 0) {
    Logger.log('[skip] 빈 시트: ' + targetSheet.getName());
    return;
  }

  // 대상 시트 컬럼 수 보정
  if (targetSheet.getMaxColumns() < CONFIG.COL_COUNT) {
    targetSheet.insertColumnsAfter(targetSheet.getMaxColumns(), CONFIG.COL_COUNT - targetSheet.getMaxColumns());
  }

  var values = targetSheet.getRange(1, 1, lastRow, CONFIG.COL_COUNT).getValues();

  // 기존 병합 해제 (재실행 시 병합이 중첩되는 것을 방지)
  targetSheet.getRange(1, 1, lastRow, CONFIG.COL_COUNT).breakApart();

  var runStart = 1;
  var runKey = classifyRow(values[0], 0);

  for (var i = 1; i <= values.length; i++) {
    var key = i < values.length ? classifyRow(values[i], i) : null;

    if (key !== runKey) {
      var runEnd = i; // 1-based, 포함
      var srcRow = template[runKey];

      if (srcRow) {
        var src = sourceSheet.getRange(srcRow, 1, 1, CONFIG.COL_COUNT);
        var dst = targetSheet.getRange(runStart, 1, runEnd - runStart + 1, CONFIG.COL_COUNT);
        // 값은 그대로 두고 서식(배경/글꼴/테두리/병합/정렬)만 복사
        src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      } else {
        Logger.log('[warn] 원본에 없는 행 종류: ' + runKey);
      }

      runStart = i + 1;
      runKey = key;
    }
  }

  // 컬럼 너비 동기화
  for (var c = 1; c <= CONFIG.COL_COUNT; c++) {
    targetSheet.setColumnWidth(c, sourceSheet.getColumnWidth(c));
  }

  // 여러 줄 텍스트가 잘리지 않도록 행 높이 자동 조정
  targetSheet.autoResizeRows(1, lastRow);

  Logger.log('[done] ' + targetSheet.getName() + ' (' + lastRow + ' rows)');
}

function applyInterfaceFormat() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sourceSheet = ss.getSheetByName(CONFIG.SOURCE_SHEET);
  if (!sourceSheet) {
    throw new Error('기준 시트를 찾을 수 없습니다: ' + CONFIG.SOURCE_SHEET + ' (CONFIG.SOURCE_SHEET 확인)');
  }

  var template = collectTemplateRows(sourceSheet);
  Logger.log('수집된 행 종류: ' + Object.keys(template).join(', '));

  CONFIG.TARGET_SHEETS.forEach(function (name) {
    var target = ss.getSheetByName(name);
    if (!target) {
      Logger.log('[skip] 시트 없음: ' + name);
      return;
    }
    applyToSheet(sourceSheet, target, template);
  });

  SpreadsheetApp.flush();
}
