import { Transaction } from 'sequelize';
import { LogFormat, logging } from '../../lib/logging';
import {
  BulkInsertedOrUpdatedResult,
  DeletedResult,
  InsertedResult,
  SelectedAllResult,
  SelectedListResult,
  UpdatedResult,
} from '../../lib/resUtil';
import {
  FacilityAttributes,
  FacilityAttributesDeep,
  FacilityDeleteParams,
  FacilityInsertParams,
  FacilitySelectInfoParams,
  FacilitySelectListParams,
  FacilityUpdateParams,
} from '../../models/operation/facility';
// import { FacilityUserJoinInsertParams } from '../../models/operation/facilityUserJoin';
import { dao as facilityDao } from '../../dao/operation/facilityDao';
// import { dao as facilityUserJoinDao } from '../../dao/operation/facilityUserJoinDao';
import { makeRegularCodeDao } from '../../lib/usefullToolUtil';
import * as process from 'process';
import superagent from 'superagent';
import { firstFloorRestapiConfig, secondFloorRestapiConfig } from '../../config/restapiConfig';
import { sequelize } from '../../models';
import { FacilityStatusType } from '../../lib/facilityUtil';
import { RedisKeys, useRedisUtil } from '../../lib/redisUtil';
import { MqttTopics, sendMqtt } from '../../lib/mqttUtil';

const redisUtil = useRedisUtil();
// const firstFloorRestapiUrl = `${firstFloorRestapiConfig.host}:${firstFloorRestapiConfig.port}`;
// const secondFloorRestapiUrl = `${secondFloorRestapiConfig.host}:${secondFloorRestapiConfig.port}`;
// let accessToken = '';
// let restapiUrl = '';

