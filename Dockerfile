# Digital Bridge accessible learning media: the player module, the API, the demo pages and Savanna.
FROM node:24-bookworm-slim

# ffmpeg: video, audio, sign recordings. chromium: tagged PDF documents.
# fonts: Noto (includes Noto Sans Ethiopic for Amharic) and DejaVu (demo slides).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg chromium fonts-noto-core fonts-dejavu-core fontconfig ca-certificates \
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
COPY openapi.yaml ./

RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080

# First start: build the demo lesson's media into /data. Then run the server.
CMD ["sh", "-c", "[ -f /data/lessons/demo/lesson.mp4 ] || DATA_DIR=/data ./scripts/make-demo.sh; exec node api/index.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
