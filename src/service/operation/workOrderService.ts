import { LogFormat, RequestLog, logging, makeLogFormat } from '../../lib/logging';
import {
  BulkInsertedOrUpdatedResult,
  DeletedResult,
  ErrorClass,
  InsertedResult,
  SelectedAllResult,
  SelectedListResult,
  UpdatedResult,
  responseCode,
} from '../../lib/resUtil';
import {
  WorkOrderAttributes,
  WorkOrderDeleteParams,
  WorkOrderInsertParams,
  WorkOrderSelectInfoParams,
  WorkOrderSelectListParams,
  WorkOrderUpdateParams,
  ImcsWorkOrderInsertParams,
  WorkOrderCancelByCodeParams,
  WorkOrderUpdateByCodeParams,
  WorkOrderAttributesDeep,
} from '../../models/operation/workOrder';
// import { WorkOrderUserJoinInsertParams } from '../../models/operation/workOrderUserJoin';
import { dao as workOrderDao } from '../../dao/operation/workOrderDao';
import { dao as itemDao } from '../../dao/operation/itemDao';
import { dao as facilityDao } from '../../dao/operation/facilityDao';
import { dao as amrDao } from '../../dao/common/amrDao';
// import { dao as workOrderUserJoinDao } from '../../dao/operation/workOrderUserJoinDao';
import { makeRegularCode, makeRegularCodeDao } from '../../lib/usefullToolUtil';
import * as process from 'process';
import { ItemInsertParams } from '../../models/operation/item';
import superagent from 'superagent';
import { Transaction } from 'sequelize';
import { sequelize } from '../../models';
import { RequestParams } from 'nodemailer/lib/xoauth2';
import dayjs from 'dayjs';
import { DailyWorkOrderStats, WorkOrderStats, useWorkOrderUtil } from '../../lib/workOrderUtil';
import { calculateDurationInSeconds } from '../../lib/dateUtil';

let accessToken = '';
const workOrderStatsUtil = useWorkOrderUtil()

