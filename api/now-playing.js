// api/now-playing.js
// Returns what's currently playing for a given session's host.
// Pass ?session=SESSION_ID

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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = req.query.session?.trim();

  try {
    let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    if (sessionId) {
      try { refreshToken = await getSessionRefreshToken(sessionId); } catch(e) {}
    }

    const token = await getAccessToken(refreshToken);
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.status === 204 || r.status === 404) return res.status(200).json({ playing: false });
    if (!r.ok) throw new Error('Spotify error ' + r.status);

    const data = await r.json();
    if (!data?.item) return res.status(200).json({ playing: false });

    const item = data.item;
    const imgs = item.album?.images || item.images || [];
    const art = imgs.find(i => i.width >= 300)?.url || imgs[0]?.url || '';

    return res.status(200).json({
      playing: !!data.is_playing,
      title: item.name,
      artist: (item.artists || []).map(a => a.name).join(', '),
      album: item.album?.name || '',
      art,
      progress_ms: data.progress_ms || 0,
      duration_ms: item.duration_ms || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not fetch now playing' });
  }
}