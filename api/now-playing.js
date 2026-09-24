const store = require('./session-store');

let cachedToken = null;
let tokenExpiry = 0;

async function tokenFromRefresh(refreshToken) {
  if (!refreshToken || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  const creds = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + creds },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

function idle() {
  return { playing: false, title: '', artist: '', album: '', art: '', progress_ms: 0, duration_ms: 0 };
}

function fromCache(s) {
  if (!s || !s.nowPlaying) return null;
  const np = Object.assign({}, s.nowPlaying);
  if (np.playing && np.duration_ms && s.nowPlayingAt) {
    np.progress_ms = Math.min((np.progress_ms || 0) + (Date.now() - s.nowPlayingAt), np.duration_ms);
  }
  return np;
}

async function fromSpotify(access) {
  if (!access) return null;
  const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: 'Bearer ' + access },
  });
  if (r.status === 204 || r.status === 404) return idle();
  if (!r.ok) return null;
  const data = await r.json();
  if (!data || !data.item) return idle();
  const item = data.item;
  const imgs = (item.album && item.album.images) || item.images || [];
  const art = (imgs.find(function (i) { return i.width >= 300; }) || imgs[0] || {}).url || '';
  return {
    playing: !!data.is_playing,
    title: item.name,
    artist: (item.artists || []).map(function (a) { return a.name; }).join(', '),
    album: (item.album && item.album.name) || '',
    art,
    uri: item.uri || '',
    progress_ms: data.progress_ms || 0,
    duration_ms: item.duration_ms || 0,
  };
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = ((req.query && req.query.session) || '').trim();
  const s = store.get(sessionId);

  try {
    const cached = fromCache(s);
    if (cached && cached.title && s.nowPlayingAt && Date.now() - s.nowPlayingAt < 20000) {
      return res.status(200).json(cached);
    }

    let access = s && s.accessToken;
    if (!access && s && s.refreshToken) access = await tokenFromRefresh(s.refreshToken);
    if (!access) {
      const envRt = process.env.SPOTIFY_REFRESH_TOKEN;
      if (envRt) {
        if (cachedToken && Date.now() < tokenExpiry - 60000) access = cachedToken;
        else {
          access = await tokenFromRefresh(envRt);
          if (access) {
            cachedToken = access;
            tokenExpiry = Date.now() + 50 * 60 * 1000;
          }
        }
      }
    }

    const live = await fromSpotify(access);
    if (live && live.title && sessionId) {
      store.put(sessionId, { nowPlaying: live, nowPlayingAt: Date.now() });
    }
    if (live) return res.status(200).json(live);
    if (cached) return res.status(200).json(cached);
    return res.status(200).json(idle());
  } catch (err) {
    console.error('Now playing error:', err.message);
    const cached = fromCache(s);
    return res.status(200).json(cached || idle());
  }
};
