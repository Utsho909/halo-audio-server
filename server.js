const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// yt-dlp binary — downloaded by "npm run build" before startup
const YTDLP_PATH = path.join(__dirname, 'bin', 'yt-dlp');

function getAudioUrl(videoId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Write cookies from env var to a temp file if available
    let cookiesFile = null;
    if (process.env.YOUTUBE_COOKIES) {
      cookiesFile = path.join('/tmp', 'yt_cookies.txt');
      const fs = require('fs');
      // Render stores multiline env vars with literal \n — replace them with real newlines
      const cookieContent = process.env.YOUTUBE_COOKIES.replace(/\\n/g, '\n');
      fs.writeFileSync(cookiesFile, cookieContent, 'utf8');
    }

    const args = [
      '--get-url',
      // Try common audio itags directly: 251=opus webm, 140=m4a, 250/249=opus, then any audio
      '-f', '251/250/249/140/bestaudio',
      '--no-warnings',
      '--no-check-certificates',
      '--geo-bypass',          // bypass geo-restrictions on Render's US IP
    ];

    if (cookiesFile) {
      args.push('--cookies', cookiesFile);
    }

    args.push(url);
    console.log('Running yt-dlp with args:', args.join(' '));

    execFile(YTDLP_PATH, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('yt-dlp error:', err.message);
        console.error('stderr:', stderr);
        return reject(err);
      }
      const u = stdout.trim().split('\n')[0];
      if (!u) return reject(new Error('yt-dlp returned empty output'));
      resolve(u);
    });
  });
}

// GET /audio?id=VIDEO_ID — returns JSON { url: "..." }
app.get('/audio', async (req, res) => {
  const videoId = req.query.id;
  console.log('\n🎵 Audio request for:', videoId);

  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing video id' });
  }

  try {
    const streamUrl = await getAudioUrl(videoId.trim());
    console.log('✅ Got URL:', streamUrl.substring(0, 80) + '...');
    return res.json({ url: streamUrl });
  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /stream?id=VIDEO_ID — proxies the audio bytes
app.get('/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).json({ error: 'Missing video id' });

  try {
    const streamUrl = await getAudioUrl(videoId.trim());
    const rangeHeader = req.headers['range'];
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Accept': '*/*',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
    };
    if (rangeHeader) reqHeaders['Range'] = rangeHeader;

    const proto = streamUrl.startsWith('https') ? https : http;
    proto.get(streamUrl, { headers: reqHeaders }, (upstream) => {
      const resHeaders = {
        'Content-Type': upstream.headers['content-type'] || 'audio/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      };
      if (upstream.headers['content-length']) resHeaders['Content-Length'] = upstream.headers['content-length'];
      if (upstream.headers['content-range']) resHeaders['Content-Range'] = upstream.headers['content-range'];
      res.writeHead((rangeHeader && upstream.statusCode === 206) ? 206 : 200, resHeaders);
      upstream.pipe(res);
    }).on('error', (e) => {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

app.get('/ping', (req, res) => res.json({
  ok: true,
  time: new Date().toISOString(),
  cookies: process.env.YOUTUBE_COOKIES ? `✅ Loaded (${process.env.YOUTUBE_COOKIES.split('\n').length} lines)` : '❌ Not set'
}));


app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Halo Audio Server running on port ${PORT}`);
  console.log(`   yt-dlp path: ${YTDLP_PATH}`);
});
