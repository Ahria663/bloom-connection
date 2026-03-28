const path = require('path');
const fs = require('fs');

// In Vercel, __dirname is the api/ folder, so root is one level up
const ROOT = path.join(__dirname, '..');

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

const DEFAULT = 'bloom-playlist.html';

module.exports = function(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const bloomPath = url.searchParams.get('__bloom_path') || '';
    
    // Determine which file to serve
    let rel = bloomPath.trim();
    if (!rel || rel === '/') rel = DEFAULT;
    rel = rel.replace(/^\//, '');
    
    // Security: no path traversal
    if (rel.includes('..') || rel.includes('\0')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const filePath = path.join(ROOT, rel);
    
    // Make sure it's within ROOT
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, function(err, data) {
      if (err) {
        console.error('File not found:', filePath, err.message);
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const ct = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    });
  } catch(e) {
    console.error('Index error:', e.message);
    res.writeHead(500);
    res.end('Error');
  }
};