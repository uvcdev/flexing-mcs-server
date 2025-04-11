/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { MqttTopics, sendMqtt } from './mqttUtil';
import os from 'os';

export type ServerStatus = {
  // mcs: boolean;
  // fms: boolean;
  // db: boolean;
  // dryrun: boolean;
  // mcsTime: Date | null;
  // fmsTime: Date | null;
  // dbTime: Date | null;
  // dryrunTime: Date | null;
  // startEndOfDayState: 'start' | 'end';
  // realOrderGroupId: number | null;
  ramUsage: number;
  cpuUsage: number;
};

const serverStatus: ServerStatus = {
  // mcs: false,
  // fms: false,
  // db: false,
  // dryrun: false,
  // dbTime: null,
  // mcsTime: null,
  // fmsTime: null,
  // dryrunTime: null,
  // startEndOfDayState: 'start',
  // realOrderGroupId: null,
  ramUsage: 0,
  cpuUsage: 0,
};
// const checkTimes = {
//   mcs: (process.env.SERVER_STATUS_CHECK_TIME_MCS && Number(process.env.SERVER_STATUS_CHECK_TIME_MCS)) || 10,
//   fms: (process.env.SERVER_STATUS_CHECK_TIME_FMS && Number(process.env.SERVER_STATUS_CHECK_TIME_FMS)) || 10,
//   db: (process.env.SERVER_STATUS_CHECK_TIME_DB && Number(process.env.SERVER_STATUS_CHECK_TIME_DB)) || 60,
// };
export const useServerUtil = () => {
  const getStatus = () => serverStatus;
  const sendStatus = () => {
    // 현재시간 - mcs, fms 신호 최근 시간이 env설정값보다 크면 false 아니면 true
    // const now = new Date();
    // if (serverStatus.fmsTime && now.getTime() - serverStatus.fmsTime.getTime() > Number(checkTimes.fms) * 1000) {
    //   serverStatus.fms = false;
    // }
    // if (serverStatus.mcsTime && now.getTime() - serverStatus.mcsTime.getTime() > Number(checkTimes.mcs) * 1000) {
    //   serverStatus.mcs = false;
    // }
    // if (serverStatus.dbTime && now.getTime() - serverStatus.dbTime.getTime() > Number(checkTimes.db) * 1000) {
    //   serverStatus.db = false;
    // }
    sendMqtt(MqttTopics.ServerStatus, JSON.stringify(serverStatus));
  };
  // const setStatusTime = (type: 'mcs' | 'fms' | 'db' | 'dryrun' | 'startOfDay' | 'endOfDay', time: Date | null) => {
  //   if (type === 'mcs') {
  //     serverStatus.mcs = true;
  //     serverStatus.mcsTime = time;
  //   } else if (type === 'fms') {
  //     serverStatus.fms = true;
  //     serverStatus.fmsTime = time;
  //   } else if (type === 'db') {
  //     serverStatus.db = true;
  //     serverStatus.dbTime = time;
  //   } else if (type === 'dryrun') {
  //     if (time) {
  //       serverStatus.dryrun = true;
  //       serverStatus.dryrunTime = time;
  //     } else {
  //       serverStatus.dryrun = false;
  //       serverStatus.dryrunTime = time;
  //     }
  //   } else if (type === 'startOfDay') {
  //     serverStatus.startEndOfDayState = 'start';
  //   } else if (type === 'endOfDay') {
  //     serverStatus.startEndOfDayState = 'end';
  //   }
  // };
  // const setStartEndOfDayState = (type: 'start' | 'end') => {
  //   serverStatus.startEndOfDayState = type;
  // };
  // const setRealOrderGroupId = async () => {
  //   const orderGroupList = await orderGroupDao.selectList({ type: 'real' });
  //   if (orderGroupList.rows.length > 0) serverStatus.realOrderGroupId = orderGroupList.rows[0].id;
  // };

  const getRAMUsage = () => {
    const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(2);

    setInterval(() => {
      const memory = process.memoryUsage();
      const rssMB = (memory.rss / 1024 / 1024).toFixed(2);

      const percent = ((Number(rssMB) / Number(totalMemMB)) * 100).toFixed(2);

      console.log(`RAM 사용량: (${rssMB} / ${totalMemMB}) MB (${percent}%)`);

      serverStatus.ramUsage = Number(percent);

    }, 2000);
  };

  const getCPUUsage = () => {

    let lastUsage = process.cpuUsage();
    let lastTime = process.hrtime();

    setInterval(() => {

      const nowUsage = process.cpuUsage();
      const nowTime = process.hrtime();

      const elapsedUsage = {
        user: nowUsage.user - lastUsage.user,
        system: nowUsage.system - lastUsage.system,
      };

      const elapsedTime = [
        nowTime[0] - lastTime[0],
        nowTime[1] - lastTime[1],
      ];

      const elapsedMS = elapsedTime[0] * 1000 + elapsedTime[1] / 1e6;
      const usedCPUTimeMS = (elapsedUsage.user + elapsedUsage.system) / 1000;
      const rawPercent = (usedCPUTimeMS / elapsedMS) * 100;
      const normalizedPercent = rawPercent / os.cpus().length;

      console.log(`CPU 사용량: ${normalizedPercent.toFixed(2)}%`);

      serverStatus.cpuUsage = Number(normalizedPercent.toFixed(2));

      lastUsage = nowUsage;
      lastTime = nowTime;
    }, 2000);

  };

  return { getStatus, sendStatus, getRAMUsage, getCPUUsage };
};
