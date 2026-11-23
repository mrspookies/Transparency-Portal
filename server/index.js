'use strict';

/* ==========================================================================
   TRANSPARENCY PORTAL — local backend
   --------------------------------------------------------------------------
   Same architecture as the Spookies Workshop Black Box:
     • serves the static Exit Plan page and its whitelisted assets
     • /api/     — public read, authenticated writes
     • /admin    — password-protected console
     • data/exit-plan.json — auto-exported public mirror (names + amounts redacted)
     • /media    — reserved for future uploads
   Runs on loopback only.

   Run:  npm install  →  npm start
   ========================================================================== */

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');

const {
  seedIfEmpty,
  getPlan,
  updatePlan,
  listComments,
  addComment,
  deleteComment,
} = require('./db');
const { redact } = require('./redact');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA_DIR = path.join(ROOT, 'data');
const MEDIA_DIR = path.join(ROOT, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

/* --------------------------------------------------------------------------
   Environment (.env parsed by hand — no dotenv dependency)
   -------------------------------------------------------------------------- */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i === -1) continue;
      out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
    }
  }
  return out;
}

const env = loadEnv();
const PORT = Number(env.PORT || process.env.PORT || 5001);
const ADMIN_PASSWORD =
  env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'changeme';

/* --------------------------------------------------------------------------
   Public mirror — keeps GitHub Pages in sync even when the API is offline.
   -------------------------------------------------------------------------- */
function buildPublicPlan() {
  const plan = getPlan();
  if (!plan) return null;
  return {
    id: plan.id,
    title: redact(plan.title),
    content: redact(plan.content),
    updatedAt: plan.updatedAt,
    updatedBy: 'Owner',
    comments: listComments().map((comment) => ({
      id: comment.id,
      content: redact(comment.content),
      author: 'Owner',
      createdAt: comment.createdAt,
    })),
  };
}

function exportPlan() {
  try {
    fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PUBLIC_DATA_DIR, 'exit-plan.json'),
      JSON.stringify(buildPublicPlan(), null, 2) + '\n'
    );
  } catch (err) {
    console.error('[transparency] static export failed:', err.message);
  }
}

/* --------------------------------------------------------------------------
   App + hardening
   -------------------------------------------------------------------------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

/* GET-only CORS so the static page can read the local feed when it is opened
   from another origin (GitHub Pages / Live Server). Mutations are same-origin
   and cookie-authenticated, so they are deliberately not exposed here. */
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; media-src 'self'; connect-src 'self' http://localhost:5001; " +
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
});

/* --------------------------------------------------------------------------
   Sessions — in-memory token store, HttpOnly cookie, 7-day TTL.
   -------------------------------------------------------------------------- */
const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const COOKIE = 'tp_session';

function getCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      }
    }
  }
  return out;
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function authRequired(req, res, next) {
  const token = getCookies(req)[COOKIE];
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  session.expires = Date.now() + SESSION_TTL;
  next();
}

/* --------------------------------------------------------------------------
   Auth
   -------------------------------------------------------------------------- */
const loginAttempts = new Map();

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, reset: now + 60_000 };
  if (attempt.reset < now) {
    attempt.count = 0;
    attempt.reset = now + 60_000;
  }
  if (attempt.count >= 10) {
    return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
  }

  const supplied = String(req.body && req.body.password ? req.body.password : '');
  const expected = Buffer.from(ADMIN_PASSWORD);
  const given = Buffer.from(supplied);
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (!ok) {
    attempt.count += 1;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: 'Access denied.' });
  }

  attempt.count = 0;
  loginAttempts.set(ip, attempt);

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + SESSION_TTL });
  setSessionCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = getCookies(req)[COOKIE];
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const token = getCookies(req)[COOKIE];
  const session = token && sessions.get(token);
  res.json({ authed: !!session && session.expires >= Date.now() });
});

/* --------------------------------------------------------------------------
   Exit Plan API
   -------------------------------------------------------------------------- */
function publicPayload() {
  const plan = getPlan();
  if (!plan) return null;
  return { ...plan, updatedBy: 'Owner', comments: listComments() };
}

app.get('/api/exit-plan', (req, res) => {
  const payload = publicPayload();
  if (!payload) return res.status(500).json({ error: 'Plan not initialized' });
  res.json(payload);
});

app.patch('/api/exit-plan', authRequired, (req, res) => {
  const body = req.body || {};
  const title = body.title === undefined ? undefined : String(body.title).trim();
  const content = body.content === undefined ? undefined : String(body.content);

  if (title !== undefined && (!title || title.length > 200)) {
    return res.status(400).json({ error: 'Title must be 1-200 characters.' });
  }
  if (content !== undefined && (!content.trim() || content.length > 200_000)) {
    return res.status(400).json({ error: 'Content must be 1-200,000 characters.' });
  }
  if (title === undefined && content === undefined) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const saved = updatePlan({ title, content });
  exportPlan();
  res.json({ ...saved, updatedBy: 'Owner', comments: listComments() });
});

app.post('/api/exit-plan/comments', authRequired, (req, res) => {
  const content = String((req.body && req.body.content) || '').trim();
  if (!content) return res.status(400).json({ error: 'Comment is required.' });
  if (content.length > 5_000) return res.status(400).json({ error: 'Comment is too long.' });

  const comment = addComment(content);
  exportPlan();
  res.status(201).json(comment);
});

app.delete('/api/comments/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid comment id.' });
  }
  if (!deleteComment(id)) return res.status(404).json({ error: 'Not found' });
  exportPlan();
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'transparency-portal', time: new Date().toISOString() });
});

/* --------------------------------------------------------------------------
   Static serving — whitelisted directories only.
   -------------------------------------------------------------------------- */
function normalizePath(p) {
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    /* malformed encoding — keep raw */
  }
  decoded = decoded.replace(/\\/g, '/');
  const out = [];
  for (const seg of decoded.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return '/' + out.join('/');
}

function isBlockedPath(p) {
  return (
    /^\/server(\/|$)/.test(p) ||
    /^\/backend(\/|$)/.test(p) ||
    /^\/\.git(\/|$)/.test(p) ||
    /^\/\.env/.test(p) ||
    /^\/node_modules(\/|$)/.test(p) ||
    /^\/package(-lock)?\.json$/.test(p) ||
    /\.(bat|vbs|ps1|db|log)$/i.test(p)
  );
}

app.use((req, res, next) => {
  if (isBlockedPath(normalizePath(req.path))) {
    return res.status(404).send('Not found');
  }
  next();
});

const PUBLIC_DIRS = ['css', 'js', 'data'];
for (const dir of PUBLIC_DIRS) {
  app.use(
    '/' + dir,
    express.static(path.join(ROOT, dir), {
      maxAge: dir === 'data' ? 0 : '1h',
      index: false,
    })
  );
}

app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d', index: false }));
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html' }));

app.get('/tp_icon.ico', (req, res) => {
  res.sendFile(path.join(ROOT, 'tp_icon.ico'));
});

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
  if (req.path.startsWith('/api')) {
    const status = err.type === 'entity.too.large' ? 413 : err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error.' });
  }
  res.status(err.status || 500).send('Server error');
});

/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */
seedIfEmpty();
exportPlan();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[transparency] serving on http://localhost:${PORT}/`);
  console.log(`[transparency] admin console: http://localhost:${PORT}/admin/`);
  console.log(
    ADMIN_PASSWORD === 'changeme' || ADMIN_PASSWORD === 'change-me-before-launch'
      ? '[transparency] WARNING: default ADMIN_PASSWORD — set one in server/.env'
      : '[transparency] auth armed'
  );
});
