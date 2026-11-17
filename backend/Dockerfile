FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-slim

# Install Python 3 and PyMuPDF for PCLm raster generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages pymupdf

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/scripts ./dist/scripts
COPY src/scripts ./src/scripts

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.js"]
