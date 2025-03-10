import { OPCUAClient } from "node-opcua-client";
import { logToConsoleAndFile } from "../lib/logging";

export function registerClientEvents(client: OPCUAClient): void {
  console.log("🚀 ~ registerClientEvents ~ client:", client)

  // OPC UA 클라이언트가 서버에 성공적으로 연결되었을 때 호출
  client.on("connected", () => {
    logToConsoleAndFile("Successfully connected to OPC UA server!", "green");
  });

  // 클라이언트가 서버 연결에 실패했을 때 호출
  client.on("connection_failed", () => {
    logToConsoleAndFile("connection_failed", "red");
  });

  // 클라이언트가 서버와의 연결을 잃었을 때 호출
  client.on("connection_lost", () => {
    logToConsoleAndFile("connection_lost", "red");
  });

  // 클라이언트가 연결을 재설정(재연결)했을 때 호출
  client.on("connection_reestablished", () => {
    logToConsoleAndFile("connection_reestablished", "red");
  });

  // 요청이 제한 시간을 초과했을 때 호출
  client.on("timed_out_request", () => {
    logToConsoleAndFile("timed_out_request", "red");
  });

  // 클라이언트가 작업을 중단(abort)했을 때 호출
  client.on("abort", () => {
    logToConsoleAndFile("abort", "red");
  });

  // 클라이언트 연결이 닫혔을 때 호출
  client.on("close", () => {
    logToConsoleAndFile("close", "red");
  });

  // 클라이언트가 재연결을 시도 중일 때 호출
  client.on("backoff", (count, delay) => {
    logToConsoleAndFile(`backoff\tcount : ${count}, delay : ${delay} `, "red");
  });

  // 클라이언트가 재연결을 시작할 때 호출
  client.on("start_reconnection", () => {
    logToConsoleAndFile("start_reconnection", "red");
  });

  // 재연결 시도가 실패했을 때 호출
  client.on("reconnection_attempt_has_failed", () => {
    logToConsoleAndFile("reconnection_attempt_has_failed", "red");
  });

  // 재연결 시도가 성공한 후 호출
  client.on("after_reconnection", () => {
    logToConsoleAndFile("after_reconnection", "red");
  });

  // 클라이언트가 서버에서 연결이 끊겼을 때 호출
  client.on("disconnected", () => {
    logToConsoleAndFile("Disconnected from OPC UA server!", "yellow");
  });

  // 클라이언트에서 오류가 발생했을 때 호출
  client.on("error", (err) => {
    logToConsoleAndFile(`Connection error: ${err.message}`, "red");
  });

}
