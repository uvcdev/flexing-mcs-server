FROM node:18.12.1-alpine3.16 as builder

WORKDIR /app

# 1) 락파일을 install '전에' 명시적으로 복사한다.
#    (package*.json 글롭은 pnpm-lock.yaml 을 못 잡기 때문에 직접 적어줘야 함)
COPY package.json pnpm-lock.yaml ./

# 2) 락파일에 박힌 '정확한 버전'만 설치. 안 맞으면 빌드 실패(--frozen-lockfile).
#    빌드 단계는 tsc 가 devDependencies(@types/*)를 써야 하므로 전체 설치한다(--prod 금지).
#    pnpm 버전도 고정해 빌드 환경을 재현 가능하게 만든다.
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

# 3) 소스코드 복사 후 빌드
COPY . .
RUN npx tsc

# ==== 결과 이미지 생성
FROM node:18.12.1-alpine3.16 as final
WORKDIR /app
# 빌드용 이미지에서 결과 이미지로 복사 (package.json 만 — npm 잔재 package-lock.json 제외)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/build/ build
# 빌드용 이미지에서 결과 이미지로 복사 (node_modules)
COPY --from=builder /app/node_modules/ node_modules
COPY --from=builder /app/src/swagger.json src/swagger.json

ENV LC_ALL ko_KR.UTF-8
ENV NODE_OPTIONS --unhandled-rejections=warn
EXPOSE 3030
CMD ["node", "build"]
