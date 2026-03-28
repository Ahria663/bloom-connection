// api/debug-token.js
// TEMPORARY - delete after debugging
module.exports = async function(req, res) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  
    // Show first/last 6 chars so we can verify without exposing full token
    const tokenPreview = refreshToken 
      ? refreshToken.slice(0, 6) + '...' + refreshToken.slice(-6) + ' (length: ' + refreshToken.length + ')'
      : 'MISSING';
  
    // Actually try to refresh
    let result = 'not attempted';
    try {
      const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + creds
        },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
      });
      const text = await r.text();
      result = 'Status: ' + r.status + ' | Response: ' + text.slice(0, 200);
    } catch(e) {
      result = 'Error: ' + e.message;
    }
  
    res.status(200).json({
      clientId: clientId ? clientId.slice(0, 6) + '...' : 'MISSING',
      clientSecret: clientSecret ? 'present (length ' + clientSecret.length + ')' : 'MISSING',
      refreshToken: tokenPreview,
      spotifyResponse: result
    });
  };