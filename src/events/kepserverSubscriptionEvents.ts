import {
  ClientSubscription,
  ClientMonitoredItem,
  NotificationMessage,
  StatusCode,
  DiagnosticInfo,
} from "node-opcua-client";
import { logToConsoleAndFile } from "../lib/logging";
import opcuaClient from "../lib/opcuaUtil";

export function registerSubscriptionEvents(subscription: ClientSubscription): void {
  subscription.on("started", (subscriptionId: number) => {
    logToConsoleAndFile(`Subscription started! subscriptionId is ${subscriptionId}`);
  });

  subscription.on("terminated", () => {
    logToConsoleAndFile("Subscription terminated!");
    opcuaClient.subscription = null;
  });

  subscription.on("item_added", (monitoredItem: ClientMonitoredItem) => {
    const nodeId = monitoredItem?.itemToMonitor?.nodeId?.toString() || "Unknown";
    logToConsoleAndFile(`Subscription item_added! monitoredItem is ${nodeId}`);
  });

  subscription.on("keepalive", () => {
    logToConsoleAndFile("Subscription keepalive!");
  });

  subscription.on("internal_error", (err: Error) => {
    logToConsoleAndFile(`Subscription internal_error! error is ${err}`);
  });

  subscription.on("raw_notification", (notificationMessage: NotificationMessage) => {
    logToConsoleAndFile(`Subscription raw_notification!`);
    // notificationMessage 처리 필요 시 추가
  });

  subscription.on("received_notifications", (notificationMessage: NotificationMessage) => {
    logToConsoleAndFile(`Subscription received_notifications!`);
    // notificationMessage 처리 필요 시 추가
  });

  subscription.on("status_changed", (status: StatusCode, diagnosticInfo?: DiagnosticInfo) => {
    logToConsoleAndFile("Subscription status_changed!");
    logToConsoleAndFile(`status is ${status}`);
    if (diagnosticInfo) {
      logToConsoleAndFile(`diagnosticInfo is ${diagnosticInfo}`);
    }
  });

  subscription.on("error", (err: Error) => {
    logToConsoleAndFile(`Subscription error! error is ${err}`);
  });
}
