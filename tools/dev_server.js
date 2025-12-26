const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5173);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const cleaned = decoded.replace(/\0/g, '');
  const rel = cleaned.replace(/^\/+/, '');

  // Serve /assets/* from repo root
  if (rel.startsWith('assets/')) {
    const fromRootAssets = path.join(ROOT, rel);
    const resolvedAssets = path.resolve(fromRootAssets);
    if (!resolvedAssets.startsWith(ROOT)) return null;
    return resolvedAssets;
  }

  // Serve everything else from /public (html/css/js)
  const fromPublic = path.join(PUBLIC_ROOT, rel);
  const resolvedPublic = path.resolve(fromPublic);
  if (!resolvedPublic.startsWith(PUBLIC_ROOT)) return null;
  return resolvedPublic;
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, 'Bad Request');

  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = safeResolve(urlPath);
  if (!filePath) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) return send(res, 500, 'Internal Server Error');
      send(res, 200, data, { 'Content-Type': contentType });
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server running at http://127.0.0.1:${PORT}/`);
});
