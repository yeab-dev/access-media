#!/usr/bin/env bash
# Builds the demo lesson in data/media/demo from data/seed/demo.
# The video is placeholder slides (no narration); replace with a real lesson.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${DATA_DIR:-data}/media/demo"
mkdir -p "$OUT"
cp data/seed/demo/* "$OUT/"

FONT="$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || true)"
[ -f "$FONT" ] || FONT=/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf

slide() { # start end text
  printf "drawtext=fontfile=%s:text='%s':fontcolor=white:fontsize=h/14:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,%s,%s)'," "$FONT" "$3" "$1" "$2"
}
FILTER="$(slide 0 5 'How to write a CV')$(slide 5 10 'What is a CV?')$(slide 10 15 '1. Name, phone, town')$(slide 15 20 '2. Education and training')$(slide 20 25 '3. Work experience')$(slide 25 30 'One or two pages')"
FILTER="${FILTER}drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontcolor=white@0.8:fontsize=h/24:x=12:y=12"

ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=0x0b3d6b:s=640x360:r=25:d=30" \
  -f lavfi -i "anullsrc=r=44100:cl=mono" -t 30 \
  -vf "$FILTER" -c:v libx264 -profile:v main -crf 28 -g 50 -pix_fmt yuv420p \
  -c:a aac -b:a 64k -movflags +faststart -shortest "$OUT/video-360.mp4"

ffmpeg -y -loglevel error -i "$OUT/video-360.mp4" \
  -vf "scale=-2:240" -c:v libx264 -profile:v baseline -g 50 -b:v 180k -maxrate 200k -bufsize 400k \
  -c:a aac -b:a 32k -ac 1 -movflags +faststart "$OUT/video-240.mp4"

ffmpeg -y -loglevel error -i "$OUT/video-360.mp4" -vn -c:a libmp3lame -b:a 32k -ac 1 "$OUT/audio.mp3"
ffmpeg -y -loglevel error -ss 1 -i "$OUT/video-360.mp4" -frames:v 1 -q:v 5 "$OUT/poster.jpg"

# Placeholder sign language video with the same timecode. Replace with a real ESL interpreter recording.
ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=0x2b2b2b:s=270x360:r=25:d=30" \
  -vf "drawtext=fontfile=${FONT}:text='ESL interpreter':fontcolor=white:fontsize=22:x=(w-text_w)/2:y=h/2-40,drawtext=fontfile=${FONT}:text='(placeholder)':fontcolor=white@0.7:fontsize=18:x=(w-text_w)/2:y=h/2-8,drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontcolor=yellow:fontsize=26:x=(w-text_w)/2:y=h/2+30" \
  -c:v libx264 -profile:v baseline -g 50 -b:v 120k -pix_fmt yuv420p -an -movflags +faststart "$OUT/sign.mp4"

echo "Demo lesson ready in $OUT"
