# 서버(홈서버/VPS) 배포용 백엔드 이미지. 로컬 개발은 `npm run dev`(tsx)를 그대로 사용하므로
# 이 이미지는 docker/docker-compose.server.yml의 `server` 프로필에서만 쓰인다.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 런타임 의존성만 설치 (devDependencies 제외 → 이미지 축소 + 공격 표면 감소)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

# root로 실행하지 않음 (node 공식 이미지에 내장된 비특권 계정 재사용)
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
