import { TagValue } from './kepServerUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
export interface EqpCallStats {
  CALL_ID: string;
  EQP_CALL_ID: string;
  Call_Type: string;
  Caller: string;
  Call_Quantity: number;
  Call_Priority: string;
  SYSTEM_NAME?: string;
  // NODE_ID: string;
}

export interface EqpCallStatsForAck extends EqpCallStats {
  Cmd_ID: string;
}

type DataObject = {
  count?: number;
  [key: string]: any;
};

export const useMultiCallRegisterUtil = () => {
  // const kepServerUtil = useKepServerUtil();
  const redisUtil = useRedisUtil();
  const multiCallRegister = async () => {
    try {
      const multiCallRegisterList = await redisUtil.hgetAllObject<TagValue>(RedisKeys.InfoMultiCallRequestOnBySerial);
      if (!multiCallRegisterList) return;

      // 멀티콜에 해당하는 작업지시
      for (let i = 0, length = multiCallRegisterList.length; i < length; i++) {
        // const targetTagInfo = multiCallRegisterList[i];
        // const targetCode = targetTagInfo.EQ_CODE;
      }
    } catch (error) {
      throw error;
    }
  };
  // callRequestMulti1Value와 callRequestMulti2Value의 값을 기반으로 multiValue 결정
  const hsetWithIncrementCount = async (key: string, field: string): Promise<void> => {
    const existing = await redisUtil.hget(key, field);

    let parsed: DataObject = {};
    if (existing) {
      try {
        parsed = JSON.parse(existing);
      } catch (existing) {
        console.error('Redis JSON parse error:', existing);
      }
    }

    const newCount = Math.min((parsed.count ?? 0) + 1, 3); // 3 초과 불가
    // const updated: DataObject = {
    //   ...parsed,
    //   ...data,
    //   count: newCount,
    // };

    await redisUtil.hset(key, field, String(newCount));
  };
  const hsetWithDecrementCount = async (key: string, field: string): Promise<void> => {
    const existing = await redisUtil.hget(key, field);

    let parsed: DataObject = {};
    if (existing) {
      try {
        parsed = JSON.parse(existing);
      } catch (existing) {
        console.error('Redis JSON parse error:', existing);
      }
    }

    const currentCount = (parsed.count ?? 0) - 1;
    const newCount = Math.max(currentCount - 1, 0); // 0 이하 불가
    // const updated: DataObject = {
    //   ...parsed,
    //   count: newCount,
    // };

    await redisUtil.hset(key, field, String(newCount));
  };
  return { multiCallRegister, hsetWithIncrementCount, hsetWithDecrementCount };
};
