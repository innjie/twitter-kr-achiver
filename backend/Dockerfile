# 서버(홈서버/VPS) 배포용 백엔드 이미지. 로컬 개발은 `npm run dev`(tsx)를 그대로 사용하므로
# 이 이미지는 docker/docker-compose.server.yml의 `server` 프로필에서만 쓰인다.
# 빌드 컨텍스트는 저장소 루트(docker-compose.server.yml의 build.context: ..) — 프론트엔드
# 소스도 함께 필요해서 backend/ 단독 컨텍스트로는 불가능하다.

FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 런타임 의존성만 설치 (devDependencies 제외 → 이미지 축소 + 공격 표면 감소)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# 프론트엔드 빌드 산출물을 정적 서빙 디렉터리에 배치 (app.ts의 express.static이 그대로 서빙)
COPY --from=frontend-build /app/frontend/dist ./public

# root로 실행하지 않음 (node 공식 이미지에 내장된 비특권 계정 재사용)
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
