import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import corsConfig from './config/corsConfig';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import hpp from 'hpp';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { logSequelize, sequelize } from './models';
import { router } from './routes/index';
import { logging, makeLogFormat } from './lib/logging';
import { responseCode as resCode, makeResponseError as resError, ErrorClass } from './lib/resUtil';
import { receiveMqtt } from './lib/mqttUtil';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerJson from '../src/swagger.json';

import * as process from 'process';
import { service as workOrderService } from './service/operation/workOrderService';
import { makeinitDailyWorkOrderstatsScheduleSet } from './lib/scheduleUtil';
import { service as facilityService } from './service/operation/facilityService';

dotenv.config();

const app = express();
const port = Number(process.env.NODE_PORT || '3030');
const httpsPort = Number(process.env.NODE_HTTPS_PORT || '443');
const env = (process.env.NODE_ENV as 'production' | 'test' | 'development') || 'development';

function getSslFile(sslType: string) {
  if (sslType === 'key') {
    try {
      return fs.readFileSync(path.join(__dirname, '../ssl/flexing.ai.key'));
    } catch (err) {
      logging.SYSTEM_LOG({
        title: 'SSL file',
        message: 'no ssl file - ssl.key',
      });

      return null;
    }
  } else if (sslType === 'cert') {
    try {
      return fs.readFileSync(path.join(__dirname, '../ssl/ssl-flexing.crt'));
    } catch (err) {
      logging.SYSTEM_LOG({
        title: 'SSL file',
        message: 'no ssl file - ssl.cert',
      });

      return null;
    }
  }

  return null;
}
const httpsOption = {
  key: getSslFile('key'),
  cert: getSslFile('cert'),
};
app.set('port', port);

// sequelize sync 동작 (Table 자동 생성 옵션)
if (env === 'production') {
  // production인 경우에만 자동 생성 한다. (개발시에는 POST {{url}}/tables 를 이용할 것)
  sequelize
    .sync({
      force: false,
    })
    .then(async () => {
      logging.SYSTEM_LOG({
        title: 'Sequelize Table Sync',
        message: {
          DB_HOST: process.env.DB_HOST,
          DB_PORT: process.env.DB_PORT,
          DB_DATABASE: process.env.DB_DATABASE,
          DB_ID: process.env.DB_ID,
          DB_PASS: '******',
          DB_DIALECT: process.env.DB_DIALECT,
        },
      });
      console.log('Sequelize sync success');

      await facilityService.writeAllRedis();
    })
    .catch((err: Error) => {
      console.error(err);
    });
}

// NODE_ENV 환경에 따른 설정
if (env === 'production') {
  // 운영 환경 세팅
  app.use(hpp());
  app.use(helmet());
  app.use(morgan('combined'));
  void (async () => {
    try {
      await sequelize.sync({ force: false }).then(async () => {
        logging.SYSTEM_LOG({
          title: 'Sequelize Table Sync',
          message: {
            DB_HOST: process.env.DB_HOST,
            DB_PORT: process.env.DB_PORT,
            DB_DATABASE: process.env.DB_DATABASE,
            DB_ID: process.env.DB_ID,
            DB_PASS: '******',
            DB_DIALECT: process.env.DB_DIALECT,
          },
        });
        console.log('Sequelize sync success');
      });
    } catch (error) {
      console.error('Unable to connect to the database:', error);
    }

    try {
      await logSequelize.sync({ force: false }).then(async () => {
        // // 첫 번째 쿼리 실행
        // try {
        //   await logSequelize.query(`SELECT create_hypertable('logs', 'created_at');`);
        // } catch (error) {
        //   console.log('Error creating hypertable for logs, but continuing:', error);
        //   await logSequelize.query(`SELECT create_hypertable('item_logs', 'created_at');`);
        // }

        // // 두 번째 쿼리 실행
        // try {
        //   await logSequelize.query(`SELECT create_hypertable('item_logs', 'created_at');`);
        // } catch (error) {
        //   console.log('Error creating hypertable for item_logs, but continuing:', error);
        // }

        logging.SYSTEM_LOG({
          title: 'Sequelize Log Table Sync',
          message: {
            LOG_DB_HOST: process.env.LOG_DB_HOST,
            LOG_DB_PORT: process.env.LOG_DB_PORT,
            LOG_DB_DATABASE: process.env.LOG_DB_DATABASE,
            LOG_DB_ID: process.env.LOG_DB_ID,
            LOG_DB_PASS: '******',
            LOG_DB_DIALECT: process.env.LOG_DB_DIALECT,
          },
        });
        console.log('Sequelize sync success');
        receiveMqtt(); // mqtt subscribe
      });
    } catch (error) {
      console.error(error);
    }
  })();
} else {
  // 개발/테스트 환경 세팅
  app.use(morgan('dev'));
}

app.use(cors(corsConfig)); // cors 설정
app.use('/public', express.static('public')); // 정적(static) 파일 세팅
app.use('/images', express.static('uploads/images')); // 업로드된 이미지 파일
app.use(
  express.json({
    limit: '50mb',
  }) as any
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env === 'development') {
  // swagger 문서 UI 설정
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerJson, { explorer: true }));
}
app.use(router);
receiveMqtt(); // mqtt subscribe

// catch 404 and forward to error handler
app.use((req, res) => {
  const logFormat = makeLogFormat(req);
  logging.REQUEST_PARAM(logFormat);

  const resJson = resError(new ErrorClass(resCode.PAGE_NOT_FOUND));
  logging.RESPONSE_DATA(logFormat, resJson);

  res.status(resJson.status).json(resJson);
});

const logMessage = {
  NODE_ENV: process.env.NODE_ENV,
  NODE_PORT: port,
  LOGGER_LEVEL: process.env.LOGGER_LEVEL,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_DATABASE: process.env.DB_DATABASE,
  DB_DIALECT: process.env.DB_DIALECT,
  MQTT_HOST: process.env.MQTT_HOST,
  MQTT_PORT: process.env.MQTT_PORT,
  MQTT_TOPIC: process.env.MQTT_TOPIC,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
};

// running http
app.listen(app.get('port'), () => {
  logging.SYSTEM_LOG({
    title: `Server Running (http:${port})`,
    message: {
      ...logMessage,
    },
  });
  console.log(`server is running on http port:${port}`);
});

// running https
if (httpsOption.key && httpsOption.cert) {
  const httpsServer = https.createServer({ key: httpsOption.key, cert: httpsOption.cert }, app);
  httpsServer.listen(httpsPort, () => {
    logging.SYSTEM_LOG({
      title: `Server Running (https:${httpsPort})`,
      message: {
        ...logMessage,
      },
    });
    console.log(`server is running on http port:${httpsPort}`);
  });
}


if (process.env.SHCEDULER_DAILY_WORK_ORDER_STATS === 'true') {
  makeinitDailyWorkOrderstatsScheduleSet({ hour: 0, minute: 0, second: 0 })
}
