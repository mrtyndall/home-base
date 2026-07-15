FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY worker ./worker
COPY src/lib/agent/schemas.ts ./src/lib/agent/schemas.ts
RUN npm run worker:build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap ca-certificates gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system homebase \
  && useradd --system --gid homebase --create-home --home-dir /home/homebase homebase \
  && mkdir -p /app /data/codex /home/homebase/work /tmp/homebase \
  && chown -R homebase:homebase /app /data/codex /home/homebase /tmp/homebase

WORKDIR /app
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/worker/dist ./dist
COPY worker/package.json ./dist/package.json
COPY worker/prompts ./worker/prompts
COPY --chmod=755 worker/entrypoint.sh /usr/local/bin/worker-entrypoint

ENV NODE_ENV=production \
  CODEX_HOME=/data/codex \
  HOME=/home/homebase \
  WORKER_CWD=/home/homebase/work \
  TMPDIR=/tmp/homebase \
  PROMPT_DIR=/app/worker/prompts

VOLUME ["/data/codex"]
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/worker-entrypoint"]
CMD ["node", "/app/dist/worker/src/index.js"]
