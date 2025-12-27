const http = require('http');
const path = require('path');

const leaderboardHandler = require('../api/leaderboard');

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'leaderboard.json');

  const server = http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/api/leaderboard')) {
      process.env.LEADERBOARD_DB_PATH = dbPath;
      return leaderboardHandler(req, res);
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : null;
  if (!port) throw new Error('Failed to bind test server');

  const base = `http://127.0.0.1:${port}`;

  // eslint-disable-next-line no-console
  console.log('Smoke server:', base);

  const fetchWithTimeout = async (url, init = {}, timeoutMs = 4000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(t);
    }
  };

  const get = async () => {
    const r = await fetchWithTimeout(`${base}/api/leaderboard?limit=3`);
    return { status: r.status, text: await r.text() };
  };

  // eslint-disable-next-line no-console
  console.log('GET before...');
  const before = await get();

  // eslint-disable-next-line no-console
  console.log('POST...');
  const postRes = await fetchWithTimeout(`${base}/api/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'SmokeTest', score: 123, wave: 4, mode: 'easy' }),
  });
  const postText = await postRes.text();

  // eslint-disable-next-line no-console
  console.log('GET after...');
  const after = await get();

  await new Promise((resolve) => server.close(resolve));

  // eslint-disable-next-line no-console
  console.log('GET before:', before.status, before.text);
  // eslint-disable-next-line no-console
  console.log('POST:', postRes.status, postText);
  // eslint-disable-next-line no-console
  console.log('GET after:', after.status, after.text);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
