// GET /api/queue-list — host Spotify queue when Supabase is unavailable
module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(200).json({ tracks: [] });
  }

  try {
    const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + creds,
      },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
    });
    if (!tokenRes.ok) return res.status(200).json({ tracks: [] });
    const tokenData = await tokenRes.json();

    const r = await fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    if (!r.ok) return res.status(200).json({ tracks: [] });
    const data = await r.json();
    const tracks = (data.queue || []).slice(0, 20).map(function(t) {
      const imgs = (t.album && t.album.images) || t.images || [];
      const art = (imgs[1] && imgs[1].url) || (imgs[0] && imgs[0].url) || '';
      const ms = t.duration_ms || 0;
      return {
        uri: t.uri,
        title: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(', '),
        art,
        dur: Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0'),
        added_by: '',
      };
    });
    return res.status(200).json({ tracks });
  } catch (e) {
    return res.status(200).json({ tracks: [] });
  }
};
