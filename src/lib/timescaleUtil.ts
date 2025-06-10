/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { logging } from './logging';
import * as dotenv from 'dotenv';
import { logSequelize } from '../models';
dotenv.config();

export const useTimescaleUtil = () => {
  const retention = (period: string): void => {
    const logPeriod = JSON.parse(period);
    void logSequelize.query(
      `SELECT remove_retention_policy('logs'); 
         SELECT add_retention_policy('logs', INTERVAL '${logPeriod.mcsLog} days');`
    );
  };

  return {
    retention,
  };
};
