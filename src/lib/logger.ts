import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

/**
 * logger 세팅 파일
 * 본 파일을 직접 사용하지 말고 logging.ts 파일을 통해 사용할 것
 */

dotenv.config();
const loggerLevel = (process.env.LOGGER_LEVEL as 'debug' | 'info') || 'info';

interface TransformableInfo {
  level: string;
  message: string;
  [key: string]: unknown;
}

// log 디렉토리 생성
const logDir = path.join(__dirname, '../../logs'); // 제일 상위에 올린다.
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = createLogger({
  level: loggerLevel,
  format: format.combine(format.json()),
  transports: [
    // 콘솔 출력은 하지 않는다.
    new transports.DailyRotateFile({
      // 로그파일 출력 세팅
      filename: `${logDir}/%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      // format: format.combine(format.printf((info: TransformableInfo) => `${info.message}`)),
    }),
  ],
});

export default logger;
