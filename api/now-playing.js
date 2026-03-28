// api/now-playing.js
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
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = (req.query.session || '').trim();
  try {
    let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    if (sessionId) {
      try { refreshToken = await getSessionToken(sessionId); } catch(e) {}
    }
    const token = await getAccessToken(refreshToken);
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (r.status === 204 || r.status === 404) return res.status(200).json({ playing: false });
    if (!r.ok) throw new Error('Spotify error ' + r.status);
    const data = await r.json();
    if (!data || !data.item) return res.status(200).json({ playing: false });
    const item = data.item;
    const imgs = (item.album && item.album.images) || item.images || [];
    const art = (imgs.find(function(i) { return i.width >= 300; }) || imgs[0] || {}).url || '';
    return res.status(200).json({
      playing: !!data.is_playing, title: item.name,
      artist: (item.artists || []).map(function(a) { return a.name; }).join(', '),
      album: (item.album && item.album.name) || '', art: art,
      progress_ms: data.progress_ms || 0, duration_ms: item.duration_ms || 0,
    });
  } catch(err) {
    console.error('Now playing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};