// api/queue-remove.js
// Called by the host app when a song finishes playing.
// Uses the service key (server-side only) to delete it from Supabase.

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
    const { uri } = req.body || {};
    if (!uri) return res.status(400).json({ error: 'Missing uri' });
  
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bloom_queue?uri=eq.${encodeURIComponent(uri)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: txt });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }