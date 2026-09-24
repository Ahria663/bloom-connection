const g = globalThis;
if (!g.__bloomSessions) g.__bloomSessions = new Map();
const sessions = g.__bloomSessions;

function ensure(id) {
  if (!id) return null;
  if (!sessions.has(id)) {
    sessions.set(id, {
      refreshToken: '',
      accessToken: '',
      accessTokenAt: 0,
      nowPlaying: null,
      nowPlayingAt: 0,
      queue: [],
      updatedAt: Date.now(),
    });
  }
  return sessions.get(id);
}

function get(id) {
  return id ? sessions.get(id) || null : null;
}

function put(id, patch) {
  const s = ensure(id);
  if (!s) return null;
  Object.assign(s, patch, { updatedAt: Date.now() });
  return s;
}

function addTrack(id, track) {
  const s = ensure(id);
  if (!s || !track || !track.uri) return s;
  if (s.queue.some(function (t) { return t.uri === track.uri; })) return s;
  s.queue.push(Object.assign({ addedAt: Date.now() }, track));
  s.updatedAt = Date.now();
  return s;
}

module.exports = { get, ensure, put, addTrack };
