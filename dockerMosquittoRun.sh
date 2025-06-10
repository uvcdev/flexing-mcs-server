#!/bin/bash

# setting - docker info
DOCKER_IMAGE_NAME=eclipse-mosquitto
DOCKER_IMAGE_TAG=2.0.10
DOCKER_PROJECT_NAME=mes-dev
DOCKER_CONTAINER_NAME=$DOCKER_IMAGE_NAME-$DOCKER_PROJECT_NAME
DOCKER_PORT_MQTT=1883
DOCKER_PORT_WEBSOCKET=9001
DOCKER_HOME=/mosquitto
DOCKER_VOLUME=/home/docker/volumes/$DOCKER_CONTAINER_NAME
DOCKER_IMAGE=$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG

# mosquitto config copy
mkdir -p $DOCKER_VOLUME/mosquitto/config
cp mosquitto.conf $DOCKER_VOLUME/mosquitto/config/mosquitto.conf

# docker run #################################
docker run --name $DOCKER_CONTAINER_NAME \
-p $DOCKER_PORT_MQTT:1883 \
-p $DOCKER_PORT_WEBSOCKET:9001 \
-v $DOCKER_VOLUME/mosquitto/config/mosquitto.conf:$DOCKER_HOME/config/mosquitto.conf \
-d \
$DOCKER_IMAGE
