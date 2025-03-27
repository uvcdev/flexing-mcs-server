import fs from "fs";
import path from "path";
import { checkbox, Separator } from "@inquirer/prompts";

// 📌 JSON 파일 경로
const filePath = path.resolve(__dirname, "../../kepserverTag.json");

// 📌 JSON 파일 읽기
const rawData = fs.readFileSync(filePath, "utf-8");
const jsonData = JSON.parse(rawData);

// 📌 중복 없는 TAG_NAME 목록 만들기 (Set 사용)
const tagNames: { name: string; value: string; checked: boolean }[] = Array.from(
  new Set(jsonData.MBS.map((tag: any) => tag.TAG_NAME)) // Set에서 중복 제거
).map((tagName) => {
  const tagNameStr = String(tagName);
  const isChecked = jsonData.MBS.some((tag: any) => tag.TAG_NAME === tagNameStr && tag.SUBSCRIPTION === true);

  return { name: tagNameStr, value: tagNameStr, checked: isChecked };
});

// 📌 사용자에게 체크박스 선택 UI 제공
async function selectTags() {
  const selectedTags = await checkbox({
    message: "Select tags to enable subscription",
    choices: [
      new Separator("──────────────"),
      ...tagNames, // ✅ 기본 선택 여부 반영
      new Separator("──────────────"),
    ],
  });

  // 📌 선택한 태그에 해당하는 SUBSCRIPTION 값 업데이트
  jsonData.MBS.forEach((tag: any) => {
    tag.SUBSCRIPTION = selectedTags.includes(tag.TAG_NAME);
  });

  // 📌 수정된 JSON 파일 저장
  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf-8");

  console.log("✅ Subscription updated successfully!");
}

// 실행
selectTags();

