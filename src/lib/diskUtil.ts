import si from 'systeminformation';

// 루트 파티션('/') 사용률(%) → 정수 문자열, 실패 시 null
// 컨테이너 환경에서는 overlay가 호스트 루트 디스크를 반영하므로 '/'를 측정한다.
// Windows 로컬 개발 등 '/'가 없으면 첫 번째 드라이브로 폴백한다.
export const getRootDiskUsagePercent = async (): Promise<string | null> => {
  try {
    const fsList = await si.fsSize();
    const root = fsList.find((fs) => fs.mount === '/') ?? fsList[0];
    if (!root) return null;
    return String(Math.round(root.use ?? 0));
  } catch {
    return null;
  }
};
