const store = require('./session-store');

let cachedAppToken = null;
let appTokenExpiry = 0;

async function tokenFromRefresh(refreshToken) {
  if (!refreshToken || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + creds,
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function tokenFromClientCredentials() {
  if (cachedAppToken && Date.now() < appTokenExpiry - 60000) return cachedAppToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + creds,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  cachedAppToken = data.access_token;
  appTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedAppToken;
}

async function getSearchToken(sessionId) {
  const s = store.get(sessionId);
  if (s && s.accessToken) return s.accessToken;
  if (s && s.refreshToken) {
    const t = await tokenFromRefresh(s.refreshToken);
    if (t) return t;
  }
  const envRt = await tokenFromRefresh(process.env.SPOTIFY_REFRESH_TOKEN);
  if (envRt) return envRt;
  return tokenFromClientCredentials();
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  const sessionId = (req.query.session || '').trim();

  try {
    const token = await getSearchToken(sessionId);
    if (!token) return res.status(500).json({ error: 'Search is not configured' });

    const spotifyRes = await fetch(
      'https://api.spotify.com/v1/search?q=' + encodeURIComponent(q) + '&type=track&limit=8',
      { headers: { Authorization: 'Bearer ' + token } }
    );

    if (spotifyRes.status === 401) {
      cachedAppToken = null;
      appTokenExpiry = 0;
      const retryToken = await tokenFromClientCredentials();
      if (!retryToken) return res.status(500).json({ error: 'Search login expired' });
      const retry = await fetch(
        'https://api.spotify.com/v1/search?q=' + encodeURIComponent(q) + '&type=track&limit=8',
        { headers: { Authorization: 'Bearer ' + retryToken } }
      );
      if (!retry.ok) throw new Error('Spotify search ' + retry.status);
      return res.status(200).json({ tracks: mapTracks(await retry.json()) });
    }

    if (!spotifyRes.ok) throw new Error('Spotify search ' + spotifyRes.status);
    return res.status(200).json({ tracks: mapTracks(await spotifyRes.json()) });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function mapTracks(data) {
  const items = (data.tracks && data.tracks.items) || [];
  return items.map(function (t) {
    const imgs = (t.album && t.album.images) || [];
    const art = (imgs[1] && imgs[1].url) || (imgs[0] && imgs[0].url) || '';
    const durMin = Math.floor(t.duration_ms / 60000);
    const durSec = String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0');
    return {
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
      album: (t.album && t.album.name) || '',
      art,
      dur: durMin + ':' + durSec,
    };
  });
}
