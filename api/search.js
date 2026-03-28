// api/search.js
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

  const q = (req.query.q || '').trim();
  const sessionId = (req.query.session || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    if (sessionId) {
      try { refreshToken = await getSessionToken(sessionId); } catch(e) { console.log('Session lookup failed, using default token:', e.message); }
    }
    const token = await getAccessToken(refreshToken);
    const spotifyRes = await fetch('https://api.spotify.com/v1/search?q=' + encodeURIComponent(q) + '&type=track&limit=8', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!spotifyRes.ok) throw new Error('Spotify search failed: ' + spotifyRes.status);
    const data = await spotifyRes.json();
    const tracks = (data.tracks && data.tracks.items || []).map(function(t) {
      const imgs = t.album && t.album.images || [];
      return {
        id: t.id, uri: t.uri, title: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(', '),
        album: t.album && t.album.name || '',
        art: (imgs[1] && imgs[1].url) || (imgs[0] && imgs[0].url) || '',
        dur: Math.floor(t.duration_ms / 60000) + ':' + String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0'),
      };
    });
    return res.status(200).json({ tracks: tracks });
  } catch(err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};