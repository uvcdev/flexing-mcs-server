#!/bin/bash

# setting - docker info
DOCKER_IMAGE_NAME=flexing-mes-server-2.0
DOCKER_PROJECT_NAME=mes-dev
DOCKER_CONTAINER_NAME=$DOCKER_IMAGE_NAME-$DOCKER_PROJECT_NAME

echo docker stop $DOCKER_CONTAINER_NAME ...
docker stop $DOCKER_CONTAINER_NAME

echo docker rm $DOCKER_CONTAINER_NAME ...
docker rm $DOCKER_CONTAINER_NAME

echo docker run $DOCKER_CONTAINER_NAME ...
./dockerRun.sh
