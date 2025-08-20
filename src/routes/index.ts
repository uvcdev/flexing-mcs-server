/* eslint-disable @typescript-eslint/no-misused-promises */
import * as express from 'express';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import { isActionKey } from '../lib/middleware';
import { makeResponseSuccess as resSuccess, responseType as resType } from '../lib/resUtil';

// common
import { router as mqttRouter } from './common/mqtt';
import { router as redisRouter } from './common/redis';
import { router as initRouter } from './common/init';
import { router as authRouter } from './common/auth';
import { router as fileRouter } from './common/file';
import { router as userRouter } from './common/user';
import { router as commonCodeRouter } from './common/commonCode';
import { router as tokenHistoryRouter } from './common/tokenHistory';
import { router as settingRouter } from './common/setting';
import { router as alarmEmailRouter } from './common/alarmEmail';
import { router as mcsAlarmRouter } from './common/mcsAlarm';
import { amrRouter } from './common/amr';
import { router as errorCodeRouter } from './common/errorCode';
// dashboard
import { router as dailyStatisticRouter } from './dashboard/dailyStatistic';
import { router as monthlyStatisticRouter } from './dashboard/monthlyStatistic';
// operation
import { router as facilityRouter } from './operation/facility';
import { router as facilityGroupRouter } from './operation/facilityGroup';
import { router as zoneRouter } from './operation/zone';
import { router as itemRouter } from './operation/item';
import { router as workOrderRouter } from './operation/workOrder';
// timescale
import { router as logRouter } from './timescale/log';
import { router as systemLogRouter } from './timescale/systemLog';
import { router as itemLogRouter } from './timescale/itemLog';
// support
import { router as faqRouter } from './support/faq';

// MBS
import { router as trackingLogRouter } from './common/trackingLog';
import { router as kepwareRouter } from './kepware/kepware';
dotenv.config();

const router = express.Router();

// index
router.get('/', (req, res) => {
  try {
    interface PackageJson {
      version: string;
      [key: string]: string;
    }

    const filePath = path.join(__dirname, '../../package.json');

    let version = '';
    fs.readFile(filePath, 'utf8', (_err, jsonFile) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonData: PackageJson = JSON.parse(jsonFile);
      version = jsonData.version;

      res.send(`Flexing MES (version: ${version})`);
    });
  } catch (err) {
    res.send(`Flexing MES`);
  }
});

//스태틱파일 경로
router.use('/uploads', express.static('uploads'));
router.use('/files', express.static('files'));

// .env 설정 응답(모두) - 앞으로는 여기에 코딩할 것
router.get('/env', isActionKey, (req, res) => {
  try {
    interface PackageJson {
      version: string;
      [key: string]: string;
    }

    const filePath = path.join(__dirname, '../../package.json');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const packageInfo: PackageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const envData = {
      info: {
        name: packageInfo.name,
        version: packageInfo.version,
      },
      mqttWs: {
        protocol: process.env.MQTT_WS_PROTOCOL,
        host: process.env.MQTT_WS_HOST,
        port: process.env.MQTT_WS_PORT,
        topic: process.env.MQTT_TOPIC,
      },
      cps: {
        host: process.env.CPS_SERVER,
        actionKey: process.env.CPS_ACTION_KEY,
      },
      projectName: process.env.PROJECT_NAME,
      serverUrl: process.env.SERVER_API_URL,
      popUrl: process.env.POP_URL,
      dashboardUrl: process.env.DASHBOARD_URL,
      accessTokenExpiresin: process.env.ACCESS_TOKEN_EXPIRESIN,
    };

    const resJson = resSuccess(envData, resType.INFO);

    res.json(resJson);
  } catch (err) {
    res.status(500).send('error');
  }
});

// info check - deprecated
router.get('/info', (req, res) => {
  try {
    interface PackageJson {
      version: string;
      [key: string]: string;
    }

    const filePath = path.join(__dirname, '../../package.json');

    fs.readFile(filePath, 'utf8', (_err, jsonFile) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonData: PackageJson = JSON.parse(jsonFile);

      const name = jsonData.name;
      const version = jsonData.version;

      const resJson = {
        name,
        version,
      };

      res.json(resJson);
    });
  } catch (err) {
    res.status(500).send('error');
  }
});

// .env 설정 응답(mqtt-ws) - deprecated
router.get('/env/mqtt-ws', isActionKey, (req, res) => {
  try {
    const envMqttWs = {
      protocol: process.env.MQTT_WS_PROTOCOL,
      host: process.env.MQTT_WS_HOST,
      port: process.env.MQTT_WS_PORT,
      topic: process.env.MQTT_TOPIC,
    };

    const resJson = resSuccess(envMqttWs, resType.INFO);

    res.json(resJson);
  } catch (err) {
    res.status(500).send('error');
  }
});

// .env 설정 응답(projectName) - deprecated
router.get('/env/project-name', isActionKey, (req, res) => {
  try {
    const projectName = {
      projectName: process.env.PROJECT_NAME,
    };

    const resJson = resSuccess(projectName, resType.INFO);

    res.json(resJson);
  } catch (err) {
    res.status(500).send('error');
  }
});

// .env 설정 응답(popUrl) - deprecated
router.get('/env/pop-url', isActionKey, (req, res) => {
  try {
    const popUrl = {
      popUrl: process.env.POP_URL,
    };

    const resJson = resSuccess(popUrl, resType.INFO);

    res.json(resJson);
  } catch (err) {
    res.status(500).send('error');
  }
});

// common
router.use('/mqtt', mqttRouter);
router.use('/redis', redisRouter);
router.use('/init', initRouter);
router.use('/auths', authRouter);
router.use('/files', fileRouter);
router.use('/users', userRouter);
router.use('/common-codes', commonCodeRouter);
router.use('/token-histories', tokenHistoryRouter);
router.use('/settings', settingRouter);
router.use('/alarm-emails', alarmEmailRouter);
router.use('/mcs-alarms', mcsAlarmRouter);
router.use('/amrs', amrRouter);
router.use('/error-codes', errorCodeRouter);
// dashboard
router.use('/daily-statistics', dailyStatisticRouter);
router.use('/monthly-statistics', monthlyStatisticRouter);
// operation
router.use('/facilities', facilityRouter);
router.use('/facility-groups', facilityGroupRouter);
router.use('/zones', zoneRouter);
router.use('/items', itemRouter);
router.use('/work-orders', workOrderRouter);
//timescale
router.use('/logs', logRouter);
router.use('/system-logs', systemLogRouter);
router.use('/item-logs', itemLogRouter);
router.use('/tracking-logs', trackingLogRouter);
// kepware
router.use('/kepware', kepwareRouter);
// support
router.use('/faqs', faqRouter);

export { router };
