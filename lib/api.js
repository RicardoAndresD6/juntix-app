'use strict';
/*
 * API de Juntix, independiente del servidor y del almacenamiento.
 * La usan server/server.js (archivo JSON local) y api/index.js (Vercel + Postgres).
 *
 * store = {
 *   ready():  comprueba que el almacenamiento responde
 *   read():   devuelve el estado (solo lectura)
 *   write(fn): ejecuta fn(state) con el estado bloqueado y lo guarda si fn no lanza error.
 *              fn es síncrona: así dos solicitudes simultáneas nunca superan el cupo (D1).
 *   limited(key, max, windowMs): registra un intento y dice si se superó el límite
 * }
 */
const crypto = require('crypto');
const core = require('../core.js');

const SESSION_MS = 30 * 24 * 3600 * 1000;

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
function newSession(state, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  state.sessions[sha(token)] = { userId: userId, exp: Date.now() + SESSION_MS };
  return token;
}
function tokenOf(headers) {
  const h = headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function authUser(state, headers) {
  const t = tokenOf(headers);
  if (!t) return null;
  const s = state.sessions[sha(t)];
  if (!s || s.exp < Date.now()) return null;
  return state.users.find((u) => u.id === s.userId) || null;
}
function normalize(state) {
  state.sessions = state.sessions || {};
  return state;
}
function pruneSessions(state) {
  const now = Date.now();
  Object.keys(state.sessions).forEach((k) => { if (state.sessions[k].exp < now) delete state.sessions[k]; });
}

/* ---------- respuestas ---------- */
const STATUS = { auth: 401, credentials: 401, forbidden: 403, organizer: 403, not_found: 404, full: 409, has_spots: 409, over: 409, email_taken: 409, rate: 429, too_big: 413 };
const out = (status, body) => ({ status: status, body: body });
function fail(e) {
  if (e && e.code && !e.severity) return out(STATUS[e.code] || 400, { ok: false, code: e.code, message: e.message, field: e.field });
  console.error(e);
  return out(500, { ok: false, code: 'server', message: 'Error del servidor. Inténtalo de nuevo en un momento.' });
}
const authErr = () => core.err('auth', 'Ingresa para continuar.');
const notFound = () => out(404, { ok: false, code: 'not_found', message: 'No encontrado.' });
const MATCH_RE = /^\/api\/matches\/([a-z0-9]+)(?:\/(join|waitlist|leave|seen))?$/;

/* ---------- rutas ---------- */
// req = { method, path, query: URLSearchParams, headers (en minúsculas), body (objeto), ip }
async function handle(req, store) {
  const route = req.method + ' ' + req.path;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (route === 'GET /api/health') { await store.ready(); return out(200, { ok: true, app: 'juntix' }); }

    if (route === 'POST /api/register') {
      if (await store.limited('reg:' + req.ip, 10, 3600 * 1000)) throw core.err('rate', 'Demasiados intentos. Espera unos minutos.');
      const pe = core.validatePassword(b.password); if (pe) throw pe;
      const passHash = hashPassword(b.password);
      return await store.write((state) => {
        normalize(state); pruneSessions(state);
        const user = core.registerUser(state, { name: b.name, email: b.email, comuna: b.comuna, adult: b.adult === true, consent: b.consent === true, passHash: passHash });
        return out(201, { ok: true, token: newSession(state, user.id), user: core.publicUser(user) });
      });
    }
    if (route === 'POST /api/login') {
      if (await store.limited('login:' + req.ip + ':' + String(b.email || '').toLowerCase(), 8, 5 * 60 * 1000)) throw core.err('rate', 'Demasiados intentos. Espera unos minutos.');
      const pre = normalize(await store.read());
      const found = core.findUserByEmail(pre, b.email);
      if (!found || typeof b.password !== 'string' || !verifyPassword(b.password, found.passHash)) throw core.err('credentials', 'Correo o contraseña incorrectos.');
      return await store.write((state) => {
        normalize(state); pruneSessions(state);
        const u = state.users.find((x) => x.id === found.id);
        if (!u) throw core.err('credentials', 'Correo o contraseña incorrectos.');
        return out(200, { ok: true, token: newSession(state, u.id), user: core.publicUser(u) });
      });
    }

    if (req.method === 'GET') {
      const state = normalize(await store.read());
      const user = authUser(state, req.headers);
      if (!user) throw authErr();
      if (req.path === '/api/me') return out(200, { ok: true, user: core.publicUser(user) });
      if (req.path === '/api/matches') return out(200, { ok: true, matches: core.list(state, user.id, Date.now(), req.query.get('filter') || 'todos') });
      if (req.path === '/api/my-matches') return out(200, { ok: true, matches: core.mine(state, user.id, Date.now()) });
      const m = MATCH_RE.exec(req.path);
      if (m && !m[2]) return out(200, { ok: true, match: core.view(state, m[1], user.id) });
      return notFound();
    }

    return await store.write((state) => {
      normalize(state); pruneSessions(state);
      const user = authUser(state, req.headers);
      if (!user) throw authErr();
      if (route === 'POST /api/logout') { delete state.sessions[sha(tokenOf(req.headers))]; return out(200, { ok: true }); }
      if (route === 'DELETE /api/me') {
        core.deleteUser(state, user.id);
        Object.keys(state.sessions).forEach((k) => { if (state.sessions[k].userId === user.id) delete state.sessions[k]; });
        return out(200, { ok: true });
      }
      if (route === 'POST /api/matches') {
        const mt = core.createMatch(state, user.id, b, Date.now());
        return out(201, { ok: true, match: core.view(state, mt.id, user.id) });
      }
      const m = MATCH_RE.exec(req.path);
      if (m) {
        const id = m[1], action = m[2];
        if (req.method === 'POST' && action) {
          let extra = {};
          if (action === 'join') core.join(state, user.id, id, Date.now());
          else if (action === 'waitlist') core.joinWaitlist(state, user.id, id, Date.now());
          else if (action === 'leave') extra = { released: core.leave(state, user.id, id, Date.now()).removed };
          else core.markSeen(state, user.id, id);
          return out(200, Object.assign({ ok: true, match: core.view(state, id, user.id) }, extra));
        }
        if (req.method === 'DELETE' && !action) { core.cancelMatch(state, user.id, id); return out(200, { ok: true }); }
      }
      throw core.err('not_found', 'No encontrado.');
    });
  } catch (e) { return fail(e); }
}

module.exports = { handle: handle, fail: fail };
