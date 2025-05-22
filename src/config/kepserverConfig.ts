import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { createClientCertificate } from "../service/kepware/certificateService";
import dotenv from "dotenv"


dotenv.config();

let certificateFile = "";
let privateKeyFile = "";

void (async () => {
  const { clientCertificateFile, clientPrivateKeyFile } = await createClientCertificate();

  certificateFile = clientCertificateFile;
  privateKeyFile = clientPrivateKeyFile;

})();

export const kepserverConfig = {

  endpointUrl: process.env.OPCUA_ENDPOINT || "opc.tcp://localhost:49320",

  clientOptions: {
    // applicationName: "MyOPCUAClient",
    applicationUri: "urn:DESKTOP-1NG4ONT:NodeOPCUA-Client",
    // // KEPServerEx 보안이 'None' 일때
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,

    // KEPServerEx 보안이 'Basic256Sha256' 일때
    // securityMode: MessageSecurityMode.SignAndEncrypt,
    // securityPolicy: SecurityPolicy.Basic256Sha256,
    // certificateFile: certificateFile,
    // privateKeyFile: privateKeyFile,

    endpointMustExist: false,
    connectionStrategy: {
      maxRetry: 2,            // 최대 5번 재시도
      initialDelay: 1000,      // 초기 지연 1초
      maxDelay: 10000,         // 최대 지연 10초
      randomisationFactor: 0.2 // 랜덤성 추가
    },
  },

  subscribeOptions: {
    requestedPublishingInterval: 1000,      // 1초 간격으로 데이터 전송
    requestedLifetimeCount: 300,			// 300초 유효 시간 1000ms * 300
    requestedMaxKeepAliveCount: 20,			// 20초 간격으로 KeepAlive 메세지 1000ms * 20
    maxNotificationsPerPublish: 1000,		// 한 번에 최대 1000개의 알림
    publishingEnabled: true,
    priority: 10,
  }

};

