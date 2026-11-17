'use strict';
/*
 * Servidor de Juntix (API + archivos estáticos). Sin dependencias: solo Node 18 o superior.
 * Uso:  node server/server.js      (variables: PORT, HOST, DATA_DIR, TRUST_PROXY=1)
 * Los datos se guardan en DATA_DIR/juntix.json. Cada petición modifica el estado de forma
 * síncrona, así dos solicitudes simultáneas nunca superan el cupo de un partido.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('../core.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'juntix.json');
const PUBLIC_DIR = path.join(__dirname, '..');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SESSION_MS = 30 * 24 * 3600 * 1000;

/* ---------- estado ---------- */
let state;
try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { state = core.emptyState(); }
state.sessions = state.sessions || {};

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DATA_FILE);
}

/* ---------- contraseñas y sesiones ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const a = Buffer.from(crypto.scryptSync(pw, parts[0], 64).toString('hex'));
  const b = Buffer.from(parts[1]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  state.sessions[sha(token)] = { userId: userId, exp: Date.now() + SESSION_MS };
  return token;
}
function tokenOf(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function authUser(req) {
  const t = tokenOf(req);
  if (!t) return null;
  const s = state.sessions[sha(t)];
  if (!s || s.exp < Date.now()) return null;
  return state.users.find((u) => u.id === s.userId) || null;
}

/* ---------- límite de intentos ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { hits.clear(); }, 3600 * 1000).unref();

/* ---------- respuestas ---------- */
const STATUS = { auth: 401, credentials: 401, forbidden: 403, organizer: 403, not_found: 404, full: 409, has_spots: 409, over: 409, email_taken: 409, rate: 429 };
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}
function fail(res, e) {
  if (e && e.code) return send(res, STATUS[e.code] || 400, { ok: false, code: e.code, message: e.message, field: e.field });
  console.error(e);
  return send(res, 500, { ok: false, code: 'server', message: 'Error del servidor. Inténtalo de nuevo en un momento.' });
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 20000) { reject(core.err('too_big', 'La solicitud es demasiado grande.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(core.err('json', 'Solicitud inválida.')); }
    });
    req.on('error', reject);
  });
}
function ipOf(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'ip';
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname;
  const route = req.method + ' ' + p;
  try {
    if (route === 'GET /api/health') return send(res, 200, { ok: true, app: 'juntix' });

    if (route === 'POST /api/register') {
      if (limited('reg:' + ipOf(req), 10, 3600 * 1000)) throw core.err('rate', 'Demasiados intentos. Espera unos minutos.');
      const b = await readJson(req);
      const pe = core.validatePassword(b.password); if (pe) throw pe;
      const user = core.registerUser(state, { name: b.name, email: b.email, comuna: b.comuna, adult: b.adult === true, consent: b.consent === true, passHash: hashPassword(b.password) });
      const token = newSession(user.id); save();
      return send(res, 201, { ok: true, token: token, user: core.publicUser(user) });
    }
    if (route === 'POST /api/login') {
      const b = await readJson(req);
      if (limited('login:' + ipOf(req) + ':' + String(b.email || '').toLowerCase(), 8, 5 * 60 * 1000)) throw core.err('rate', 'Demasiados intentos. Espera unos minutos.');
      const u = core.findUserByEmail(state, b.email);
      if (!u || typeof b.password !== 'string' || !verifyPassword(b.password, u.passHash)) throw core.err('credentials', 'Correo o contraseña incorrectos.');
      const token = newSession(u.id); save();
      return send(res, 200, { ok: true, token: token, user: core.publicUser(u) });
    }

    const user = authUser(req);
    if (!user) throw core.err('auth', 'Ingresa para continuar.');

    if (route === 'POST /api/logout') { const t = tokenOf(req); delete state.sessions[sha(t)]; save(); return send(res, 200, { ok: true }); }
    if (route === 'GET /api/me') return send(res, 200, { ok: true, user: core.publicUser(user) });
    if (route === 'DELETE /api/me') {
      core.deleteUser(state, user.id);
      Object.keys(state.sessions).forEach((k) => { if (state.sessions[k].userId === user.id) delete state.sessions[k]; });
      save(); return send(res, 200, { ok: true });
    }
    if (route === 'GET /api/matches') {
      const f = url.searchParams.get('filter') || 'todos';
      return send(res, 200, { ok: true, matches: core.list(state, user.id, Date.now(), f) });
    }
    if (route === 'GET /api/my-matches') return send(res, 200, { ok: true, matches: core.mine(state, user.id, Date.now()) });
    if (route === 'POST /api/matches') {
      const b = await readJson(req);
      const m = core.createMatch(state, user.id, b, Date.now()); save();
      return send(res, 201, { ok: true, match: core.view(state, m.id, user.id) });
    }

    const m = /^\/api\/matches\/([a-z0-9]+)(?:\/(join|waitlist|leave|seen))?$/.exec(p);
    if (m) {
      const id = m[1], action = m[2];
      if (req.method === 'GET' && !action) return send(res, 200, { ok: true, match: core.view(state, id, user.id) });
      if (req.method === 'POST' && action) {
        let extra = {};
        if (action === 'join') core.join(state, user.id, id, Date.now());
        else if (action === 'waitlist') core.joinWaitlist(state, user.id, id, Date.now());
        else if (action === 'leave') extra = { released: core.leave(state, user.id, id, Date.now()).removed };
        else core.markSeen(state, user.id, id);
        save();
        return send(res, 200, Object.assign({ ok: true, match: core.view(state, id, user.id) }, extra));
      }
      if (req.method === 'DELETE' && !action) { core.cancelMatch(state, user.id, id); save(); return send(res, 200, { ok: true }); }
    }
    return send(res, 404, { ok: false, code: 'not_found', message: 'No encontrado.' });
  } catch (e) { return fail(res, e); }
}

/* ---------- archivos estáticos (lista cerrada) ---------- */
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8', 'no-cache'],
  '/core.js': ['core.js', 'text/javascript; charset=utf-8', 'no-cache'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8', 'no-cache'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json', 'no-cache'],
  '/icon.svg': ['icon.svg', 'image/svg+xml', 'public, max-age=86400'],
  '/icon-192.png': ['icon-192.png', 'image/png', 'public, max-age=86400'],
  '/icon-512.png': ['icon-512.png', 'image/png', 'public, max-age=86400']
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function serveStatic(req, res, p) {
  const f = FILES[p];
  if (!f || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
  fs.readFile(path.join(PUBLIC_DIR, f[0]), (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, {
      'Content-Type': f[1], 'Cache-Control': f[2], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY', 'Content-Security-Policy': CSP
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  return serveStatic(req, res, url.pathname);
});
server.listen(PORT, HOST, () => console.log('Juntix escuchando en http://' + HOST + ':' + PORT));
process.on('SIGTERM', () => { try { save(); } catch (e) { /* nada */ } process.exit(0); });
