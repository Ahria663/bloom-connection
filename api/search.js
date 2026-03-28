// api/search.js
// Guests call this to search Spotify using the host's credentials.
// Required env vars (set in Vercel dashboard):
//   SPOTIFY_CLIENT_ID      — your Spotify app's client ID
//   SPOTIFY_CLIENT_SECRET  — your Spotify app's client secret
//   SPOTIFY_REFRESH_TOKEN  — your long-lived refresh token

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

  if (!res.ok) throw new Error('Failed to refresh Spotify token');
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  // CORS — allow your Vercel domain and localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const token = await getAccessToken();
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!spotifyRes.ok) throw new Error('Spotify search failed');
    const data = await spotifyRes.json();

    const tracks = (data.tracks?.items || []).map((t) => ({
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album.name,
      art: t.album.images[1]?.url || t.album.images[0]?.url || '',
      dur: `${Math.floor(t.duration_ms / 60000)}:${String(
        Math.floor((t.duration_ms % 60000) / 1000)
      ).padStart(2, '0')}`,
    }));

    return res.status(200).json({ tracks });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Search failed' });
  }
}