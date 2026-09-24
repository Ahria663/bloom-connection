// api/auth-callback.js
// Spotify always returns here (one allowlisted Redirect URI),
// then we bounce the host back to the page they started from.

const PRODUCTION_HOME = 'https://bloom-connection-vznr.vercel.app/';
const REDIRECT_URI = 'https://bloom-connection-vznr.vercel.app/api/auth-callback';

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function allowedReturnTo(raw) {
  try {
    const u = new URL(String(raw || ''));
    const host = u.hostname;
    const local = host === 'localhost' || host === '127.0.0.1';
    const vercel = host === 'bloom-connection-vznr.vercel.app' || host.endsWith('.vercel.app');
    if (!local && !vercel) return null;
    if (local && u.protocol !== 'http:') return null;
    if (vercel && u.protocol !== 'https:') return null;
    u.hash = '';
    u.search = '';
    if (!u.pathname) u.pathname = '/';
    return u.toString();
  } catch (e) {
    return null;
  }
}

function returnToFromState(state) {
  const s = String(state || '');
  const dot = s.indexOf('.');
  if (dot < 1) return PRODUCTION_HOME;
  try {
    let b64 = s.slice(dot + 1).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    return allowedReturnTo(decoded) || PRODUCTION_HOME;
  } catch (e) {
    return PRODUCTION_HOME;
  }
}

module.exports = async function(req, res) {
  const query = req.query || {};
  const code = first(query.code);
  const error = first(query.error);
  const state = first(query.state);
  const returnTo = returnToFromState(state);

  if (error) {
    return res.status(200).send(`<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><title>Bloom Auth</title>
  <style>body{font-family:-apple-system,sans-serif;background:#fdf0f3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .card{background:#fefaf7;border-radius:24px;padding:40px;max-width:480px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(45,26,34,.12);}
  h2{color:#d95c74;margin-bottom:12px;}p{color:#7a4a5c;font-size:14px;}</style></head>
  <body><div class="card"><h2>❌ Auth Error</h2><p>${String(error)}</p></div></body></html>`);
  }

  if (!code) {
    return res.status(400).send('Missing code');
  }

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set in Vercel env vars yet.');
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    return res.status(200).send(`<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><title>Bloom Auth</title>
  <style>body{font-family:-apple-system,sans-serif;background:#fdf0f3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .card{background:#fefaf7;border-radius:24px;padding:40px;max-width:520px;width:90%;box-shadow:0 8px 40px rgba(45,26,34,.12);}
  h2{color:#d95c74;margin-bottom:12px;font-size:20px;}pre{background:#fde8ed;padding:16px;border-radius:12px;font-size:12px;overflow-x:auto;color:#2d1a22;}</style></head>
  <body><div class="card"><h2>❌ Token exchange failed</h2><pre>${JSON.stringify(data, null, 2)}</pre></div></body></html>`);
  }

  const hash = new URLSearchParams({
    access_token: data.access_token || '',
    token_type: data.token_type || 'Bearer',
  });
  if (data.refresh_token) hash.set('refresh_token', data.refresh_token);

  const target = returnTo.split('#')[0] + '#' + hash.toString();
  res.writeHead(302, { Location: target });
  res.end();
};
