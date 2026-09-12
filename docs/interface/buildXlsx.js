/**
 * Interface 연동정의서 CSV → 서식 적용된 XLSX 변환
 *
 * 실행: node docs/interface/buildXlsx.js   (프로젝트 루트에서)
 *
 * - 12컬럼 CSV를 실제 시트 레이아웃(5컬럼: A~E)으로 압축
 * - 셀 병합 / 배경색 / 글자 크기 / 테두리 / 행 높이 적용
 *
 * 색상은 아래 THEME 에서 한 곳에서 관리한다. 원본 시트 색상값을 알면 여기만 고치면 된다.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DIR = __dirname;

const THEME = {
  title: { bg: 'FF1F3864', font: 'FFFFFFFF', size: 14, bold: true }, // 프로그램 명
  section: { bg: 'FFB4C6E7', font: 'FF000000', size: 11, bold: true }, // Request/Response Body
  label: { bg: 'FFF2F2F2', font: 'FF000000', size: 10, bold: true }, // Function Id ~ Url 라벨(A열)
  header: { bg: 'FFD9E2F3', font: 'FF000000', size: 10, bold: true }, // Parameter 헤더행
  body: { bg: null, font: 'FF000000', size: 10, bold: false }, // 파라미터 행
  eg: { bg: 'FFFAFAFA', font: 'FF444444', size: 9, bold: false }, // e.g. JSON
  note: { bg: 'FFFFF2CC', font: 'FF000000', size: 9, bold: false }, // E열 비고
  border: 'FFBFBFBF',
};

const BASE_FONT = '맑은 고딕';
const MONO_FONT = 'Consolas';

const COLS = [
  { width: 18 }, // A Parameter / 라벨
  { width: 20 }, // B Mandatory/Optional / 값
  { width: 10 }, // C Type
  { width: 46 }, // D Description
  { width: 34 }, // E 비고
];

/* ---------- CSV 파서 ---------- */
function parseCsv(text) {
  const rows = [[]];
  let cur = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      rows[rows.length - 1].push(cur);
      cur = '';
    } else if (c === '\n') {
      rows[rows.length - 1].push(cur);
      cur = '';
      rows.push([]);
    } else if (c !== '\r') cur += c;
  }
  rows[rows.length - 1].push(cur);
  // 마지막 빈 행 제거
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

/* ---------- 행 종류 판별 ---------- */
function classify(row, index) {
  const a = String(row[0] || '').trim();
  if (index === 0) return 'TITLE';
  if (a === '') return 'EMPTY';
  if (a === 'Function Id') return 'LABEL';
  if (a === 'Subject') return 'LABEL';
  if (a === 'Description') return 'LABEL';
  if (a === 'Type') return 'LABEL';
  if (a === 'Url') return 'LABEL';
  if (a === 'Request Body' || a === 'Response Body') return 'SECTION';
  if (a === 'Parameter') return 'HEADER';
  if (a === 'e.g.') return 'EG';
  return 'PARAM';
}

/* ---------- 12컬럼 → 5컬럼 압축 ---------- */
function compress(row, kind) {
  if (kind === 'TITLE') return ['프로그램 명', row[3] || '', '', '', ''];
  // A~D + 비고(원본 8번째 컬럼)
  return [row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[7] || ''];
}

/* ---------- 스타일 적용 ---------- */
function lineCount(v) {
  return String(v || '').split('\n').length;
}

function styleRow(ws, rowIdx, kind, values) {
  const row = ws.getRow(rowIdx);
  const t =
    kind === 'TITLE'
      ? THEME.title
      : kind === 'SECTION'
        ? THEME.section
        : kind === 'HEADER'
          ? THEME.header
          : kind === 'EG'
            ? THEME.eg
            : THEME.body;

  for (let c = 1; c <= 5; c++) {
    const cell = row.getCell(c);
    let style = t;
    let fontName = BASE_FONT;

    if (kind === 'LABEL') style = c === 1 ? THEME.label : THEME.body;
    if (kind === 'PARAM' && c === 5 && values[4]) style = THEME.note;
    if (kind === 'EG' && c === 1) style = THEME.label;
    if (kind === 'EG' && c === 2) fontName = MONO_FONT;

    cell.font = { name: fontName, size: style.size, bold: style.bold, color: { argb: style.font } };
    if (style.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bg } };
    cell.alignment = {
      vertical: kind === 'TITLE' || kind === 'SECTION' || kind === 'HEADER' ? 'middle' : 'top',
      horizontal: kind === 'HEADER' || (kind === 'PARAM' && (c === 2 || c === 3)) ? 'center' : 'left',
      wrapText: true,
    };
    if (kind !== 'EMPTY') {
      const b = { style: 'thin', color: { argb: THEME.border } };
      cell.border = { top: b, left: b, bottom: b, right: b };
    }
  }

  // 병합
  if (kind === 'TITLE' || kind === 'LABEL' || kind === 'EG') ws.mergeCells(rowIdx, 2, rowIdx, 5);
  if (kind === 'SECTION') ws.mergeCells(rowIdx, 1, rowIdx, 5);

  // 행 높이 (줄 수 기반)
  const maxLines = Math.max(...values.map(lineCount));
  if (kind === 'TITLE') row.height = 30;
  else if (kind === 'EMPTY') row.height = 8;
  else if (maxLines > 1) row.height = maxLines * (kind === 'EG' ? 12.5 : 14);
  else row.height = 19;
}

/* ---------- 시트 생성 ---------- */
async function build(csvFile) {
  const name = path.basename(csvFile, '.csv').replace('Interface_연동정의서 - ', '');
  const rows = parseCsv(fs.readFileSync(csvFile, 'utf8'));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLS;

  rows.forEach((raw, i) => {
    const kind = classify(raw, i);
    const values = compress(raw, kind);
    ws.addRow(values);
    styleRow(ws, i + 1, kind, values);
  });

  const out = path.join(DIR, `Interface_연동정의서 - ${name}.xlsx`);
  await wb.xlsx.writeFile(out);
  console.log(`생성: ${path.basename(out)}  (${rows.length} rows)`);
}

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.csv'));
  for (const f of files) await build(path.join(DIR, f));
})();
