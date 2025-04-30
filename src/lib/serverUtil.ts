/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { MqttTopics, sendMqtt } from './mqttUtil';
import os from 'os';
import { cpu, mem } from 'node-os-utils';

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
  ramUsage: string;
  cpuUsage: string;
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
  ramUsage: '00',
  cpuUsage: '00',
};
// const checkTimes = {
//   mcs: (process.env.SERVER_STATUS_CHECK_TIME_MCS && Number(process.env.SERVER_STATUS_CHECK_TIME_MCS)) || 10,
//   fms: (process.env.SERVER_STATUS_CHECK_TIME_FMS && Number(process.env.SERVER_STATUS_CHECK_TIME_FMS)) || 10,
//   db: (process.env.SERVER_STATUS_CHECK_TIME_DB && Number(process.env.SERVER_STATUS_CHECK_TIME_DB)) || 60,
// };
export const useServerUtil = () => {
  const getStatus = () => serverStatus;
  const sendStatus = async () => {
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
    const ramUsage = await getRAMUsage();
    const cpuUsage = await getCPUUsage();
    serverStatus.ramUsage = ramUsage;
    serverStatus.cpuUsage = cpuUsage;
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

  const getRAMUsage = async () => {
    const memory = await mem.info();
    const totalMemMB = Math.floor(memory.totalMemMb);
    const usedMemMB = Math.floor(memory.usedMemMb);
    const percent = Math.floor(memory.usedMemPercentage);

    // console.log(`시스템 RAM 사용량: ${percent}%`);

    return percent.toString().padStart(2, '0');
  };

  const getCPUUsage = async () => {
    const cpuUsage = await cpu.usage();
    // console.log(`시스템 CPU 사용량: ${Math.floor(cpuUsage)}%`);
    return Math.floor(cpuUsage).toString().padStart(2, '0');
  };


  return { getStatus, sendStatus, getRAMUsage, getCPUUsage };
};
