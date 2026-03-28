// api/auth-callback.js
// Spotify redirects here after you approve access.
// It exchanges the code for tokens and displays your refresh token on screen.

module.exports = async function(req, res) {
    const { code, error } = req.query;
  
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
    const redirectUri  = 'https://bloom-connection-vznr.vercel.app/api/auth-callback';
  
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
        redirect_uri: redirectUri,
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
  
    const refreshToken = data.refresh_token;
    const accessToken  = data.access_token;
  
    return res.status(200).send(`<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><title>Bloom — Auth Success 🌸</title>
  <style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdf0f3;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
  .card{background:#fefaf7;border-radius:24px;padding:40px 36px;max-width:560px;width:100%;box-shadow:0 8px 40px rgba(45,26,34,.12);border:1px solid rgba(244,160,176,.35);}
  h1{font-family:Georgia,serif;font-size:26px;color:#2d1a22;margin-bottom:8px;}
  .sub{font-size:14px;color:#7a4a5c;margin-bottom:32px;line-height:1.6;}
  .step{margin-bottom:24px;}
  .step-label{font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#d95c74;margin-bottom:8px;}
  .token-box{background:#fde8ed;border:1px solid rgba(217,92,116,.2);border-radius:12px;padding:14px 16px;font-family:'Courier New',monospace;font-size:12px;color:#2d1a22;word-break:break-all;line-height:1.7;position:relative;}
  .copy-btn{margin-top:10px;background:linear-gradient(135deg,#f4a0b0,#d95c74);color:#fff;border:none;border-radius:20px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .2s;}
  .copy-btn:hover{opacity:.88;}
  .note{background:#ede6f7;border-radius:12px;padding:16px;font-size:13px;color:#7a4a5c;line-height:1.7;margin-top:28px;}
  .note strong{color:#2d1a22;}
  </style></head>
  <body>
  <div class="card">
    <h1>🌸 Bloom connected!</h1>
    <p class="sub">Copy your refresh token below and add it to Vercel as <code>SPOTIFY_REFRESH_TOKEN</code>.</p>
  
    <div class="step">
      <div class="step-label">Your Refresh Token</div>
      <div class="token-box" id="rt">${refreshToken}</div>
      <button class="copy-btn" onclick="copy('rt', this)">Copy refresh token</button>
    </div>
  
    <div class="note">
      <strong>What to do next:</strong><br>
      1. Copy the refresh token above<br>
      2. Go to <strong>Vercel → your project → Settings → Environment Variables</strong><br>
      3. Add <code>SPOTIFY_REFRESH_TOKEN</code> = the token you copied<br>
      4. Make sure <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> are also set<br>
      5. Click <strong>Redeploy</strong> in Vercel → Deployments<br><br>
      This page is safe to close after copying. The refresh token never expires unless you revoke access in Spotify.
    </div>
  </div>
  <script>
  function copy(id, btn) {
    const text = document.getElementById(id).textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = 'Copy refresh token', 2000);
    });
  }
  </script>
  </body></html>`);
  }