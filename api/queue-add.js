// api/queue-add.js
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
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json();
  tokenCache[refreshToken] = { token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function getSessionToken(sessionId) {
  const url = process.env.SUPABASE_URL + '/rest/v1/bloom_sessions?id=eq.' + encodeURIComponent(sessionId) + '&select=refresh_token';
  const r = await fetch(url, {
    headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY }
  });
  if (!r.ok) throw new Error('Session fetch failed');
  const rows = await r.json();
  if (!rows.length) throw new Error('Session not found');
  return rows[0].refresh_token;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const uri = body.uri, title = body.title, artist = body.artist || '', art = body.art || '';
  const album = body.album || '', dur = body.dur || '', addedBy = body.addedBy || 'guest';
  const sessionId = body.sessionId || '';

  if (!uri || !title) return res.status(400).json({ error: 'Missing uri or title' });
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  try { refreshToken = await getSessionToken(sessionId); } catch(e) { console.log('Using default token:', e.message); }

  const errors = [];

  // Write to Supabase
  try {
    const sbRes = await fetch(process.env.SUPABASE_URL + '/rest/v1/bloom_queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ uri, title, artist, art, album, dur, added_by: addedBy, votes: 0, session_id: sessionId })
    });
    if (!sbRes.ok) errors.push('Supabase: ' + await sbRes.text());
  } catch(e) { errors.push('Supabase: ' + e.message); }

  // Add to Spotify queue
  try {
    const token = await getAccessToken(refreshToken);
    const spRes = await fetch('https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(uri), {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!spRes.ok && spRes.status !== 404) errors.push('Spotify: ' + spRes.status);
  } catch(e) { errors.push('Spotify: ' + e.message); }

  if (errors.length === 2) return res.status(500).json({ error: errors.join(' | ') });
  return res.status(200).json({ ok: true, warnings: errors.length ? errors : undefined });
};