#!/bin/bash

DAYS_BEFORE=7

DOCKER_IMAGE_NAME=flexing-mes-server-2.0
DOCKER_PROJECT_NAME=mes-dev
DOCKER_CONTAINER_NAME=$DOCKER_IMAGE_NAME-$DOCKER_PROJECT_NAME

LOG_DIR=/home/docker/volumes/$DOCKER_CONTAINER_NAME/logs

THEDAY="$(date -d "-$DAYS_BEFORE days" "+%Y-%m-%d")"
LOG_FILE=$LOG_DIR/$THEDAY.log

#echo $LOG_FILE
gzip $LOG_FILE

# crontab -e
# 0 1 * * * /home/docker/containers/flexing-mes-server-2.0/logBackup.sh