#!/bin/bash
DOCKER_USER_NAME=uvclab
DOCKER_IMAGE_NAME=flexing-mcs-server
DOCKER_IMAGE_TAG=3.2.5
SAVE_DIR=../images

docker build -t $DOCKER_USER_NAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG .

# docker build --no-cache -t $DOCKER_USER_NAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG .

# 빌드 성공 시에만 저장
if [ $? -eq 0 ]; then
    mkdir -p $SAVE_DIR
    OUTPUT_FILE="$SAVE_DIR/${DOCKER_IMAGE_NAME}_${DOCKER_IMAGE_TAG}.tar.gz"
    echo "이미지 저장 중: $OUTPUT_FILE"
    docker save $DOCKER_USER_NAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG | gzip > $OUTPUT_FILE
    echo "저장 완료: $OUTPUT_FILE"
else
    echo "빌드 실패 - 저장 건너뜀"
fi
