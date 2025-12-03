FROM node:18.12.1-alpine3.16 as builder

WORKDIR /app

# 노드 패키지 설치
COPY package*.json src /app/
COPY plcTagInfo.json src /app/
RUN npm install -g pnpm && pnpm install
# RUN npm i --save-dev @types/node-schedule
# 소스코드 빌드
COPY . .
RUN npx tsc
# RUN pnpm build

# ==== 결과 이미지 생성
FROM node:18.12.1-alpine3.16 as final
WORKDIR /app
# 빌드용 이미지에서 결과 이미지로 복사 (소스코드)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/plcTagInfo.json ./
COPY --from=builder /app/build/ build
# 빌드용 이미지에서 결과 이미지로 복사 (node_modules 및 추가적으로 필요한 파일들)
COPY --from=builder /app/node_modules/ node_modules
COPY --from=builder /app/src/swagger.json src/swagger.json

ENV LC_ALL ko_KR.UTF-8
ENV NODE_OPTIONS --unhandled-rejections=warn
EXPOSE 3030
CMD ["node", "build"]