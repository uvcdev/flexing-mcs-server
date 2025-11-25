import { UserInsertParams } from '../models/common/user';
import { CommonCodeInsertParams } from '../models/common/commonCode';

// 데이터 초기화를 위한 값들의 모임

// 시스템 관리자
export const initUser: UserInsertParams = {
  userid: 'system',
  password: '@dbqlTl1',
  name: '시스템관리자',
  email: null,
  mobile: null,
  active: true,
  auth: 'system',
};

// 공통 코드
export const initCommonCodes: Array<CommonCodeInsertParams> = [];
