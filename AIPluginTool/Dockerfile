FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev

COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_CLIENT=true
ENV TRUST_PROXY=true

EXPOSE 3001

VOLUME ["/app/server/data"]

CMD ["node", "--experimental-sqlite", "server/src/index.js"]
