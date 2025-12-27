const fs = require('fs');
const path = require('path');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function getRequestUrl(req) {
  // Vercel provides req.url as a path. URL() needs an absolute base.
  return new URL(req.url || '/', 'http://localhost');
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Basic guardrail
      if (data.length > 50_000) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', (e) => reject(e));
  });
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function cleanName(name) {
  const raw = String(name ?? '').trim();
  const safe = raw.replace(/\s+/g, ' ').slice(0, 16);
  return safe;
}

function getDbFilePath() {
  const explicit = process.env.LEADERBOARD_DB_PATH;
  if (explicit) return explicit;

  // Vercel serverless filesystem: only /tmp is writable.
  if (process.env.VERCEL) return '/tmp/leaderboard.json';

  // Local dev / Node server: keep it in-repo.
  return path.join(process.cwd(), 'data', 'leaderboard.json');
}

function ensureDirExists(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function readLeaderboardEntries(dbFilePath) {
  try {
    const txt = fs.readFileSync(dbFilePath, 'utf8');
    const json = JSON.parse(txt);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function writeLeaderboardEntries(dbFilePath, entries) {
  const dir = path.dirname(dbFilePath);
  ensureDirExists(dir);

  const tmpPath = `${dbFilePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmpPath, dbFilePath);
}

function normalizeEntry(input) {
  const name = cleanName(input?.name);
  const score = clampInt(input?.score, 0, 1_000_000, 0);
  const wave = clampInt(input?.wave, 1, 50, 1);
  const mode = input?.mode === 'hard' ? 'hard' : 'easy';
  return { name, score, wave, mode };
}

function compareEntries(a, b) {
  // score desc, wave desc, created_at asc
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  if ((b.wave ?? 0) !== (a.wave ?? 0)) return (b.wave ?? 0) - (a.wave ?? 0);

  const at = Date.parse(a.created_at ?? '') || 0;
  const bt = Date.parse(b.created_at ?? '') || 0;
  return at - bt;
}

module.exports = async (req, res) => {
  try {
    const dbFilePath = getDbFilePath();

    if (req.method === 'GET') {
      const url = getRequestUrl(req);
      const limit = clampInt(url.searchParams.get('limit'), 1, 25, 10);

      const entries = readLeaderboardEntries(dbFilePath);
      entries.sort(compareEntries);
      return sendJson(res, 200, { ok: true, data: entries.slice(0, limit) });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body) return sendError(res, 400, 'Missing JSON body');

      const entry = normalizeEntry(body);
      if (!entry.name) return sendError(res, 400, 'Name is required');

      const now = new Date().toISOString();
      const record = { ...entry, created_at: now };

      const entries = readLeaderboardEntries(dbFilePath);
      entries.push(record);

      // Prevent unbounded growth.
      entries.sort(compareEntries);
      const capped = entries.slice(0, 200);

      writeLeaderboardEntries(dbFilePath, capped);
      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method Not Allowed');
  } catch (e) {
    return sendError(res, 500, e?.message || 'Unknown error');
  }
};
