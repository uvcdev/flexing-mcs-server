import fs from 'fs';
import path from 'path';
import { checkbox, Separator } from '@inquirer/prompts';

// 📌 JSON 파일 경로
const filePath = path.resolve(__dirname, '../../plcTagInfo.json');

// 📌 JSON 파일 읽기
const rawData = fs.readFileSync(filePath, 'utf-8');
const jsonData = JSON.parse(rawData);

// 📌 INPUT_TYPE이 "Bool"이 아닌 태그만 필터링하여 선택지 구성
const inputTypeTags: { name: string; value: string; checked: boolean }[] = jsonData[process.env.SITE || 'MBS']
  .filter((tag: any) => tag.INPUT_TYPE !== 'Bool') // ✅ Bool이 아닌 태그만 필터링
  .map((tag: any) => {
    const isChecked = tag.INPUT_TYPE === 'ASCII'; // ✅ "ASCII"면 기본 선택 (true), "DEC"면 선택 해제 (false)
    return { name: tag.TAG_NAME, value: tag.TAG_NAME, checked: isChecked };
  });

// 📌 사용자에게 체크박스 선택 UI 제공
async function selectInputTypes() {
  const selectedTags = await checkbox({
    message: 'Select tags where INPUT_TYPE should be ASCII (Checked: ASCII / Unchecked: DEC)',
    choices: [
      new Separator('──────────────'),
      ...inputTypeTags, // ✅ 기본 선택 여부 반영
      new Separator('──────────────'),
    ],
  });

  // 📌 선택한 태그에 해당하는 INPUT_TYPE 값을 업데이트
  jsonData[process.env.SITE || 'MBS'].forEach((tag: any) => {
    if (tag.INPUT_TYPE !== 'Bool') {
      tag.INPUT_TYPE = selectedTags.includes(tag.TAG_NAME) ? 'ASCII' : 'DEC';
    }
  });

  // 📌 수정된 JSON 파일 저장
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

  console.log('✅ INPUT_TYPE updated successfully!');
}

// 실행
selectInputTypes();
