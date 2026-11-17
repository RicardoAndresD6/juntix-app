'use strict';
/*
 * Servidor local de Juntix (API + archivos estáticos). Sin dependencias: solo Node 18 o superior.
 * Uso:  node server/server.js      (variables: PORT, HOST, DATA_DIR, TRUST_PROXY=1)
 * Los datos se guardan en DATA_DIR/juntix.json. En Vercel se usa api/index.js con Postgres.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle, fail } = require('../lib/api.js');
const fileStore = require('../lib/store-file.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const store = fileStore(DATA_DIR);

function send(res, r) {
  res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(r.body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const err = (code, msg) => Object.assign(new Error(msg), { code: code });
    req.on('data', (c) => { size += c.length; if (size > 20000) { reject(err('too_big', 'La solicitud es demasiado grande.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(err('json', 'Solicitud inválida.')); }
    });
    req.on('error', reject);
  });
}
function ipOf(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'ip';
}
async function api(req, res, url) {
  let body = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { body = await readJson(req); } catch (e) { return send(res, fail(e)); }
  }
  send(res, await handle({ method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body: body, ip: ipOf(req) }, store));
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
process.on('SIGTERM', () => { try { store.save(); } catch (e) { /* nada */ } process.exit(0); });
