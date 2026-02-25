import { UserTokenType, OPCUAClient, ClientSession, ClientSubscription, UserIdentityInfoUserName } from 'node-opcua';
import { kepserverConfig } from '../config/kepserverConfig';
import fs from 'fs';
import path from 'path';
import {
  AttributeIds,
  DataValue,
  ReadValueIdOptions,
  TimestampsToReturn,
  NodeId,
  ClientMonitoredItemBase,
  ClientMonitoredItemGroup,
} from 'node-opcua-client';
import { logging, logToConsoleAndFile } from './logging';
import { registerClientEvents } from '../events/kepserverClientEvents';
import { registerSubscriptionEvents } from '../events/kepserverSubscriptionEvents';
import { MonitorTag, parseAsciiToDecWord, parseDecWordToAscii, Tag, TagValue, useKepServerUtil } from './kepServerUtil';
import { useEqpCheckUtil } from './eqpCheckUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';
import { usePlcConnectUtil } from './plcConnectUtil';
import { FacilityAttributes } from '../models/operation/facility';

const userIdentity: UserIdentityInfoUserName = {
  type: 1,
  userName: process.env.OPCUA_USERNAME || '',
  password: process.env.OPCUA_PASSWORD || '',
};

export const opcuaUtil = {
  client: OPCUAClient.create(kepserverConfig.clientOptions),
  session: null as ClientSession | null,
  subscription: null as ClientSubscription | null,
  eqpCheckUtil: useEqpCheckUtil(),
  allTagNodeIds: new Map<string, MonitorTag>(),
  tagMap: new Map<string, TagValue>(),

  // KEPServerEx에 연결하는 함수

  // async connectToKepserverex(): Promise<void> {
  //   // 연결 이벤트 등록
  //   registerClientEvents(this.client);
  //   try {
  //     // KEPServerEx에 연결
  //     // console.log('connect request', kepserverConfig.endpointUrl)
  //     await this.client.connect(kepserverConfig.endpointUrl);
  //     // console.log('connect completed')
  //     // logToConsoleAndFile("Connected to KepServerEX!", "green");

  //   } catch (error) {
  //     logToConsoleAndFile(`Failed to connect: ${error}`, "red");
  //   }
  // },
  async connectToKepserverex(maxRetries = Infinity, retryInterval = 5000): Promise<void> {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // 연결 이벤트 등록
        registerClientEvents(this.client);

        // KEPServerEX에 연결 시도
        await this.client.connect(kepserverConfig.endpointUrl);

        logToConsoleAndFile('Connected to KepServerEX!', 'green');

        return; // 연결 성공 시 함수 종료
      } catch (error) {
        console.error(`Kepware 연결 실패 (${attempt + 1}회차):`, error);
        logToConsoleAndFile(`Failed to connect: ${error}`, 'red');

        attempt++;

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        } else {
          console.error('연결 중단');
          break;
        }
      }
    }
  },

  // Session 생성하는 함수
  async createSession(): Promise<void> {
    if (this.session) {
      logToConsoleAndFile('Session already exists!', 'yellow');
      return;
    }

    try {
      // session 생성
      this.session = await this.client.createSession(
        userIdentity.userName !== '' ? userIdentity : { type: UserTokenType.Anonymous }
      );
      logToConsoleAndFile('Created Session!', 'green');
    } catch (error) {
      logToConsoleAndFile(`Failed to Create Session: ${error}`, 'red');
    }
  },

  // Subscription 생성하는 함수
  async createSubscription() {
    if (this.subscription) {
      logToConsoleAndFile('Subscription already exists!', 'yellow');
      return;
    }

    if (!this.session) throw new Error('Session is not initialized!');

    try {
      // Subscription 생성
      this.subscription = ClientSubscription.create(this.session, kepserverConfig.subscribeOptions);

      // Subscription 이벤트 등록
      registerSubscriptionEvents(this.subscription);
    } catch (error) {
      logToConsoleAndFile(`Failed to Create Session: ${error}`, 'red');
    }
  },

  // plcTagInfo.json에서 SUBSCRIPTION===true인 태그들만 배열에 담아 반환
  loadTagsAndCreateSubscriptionNodes(): ReadValueIdOptions[] {
    const subscriptionsPath = path.resolve(__dirname, '../../plcTagInfo.json');

    try {
      const fileContent = fs.readFileSync(subscriptionsPath, 'utf8');
      const allTags: Tag[] = JSON.parse(fileContent)[process.env.SITE || 'MBS'];
      const subscriptions: string[] = allTags
        .filter((tag: Tag) => tag.SUBSCRIPTION === true) // SUBSCRIPTION이 true인 것만 필터링
        .map((tag: Tag) => tag.NODE_ID); // NODE_ID만 추출

      return subscriptions.map((nodeId: string) => ({
        nodeId: nodeId,
        attributeId: AttributeIds.Value,
      }));
    } catch (error) {
      logToConsoleAndFile(`Failed to load tags from ${subscriptionsPath}: ${error}`, 'red');
      throw error;
    }
  },

  // 모니터링 할 노드 등록
  async monitorSubscriptionNodes(subscriptionNodes: ReadValueIdOptions[]): Promise<void> {
    if (!this.subscription) {
      logToConsoleAndFile('Subscription is not initialized!', 'red');
      return;
    }

    if (subscriptionNodes.length === 0) {
      logToConsoleAndFile('No subscription nodes to monitor!', 'red');
      return;
    }

    try {
      // 모니터링 등록
      const monitoredItems = await this.subscription.monitorItems(
        subscriptionNodes,
        // 0.5초마다 샘플링, 10개까지 보관하고 오래된 값이 자동으로 삭제
        { samplingInterval: 300, discardOldest: true, queueSize: 10 },
        TimestampsToReturn.Both
      );

      // 'on.changed' 이벤트 등록
      this.registerChangeEvent(monitoredItems);
    } catch (error) {
      logToConsoleAndFile(`Failed to monitor subscription nodes: ${error}`, 'red');
      throw error;
    }
  },

  // 'on.changed' 이벤트 등록 함수
  registerChangeEvent(monitoredItems: ClientMonitoredItemGroup): void {
    /*
    monitoredItems.on('changed', (monitoredItem: ClientMonitoredItemBase, dataValue: DataValue) => {
      setImmediate(async () => {
        try {
          const redisUtil = useRedisUtil();
          const nodeId = monitoredItem.itemToMonitor.nodeId.value.toString();
          const value = dataValue;
          const targetTagInfo = useKepServerUtil().updateTagValue(nodeId, value);

          logging.KEPWARE_LOG({
            action: 'TAG_WRITE',
            tag: nodeId,
            value: value.value.value,
            message: `changing value from opcuaUtil.registerChangeEvent`,
          });

          await redisUtil.hset(
            RedisKeys.InfoChangedTagById,
            nodeId,
            JSON.stringify(targetTagInfo)
          );

          if (targetTagInfo) {
            this.eqpCheckUtil.eqpTaskStatus(targetTagInfo, value.value.value);
          }
        } catch (error) {
          logToConsoleAndFile(`Error handling changed event: ${error}`, 'red');
        }
      });
    });
*/
    monitoredItems.on('changed', (monitoredItem: ClientMonitoredItemBase, dataValue: DataValue) => {
      setImmediate(async () => {
        try {
          const redisUtil = useRedisUtil();
          const nodeId = monitoredItem.itemToMonitor.nodeId.value.toString();
          const value = dataValue;
          if (value.statusCode.isBad()) {
            logging.KEPWARE_ERROR({
              action: 'ERROR',
              tag: nodeId.toString(),
              value: null,
              message: `Error, changed tag, but plc status is offline `,
              error: '',
            });
            return;
          }
          const targetTagInfo = useKepServerUtil().updateTagValue(nodeId, value);
          redisUtil.hSetPlcTag(
            `${RedisKeys.PlcRealtimeData}:${targetTagInfo.EQ_CODE}`,
            targetTagInfo.TAG_NAME,
            value.value.value ?? ''
          );
          const snapshotData = await redisUtil.hGetPlcAllTags(`${RedisKeys.PlcRealtimeData}:${targetTagInfo.EQ_CODE}`);
          if (!snapshotData) {
            logging.ACTION_ERROR({
              filename: 'opcuaUtil.registerChangeEvent',
              params: { targetTagInfo },
              result: null,
              error: 'snapshotData is null',
            });
            return;
          }
          const facilityInfo = await redisUtil.hgetObject<FacilityAttributes>(
            RedisKeys.InfoFacilityBySerial,
            targetTagInfo.EQ_CODE
          );
          if (!facilityInfo) {
            logging.ACTION_ERROR({
              filename: 'opcuaUtil.registerChangeEvent',
              params: { targetTagInfo },
              result: null,
              error: 'facilityInfo is null',
            });
            return;
          }
          logging.PLC_DATA_CHANGE_HISTORY_LOG.INSERT({
            ts: new Date(),
            createdAt: new Date(),
            facilityCode: facilityInfo.code,
            facilityName: facilityInfo.serial || '',
            facilityType: facilityInfo.type,
            isTriggered: facilityInfo.isActiveCallTrigger || false,
            tagName: targetTagInfo.TAG_NAME,
            oldValue: targetTagInfo.prevValue?.toString() ?? '',
            newValue: value.value.value.toString() ?? '',
            valueType: targetTagInfo.DATA_TYPE,
            snapshotData: snapshotData,
          });

          logging.KEPWARE_LOG({
            action: 'TAG_WRITE',
            tag: nodeId,
            value: value.value.value,
            message: `changing value from opcuaUtil.registerChangeEvent`,
          });
          redisUtil.hset(RedisKeys.InfoChangedTagById, nodeId, JSON.stringify(targetTagInfo));
          if (targetTagInfo) {
            this.eqpCheckUtil.eqpTaskStatus(targetTagInfo, value.value.value);
          }
        } catch (error) {
          logToConsoleAndFile(`Error handling changed event: ${error}`, 'red');
        }
      });
    });
  },

  async populatePlcInit(): Promise<void> {
    const plcConnectUtil = usePlcConnectUtil();
    // this.tagMap의 key값은 'EQ_CODE.TAG_NAME' 형식이다.
    // this.tagMap을 순회하며 TAG_NAME이 'EQ_Auto'인 태그를 찾는다.
    // 찾은 태그의 값(tagMapValue) 중 EQ_CODE를 추출하고 EQ_CODE는 4글자니 앞뒤 2글자씩 잘라서 문자열로 변환한다.(ex: 'WS11' -> EQ_Code_01: 'WS', EQ_Code_02: '11')
    // EQ_Code_01과 EQ_Code_02를 각각 parseAsciiToDecWord 함수에 전달하여 10진수로 변환한다.
    // this.tagMap에서 'EQ_CODE.EQ_Code_01', 'EQ_CODE.EQ_Code_02' 형식의 키값을 찾는다.
    // 해당 태그에 변환한 10진수를 각각 write한다.
    // 오늘 년,월,일을 체크 (ex. 20250813)
    // Call_Time_Year, Call_Time_MonthDay에 각각 '2025', '0813' 문자열을 write한다.
    this.tagMap.forEach((tagMapValue, key) => {
      if (tagMapValue.TAG_NAME === 'EQ_Auto') {
        const eqCode = tagMapValue.EQ_CODE;
        const eqCode01 = eqCode.slice(0, 2);
        const eqCode02 = eqCode.slice(2, 4);

        const eqCode01Value = parseAsciiToDecWord(eqCode01);
        const eqCode02Value = parseAsciiToDecWord(eqCode02);

        plcConnectUtil.writeTagValue({
          targetFacility: eqCode,
          tagInfo: [
            { tagName: 'EQ_Code_01', value: eqCode01Value.toString() },
            { tagName: 'EQ_Code_02', value: eqCode02Value.toString() },
          ],
        });

        const today = new Date();
        const year = today.getFullYear().toString();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');

        plcConnectUtil.writeTagValue({
          targetFacility: eqCode,
          tagInfo: [
            { tagName: 'Call_Time_Year', value: year },
            { tagName: 'Call_Time_MonthDay', value: `${month}${day}` },
          ],
        });
      }
    });
  },

  async initKepserverex(): Promise<void> {
    try {
      // KEPServerEx에 연결 (최대 10회, 5초마다 연결시도)
      await this.connectToKepserverex(10, 5000);

      // Session 생성
      await this.createSession();

      // Subscription 생성
      await this.createSubscription();

      // 모니터링 할 노드 목록 불러오기
      const subscriptionNodes = this.loadTagsAndCreateSubscriptionNodes();

      // 모니터링 할 노드 등록하고 'on.change' 이벤트 등록하기
      await this.monitorSubscriptionNodes(subscriptionNodes);

      if (process.env.POPULATE_PLC_INIT === 'true') {
        await this.populatePlcInit();
      }
    } catch (error) {
      logToConsoleAndFile(`Error during initKepserverex: ${error}`, 'red');
      throw error;
    }
  },
};

export default opcuaUtil;
