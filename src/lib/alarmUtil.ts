import { dao as errorCodeDao } from '../dao/common/errorCodeDao';
import { dao as mcsAlarmDao } from '../dao/common/mcsAlarmDao';
import { ErrorFromType } from '../models/common/errorCode';
import { McsAlarmInsertParams, McsAlarmUpdateStateByCodeParams } from '../models/common/mcsAlarm';
import { MqttTopics, sendMqtt } from './mqttUtil';

export interface CheckErrorCodeParams {
  errorFrom: ErrorFromType;
  errorCode: string;
}

export interface RegAlarmParams {
  errorFrom: ErrorFromType;
  errorCode: string;
  code: string; // 자체적으로 사용 할 알람에 대한 KeyValue  ( WMS는 "[TransferID]-[AlarmID]" )
  alarmText: string | null;
  target: string | null;
  level?: string | null;
}

export interface ClearAlarmParams {
  errorFrom: ErrorFromType;
  code: string; // 자체적으로 사용 할 알람에 대한 KeyValue  ( WMS는 "[TransferID]-[AlarmID]" )
}

export interface SendAlarmParams {
  id: number;
  errorFrom?: string;
  code?: string;
  errorCode?: string;
  data?: {
    messageKo?: string;
    messageEn?: string;
    messageEs?: string;
  } | null;
  target?: string | null;
  level?: string | null;
  state?: string | null;
}

export const checkErrorCode = async (params: CheckErrorCodeParams, alarmText: string) => {
  const errorFrom = params.errorFrom;
  const errorCode = params.errorCode;

  let errorCodeInfo = await errorCodeDao.selectInfoByErrorFromAndCode({ errorFrom: errorFrom, code: errorCode });

  if (!errorCodeInfo) {
    errorCodeInfo = await errorCodeDao.selectInfoByErrorFromAndCode({ errorFrom: errorFrom, code: '0' });
    if (alarmText && errorCodeInfo) {
      // 새로 들어온 alarm Text 가 있을 경우에는 해당 알람 내용을 사용하고 아닌 경우에는 기존에 정의한 알람 내용을 우선적으로 사용한다.
      errorCodeInfo.messageKo = errorCodeInfo.messageKo || '';
      errorCodeInfo.messageEn = errorCodeInfo.messageEn || alarmText;
      errorCodeInfo.messageEs = errorCodeInfo.messageEs || '';
    }
  }

  return errorCodeInfo;
};

// 알람 등록 / 해제 정보 전송
export const sendAlarm = (params: SendAlarmParams, type: 'reg' | 'clear') => {
  if (type === 'reg') {
    sendMqtt(`${MqttTopics.AlarmRegist}/${params.id}`, JSON.stringify(params));
  } else {
    sendMqtt(`${MqttTopics.AlarmClear}/${params.id}`, JSON.stringify(params));
  }
};

export const regAlarm = async (params: RegAlarmParams) => {
  const errorCodeInfo = await checkErrorCode(
    { errorFrom: params.errorFrom, errorCode: params.errorCode },
    params.alarmText || ''
  );

  // 알람 등록 AlarmInsertParams
  const alarmInsertParams: McsAlarmInsertParams = {
    errorFrom: params.errorFrom,
    code: params.code,
    errorCode: params.errorCode,
    data: {
      messageKo: errorCodeInfo?.messageKo,
      messageEn: errorCodeInfo?.messageEn,
      messageEs: errorCodeInfo?.messageEs,
    },
    target: params.target,
    level: errorCodeInfo?.errorLevel || 'warning',
    state: 'registered',
  };

  // 알람 테이블 만들어지면 해당 알람 등록
  const result = await mcsAlarmDao.insert(alarmInsertParams);

  // 해당 알람 내용으로 ACS Server에 전송
  const sendAlarmParams: SendAlarmParams = {
    ...alarmInsertParams,
    id: result.insertedId,
  };
  if (sendAlarmParams.level === 'error') {
    sendAlarm(sendAlarmParams, 'reg');
  }
};

export const clearAlarm = async (params: ClearAlarmParams) => {
  // 알람 해제 AlarmUpdateParams
  const alarmUpdateParams: McsAlarmUpdateStateByCodeParams = {
    code: params.code,
    state: 'completed',
  };

  // 알람 테이블 만들어지면 해당 알람 등록
  const result = await mcsAlarmDao.updateStateByCode(alarmUpdateParams);

  // 해당 알람 내용으로 ACS Server에 전송
  for (let i = 0, length = result.updatedCount; i < length; i++) {
    const params: SendAlarmParams = {
      id: result.updatedIds[i],
      state: 'completed',
    };

    sendAlarm(params, 'clear');
  }
};
