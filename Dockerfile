# Digital Bridge accessible learning media: the player module, the API, the demo pages and Savanna.

# --- whisper.cpp (MIT): speech to text for automatic captions, inside this server: no extra service, no cost,
# and lesson audio never leaves the machine. Built from a pinned release; only the program is kept.
FROM debian:bookworm-slim AS whisper
ARG WHISPER_VERSION=v1.9.5
RUN apt-get -o Acquire::Retries=5 update \
 && apt-get -o Acquire::Retries=5 install -y --no-install-recommends build-essential cmake curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 5 "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz" | tar -xz -C /opt \
 && mv /opt/whisper.cpp-* /opt/whisper.cpp
# Portable build (the machine that builds may not be the one that runs it). On x86, use AVX2, which all current servers have.
RUN X86=""; [ "$(uname -m)" = x86_64 ] && X86="-DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON"; \
    cmake -S /opt/whisper.cpp -B /opt/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF \
      -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF $X86 \
 && cmake --build /opt/build -j "$(nproc)" --config Release --target whisper-cli \
 && strip /opt/build/bin/whisper-cli

# --- the app
FROM node:24-bookworm-slim

# ffmpeg: video, audio, sign recordings. chromium: tagged PDF documents.
# fonts: Noto (includes Noto Sans Ethiopic for Amharic) and DejaVu (demo slides).
RUN apt-get -o Acquire::Retries=5 update \
 && apt-get -o Acquire::Retries=5 install -y --no-install-recommends ffmpeg chromium fonts-noto-core fonts-dejavu-core fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=whisper /opt/build/bin/whisper-cli /usr/local/bin/whisper-cli

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
COPY openapi.yaml ./

RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 8080

# Starts as root only to make the data disk writable, then runs everything as "node".
# First start builds the demo lesson's media into /data.
CMD ["./scripts/docker-start.sh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
