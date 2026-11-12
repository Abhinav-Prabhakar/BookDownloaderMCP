# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    LIBGEN_DOWNLOAD_DIR=/books
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY README.md LICENSE ./

RUN mkdir -p /books && chown -R node:node /books
USER node

# The server speaks MCP over stdio, so keep stdin open (`docker run -i`).
VOLUME ["/books"]
CMD ["node", "dist/cli.js"]
