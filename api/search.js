// api/search.js
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken(forceRefresh) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing env vars');
  }

  const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + creds
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
  });

  const text = await res.text();
  if (!res.ok) throw new Error('Token refresh failed ' + res.status + ': ' + text);

  const data = JSON.parse(text);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const forceRefresh = attempt > 0;
      const token = await getAccessToken(forceRefresh);
      const spotifyRes = await fetch(
        'https://api.spotify.com/v1/search?q=' + encodeURIComponent(q) + '&type=track&limit=8',
        { headers: { 'Authorization': 'Bearer ' + token } }
      );

      // If 401, clear cache and retry once with a fresh token
      if (spotifyRes.status === 401) {
        cachedToken = null;
        tokenExpiry = 0;
        continue;
      }

      if (!spotifyRes.ok) throw new Error('Spotify search ' + spotifyRes.status);

      const data = await spotifyRes.json();
      const items = (data.tracks && data.tracks.items) || [];

      const tracks = items.map(function(t) {
        const imgs = (t.album && t.album.images) || [];
        const art  = (imgs[1] && imgs[1].url) || (imgs[0] && imgs[0].url) || '';
        const durMin = Math.floor(t.duration_ms / 60000);
        const durSec = String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0');
        return {
          id: t.id, uri: t.uri, title: t.name,
          artist: (t.artists || []).map(function(a) { return a.name; }).join(', '),
          album:  (t.album && t.album.name) || '',
          art, dur: durMin + ':' + durSec
        };
      });

      return res.status(200).json({ tracks });
    } catch(err) {
      if (attempt === 1) {
        console.error('Search error:', err.message);
        return res.status(500).json({ error: err.message });
      }
    }
  }
};