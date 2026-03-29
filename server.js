const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// yt-dlp binary path — the build script downloads it here
const YTDLP_PATH = path.join(__dirname, 'bin', 'yt-dlp');

function getAudioUrl(videoId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    execFile(YTDLP_PATH, [
      '--get-url',
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '--no-warnings',
      '--no-check-certificates',
      '--cookies-from-browser', 'chrome', // helps bypass age-gating if present
      url
    ], { timeout: 30000 }, (err, stdout) => {
      if (err) {
        // Retry without cookies on error
        execFile(YTDLP_PATH, [
          '--get-url',
          '-f', 'bestaudio[ext=m4a]/bestaudio/best',
          '--no-warnings',
          '--no-check-certificates',
          url
        ], { timeout: 30000 }, (err2, stdout2) => {
          if (err2) return reject(err2);
          const u = stdout2.trim().split('\n')[0];
          if (!u) return reject(new Error('No URL returned'));
          resolve(u);
        });
        return;
      }
      const u = stdout.trim().split('\n')[0];
      if (!u) return reject(new Error('No URL returned'));
      resolve(u);
    });
  });
}

// /audio?id=VIDEO_ID — returns JSON with the stream URL
app.get('/audio', async (req, res) => {
  const videoId = req.query.id;
  console.log('🎵 Request for videoId:', videoId);

  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid video id' });
  }

  try {
    const streamUrl = await getAudioUrl(videoId.trim());
    console.log('✅ Extracted URL:', streamUrl.substring(0, 80) + '...');

    // Returned for clients that want to stream directly (mobile app)
    return res.json({ url: streamUrl });
  } catch (error) {
    console.error('❌ yt-dlp Error:', error.message || error);
    return res.status(500).json({ error: String(error.message || error) });
  }
});

// /stream?id=VIDEO_ID — streams (proxies) the audio bytes directly
// Useful if your device cannot reach YouTube's CDN directly
app.get('/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid video id' });
  }

  try {
    const streamUrl = await getAudioUrl(videoId.trim());

    const rangeHeader = req.headers['range'];
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
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

      const status = (rangeHeader && upstream.statusCode === 206) ? 206 : 200;
      res.writeHead(status, resHeaders);
      upstream.pipe(res);
    }).on('error', (e) => {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`✅ Halo Audio Server is running on port ${PORT}`);
  console.log(`======================================================\n`);
});
