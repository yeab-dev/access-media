# Digital Bridge accessible learning media: the player module, the API, the demo pages and Savanna.
FROM node:24-bookworm-slim

# ffmpeg: video, audio, sign recordings. chromium: tagged PDF documents.
# fonts: Noto (includes Noto Sans Ethiopic for Amharic) and DejaVu (demo slides).
RUN apt-get -o Acquire::Retries=5 update \
 && apt-get -o Acquire::Retries=5 install -y --no-install-recommends ffmpeg chromium fonts-noto-core fonts-dejavu-core fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY api ./api
COPY module ./module
COPY demo ./demo
COPY studio ./studio
COPY savanna ./savanna
COPY scripts ./scripts
COPY portal ./portal
COPY provider-site ./provider-site
COPY openapi.yaml ./

RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 8080

# Starts as root only to make the data disk writable, then runs everything as "node".
# First start builds the demo lesson's media into /data.
CMD ["./scripts/docker-start.sh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
