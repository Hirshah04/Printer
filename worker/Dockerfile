# Production Dockerfile for Cloud Print Worker
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# Runtime Stage
FROM node:20-slim

# Install WireGuard tools, Ghostscript (for PCLm conversion), poppler-utils, and iproute2
RUN apt-get update && apt-get install -y --no-install-recommends \
    wireguard-tools \
    iproute2 \
    iptables \
    ghostscript \
    poppler-utils \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY wireguard ./wireguard

# Environment
ENV NODE_ENV=production
ENV WIREGUARD_INTERFACE=wg0

# Entrypoint script that can optionally bring up WireGuard before starting worker
RUN echo '#!/bin/sh\n\
if [ -f "/etc/wireguard/wg0.conf" ]; then\n\
  echo "[Container] Starting WireGuard interface wg0..."\n\
  wg-quick up wg0 || echo "[Container] Warning: wg-quick failed, check SYS_MODULE / NET_ADMIN capabilities"\n\
fi\n\
exec node dist/index.js' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
