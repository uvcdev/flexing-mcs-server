import mqtt, { IClientOptions } from 'mqtt';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config();
interface Tag {
  NODE_ID: string;
  CHANNEL: string;
  DEVICE: string;
  TAGGROUP: string;
  TAG_NAME: string;
  DESCRIPTION: string;
  DATA_TYPE: string;
  ADDRESS: string;
  SUBSCRIPTION: boolean;
  INPUT_TYPE: string;
  EQ_CODE: string;
}

type MqttConfig = {
  host: string;
  port: number;
  topic: string;
};

interface SmartConnectorTagsData {
  TAG_ID: string;
  TAG_VALUE: string;
  IS_ERROR: 'Y' | 'N';
}

interface FacilityData {
  DEVICE_ID: string;
  TAGS: SmartConnectorTagsData[];
  DATE_TIME: string;
}

const mqttConfig: MqttConfig = {
  host: process.env.MQTT_HOST || '',
  port: Number(process.env.MQTT_PORT || '1883'),
  topic: 'smartConnector/facility',
};

const clientId = 'init_smart_connector_sync_' + Math.random().toString(16).substr(2, 8);

const options: IClientOptions = {
  host: mqttConfig.host,
  port: mqttConfig.port,
  clientId: clientId,
};

const siteName: string = process.env.SITE || 'UNT';
const subscriptionsPath = path.resolve(__dirname, '../../plcTagInfo.json');
console.log('subscriptionsPath', subscriptionsPath);
try {
  // 파일이 없으면 만들기
  if (!fs.existsSync(subscriptionsPath)) {
    fs.writeFileSync(subscriptionsPath, '{}', 'utf-8');
  }
} catch (error) {
  console.error('Error writing subscriptions file', error);
  process.exit(1);
}
const fileContent = fs.readFileSync(subscriptionsPath, 'utf-8');
const originJsonData = JSON.parse(fileContent);
const resetSiteData = () => {
  originJsonData[siteName] = [];
  fs.writeFileSync(subscriptionsPath, JSON.stringify(originJsonData, null, 4), 'utf-8');
  console.log(`Reset tag info for site ${siteName}`);
};
resetSiteData();
const client = mqtt.connect(options);
const topic = mqttConfig.topic;
// 이미 처리한 설비일때 처리하지 않기위해 키값(설비이름)을 저장하는 변수
const processedFacilityList = new Set<string>();

let lastProcessedTime = Date.now();
const TIMEOUT = 2000; // 2초

// 3초마다 체크
const checkInterval = setInterval(() => {
  if (Date.now() - lastProcessedTime > TIMEOUT) {
    console.log('No new facilities processed for 2 seconds. Closing MQTT connection.');
    client.end();
    clearInterval(checkInterval);
    process.exit(0);
  }
}, 500); // 0.5초마다 체크

const smartConnectorSyncMqtt = async () => {
  const isASCII = (tagName: string): boolean => {
    return tagName.includes('EQ_Code') || tagName.includes('Call_Type');
  };
  const isDEC = (tagName: string): boolean => {
    return tagName.includes('Call_Time') || tagName.includes('Count') || tagName.includes('Station_Product_Status');
  };
  const generateFinalTagJson = async (facilityData: FacilityData): Promise<Tag[]> => {
    const tags: Tag[] = [];
    for (const tag of facilityData.TAGS) {
      tags.push({
        NODE_ID: '',
        CHANNEL: '',
        DEVICE: '',
        TAGGROUP: '',
        TAG_NAME: tag.TAG_ID,
        DESCRIPTION: '',
        DATA_TYPE: isASCII(tag.TAG_ID) ? 'String' : isDEC(tag.TAG_ID) ? 'Int16' : 'Boolean',
        ADDRESS: '',
        SUBSCRIPTION: false,
        INPUT_TYPE: isASCII(tag.TAG_ID) ? 'ASCII' : isDEC(tag.TAG_ID) ? 'DEC' : 'Bool',
        EQ_CODE: facilityData.DEVICE_ID,
      });
    }
    return tags;
  };

  if (mqttConfig.host === '') {
    console.error('MQTT host is not set');
    return;
  }

  client.on('connect', () => {
    console.log('Connected to smartConnector');
  });

  client.subscribe(`${topic}/#`, (err) => {
    if (err) {
      console.error('Error subscribing to smartConnector', err);
      return;
    }
    console.log('Subscribed to smartConnector');
  });

  client.on('message', async (messageTopic, messageOrg) => {
    const topicSplit = messageTopic.split('/');
    if (
      topicSplit.length === 4 &&
      topicSplit[0] === 'smartConnector' &&
      topicSplit[1] === 'facility' &&
      topicSplit[3] === 'data'
    ) {
      const deviceId = topicSplit[2];
      const facilityData: FacilityData = JSON.parse(messageOrg.toString());
      // console.log('Received tags from smartConnector', deviceId, facilityData);
      if (processedFacilityList.has(deviceId)) {
        return;
      }
      processedFacilityList.add(deviceId);
      lastProcessedTime = Date.now();
      const deviceName = facilityData.DEVICE_ID;
      console.log('Processed facility', deviceName);
      // 설비 데이터 처리
      const finalTags = await generateFinalTagJson(facilityData);
      const existingTags: Tag[] = Array.isArray(originJsonData[siteName]) ? originJsonData[siteName] : [];
      originJsonData[siteName] = [...existingTags, ...finalTags];
      fs.writeFileSync(subscriptionsPath, JSON.stringify(originJsonData, null, 4), 'utf-8');
    }
  });
};

smartConnectorSyncMqtt();
