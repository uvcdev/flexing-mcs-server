const MCS_TOPIC = process.env.MQTT_WMS_TOPIC || 'MS01';

export const mqttSubscribeWmsTopics = [
  // WMS
  `${MCS_TOPIC}-CALL`,
  `${MCS_TOPIC}-TRANSFER`,
  `${MCS_TOPIC}-CARRIER`,
  `${MCS_TOPIC}-PORT`,
  `${MCS_TOPIC}-CRANE`,
  `${MCS_TOPIC}-BRANCH`,
  `${MCS_TOPIC}-ALARM`,
  `${MCS_TOPIC}-ONLINE`,
  '-HEARTBEAT',
];

export const mqttSubscribeAcsTopics = [
  // ACS
  '-MCS-PAYLOAD_STATE',
  '-MCS-MISSION_STATE',
  '-MCS-ALARM_STATE',
  '-MCS-ACK_MISSION_COMMAND',
];
