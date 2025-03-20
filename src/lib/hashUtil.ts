import passwordValidator from 'password-validator';
import crypto, { randomUUID } from 'crypto';

// 패스워드 정책 체크
export function checkPasswordValidator(password: string): boolean {
  const schema = new passwordValidator();

  schema
    .is()
    .min(4) // 최소 4자리
    .is()
    .max(50) // 최대 50자리
    // .has()
    // .uppercase() // 영문 대문자 반드시 포함
    // .has()
    // .lowercase() // 영문 소문자 반드시 포함
    // .has()
    // .digits(1) // 숫자 최소 1개 반드시 포함
    // .has()
    // .symbols(1) // 특수문자 최소 1개 반드시 포함
    .has()
    .not()
    .spaces(); // 공백 허용 안함

  return schema.validate(password) as boolean;
}

// hash함수 생성
export function makePasswordHash(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 입력값이 없는 경우 튕겨냄
    if (!password) {
      reject(new Error('Not allowed null (password)'));
    }

    // 1. salt 생성
    const salt = crypto.randomBytes(64).toString('base64');

    // 2. hash 생성
    crypto.pbkdf2(password, salt, 100001, 64, 'sha256', (err, derivedKey) => {
      if (err) throw err;

      const hash = derivedKey.toString('hex');

      // 최종 패스워드 (password=salt.hash)
      const encryptedPassword = `${salt}.${hash}`;

      resolve(encryptedPassword);
    });
  });
}

// 패스워드 확인
export function checkPasswordHash(password: string, encryptedPassword: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // 입력값이 없는 경우 튕겨냄
    if (!password || !encryptedPassword) {
      reject(new Error('Not allowed null (password)'));
    }

    // 1. salt와 hash 분리
    const passwordSplit = encryptedPassword.split('.');
    const salt = passwordSplit[0];
    const hash = passwordSplit[1];

    // 2. 입력된 password로 부터 hash 생성
    crypto.pbkdf2(password, salt, 100001, 64, 'sha256', (err, derivedKey) => {
      if (err) throw err;

      const newHash = derivedKey.toString('hex');

      // 입력된 password와 암호화된 password를 비교한다.
      if (newHash === hash) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// 메세지 고유의 GUID 사용 필요성 때문에 추가
// UUID 생성 함수
export function generateUUIDNode() {
  return randomUUID();
}