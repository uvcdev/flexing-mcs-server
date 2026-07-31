import { execFile } from 'child_process';
import { constants } from 'fs';
import { access } from 'fs/promises';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

// 아래 경로 상수를 모듈 로드 시점에 읽으므로, index.ts의 dotenv.config()보다 먼저 로드해야 한다
dotenv.config();

const execFileAsync = promisify(execFile);

// Node 18+ statfs — @types/node 14에는 타입 정의 없음
const statfs = require('fs/promises').statfs as (
  path: string
) => Promise<{ blocks: number; bfree: number }>;

// 운영(Linux Docker) 기본 경로. 필요 시 .env로 덮어쓰기 (예: Windows 로컬 USB 테스트 시 DISK_VOLUME_CHECK_PATH=D:\)
export const DISK_ROOT_CHECK_PATH = process.env.DISK_ROOT_CHECK_PATH || '/';
export const DISK_VOLUME_CHECK_PATH = process.env.DISK_VOLUME_CHECK_PATH || '/app/uploads';

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

// Linux/macOS: df -P {path} → Capacity 컬럼(%) 파싱
const getDiskUsagePercentUnix = async (mountPath: string): Promise<number | null> => {
  try {
    // df가 응답 없이 매달리면(스테일 마운트 등) 자식 프로세스가 계속 쌓이므로 타임아웃 필수
    const { stdout } = await execFileAsync('df', ['-P', mountPath], { timeout: 3000, killSignal: 'SIGKILL' });
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;

    const parts = lines[1].trim().split(/\s+/);
    const capacity = parts[4];
    if (!capacity?.endsWith('%')) return null;

    const percent = parseInt(capacity.replace('%', ''), 10);
    return isNaN(percent) ? null : percent;
  } catch {
    return null;
  }
};

// Windows 로컬 개발용: statfs로 사용률 계산 (경로가 실제로 존재할 때만)
const getDiskUsagePercentWindows = async (mountPath: string): Promise<number | null> => {
  try {
    const stats = await statfs(mountPath);
    if (!stats.blocks) return null;

    const used = stats.blocks - stats.bfree;
    return Math.round((used / stats.blocks) * 100);
  } catch {
    return null;
  }
};

// 지정 경로 디스크 사용률(%) 조회. 실패·경로 없음 시 null (판단 보류)
export const getDiskUsagePercentByPath = async (mountPath: string): Promise<number | null> => {
  if (!(await pathExists(mountPath))) return null;

  if (process.platform === 'win32') {
    return getDiskUsagePercentWindows(mountPath);
  }
  return getDiskUsagePercentUnix(mountPath);
};

export const getRootDiskUsagePercent = async (): Promise<number | null> => {
  return getDiskUsagePercentByPath(DISK_ROOT_CHECK_PATH);
};

export const getVolumeDiskUsagePercent = async (): Promise<number | null> => {
  return getDiskUsagePercentByPath(DISK_VOLUME_CHECK_PATH);
};
