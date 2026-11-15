#!/bin/sh
# Container start. Hosting disks (Render, Fly) are often mounted owned by root: make /data ours,
# then run as the unprivileged "node" user. The server itself never runs as root.
set -e
if [ "$(id -u)" = 0 ]; then
  mkdir -p /data
  [ "$(stat -c %U /data)" = node ] || chown -R node:node /data
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi
# First start: build the demo lesson's media into /data.
[ -f /data/lessons/demo/lesson.mp4 ] || DATA_DIR=/data ./scripts/make-demo.sh
exec node api/index.js
