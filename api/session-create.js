// api/session-create.js
function generateId() {
    return Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);
  }
  
  module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
    const body = req.body || {};
    const refreshToken = body.refreshToken;
    const accessToken = body.accessToken;
    if (!refreshToken && !accessToken) return res.status(400).json({ error: 'Missing token' });
  
    let hostName = '', spotifyUserId = '';
    if (accessToken) {
      try {
        const r = await fetch('https://api.spotify.com/v1/me', { headers: { 'Authorization': 'Bearer ' + accessToken } });
        if (r.ok) {
          const p = await r.json();
          hostName = p.display_name || p.id || '';
          spotifyUserId = p.id || '';
        }
      } catch(e) {}
    }
  
    const storedToken = refreshToken || process.env.SPOTIFY_REFRESH_TOKEN;
    const sessionId = generateId();
  
    try {
      const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/bloom_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id: sessionId, refresh_token: storedToken, host_name: hostName,
          spotify_user_id: spotifyUserId,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      return res.status(200).json({ sessionId, hostName });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  };