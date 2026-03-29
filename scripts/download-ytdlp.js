// This script runs during the Render build phase.
// It downloads the yt-dlp binary for the Linux x64 environment.
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

if (fs.existsSync(YTDLP_PATH)) {
  console.log('✅ yt-dlp already exists, skipping download.');
  process.exit(0);
}

console.log('📥 Downloading yt-dlp binary...');

const file = fs.createWriteStream(YTDLP_PATH);
https.get(YTDLP_URL, (response) => {
  // Handle redirects
  if (response.statusCode === 302 || response.statusCode === 301) {
    https.get(response.headers.location, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.chmodSync(YTDLP_PATH, '755');
        console.log('✅ yt-dlp downloaded and made executable!');
      });
    }).on('error', (err) => {
      fs.unlinkSync(YTDLP_PATH);
      console.error('❌ Download redirect failed:', err.message);
      process.exit(1);
    });
    return;
  }

  response.pipe(file);
  file.on('finish', () => {
    file.close();
    fs.chmodSync(YTDLP_PATH, '755');
    console.log('✅ yt-dlp binary ready!');
  });
}).on('error', (err) => {
  fs.unlinkSync(YTDLP_PATH);
  console.error('❌ Download failed:', err.message);
  process.exit(1);
});
