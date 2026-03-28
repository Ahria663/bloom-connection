// api/queue-remove.js
module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
    const body = req.body || {};
    const uri = body.uri, sessionId = body.sessionId;
    if (!uri) return res.status(400).json({ error: 'Missing uri' });
  
    const filter = sessionId
      ? 'uri=eq.' + encodeURIComponent(uri) + '&session_id=eq.' + encodeURIComponent(sessionId)
      : 'uri=eq.' + encodeURIComponent(uri);
  
    try {
      const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/bloom_queue?' + filter, {
        method: 'DELETE',
        headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY }
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  };