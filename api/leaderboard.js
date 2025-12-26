const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function supabaseRequest(path, init) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...init.headers,
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase error ${res.status}: ${txt || res.statusText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return sendError(res, 503, 'Leaderboard backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    if (req.method === 'GET') {
      const url = getRequestUrl(req);
      const limit = clampInt(url.searchParams.get('limit'), 1, 25, 10);

      const data = await supabaseRequest(
        `/rest/v1/leaderboard?select=name,score,wave,mode,created_at&order=score.desc,wave.desc,created_at.asc&limit=${encodeURIComponent(String(limit))}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );

      return sendJson(res, 200, { ok: true, data: Array.isArray(data) ? data : [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body) return sendError(res, 400, 'Missing JSON body');

      const name = cleanName(body.name);
      const score = clampInt(body.score, 0, 1_000_000, 0);
      const wave = clampInt(body.wave, 1, 50, 1);
      const mode = body.mode === 'hard' ? 'hard' : 'easy';

      if (!name) return sendError(res, 400, 'Name is required');

      await supabaseRequest('/rest/v1/leaderboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify([{ name, score, wave, mode }]),
      });

      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method Not Allowed');
  } catch (e) {
    return sendError(res, 500, e?.message || 'Unknown error');
  }
};
