// api/session-create.js
// Creates a Bloom session for a host.
// Accepts either:
//   { refreshToken } — store directly (best, gives long-lived sessions)
//   { accessToken }  — host is already logged in but no refresh token available
//                      we store the server's SPOTIFY_REFRESH_TOKEN as a fallback
//                      but tag the session with the user's access token for identity

function generateId() {
    return Math.random().toString(36).slice(2, 9) +
           Math.random().toString(36).slice(2, 9);
  }
  
  async function getSpotifyProfile(accessToken) {
    try {
      const r = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  
  export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
    const { refreshToken, accessToken } = req.body || {};
    if (!refreshToken && !accessToken) {
      return res.status(400).json({ error: 'Missing refreshToken or accessToken' });
    }
  
    // Get the host's Spotify profile for their display name
    const token = accessToken || null;
    let hostName = '';
    let spotifyUserId = '';
    if (token) {
      const profile = await getSpotifyProfile(token);
      hostName = profile?.display_name || profile?.id || '';
      spotifyUserId = profile?.id || '';
    }
  
    // Use provided refresh token, or fall back to the server's own token.
    // This means if a whitelisted user logs in but Spotify didn't return a refresh
    // token (because they've previously authorized), we use the server token.
    // Their queue will still be isolated by session_id.
    const storedRefreshToken = refreshToken || process.env.SPOTIFY_REFRESH_TOKEN;
  
    const sessionId = generateId();
  
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bloom_sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            id: sessionId,
            refresh_token: storedRefreshToken,
            host_name: hostName,
            spotify_user_id: spotifyUserId,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }),
        }
      );
  
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: txt });
      }
  
      return res.status(200).json({ sessionId, hostName });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }