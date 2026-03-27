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

/** Prefer OS LAN IP; if missing, use Host when the client already opened the site via a non-localhost address. */
function computeLanOrigin(req) {
  const ip = getLanIPv4();
  if (ip) return `http://${ip}:${PORT}`;
  const h = req.headers.host;
  if (!h) return null;
  const hostname = h.split(':')[0];
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(hostname)) return null;
  if (/^\[/.test(hostname)) return null;
  return `http://${h}`;
}

const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

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
