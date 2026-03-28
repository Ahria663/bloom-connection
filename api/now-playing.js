// api/now-playing.js
// Polled by guest.html every 5s to show what's currently playing.
// Same token refresh pattern as the other functions.

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) throw new Error('Failed to refresh token');
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getAccessToken();
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.status === 204 || r.status === 404) {
      return res.status(200).json({ playing: false });
    }
    if (!r.ok) throw new Error('Spotify error ' + r.status);

    const data = await r.json();
    if (!data?.item) return res.status(200).json({ playing: false });

    const item = data.item;
    const imgs = item.album?.images || item.images || [];
    const art = imgs.find((i) => i.width >= 300)?.url || imgs[0]?.url || '';

    return res.status(200).json({
      playing: !!data.is_playing,
      title: item.name,
      artist: (item.artists || []).map((a) => a.name).join(', '),
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