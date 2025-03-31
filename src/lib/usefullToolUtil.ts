import { LogFormat, logging } from './logging';
import dayjs from 'dayjs';
import { makeResponseError as resError, SelectedListResult } from './resUtil';

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
  return dayjs(date).format('YYYY.MM.DD HH:mm:ss') + '.' +
    String(date.getMilliseconds()).padStart(3, '0').substring(0, 2);
};

export const isCurrentTimeFasterThanAnySeconds = (referenceTime: Date, anySeconds: number) => {
  const currentTime = new Date();
  const timeDifference = currentTime.getTime() - referenceTime.getTime();

  return timeDifference >= (1000 * anySeconds)
}