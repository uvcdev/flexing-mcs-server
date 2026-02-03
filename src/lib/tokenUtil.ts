import { sign as jwtSign, verify as jwtVerify } from 'jsonwebtoken';
import { tokenConfig as token } from '../config/tokenConfig';
import { UserAttributes } from '../models/common/user';

// payload 인터페이스
export interface Payload {
  id: number | null;
  userid: string | null;
  name: string | null;
  auth: string | null;
}

// payload 확장 인터페이스
export interface PayloadExt extends Payload {
  iat: number;
  exp: number;
}

// 토큰 생성
export function makeAccessToken(user: UserAttributes | Payload | null): string {
  const payload: Payload = {
    id: user && user.id,
    userid: user && user.userid,
    name: user && user.name,
    auth: user && user.auth,
  };

  const accessToken = jwtSign(payload, token.secretKey, token.options);

  return accessToken;
}

// 토큰 검증
export function verifyAccessToken(accessToken: string): Payload | null {
  try {
    const decoded = jwtVerify(accessToken, token.secretKey) as Payload;

    return decoded;
  } catch (err) {
    return null;
  }
}

// 로그인된 토큰값을 토대로 companyId에 대해서 제어가 가능한지 체크
// export function checkTokenAuth(
//   tokenUser: Payload | undefined,
//   companyId: number | null,
//   userId: number | null
// ): boolean {
//   let isAuthOk = false;

//   if (tokenUser && tokenUser.auth === 'system') {
//     // auth === 'system'인 경우 모든 권한 가능
//     isAuthOk = true;
//   } else if (tokenUser && tokenUser.auth === 'admin') {
//     // auth === 'admin'인 경우 본인의 companyId만 제어 가능
//     if (tokenUser.companyId === companyId) {
//       isAuthOk = true;
//     }
//   } else if (tokenUser && tokenUser.auth === 'staff') {
//     // auth === 'staff'인 경우 자신의 데이터만 제어 가능
//     if (tokenUser.companyId === companyId && tokenUser.id === userId) {
//       isAuthOk = true;
//     } else {
//       isAuthOk = false;
//     }
//   }

//   return isAuthOk;
// }
