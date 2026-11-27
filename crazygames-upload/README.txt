PING PALACE — CrazyGames upload package

ping-palace-upload.zip   Upload this as the game build. It contains ONE file: index.html
                         (all code, 3D models, textures and the sky are embedded in it).
covers/                  Cover images: 1920x1080 (landscape), 800x1200 (portrait), 800x800 (square)
videos/                  Preview videos: 1920x1080 (16:9) and 1080x1620 (2:3), 18.8 s each, under 50 MB
LISTING.md               Title, short description, description, controls, category and tags

Rebuild everything from the repository:
  npm install
  npm run upload            -> rebuilds index.html and the zip
  npm run media             -> re-renders covers + videos (slow: ~1 hour, needs Chromium + ffmpeg)
