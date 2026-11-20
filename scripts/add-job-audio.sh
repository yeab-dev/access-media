#!/usr/bin/env bash
# Attaches a recorded "Listen to summary" to a test job, so the job card plays it on every phone,
# including phones with no voice for that language (most have no Amharic voice).
#
# Usage: scripts/add-job-audio.sh <job-id> <en|am> <recording>   (any audio or video file a phone makes)
# Writes demo/data/jobs-audio/<job-id>.<lang>.mp3 (32 kbps mono, small for 3G) and sets "audio" in demo/data/jobs.json.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 3 ] || { echo "Usage: $0 <job-id> <en|am> <recording>"; exit 1; }
id="$1"; lang="$2"; in="$3"
[[ "$id" =~ ^[a-z0-9-]+$ ]] || { echo "Job id: lowercase letters, digits and dashes only."; exit 1; }
[[ "$lang" =~ ^(en|am)$ ]] || { echo "Language: en or am."; exit 1; }
[ -f "$in" ] || { echo "No such file: $in"; exit 1; }

mkdir -p demo/data/jobs-audio
out="demo/data/jobs-audio/$id.$lang.mp3"
# Trim silence at both ends, even out the loudness, mono 32 kbps.
ffmpeg -y -loglevel error -i "$in" -vn \
  -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5" \
  -ac 1 -ar 22050 -c:a libmp3lame -b:a 32k "$out"

node -e '
  const fs = require("fs"), [id, lang, src] = process.argv.slice(1), f = "demo/data/jobs.json";
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const job = data.jobs.find((j) => j.id === id);
  if (!job) { console.error(`No job "${id}" in ${f}. Ids: ${data.jobs.map((j) => j.id).join(", ")}`); fs.unlinkSync(src); process.exit(1); }
  job[lang] = { ...job[lang], audio: "/" + src };
  // Keep short lists of words on one line, as the file is written by hand.
  const text = JSON.stringify(data, null, 2).replace(/\[\n\s+("[^"\n]*"(?:,\n\s+"[^"\n]*")*)\n\s+\]/g, (_, inner) => "[" + inner.replace(/,\n\s+/g, ", ") + "]");
  fs.writeFileSync(f, text + "\n");
' "$id" "$lang" "$out"
echo "Added $out ($(du -k "$out" | cut -f1) KB) to job $id ($lang)."
