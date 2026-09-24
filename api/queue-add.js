// api/queue-add.js
const { SUPABASE_URL, supabaseHeaders } = require('./supabase-env');
const tokenCache = {};

async function getAccessToken(refreshToken) {
  const cached = tokenCache[refreshToken];
  if (cached && Date.now() < cached.expiry - 60000) return cached.token;
  const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + creds },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });
  if (!res.ok) throw new Error('Token refresh failed: ' + res.status);
  const data = await res.json();
  tokenCache[refreshToken] = { token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function getSessionToken(sessionId) {
  const url = SUPABASE_URL + '/rest/v1/bloom_sessions?id=eq.' + encodeURIComponent(sessionId) + '&select=refresh_token';
  const r = await fetch(url, {
    headers: supabaseHeaders()
  });
  if (!r.ok) throw new Error('Session fetch failed: ' + r.status);
  const rows = await r.json();
  if (!rows.length) throw new Error('Session not found: ' + sessionId);
  return rows[0].refresh_token;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const raw = await new Promise(function(resolve, reject) {
        let data = '';
        req.on('data', function(chunk) { data += chunk; });
        req.on('end', function() { resolve(data); });
        req.on('error', reject);
      });
      body = JSON.parse(raw || '{}');
    } catch(e) {
      body = {};
    }
  }

  const uri = body.uri, title = body.title;
  const artist = body.artist || '', art = body.art || '';
  const album = body.album || '', dur = body.dur || '';
  const addedBy = body.addedBy || 'guest';
  const sessionId = body.sessionId || '';

  if (!uri || !title) return res.status(400).json({ error: 'Missing uri or title' });
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  try {
    const sessionToken = await getSessionToken(sessionId);
    if (sessionToken) refreshToken = sessionToken;
  } catch(e) {
    console.log('Session lookup failed, using default token:', e.message);
  }

  let stored = false;
  try {
    const sbRes = await fetch(SUPABASE_URL + '/rest/v1/bloom_queue', {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }),
      body: JSON.stringify({ uri, title, artist, art, album, dur, added_by: addedBy, votes: 0, session_id: sessionId })
    });
    stored = sbRes.ok;
    if (!sbRes.ok) console.error('Supabase error:', await sbRes.text());
  } catch(e) {
    console.error('Supabase fetch failed:', e.message);
  }

  let queued = false;
  let spotifyError = '';
  if (refreshToken) {
    try {
      const access = await getAccessToken(refreshToken);
      const qr = await fetch(
        'https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(uri),
        { method: 'POST', headers: { Authorization: 'Bearer ' + access } }
      );
      if (qr.status === 204 || qr.ok) {
        queued = true;
      } else if (qr.status === 404) {
        spotifyError = 'Start playback on a Spotify device first (Premium)';
      } else {
        const j = await qr.json().catch(() => ({}));
        spotifyError = j.error?.message || ('Spotify queue failed ' + qr.status);
      }
    } catch(e) {
      spotifyError = e.message;
    }
  } else {
    spotifyError = 'No host Spotify token for this session';
  }

  if (stored || queued) return res.status(200).json({ ok: true, stored, queued });
  return res.status(500).json({ error: spotifyError || 'Could not add song' });
};