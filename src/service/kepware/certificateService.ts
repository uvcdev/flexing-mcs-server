import { OPCUACertificateManager } from "node-opcua";
import path from "path";
import fs from "fs";
import { logToConsoleAndFile } from '../../lib/logging';


export async function createClientCertificate() {

  const clientCertificateManager = new OPCUACertificateManager({
    rootFolder: path.join(__dirname, "../certificates/clients/PKI"),
    name: "ClientPKI",
  });

  await clientCertificateManager.initialize();

  const clientCertificateFile = path.join(clientCertificateManager.rootDir, "own/client_selfsigned_cert.pem");
  const clientPrivateKeyFile = path.join(clientCertificateManager.rootDir, "own/private_key.pem");

  // 인증서가 없으면 새로 생성
  if (!fs.existsSync(clientCertificateFile)) {
    console.log("Generating client certificate...");
    await clientCertificateManager.createSelfSignedCertificate({
      applicationUri: "urn:DESKTOP-1NG4ONT:NodeOPCUA-Client",
      dns: [],
      validity: 365, // 인증서 유효기간 (365일)
      subject: "/CN=MyNodeOPCUAClient",
      startDate: new Date(),
      outputFile: clientCertificateFile,
    });
    logToConsoleAndFile("Client certificate generated!", "green");
  } else {
    logToConsoleAndFile("Client certificate already exists.", "yellow");
  }

  return { clientCertificateFile, clientPrivateKeyFile };
}
