FROM node:24-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN npm ci --workspace @oshikatsu/api --include-workspace-root

COPY apps/api apps/api
COPY packages/protocol packages/protocol
RUN npm run build --workspace @oshikatsu/protocol
RUN npm run build --workspace @oshikatsu/api
RUN npm prune --omit=dev

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
USER node

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=build --chown=node:node /workspace/packages/protocol/dist ./packages/protocol/dist

CMD ["node", "apps/api/dist/server.js"]