const service = {
  // restapi login
  // async restapiLogin(logFormat: LogFormat<unknown>, restapiConfig: { id?: string; pass?: string; }): Promise<Record<string, any>> {
  //   let result: Record<string, any>;

  //   try {
  //     console.log('loginApi', restapiUrl)
  //     result = await superagent.post(`${restapiUrl}/auths/token`).send({
  //       userid: restapiConfig.id,
  //       password: restapiConfig.pass,
  //     });
  //     accessToken = JSON.parse(result.text).data.accessToken;
  //     result = { accessToken };
  //     logging.METHOD_ACTION(logFormat, __filename, null, result);
  //   } catch (err) {
  //     logging.ERROR_METHOD(logFormat, __filename, null, err);

  //     return new Promise((resolve, reject) => {
  //       reject(err);
  //     });
  //   }

  //   return new Promise((resolve) => {
  //     resolve(result);
  //   });
  // },
  // insert
  async reg(params: FacilityInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;
    const transaction: Transaction = await sequelize.transaction();

    // 1. 설비 정보 입력
    try {
      // code 칼럼 정량화
      const codeHeader = 'FAC';
      params.code = await makeRegularCodeDao('code', codeHeader, facilityDao);
      result = await facilityDao.insert(params, transaction);
      void this.writeAllRedis();
      logging.METHOD_ACTION(logFormat, __filename, params, result);

      // 설비 데이터 acs MQTT로 전송
      sendMqtt(`${MqttTopics.InsertFacilityInfo}/${params.code}/insert`, JSON.stringify(params));
      /*
      // ACS 테이블 입력
      if (Number(params.floor) === 1) {
        restapiUrl = firstFloorRestapiUrl
        restapiConfig = firstFloorRestapiConfig
      } else {
        restapiUrl = secondFloorRestapiUrl
        restapiConfig = secondFloorRestapiConfig
      }

      const accessToken = (await this.restapiLogin(logFormat, restapiConfig))?.accessToken || '';
      const response = await superagent.post(`${restapiUrl}/facilities`).set('access-token', accessToken).send(params);
      const responseData: Record<string, any> = JSON.parse(response.text).Data;
      logging.METHOD_ACTION(logFormat, __filename, params, responseData);
*/
      await transaction.commit(); // 트랜잭션 커밋
    } catch (err) {
      await transaction.rollback(); // 트랜잭션 롤백
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectList
  async list(
    params: FacilitySelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<FacilityAttributes>> {
    let result: SelectedListResult<FacilityAttributes>;

    try {
      result = await facilityDao.selectList(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // selectInfo
  async info(params: FacilitySelectInfoParams, logFormat: LogFormat<unknown>): Promise<FacilityAttributes | null> {
    let result: FacilityAttributes | null;

    try {
      result = await facilityDao.selectInfo(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // update
  async edit(params: FacilityUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;
    // const transaction: Transaction = await sequelize.transaction();

    // 1. 설비 정보 수정
    try {
      result = await facilityDao.update(params);
      if (params.id) {
        void this.writeSingleRedis(params.id);
      }
      logging.METHOD_ACTION(logFormat, __filename, params, result);

      // 설비 데이터 acs MQTT로 전송
      sendMqtt(`${MqttTopics.InsertFacilityInfo}/${params.code}/update`, JSON.stringify(params));
      // ACS 테이블 입력
      // const accessToken = (await this.restapiLogin(logFormat))?.accessToken || '';
      // const response = await superagent
      //   .put(`${restapiUrl}/facilities/code/:code`)
      //   .set('access-token', accessToken)
      //   .send(params);
      // const responseData: Record<string, any> = JSON.parse(response.text).Data;

      // logging.METHOD_ACTION(logFormat, __filename, null, responseData);
      // await transaction.commit(); // 트랜잭션 커밋
    } catch (err) {
      // await transaction.rollback(); // 트랜잭션 롤백
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // update
  // async editLiveState(params: FacilityUpdateLiveStateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
  //   let result: UpdatedResult;

  //   try {
  //     result = await facilityDao.updateLiveState(params);
  //     logging.METHOD_ACTION(logFormat, __filename, params, result);
  //   } catch (err) {
  //     logging.ERROR_METHOD(logFormat, __filename, params, err);

  //     return new Promise((resolve, reject) => {
  //       reject(err);
  //     });
  //   }

  //   return new Promise((resolve) => {
  //     resolve(result);
  //   });
  // },
  // delete
  async delete(params: FacilityDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      result = await facilityDao.delete(params);
      void this.writeAllRedis();

      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  async writeAllRedis(): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      redisUtil.del(RedisKeys.InfoFacilityById);
      redisUtil.del(RedisKeys.InfoFacilityByResource);
      redisUtil.del(RedisKeys.InfoFacilityBySerial);
      const facilityList = await facilityDao.selectList({});
      facilityList.rows.forEach((facility) => {
        const facilityDeep = facility as FacilityAttributesDeep;
        const facilityString = JSON.stringify(facilityDeep);
        redisUtil.hset(RedisKeys.InfoFacilityById, facilityDeep.id.toString(), facilityString);
        if (facilityDeep.serial) {
          redisUtil.hset(RedisKeys.InfoFacilityBySerial, facilityDeep.serial, facilityString);
        }
        // if (facilityDeep.Location?.tag) {
        //   redisUtil.hset(RedisKeys.InfoFacilityByResource, facilityDeep.Location?.tag, facilityString);
        // }
      });

      logging.ACTION_DEBUG({
        filename: 'facilityService.ts',
        error: null,
        params: null,
        result: 'facility writeAllRedis success',
      });

      return { insertedId: facilityList.rows.length }

    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'facilityService.ts',
        error: 'redis acs facility info값 초기화 실패',
        params: null,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },

  // redis init
  async writeSingleRedis(facilityId: number): Promise<InsertedResult> {
    let result: InsertedResult;
    try {
      const facilityInfo = await facilityDao.selectInfo({ id: facilityId });

      const facilityDeep = facilityInfo as FacilityAttributesDeep;
      if (facilityDeep?.active === true) {
        const facilityInfoRedisString = JSON.stringify(facilityInfo);
        redisUtil.hset(RedisKeys.InfoFacilityById, facilityDeep.id.toString(), facilityInfoRedisString);
        if (facilityDeep?.serial) {
          redisUtil.hset(RedisKeys.InfoFacilityBySerial, facilityDeep.serial, facilityInfoRedisString);
        }
        // if (facilityDeep?.Location?.tag) {
        //   redisUtil.hset(RedisKeys.InfoFacilityByResource, facilityDeep.Location?.tag, facilityInfoRedisString);
        // }
      } else if (facilityDeep?.active === false) {
        redisUtil.hdel(RedisKeys.InfoFacilityById, facilityDeep.id.toString() || '');
        // redisUtil.hdel(RedisKeys.InfoFacilityBySerial, facilityDeep.serial || '');
        // redisUtil.hdel(RedisKeys.InfoFacilityByResource, facilityDeep.Location?.tag || '');
      }
      logging.ACTION_DEBUG({
        filename: 'facilityService.ts',
        error: null,
        params: null,
        result: 'facility writeSingleRedis success',
      });

      return { insertedId: facilityId }
    } catch (err) {
      logging.ACTION_ERROR({
        filename: 'facilityService.ts',
        error: 'redis acs facility info값 초기화 실패',
        params: null,
        result: false,
      });

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },
  // update MQTT - mode
  async editFacilityMode(params: FacilityUpdateParams) {
    try {
      if (!params.serial) {
        logging.ACTION_ERROR({
          filename: `facilityService.ts - editFacilityMode`,
          params: `Serial(${params.serial}) 값이 올바르지 않습니다.`,
          result: null,
          error: false,
        });
        return
      }
      const facilityInfo = await facilityDao.selectSerial({ serial: params.serial })

      if (!facilityInfo) {
        logging.ACTION_ERROR({
          filename: `facilityService.ts - editFacilityMode`,
          params: `Serial(${params.serial})에 해당하는 설비 정보를 찾을 수 없습니다.`,
          result: null,
          error: false,
        });
        return
      }

      const updateParams = {
        id: facilityInfo.id,
        mode: params.mode
      }

      await facilityDao.update(updateParams);
      if (updateParams.id) {
        void this.writeSingleRedis(facilityInfo.id);
      }
    } catch (err) {
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }
  },
};

export { service };
