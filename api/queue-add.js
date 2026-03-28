// api/queue-add.js
// Adds a song to the session's Supabase queue and to the host's Spotify queue.

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
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json();
  tokenCache[refreshToken] = { token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function getSession(sessionId) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/bloom_sessions?id=eq.${sessionId}&select=refresh_token,host_name`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!r.ok) throw new Error('Session lookup failed');
  const rows = await r.json();
  if (!rows.length) throw new Error('Session not found');
  return rows[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uri, title, artist, art, album, dur, addedBy, sessionId } = req.body || {};
  if (!uri || !title) return res.status(400).json({ error: 'Missing uri or title' });
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const errors = [];

  // 1. Look up the session to get the host's refresh token
  let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  try {
    const session = await getSession(sessionId);
    refreshToken = session.refresh_token;
  } catch (e) {
    errors.push('Session error: ' + e.message);
  }

  // 2. Write to Supabase with session_id so it's scoped to this host
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
          uri, title,
          artist: artist || '',
          art: art || '',
          album: album || '',
          dur: dur || '',
          added_by: addedBy || 'guest',
          votes: 0,
          session_id: sessionId,
        }),
      }
    );
    if (!sbRes.ok) errors.push('Supabase error: ' + await sbRes.text());
  } catch (e) {
    errors.push('Supabase unreachable: ' + e.message);
  }

  // 3. Add to the host's Spotify queue using their token
  try {
    const token = await getAccessToken(refreshToken);
    const spRes = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!spRes.ok && spRes.status !== 404) {
      errors.push('Spotify error: ' + await spRes.text());
    }
  } catch (e) {
    errors.push('Spotify unreachable: ' + e.message);
  }

  if (errors.length === 3) return res.status(500).json({ error: errors.join(' | ') });
  return res.status(200).json({ ok: true, warnings: errors.length ? errors : undefined });
}