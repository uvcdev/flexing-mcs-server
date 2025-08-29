import dotenv from "dotenv";
import { kepserverConfig } from "../config/kepserverConfig";
import fs from "fs";
import path from "path";
import { OPCUAClient, ClientSession, ClientSubscription, ReferenceDescription, UserIdentityInfoUserName, BrowseResult, UserTokenType, DataType, AttributeIds } from "node-opcua";
import colors from "ansi-colors";
import { parseDecWordToAscii } from "../lib/kepServerUtil";

interface TagDeviceInfo {
  KEY: string;
  VALUE: string;
}

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

dotenv.config();

const tagName: string = "MBS";
const subscriptionsPath = path.resolve(__dirname, "../../kepserverTag.json");
const fileContent = fs.readFileSync(subscriptionsPath, 'utf-8');
const originJsonData = JSON.parse(fileContent);
let newJsonData;

const userIdentity: UserIdentityInfoUserName = {
  type: 1,
  userName: process.env.OPCUA_USERNAME || "",
  password: process.env.OPCUA_PASSWORD || "",
};
// 로그 파일 경로
const logFilePath = path.resolve(__dirname, "output.txt");

// 로그 파일에 데이터 쓰기 함수
function writeToLogFile(data: string) {
  fs.appendFileSync(logFilePath, data + "\n", { encoding: "utf8" });
}

// 콘솔 및 파일 출력 함수
function logToConsoleAndFile(data: string, color: 'white' | 'green' | 'blue' | 'red' | 'yellow') {

  if (color === 'green') {
    console.log(colors.green(data)); // 기존 콘솔 출력
  } else if (color === 'blue') {
    console.log(colors.blue(data)); // 기존 콘솔 출력
  } else if (color === 'red') {
    console.log(colors.red(data)); // 기존 콘솔 출력
  } else if (color === 'yellow') {
    console.log(colors.yellow(data)); // 기존 콘솔 출력
  } else if (color === 'white') {
    console.log(colors.white(data)); // 기존 콘솔 출력
  }
  writeToLogFile(data); // 파일에 저장
}

