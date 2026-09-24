const store = require('./session-store');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const sessionId = (req.query.session || '').trim();
    const s = store.get(sessionId);
    if (!s) return res.status(200).json({ nowPlaying: null, queue: [] });
    return res.status(200).json({
      nowPlaying: s.nowPlaying,
      nowPlayingAt: s.nowPlayingAt,
      queue: s.queue,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const raw = await new Promise(function (resolve, reject) {
        let data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function () { resolve(data); });
        req.on('error', reject);
      });
      body = JSON.parse(raw || '{}');
    } catch (e) {
      body = {};
    }
  }

  const sessionId = (body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const patch = {};
  if (body.accessToken) {
    patch.accessToken = body.accessToken;
    patch.accessTokenAt = Date.now();
  }
  if (body.refreshToken) patch.refreshToken = body.refreshToken;
  if (body.nowPlaying && typeof body.nowPlaying === 'object') {
    patch.nowPlaying = body.nowPlaying;
    patch.nowPlayingAt = Date.now();
  }
  const s = store.put(sessionId, patch);
  return res.status(200).json({ ok: true, queue: s.queue });
};
