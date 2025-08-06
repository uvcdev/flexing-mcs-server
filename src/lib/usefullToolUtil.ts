import { LogFormat, logging, makeLogFormat, RequestLog } from './logging';
import dayjs from 'dayjs';
import { makeResponseError as resError, SelectedListResult } from './resUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { FacilityAttributesDeep } from '../models/operation/facility';
import { service as facilityService } from '../service/operation/facilityService';

// 랜덤한 코드를 생성 for 출고(itemOutflow)
export const makeCode = (pre: string): string => {
  const now = new Date().getTime();
  const result = `${pre}-${now}`;
  return result;
};

export const errorFunction = (logFormat: LogFormat<unknown>, params: any, err: any): Promise<unknown> => {
  logging.ERROR_METHOD(logFormat, __filename, params, err);

  return new Promise((resolve, reject) => {
    reject(err);
  });
};
// YYMMDD 형태의 code를 생성
export const makeCodeByDate = (pre: string, post: string): string => {
  const now = new Date();
  const formattedDate = dayjs(now).format('YYMMDD');
  post = post.padStart(4, '0');
  const result = `${pre}${formattedDate}-${post}`;
  return result;
};

// 테이블에 맞는 code뒤의 count값 생성
export const FindTopLevelRowOfTableAndMakeCode = (code: string, createdAt: Date = new Date()): number | Error => {
  let rowInsertedParam = 0;
  const rowDate = dayjs(dayjs(createdAt).format('YYYY-MM-DD')); // 시간 제외를 위한 convert ex) 2023-01-17
  const nowDate = dayjs(dayjs(new Date()).format('YYYY-MM-DD')); // 시간 제외를 위한 convert ex) 2023-01-17
  // row의 생성일이 현재일보다 전일이면 ? '0001' 적용 : 기존code값 + 1
  const codeCount = parseInt(code.split('-')[1]);
  // NaN일 경우 생성불가
  if (isNaN(codeCount)) {
    throw new Error('code should be not NaN, code의 값이 형식에 맞지 않습니다.');
  }
  rowInsertedParam = nowDate.diff(rowDate, 'day') ? 1 : codeCount + 1; // XYZ230116-001
  return rowInsertedParam;
};

// 자동체번
export const makeRegularCode = (topLevelRow: SelectedListResult<unknown>, columnCode: string, preCode: string) => {
  let increasingCount = 1;
  // code 찾아서 +1 해주기
  if (topLevelRow.rows.length > 0) {
    const highestRow = topLevelRow.rows[0] as { [key: string]: string } & { createdAt: Date };
    const currentCount = FindTopLevelRowOfTableAndMakeCode(highestRow[columnCode] || '', highestRow.createdAt);
    if (typeof currentCount === 'number') {
      increasingCount = currentCount;
    }
  }
  return makeCodeByDate(preCode, increasingCount.toString());
};

// 다양한 dao를 받기위한 type, T에는 Model Attribute 속성
interface basicDao<T> {
  selectList(options: { code?: string; order?: string; limit?: number }): Promise<{ rows: T[]; count: number }>;
}

// 자동체번 With Dao
export const makeRegularCodeDao = async (
  columnCode: string,
  codeHeader: string,
  dao: basicDao<unknown>
): Promise<string> => {
  let increasingCount = 1;
  const now = dayjs().format('YYMMDD');

  // 1. [code string의 날짜를 기준으로 최상위 row 검색] 테이블의 최상단 row를 찾기 위함
  const topLevelRowByDao = await dao.selectList({ code: `${now}`, order: '-id', limit: 1 });
  const highestRow = topLevelRowByDao.rows[0] as { [key: string]: string } & { createdAt: Date } & { code: string };
  try {
    if (topLevelRowByDao.rows.length > 0) {
      // 2. 최상위 row에서 날짜만 빼오기
      const [day, count] = highestRow[columnCode].match(/\d+/g) || [];

      if (day) {
        const standardDay = `20${day}`;
        // 3. 최상위 row의 column code에서 번호 추출
        const currentCount = FindTopLevelRowOfTableAndMakeCode(
          highestRow[columnCode] || '',
          dayjs(standardDay).toDate()
        );
        if (typeof currentCount === 'number') {
          increasingCount = currentCount;
        }
      }
    }

    const result = makeCodeByDate(codeHeader, increasingCount.toString());
    // 4. 중복되는 값 체크
    const keyObject: { [key: string]: string } = {};
    keyObject[columnCode] = result;
    const duplicatedCheck = await dao.selectList(keyObject);

    // 새로 생성된 code가 존재한다면 reject
    if (duplicatedCheck.rows.length === 0) {
      return result;
    } else {
      // 에러 응답 값 세팅
      return new Promise((resolve, reject) => {
        reject(new Error(`동일한 Code가 존재합니다. 현재Code: ${result}`));
      });
    }
  } catch (err) {
    // 에러 응답 값 세팅
    return new Promise((resolve, reject) => {
      reject(err);
    });
  }
};

export const pushArrayWithPromise = (array: Array<any>, item: any) => {
  return new Promise<void>((resolve) => {
    array.push(item);
    resolve();
  });
};

export const formatDetailedDateTime = (date: Date) => {
  return (
    dayjs(date).format('YYYY.MM.DD HH:mm:ss') + '.' + String(date.getMilliseconds()).padStart(3, '0').substring(0, 2)
  );
};

export const isCurrentTimeFasterThanAnySeconds = (referenceTime: Date, anySeconds: number) => {
  const currentTime = new Date();
  const timeDifference = currentTime.getTime() - referenceTime.getTime();

  return timeDifference >= 1000 * anySeconds;
};

export const isCurrentTimeFasterThanAnyMinutes = (referenceTime: Date, anyMinutes: number) => {
  const currentTime = new Date();
  const timeDifference = currentTime.getTime() - referenceTime.getTime();

  return timeDifference >= 1000 * 60 * anyMinutes;
};

export const removeAckPrefix = (input: string): string => {
  return input.replace(/^ACK_/, '');
};

export const formatToDateCode = (input: number): string => {
  let month: number;
  let day: number;

  if (input < 100) {
    // 예: 11 → 01월 01일
    month = Math.floor(input / 10);
    day = input % 10;
  } else {
    // 예: 425 → 04월 25일
    month = Math.floor(input / 100);
    day = input % 100;
  }

  // 두 자릿수 포맷 맞추기
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');

  return `${monthStr}${dayStr}`;
};

export const makeCallCount = async (facilityInfo: FacilityAttributesDeep): Promise<string> => {
  // Redis에서 기존 객체 가져오기
  const facilityCode = facilityInfo.serial || '';
  const currentValue = facilityInfo.generatedCallCount || 0;
  let nextValue = currentValue + 1;

  // 9999 넘어가면 다시 1로
  if (nextValue > 9999) {
    nextValue = 1;
  }

  const newData = { ...facilityInfo, generatedCallCount: nextValue };
  const facilityInfoRedisString = JSON.stringify(newData);

  await useRedisUtil().hset(RedisKeys.InfoFacilityBySerial, facilityCode, facilityInfoRedisString);
  await useRedisUtil().hset(RedisKeys.InfoFacilityById, facilityInfo.id.toString(), facilityInfoRedisString);
  void facilityService.edit({ id: facilityInfo.id, generatedCallCount: nextValue }, makeLogFormat({} as RequestLog));

  // 4자리 패딩된 값 리턴
  const paddedSeq = nextValue.toString().padStart(4, '0');
  return paddedSeq;
};
