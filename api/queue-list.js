const store = require('./session-store');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = ((req.query && req.query.session) || '').trim();
  const s = store.get(sessionId);
  if (s && s.queue && s.queue.length) {
    return res.status(200).json({ tracks: s.queue });
  }
  return res.status(200).json({ tracks: [] });
};
