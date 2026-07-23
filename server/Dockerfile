FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN node node_modules/typescript/bin/tsc -p tsconfig.json

FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /data/cloud /data/media-jobs && chown -R node:node /data/cloud /data/media-jobs

USER node
CMD ["node", "dist/server.js"]
