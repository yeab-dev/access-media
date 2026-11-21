#!/bin/sh
# Container start. Hosting disks (Render, Fly) are often mounted owned by root: make /data ours,
# then run as the unprivileged "node" user. The server itself never runs as root.
set -e
if [ "$(id -u)" = 0 ]; then
  mkdir -p /data
  [ "$(stat -c %U /data)" = node ] || chown -R node:node /data
  # setpriv keeps the environment: give "node" its own home (Chromium crashes with an unwritable HOME=/root).
  export HOME=/home/node USER=node LOGNAME=node
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi
# Build the demo lesson's media into /data on first start, and again when the repo has a new clip or sign video for it.
want="$(cat demo/data/lessons/demo/lesson.mp4 demo/data/lessons/demo/lesson.ethsl.mp4 2>/dev/null | sha256sum | cut -c1-64)"
if [ ! -f /data/lessons/demo/lesson.mp4 ] || { [ -n "$want" ] && [ "$want" != "$(cat /data/lessons/demo/.built-from 2>/dev/null)" ]; }; then
  DATA_DIR=/data ./scripts/make-demo.sh
fi
exec node api/index.js
