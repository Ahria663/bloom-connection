const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DEFAULT = 'bloom-playlist.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function safeResolve(rel) {
  const joined = path.normalize(path.join(ROOT, rel));
  if (!joined.startsWith(ROOT)) return null;
  return joined;
}

function getLanIPv4() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (
      lower.includes('docker') ||
      lower.includes('veth') ||
      lower.includes('virtualbox') ||
      lower.includes('vmnet') ||
      lower === 'lo' ||
      lower === 'lo0'
    ) {
      continue;
    }
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4 || String(net.family) === 'IPv4';
      if (v4 && !net.internal) {
        list.push({ name, address: net.address });
      }
    }
  }
  const rank = (name) => {
    const n = name.toLowerCase();
    if (n.startsWith('en') || n.includes('wi-fi') || n.includes('wifi') || n.includes('ethernet')) return 0;
    if (n.startsWith('wl')) return 1;
    return 5;
  };
  list.sort((a, b) => rank(a.name) - rank(b.name) || a.address.localeCompare(b.address));
  const pick =
    list.find((x) => !x.address.startsWith('169.254.')) || list[0];
  return pick ? pick.address : null;
}

/**
 * Under Vercel, rewrites send the browser path to /api, so req.url pathname is /api.
 * vercel.json passes the real path as __bloom_path (see rewrite destination).
 */
function resolvePathname(req) {
  const host = req.headers.host || 'localhost';
  const parsed = new URL(req.url || '/', `http://${host}`);
  const bridged = parsed.searchParams.get('__bloom_path');
  if (bridged === null) return { ok: true, pathname: parsed.pathname };
  let s = bridged.trim();
  if (s === '') return { ok: true, pathname: '/' };
  if (!s.startsWith('/')) s = `/${s}`;
  try {
    s = decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return { ok: false };
  }
  if (s.includes('\0') || s.includes('..')) return { ok: false };
  return { ok: true, pathname: path.posix.normalize(s) };
}

/** Prefer OS LAN IP; if missing, use Host when the client already opened the site via a non-localhost address. */
function computeLanOrigin(req) {
  const ip = getLanIPv4();
  if (ip) return `http://${ip}:${PORT}`;
  const h = req.headers.host;
  if (!h) return null;
  const hostname = h.split(':')[0];
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(hostname)) return null;
  if (/^\[/.test(hostname)) return null;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const scheme = proto === 'https' ? 'https' : 'http';
  return `${scheme}://${h}`;
}

const server = http.createServer((req, res) => {
  try {
    const resolved = resolvePathname(req);
    if (!resolved.ok) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const { pathname } = resolved;

    if (pathname === '/__bloom/lan.json') {
      const origin = computeLanOrigin(req);
      const body = JSON.stringify({ origin });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }

    const rel = pathname === '/' ? DEFAULT : pathname.replace(/^\//, '');
    const filePath = safeResolve(rel);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const ct = MIME[ext] || 'application/octet-stream';
      if (ext === '.html' && path.basename(filePath) === DEFAULT) {
        const lanOrigin = computeLanOrigin(req);
        const inject = `<script>window.__BLOOM_LAN_ORIGIN__=${JSON.stringify(lanOrigin)};</script>`;
        const str = data.toString('utf8');
        const out = str.includes('</head>')
          ? str.replace('</head>', `${inject}</head>`)
          : `${inject}${str}`;
        res.writeHead(200, { 'Content-Type': ct });
        res.end(Buffer.from(out, 'utf8'));
        return;
      }
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    });
  } catch {
    res.writeHead(500);
    res.end('Error');
  }
});

if (!process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    const local = `http://127.0.0.1:${PORT}`;
    const lanIp = getLanIPv4();
    const lan = lanIp ? `http://${lanIp}:${PORT}` : null;
    console.log('');
    console.log(`  Bloom → ${local}/  (same as /${DEFAULT})`);
    if (lan) console.log(`  On your network → ${lan}/  (phones / QR use this)`);
    console.log('');
    console.log('  Spotify Dashboard → Redirect URIs (exact match for each URL you use):');
    console.log(`    ${local}/`);
    console.log(`    ${local}/${DEFAULT}`);
    if (lan) {
      console.log(`    ${lan}/`);
      console.log(`    ${lan}/${DEFAULT}`);
    }
    console.log('');
  });
}

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;


