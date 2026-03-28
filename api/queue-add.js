// api/queue-add.js
// Guests call this to add a song. It:
//   1. Writes the song to Supabase (so the host's UI updates live)
//   2. Adds it to the host's Spotify queue via the host's token
//
// Required env vars (set in Vercel dashboard):
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//   SUPABASE_URL          — e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role key (NOT the anon key — needs insert rights)

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uri, title, artist, art, album, dur, addedBy } = req.body || {};
  if (!uri || !title) return res.status(400).json({ error: 'Missing uri or title' });

  const errors = [];

  // 1. Write to Supabase
  try {
    const sbRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/bloom_queue`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          uri,
          title,
          artist: artist || '',
          art: art || '',
          album: album || '',
          dur: dur || '',
          added_by: addedBy || 'guest',
          votes: 0,
        }),
      }
    );
    if (!sbRes.ok) {
      const txt = await sbRes.text();
      errors.push('Supabase error: ' + txt);
    }
  } catch (e) {
    errors.push('Supabase unreachable: ' + e.message);
  }

  // 2. Add to Spotify queue
  try {
    const token = await getAccessToken();
    const spRes = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // 404 means no active device — that's okay, song is still in Supabase
    if (!spRes.ok && spRes.status !== 404) {
      const txt = await spRes.text();
      errors.push('Spotify error: ' + txt);
    }
  } catch (e) {
    errors.push('Spotify unreachable: ' + e.message);
  }

  if (errors.length === 2) {
    // Both failed — something is very wrong
    return res.status(500).json({ error: errors.join(' | ') });
  }

  return res.status(200).json({
    ok: true,
    warnings: errors.length ? errors : undefined,
  });
}