const opcuaClient = {
  client: OPCUAClient.create(kepserverConfig.clientOptions),
  session: null as ClientSession | null,
  subscription: null as ClientSubscription | null,
  dataState: {} as Record<string, any>, // 현재 상태를 저장할 객체
  visitedNodes: new Set<string>(), // 방문한 NodeId를 추적하는 Set
  subscribableNodes: [] as Record<string, any>[],   // 구독가능한 노드배열
  nodesToSubscribe: [{}] as Record<string, any>[],   // 구독선택한 노드배열
  subscribableTags: new Set<string>(),


  needToSubscribe(tagName: string): boolean {
    return tagName === 'Call_Request' ||
      tagName === 'Call_Response' ||
      tagName === 'Call_Cancel_Request' ||
      tagName === 'Dock_Permit' ||
      tagName === 'Dock_Not_Permit' ||
      tagName === 'Dock_EQ_Status' ||
      tagName === 'Dock_Out_Permit' ||
      tagName === 'Call_Type_01' ||
      tagName === 'Complete' ||
      tagName === 'Call_Request_Multi_1' ||
      tagName === 'Call_Request_Multi_2' ||
      tagName === 'Call_Priority' ||
      tagName === 'EQ_Auto' ||
      tagName === 'EQ_Manual'
  },

  isASCII(tagName: string): boolean {
    return tagName.includes('EQ_Code') || tagName.includes('Call_Type')
  },

  async getTagDetails(nodeId: string): Promise<{ description: string; dataType: string, address: string; }> {
    if (!this.session) {
      throw new Error("❌ OPC UA 세션이 없습니다. 먼저 연결하세요!");
    }

    // 🔹 읽을 속성 정의 (Description, DataType)
    const attributesToRead = [
      { nodeId: `${nodeId}._Description`, attributeId: AttributeIds.Value },
      { nodeId, attributeId: AttributeIds.DataType },
      { nodeId: `${nodeId}._Address`, attributeId: AttributeIds.Value }
    ];

    const results = await this.session.read(attributesToRead);
    // console.log("🚀 ~ getTagDetails ~ results:", results)

    // 🔹 Description 값 파싱
    const descriptionValue = results[0].value;
    const description = descriptionValue ? descriptionValue.value : "설명 없음";

    // 🔹 DataType 값 파싱
    const dataType = DataType[results[1].value.value.value];

    // 🔹 Address 값 파싱
    const address = results[2].value.value;

    return { description, dataType, address };
  },
  // 🔹 OPC UA에서 JSON 데이터 생성 함수
  async generateTagJson(): Promise<Tag[]> {
    if (!this.session) {
      console.error("❌ OPC UA 세션이 없습니다. 먼저 연결하세요!");
      return [];
    }

    const objectsNodeId = "ns=0;i=85"; // Objects 노드 ID
    const browseResult: BrowseResult = await this.session.browse(objectsNodeId);

    console.log("📌 'Objects' 내부에서 채널 검색...");

    const tags: Tag[] = [];

    // 🔹 1️⃣ 채널 찾기


    const channels = browseResult.references!
      .filter((ref) => ref.nodeClass === 1)
      .filter((ref: ReferenceDescription) => !(ref.browseName.name?.startsWith("_") ?? false)) // 시스템 노드 제외 ("_AdvancedTags", "_System" 등)
      .filter((ref: ReferenceDescription) => ref.nodeId.namespace === 2)
      .map((ref) => ({
        name: ref.browseName.name || "",
        nodeId: ref.nodeId.toString(),
      }));

    console.log("✅ 채널 목록:", channels);

    // 🔹 2️⃣ 채널별 디바이스 찾기
    for (const channel of channels) {
      const deviceBrowseResult: BrowseResult = await this.session.browse(channel.nodeId);
      const devices = deviceBrowseResult.references!
        .filter((ref) => ref.nodeClass === 1)
        .filter((ref: ReferenceDescription) => !(ref.browseName.name?.startsWith("_") ?? false)) // 시스템 노드 제외 ("_AdvancedTags", "_System" 등)
        .filter((ref: ReferenceDescription) => ref.nodeId.namespace === 2)
        .map((ref) => ({
          name: ref.browseName.name || "",
          nodeId: ref.nodeId.toString(),
        }));

      console.log(`📌 채널 '${channel.name}'의 디바이스:`, devices);

      for (const device of devices) {
        // 🔹 3️⃣ 디바이스별 태그 그룹 찾기
        const tagGroupBrowseResult: BrowseResult = await this.session.browse(device.nodeId);
        const tagGroups = tagGroupBrowseResult.references!
          .filter((ref) => ref.nodeClass === 1) // Object 타입만 포함
          .filter((ref: ReferenceDescription) => !(ref.browseName.name?.startsWith("_") ?? false)) // 시스템 노드 제외 ("_AdvancedTags", "_System" 등)
          .filter((ref: ReferenceDescription) => ref.nodeId.namespace === 2)
          .map((ref) => ({
            name: ref.browseName.name || "",
            nodeId: ref.nodeId.toString(),
          }));

        console.log(`📌 디바이스 '${device.name}'의 태그 그룹:`, tagGroups);

        if (tagGroups.length === 0) {
          // 🔹 4️⃣ 태그 그룹이 없으면 바로 태그 검색
          const tagBrowseResult: BrowseResult = await this.session.browse(device.nodeId);
          const attributesToRead = [
            { nodeId: `${device.nodeId}.EQ_Code_01`, attributeId: AttributeIds.Value },
            { nodeId: `${device.nodeId}.EQ_Code_02`, attributeId: AttributeIds.Value }
          ];

          const results = await this.session.read(attributesToRead);
          // const eqCode01 = results[0].value.value;
          // const eqCode02 = results[1].value.value;
          // const eqCode = parseDecWordToAscii(eqCode01) + parseDecWordToAscii(eqCode02);

          // nodeId 형식: STACK01.SC11.Call_Request 일때
          const eqCode = device.name;
          // nodeId 형식: SC.11.Call_Request 일때
          // const eqCode = device.nodeId.split('.').slice(0, 2).join('');

          for (const ref of tagBrowseResult.references!) {
            if (ref.nodeClass === 2 && ref.nodeId.namespace === 2 && !(ref.browseName.name?.startsWith("_") ?? false)) {
              const tagDetails = await this.getTagDetails(ref.nodeId.toString());
              this.subscribableTags.add(ref.browseName.name || '');
              tags.push({
                NODE_ID: ref.nodeId.toString(),
                CHANNEL: channel.name,
                DEVICE: device.name,
                TAGGROUP: '', // 태그 그룹 없음
                TAG_NAME: ref.browseName.name || '',
                DESCRIPTION: tagDetails.description || '',
                DATA_TYPE: tagDetails.dataType,
                ADDRESS: tagDetails.address,
                SUBSCRIPTION: this.needToSubscribe(ref.browseName.name || ''),
                INPUT_TYPE: (tagDetails.dataType === 'Boolean') ? 'Bool' : this.isASCII(ref.browseName.name || '') ? 'ASCII' : 'DEC',
                EQ_CODE: eqCode
              });
            }
          }
        } else {
          // 🔹 5️⃣ 태그 그룹이 있으면 그룹별로 태그 찾기
          for (const tagGroup of tagGroups) {
            const tagBrowseResult: BrowseResult = await this.session.browse(tagGroup.nodeId);
            const attributesToRead = [
              { nodeId: `${tagGroup.nodeId}.EQ_Code_01`, attributeId: AttributeIds.Value },
              { nodeId: `${tagGroup.nodeId}.EQ_Code_02`, attributeId: AttributeIds.Value }
            ];

            const results = await this.session.read(attributesToRead);
            // const eqCode01 = results[0].value.value;
            // const eqCode02 = results[1].value.value;
            // const eqCode = parseDecWordToAscii(eqCode01) + parseDecWordToAscii(eqCode02);
            // nodeId 형식: STACK01.SC11.Call_Request 일때
            const eqCode = tagGroup.name;
            // nodeId 형식: SC.11.Call_Request 일때
            // const eqCode = tagGroup.nodeId.split('.').slice(0, 2).join('');

            for (const ref of tagBrowseResult.references!) {
              if (ref.nodeClass === 2 && ref.nodeId.namespace === 2 && !(ref.browseName.name?.startsWith("_") ?? false)) {
                const tagDetails = await this.getTagDetails(ref.nodeId.toString());
                this.subscribableTags.add(ref.browseName.name || '');
                tags.push({
                  NODE_ID: ref.nodeId.toString(),
                  CHANNEL: channel.name,
                  DEVICE: device.name,
                  TAGGROUP: tagGroup.name,
                  TAG_NAME: ref.browseName.name || '',
                  DESCRIPTION: tagDetails.description || '',
                  DATA_TYPE: tagDetails.dataType,
                  ADDRESS: tagDetails.address,
                  SUBSCRIPTION: this.needToSubscribe(ref.browseName.name || ''),
                  INPUT_TYPE: (tagDetails.dataType === 'Boolean') ? 'Bool' : this.isASCII(ref.browseName.name || '') ? 'ASCII' : 'DEC',
                  EQ_CODE: eqCode
                });
              }
            }
          }
        }
      }
    }

    return tags;
  },

  async findNodeIdByBrowseName(parentNodeId: string, browseName: string): Promise<string | null> {
    let browseResult: BrowseResult | undefined;

    if (this.session) {
      browseResult = await this.session.browse({
        nodeId: parentNodeId,
        browseDirection: 0, // Forward
        includeSubtypes: true,
        nodeClassMask: 0, // 모든 노드 클래스
        resultMask: 0x3f, // 모든 속성 포함
      });

    }



    if (browseResult?.references) {
      for (const ref of browseResult.references) {
        if (ref.browseName.name === browseName) {
          return ref.nodeId.toString(); // NodeId 반환
        }
      }
    }
    return null; // BrowseName에 해당하는 NodeId를 찾지 못한 경우
  },

  async connect() {
    if (this.session) {
      logToConsoleAndFile("Already connected!", "yellow");
      return this.session;
    }

    // 연결 이벤트 추가
    this.client.on("connected", () => {
      logToConsoleAndFile("Successfully connected to OPC UA server!", "green");
    });

    this.client.on("connection_failed", () => {
      logToConsoleAndFile("connection_failed", "red");
    })

    this.client.on("connection_lost", () => {
      logToConsoleAndFile("connection_lost", "red");
    })

    this.client.on("connection_reestablished", () => {
      logToConsoleAndFile("connection_reestablished", "red");
    })

    this.client.on("timed_out_request", () => {
      logToConsoleAndFile("timed_out_request", "red");
    })

    this.client.on("abort", () => {
      logToConsoleAndFile("abort", "red");
    })

    this.client.on("close", () => {
      logToConsoleAndFile("close", "red");
    })

    this.client.on("backoff", (count, delay) => {
      logToConsoleAndFile(`backoff\tcount : ${count}, delay : ${delay} `, "red");
    })

    this.client.on("start_reconnection", () => {
      logToConsoleAndFile("start_reconnection", "red");
    })

    this.client.on("reconnection_attempt_has_failed", () => {
      logToConsoleAndFile("reconnection_attempt_has_failed", "red");
    })

    this.client.on("after_reconnection", () => {
      logToConsoleAndFile("after_reconnection", "red");
    })

    this.client.on("disconnected", () => {
      logToConsoleAndFile("Disconnected from OPC UA server!", "yellow");
    });

    this.client.on("error", (err) => {
      logToConsoleAndFile(`Connection error: ${err.message}`, "red");
    });

    try {
      await this.client.connect(kepserverConfig.endpointUrl);
      logToConsoleAndFile("Connected to KepServerEX!", "green");
      this.session = await this.client.createSession(
        userIdentity.userName !== "" ? userIdentity : { type: UserTokenType.Anonymous }
      );
      return this.session;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logToConsoleAndFile(`Failed to connect: ${error.message}`, "red");
      } else {
        logToConsoleAndFile(`Unknown error occurred: ${String(error)}`, "red");
      }
    }
  },

  async initSubscriptions() {

    const session = await this.connect();
    const tags = await this.generateTagJson();

    originJsonData[tagName] = tags;
    fs.writeFileSync(subscriptionsPath, JSON.stringify(originJsonData, null, 4), 'utf-8');
  },

  async disconnect() {
    if (this.subscription) {
      await this.subscription.terminate();
      console.log("Subscription terminated!");
    }
    if (this.session) {
      await this.session.close();
      console.log("Session closed!");
    }
    await this.client.disconnect();
    console.log("Disconnected from KepServerEX!");
    this.session = null;
    this.subscription = null;
  },
};



// OPC UA 구독 초기화
opcuaClient.initSubscriptions().then(() => {
  console.log("Subscriptions initialized!");
  process.exit(0);
}).catch((error) => {
  console.error("Failed to initialize subscriptions:", error.message);
  console.log("the end");
  process.exit(1);

});