const service = {
  // insert
  async reg(params: WorkOrderInsertParams, logFormat: LogFormat<unknown>): Promise<InsertedResult> {
    let result: InsertedResult;

    // 1. 설비 정보 입력
    try {
      result = await workOrderDao.insert(params);
      logging.METHOD_ACTION(logFormat, __filename, params, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, params, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    // (promise 2-1)설비당 작업자 입력
    // const promiseInsertWorkOrderUserJoin = async (
    //   workOrderId: InsertedResult['insertedId'],
    //   userIds: WorkOrderInsertParams['userIds']
    // ): Promise<BulkInsertedOrUpdatedResult> => {
    //   let insertedIds: BulkInsertedOrUpdatedResult;

    //   const paramList: Array<WorkOrderUserJoinInsertParams> = [];
    //   if (userIds && userIds.length > 0) {
    //     for (let i = 0; i < userIds.length; i += 1) {
    //       paramList.push({
    //         workOrderId,
    //         userId: userIds[i],
    //       });
    //     }
    //   }

    //   try {
    //     insertedIds = await workOrderUserJoinDao.bulkInsert(paramList);
    //     logging.METHOD_ACTION(logFormat, __filename, paramList, insertedIds);
    //   } catch (err) {
    //     logging.ERROR_METHOD(logFormat, __filename, params, err);

    //     return new Promise((resolve, reject) => {
    //       reject(err);
    //     });
    //   }

    //   return new Promise((resolve) => {
    //     resolve(insertedIds);
    //   });
    // };

    // 3. (Promise.all)설비당 작업자 입력 처리
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const [insertedWorkOrderUserJoin] = await Promise.all([
    //   promiseInsertWorkOrderUserJoin(result.insertedId, params.userIds),
    // ]);

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // imcs 로부터 메시지 수신하여 작업등록
  async regWorkOrder(params: ImcsWorkOrderInsertParams): Promise<InsertedResult> {
    let workOrderResult: InsertedResult;
    const transaction: Transaction = await sequelize.transaction();

    try {
      let result: InsertedResult;
      // 품목 조회해서 없을 경우 insert
      const itemCode = params.CALL_TYPE;

      const existItem = await itemDao.selectOneCode({ code: itemCode });
      if (!existItem) {
        const itemInsertParam: ItemInsertParams = {
          code: itemCode,
          type: params.CALL_TYPE,
        };
        result = await itemDao.insert(itemInsertParam);
        params.newItemId = result.insertedId;
      }

      let fromFacilitySerial = null;
      let toFacilitySerial = null;

      /** EQP 기준
       * OUT: EQP에서 뺀다 = from설비(EQP) → to설비(WCS)
       * IN: EQP에 넣는다 = from설비(WCS) → to설비(EQP)
       */
      if (params.TYPE === 'OUT' || params.TYPE === 'MISSION') {
        fromFacilitySerial = params.EQP_ID;
        toFacilitySerial = params.PORT_ID;
      } else {
        fromFacilitySerial = params.PORT_ID;
        toFacilitySerial = params.EQP_ID;
      }
      // 설비 시리얼 조회해서 id 매핑
      const fromFacilityInfo = await facilityDao.selectSerial({ serial: fromFacilitySerial });
      const toFacilityInfo = await facilityDao.selectSerial({ serial: toFacilitySerial });

      // 작업지시 생성
      const transParams: WorkOrderInsertParams = {
        fromFacilityId: fromFacilityInfo?.id || null,
        toFacilityId: toFacilityInfo?.id || null,
        code: params.CALL_ID,
        itemId: existItem?.id || params?.newItemId || null,
        itemCode: itemCode,
        level: params.CALL_PRIORITY,
        type: params.TYPE,
        fromAmrId: null,
        state: 'registered',
        isClosed: false,
        cancelUserId: 0,
        cancelDate: null,
        description: null,
      };
      workOrderResult = await workOrderDao.insertTransac(transParams, transaction);
      await transaction.commit(); // 트랜잭션 커밋
    } catch (err) {
      await transaction.rollback(); // 트랜잭션 롤백
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(workOrderResult);
    });
  },
  // selectList
  async list(
    params: WorkOrderSelectListParams,
    logFormat: LogFormat<unknown>
  ): Promise<SelectedListResult<WorkOrderAttributes>> {
    let result: SelectedListResult<WorkOrderAttributes>;

    try {
      result = await workOrderDao.selectList(params);
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
  async info(params: WorkOrderSelectInfoParams, logFormat: LogFormat<unknown>): Promise<WorkOrderAttributes | null> {
    let result: WorkOrderAttributes | null;

    try {
      result = await workOrderDao.selectInfo(params);
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
  async facilityCancel(params: WorkOrderCancelByCodeParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let workOrderResult: UpdatedResult;
    const transaction: Transaction = await sequelize.transaction();
    try {
      // 취소할 작업지시 조회
      const workOrder = await workOrderDao.selectInfoByCode({ code: params.code });
      if (!workOrder) {
        await transaction.rollback();
        const errorMessage = `postgres에 workOrder ${params.code} 데이터가 없습니다.`;
        logging.ACTION_DEBUG({
          filename: 'workOrderService.ts.forceCancel',
          error: errorMessage,
          params: null,
          result: false,
        });
        const err = new ErrorClass(responseCode.BAD_REQUEST_NODATA, errorMessage);
        logging.ERROR_METHOD(logFormat, __filename, params, err);

        return new Promise((resolve, reject) => {
          reject(err);
        });
      }
      if (workOrder.state === 'facilityCanceled') {
        await transaction.rollback();
        const errorMessage = `이미 설비취소된 작업지시입니다.`;
        logging.ACTION_DEBUG({
          filename: 'workOrderService.ts.forceCancel',
          error: errorMessage,
          params: null,
          result: false,
        });
        const err = new ErrorClass(responseCode.BAD_REQUEST_NODATA, errorMessage);
        logging.ERROR_METHOD(logFormat, __filename, params, err);

        return new Promise((resolve, reject) => {
          reject(err);
        });
      }

      const workOrderUpdateParmas: WorkOrderUpdateParams = {
        id: workOrder.id,
        cancelDate: new Date(),
        cancelUserId: null,
        state: 'facilityCanceled',
      };

      workOrderResult = await workOrderDao.update(workOrderUpdateParmas);
    } catch (err) {
      await transaction.rollback();
      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(workOrderResult);
    });
  },
  // update
  async edit(params: WorkOrderUpdateParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    try {
      result = await workOrderDao.update(params);
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
  async editByCode(params: WorkOrderUpdateByCodeParams, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult;

    try {
      result = await workOrderDao.updateByCode(params);
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
  async stateCheckAndEdit(params: WorkOrderAttributesDeep, logFormat: LogFormat<unknown>): Promise<UpdatedResult> {
    let result: UpdatedResult = { updatedCount: 0 };

    try {
      const codeSplit = params.code?.split('$') || [];
      if (codeSplit.length <= 0) {
        const errorMessage = `작업지시 code가 없습니다.`;
        logging.ACTION_DEBUG({
          filename: 'workOrderService.ts.stateCheckAndEdit',
          error: errorMessage,
          params: null,
          result: false,
        });
        const err = new ErrorClass(responseCode.BAD_REQUEST_REJECT, errorMessage);
        return new Promise((resolve, reject) => {
          reject(err);
        });
      }
      const code = codeSplit[0];
      if (code) {
        const amr = await amrDao.selectOneCode({ code: params.Amr?.code || '' });
        const workOrderInfo = await workOrderDao.selectInfoByCode({ code: code });
        if (workOrderInfo) {
          //상태 업데이트
          if (workOrderInfo.state !== params.state) {
            const updateParams: WorkOrderUpdateByCodeParams = {
              code: code,
              state: params.state,
              fromAmrId: amr && amr.id || undefined,
              fromStartDate:
                params.state === 'pending1' ? (!workOrderInfo.fromStartDate ? new Date() : undefined) : undefined,
              fromEndDate: params.state === 'pending2' ? new Date() : undefined,
              toStartDate:
                params.state === 'pending2' ? (!workOrderInfo.toStartDate ? new Date() : undefined) : undefined,
              toEndDate: params.state === 'completed2' ? new Date() : undefined,
              cancelDate: params.cancelDate,
              description: params.description,
            }
            workOrderDao.updateByCode(updateParams);
            const newWorkOrderInfo = workOrderInfo as WorkOrderAttributesDeep
            if (params.state === 'pending1' && !workOrderInfo.fromStartDate) {
              const fromFacility = newWorkOrderInfo.FromFacility
              workOrderStatsUtil.setStats('Facility', fromFacility.id, fromFacility.code, fromFacility.system, fromFacility.name, { created: 1 })
              if (amr) {
                workOrderStatsUtil.setStats('Amr', amr.id, amr.code, '', amr.name || '', { created: 1 })
              }
            }
            if (params.state === 'pending2' && workOrderInfo.fromStartDate && updateParams.fromEndDate && !workOrderInfo.fromEndDate) {
              const fromFacility = newWorkOrderInfo.FromFacility
              const duration = calculateDurationInSeconds(workOrderInfo.fromStartDate, updateParams.fromEndDate)
              workOrderStatsUtil.setStats('Facility', fromFacility.id, fromFacility.code, fromFacility.system, fromFacility.name, { completed: 1, duration: duration })
            }
            if (params.state === 'pending2') {
              const toFacility = newWorkOrderInfo.ToFacility
              workOrderStatsUtil.setStats('Facility', toFacility.id, toFacility.code, toFacility.system, toFacility.name, { created: 1 })
            }
            if (params.state === 'completed2' && workOrderInfo.toStartDate && updateParams.toEndDate) {
              const toFacility = newWorkOrderInfo.ToFacility
              const amr = newWorkOrderInfo.Amr
              const duration = calculateDurationInSeconds(workOrderInfo.toStartDate, updateParams.toEndDate)
              workOrderStatsUtil.setStats('Facility', toFacility.id, toFacility.code, toFacility.system, toFacility.name || '', { completed: 1, duration: duration })
              if (amr) {
                let amrDuration = 0
                if (workOrderInfo.fromStartDate) {
                  amrDuration = calculateDurationInSeconds(workOrderInfo.fromStartDate, updateParams.toEndDate)
                } else if (workOrderInfo.toStartDate) {
                  amrDuration = calculateDurationInSeconds(workOrderInfo.toStartDate, updateParams.toEndDate)
                }
                workOrderStatsUtil.setStats('Amr', amr.id, amr.code, '', amr.name || '', { completed: 1, duration: amrDuration })
              }
            }
          }
        } else {
          //신규 (수동작업지시 등)
          const fromFacility = await facilityDao.selectOneCode({ code: params.FromFacility.code });
          const toFacility = await facilityDao.selectOneCode({ code: params.ToFacility.code });
          const amr = await amrDao.selectOneCode({ code: params.Amr?.code || '' });
          const item = await itemDao.selectOneCode({ code: params.Item.code });
          const insertResult = await workOrderDao.insert({
            code: code,
            fromFacilityId: (fromFacility && fromFacility.id) || null,
            toFacilityId: (toFacility && toFacility.id) || null,
            fromAmrId: (amr && amr.id) || null,
            itemId: (item && item.id) || null,
            cancelDate: null,
            cancelUserId: null,
            level: params.level,
            state: params.state,
            type: params.type,
            isClosed: false,
            description: params.description,
          });
          result.updatedCount = insertResult.insertedId > 0 ? 1 : 0;
        }
        logging.METHOD_ACTION(logFormat, __filename, params, result);
      }
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
  async initDailyWorkOrderstats(
    logFormat: LogFormat<unknown> = makeLogFormat({} as RequestLog)
  ): Promise<UpdatedResult> {
    let result: UpdatedResult = { updatedCount: 0 };

    try {
      await workOrderStatsUtil.initStats()
      const startOfToDay = dayjs().startOf('day').toDate();
      const endOfToDay = dayjs().endOf('day').toDate();

      const todayWorkOrderList = await workOrderDao.selectList({
        createdAtFrom: startOfToDay,
        createdAtTo: endOfToDay,
      });

      todayWorkOrderList.rows.forEach((v) => {
        const workOrder = v as WorkOrderAttributesDeep
        workOrderStatsUtil.setInitStats(workOrder)
      })
      workOrderStatsUtil.sendStats()
      logging.METHOD_ACTION(logFormat, __filename, null, result);
    } catch (err) {
      logging.ERROR_METHOD(logFormat, __filename, null, err);

      return new Promise((resolve, reject) => {
        reject(err);
      });
    }

    return new Promise((resolve) => {
      resolve(result);
    });
  },
  // delete
  async delete(params: WorkOrderDeleteParams, logFormat: LogFormat<unknown>): Promise<DeletedResult> {
    let result: DeletedResult;

    try {
      result = await workOrderDao.delete(params);
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
};

export { service };
