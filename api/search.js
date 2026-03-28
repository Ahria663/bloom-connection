// api/search.js
// Searches Spotify using the session host's token.
// Pass ?q=query&session=SESSION_ID

const tokenCache = {};

async function getAccessToken(refreshToken) {
  const cached = tokenCache[refreshToken];
  if (cached && Date.now() < cached.expiry - 60_000) return cached.token;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
      ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('Failed to refresh token');
  const data = await res.json();
  tokenCache[refreshToken] = { token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function getSessionRefreshToken(sessionId) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/bloom_sessions?id=eq.${sessionId}&select=refresh_token`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!r.ok) throw new Error('Session not found');
  const rows = await r.json();
  if (!rows.length) throw new Error('Session not found');
  return rows[0].refresh_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query.q?.trim();
  const sessionId = req.query.session?.trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    if (sessionId) {
      try { refreshToken = await getSessionRefreshToken(sessionId); } catch(e) {}
    }

    const token = await getAccessToken(refreshToken);
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!spotifyRes.ok) throw new Error('Spotify search failed');
    const data = await spotifyRes.json();

    const tracks = (data.tracks?.items || []).map(t => ({
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      album: t.album.name,
      art: t.album.images[1]?.url || t.album.images[0]?.url || '',
      dur: `${Math.floor(t.duration_ms / 60000)}:${String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0')}`,
    }));

    return res.status(200).json({ tracks });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Search failed' });
  }
}