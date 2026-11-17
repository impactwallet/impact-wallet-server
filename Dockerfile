FROM node:22-bookworm-slim AS dependencies
WORKDIR /app

# Native dependencies (including sharp) are installed for the image platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development PORT=9898
# Nest's watch-mode process cleanup invokes ps when restarting the server.
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node nest-cli.json tsconfig.json tsconfig.build.json .eslintrc.js .prettierrc ./
COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.test.json ./
COPY --chown=node:node test ./test
RUN chown node:node /app
USER node
EXPOSE 9898 9339
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + process.env.PORT + '/docs-json', r => { r.resume(); process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"
CMD ["npm", "run", "start:dev", "--", "--debug", "0.0.0.0:9339"]

FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=9898
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 9898
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + process.env.PORT + '/docs-json', r => { r.resume(); process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"
CMD ["node", "dist/main.js"]
