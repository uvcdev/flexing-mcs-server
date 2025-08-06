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
import { MonitorTag, Tag, TagValue, useKepServerUtil } from './kepServerUtil';
import { useEqpCheckUtil } from './eqpCheckUtil';
import { RedisKeys, useRedisUtil } from './redisUtil';

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

  // kepserverTag.json에서 SUBSCRIPTION===true인 태그들만 배열에 담아 반환
  loadTagsAndCreateSubscriptionNodes(): ReadValueIdOptions[] {
    const subscriptionsPath = path.resolve(__dirname, '../../kepserverTag.json');

    try {
      const fileContent = fs.readFileSync(subscriptionsPath, 'utf8');
      const allTags: Tag[] = JSON.parse(fileContent)['MBS'];
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
        { samplingInterval: 500, discardOldest: true, queueSize: 10 },
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
    monitoredItems.on('changed', (monitoredItem: ClientMonitoredItemBase, dataValue: DataValue) => {
      try {
        // const eqpCheckUtil = useEqpCheckUtil();
        const redisUtil = useRedisUtil();
        const nodeId = monitoredItem.itemToMonitor.nodeId.value.toString();
        const value = dataValue;
        const targetTagInfo = useKepServerUtil().updateTagValue(nodeId, value);

        // logToConsoleAndFile(`Changed Tag Data NodeId: ${nodeId} ${value.value.value}`);
        logging.KEPWARE_LOG({
          action: 'TAG_WRITE',
          tag: nodeId,
          value: value.value.value,
          message: `changing value from opcuaUtil.registerChangeEvent`,
        });

        // 변경되는 값 저장
        redisUtil.hset(RedisKeys.InfoChangedTagById, nodeId, JSON.stringify(targetTagInfo));

        if (targetTagInfo) {
          // 변경된 데이터 값을 기준으로 판단하는 함수
          this.eqpCheckUtil.eqpTaskStatus(targetTagInfo);
        }
      } catch (error) {
        logToConsoleAndFile(`Error handling changed event: ${error}`, 'red');
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
    } catch (error) {
      logToConsoleAndFile(`Error during initKepserverex: ${error}`, 'red');
      throw error;
    }
  },
};

export default opcuaUtil;
