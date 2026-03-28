// api/now-playing.js
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken(refreshToken) {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + creds },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Token refresh failed ' + res.status + ': ' + txt);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Always use the server's master refresh token — simpler and reliable
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  try {
    const token = await getAccessToken(refreshToken);
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (r.status === 204 || r.status === 404) return res.status(200).json({ playing: false });
    if (!r.ok) throw new Error('Spotify error ' + r.status);
    const data = await r.json();
    if (!data || !data.item) return res.status(200).json({ playing: false });
    const item = data.item;
    const imgs = (item.album && item.album.images) || item.images || [];
    const art = (imgs.find(function(i) { return i.width >= 300; }) || imgs[0] || {}).url || '';
    return res.status(200).json({
      playing: !!data.is_playing, title: item.name,
      artist: (item.artists || []).map(function(a) { return a.name; }).join(', '),
      album: (item.album && item.album.name) || '', art: art,
      progress_ms: data.progress_ms || 0, duration_ms: item.duration_ms || 0,
    });
  } catch(err) {
    console.error('Now playing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};