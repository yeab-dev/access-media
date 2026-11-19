#!/usr/bin/env bash
# Adds the example lesson "Creativity at work" to a server, through the API,
# the same way any lesson provider adds a lesson.
#   SERVER=https://your-server KEY=<master key or provider key> ./scripts/add-example-lesson.sh
# Video: "Creativity in the Workplace" by the simpleshow foundation, CC BY-SA 3.0, from Wikimedia Commons.
set -euo pipefail
: "${SERVER:?Set SERVER, for example https://access-media.onrender.com}"
: "${KEY:?Set KEY to your API key (or the master key)}"
URL="https://upload.wikimedia.org/wikipedia/commons/e/ed/Creativity_in_the_Workplace_-_explained_by_simpleshow_foundation.webm"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Downloading the video from Wikimedia Commons (23 MB)…"
curl -fsSL -A "access-media-example/1.0" -o "$TMP/creativity.webm" "$URL"
echo "Uploading to $SERVER…"
curl -fsS -X POST "$SERVER/api/v1/lessons" -H "Authorization: Bearer $KEY" \
  -F "video=@$TMP/creativity.webm" -F "title=Creativity at work" -F lang=en -F id=creativity-at-work
echo
echo "Follow progress: curl $SERVER/api/v1/lessons/creativity-at-work"
