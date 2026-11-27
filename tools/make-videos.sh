#!/usr/bin/env bash
# Assembles rendered frames into the two CrazyGames preview videos (cover image as the opening frame).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p crazygames-upload/videos
mk() { # frames_dir cover WxH out
  local frames=$1 cover=$2 size=$3 out=$4
  ffmpeg -y -loglevel error \
    -loop 1 -t 0.4 -framerate 30 -i "$cover" \
    -framerate 30 -i "$frames/f%04d.jpg" \
    -filter_complex "[0:v]scale=${size/x/:},setsar=1,format=yuv420p[c];[1:v]scale=${size/x/:},setsar=1,format=yuv420p[v];[c][v]concat=n=2:v=1:a=0[o]" \
    -map "[o]" -c:v libx264 -preset slow -crf 19 -profile:v high -pix_fmt yuv420p -r 30 -movflags +faststart -an "$out"
  echo "$out: $(du -h "$out" | cut -f1), $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")s"
}
mk tools/shots/vid_land crazygames-upload/covers/cover-landscape-1920x1080.png 1920x1080 crazygames-upload/videos/preview-landscape-1920x1080.mp4
mk tools/shots/vid_port crazygames-upload/covers/cover-portrait-800x1200.png 1080x1620 crazygames-upload/videos/preview-portrait-1080x1620.mp4
