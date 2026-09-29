# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --ignore-scripts --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_SITE_URL=https://kucafe.ir
ARG NEXT_DEPLOYMENT_ID=container-build
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# Build-time database access is currently required by the application's
# server-rendered metadata/home queries. The env file is a BuildKit secret and
# is never copied to an image layer. CI supplies its own disposable database.
RUN --mount=type=secret,id=kucafe_env,target=/app/.env.local,required=false \
    npm run postinstall && npm run prebuild && npm run build:next && \
    printf '%s\n' "$NEXT_DEPLOYMENT_ID" > .next/DEPLOYMENT_ID

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 \
    PORT=3100
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl imagemagick tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 kucafe \
    && useradd --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin kucafe
WORKDIR /app
COPY --from=builder --chown=10001:10001 /app/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=builder --chown=10001:10001 /app/.next/DEPLOYMENT_ID ./.next/DEPLOYMENT_ID
COPY --from=builder --chown=10001:10001 /app/public ./public
RUN mkdir -p /app/public/media/upload && chown -R 10001:10001 /app/public/media
USER 10001:10001
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=4 \
  CMD curl --fail --silent --show-error http://127.0.0.1:3100/robots.txt >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

FROM deps AS maintenance
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl default-mysql-client imagemagick rsync tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm run postinstall
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--version"]
