// This script runs during the Render build phase via "npm run build"
// It downloads the yt-dlp Linux x64 binary to the project root /bin folder.
const https = require('https');
const fs = require('fs');
const path = require('path');

// Always relative to the PROJECT ROOT, not this script's directory
const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function download(url, dest, redirectCount = 0) {
  if (redirectCount > 5) {
    console.error('Too many redirects');
    process.exit(1);
  }

  https.get(url, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      return download(response.headers.location, dest, redirectCount + 1);
    }

    if (response.statusCode !== 200) {
      console.error('Failed to download yt-dlp, status:', response.statusCode);
      process.exit(1);
    }

    const file = fs.createWriteStream(dest);
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      fs.chmodSync(dest, '755');
      console.log('✅ yt-dlp downloaded to:', dest);
    });
  }).on('error', (err) => {
    console.error('Download error:', err.message);
    process.exit(1);
  });
}

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

if (fs.existsSync(YTDLP_PATH)) {
  console.log('✅ yt-dlp already present, skipping download.');
} else {
  console.log('📥 Downloading yt-dlp...');
  download(YTDLP_URL, YTDLP_PATH);
}
