'use strict';
// Función de Vercel: atiende todas las rutas /api/* (ver rewrites en vercel.json).
const { handle, fail } = require('../lib/api.js');
const store = require('../lib/store-pg.js');

function send(res, r) {
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(r.body));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const query = url.searchParams;
  let path = url.pathname.replace(/\/+$/, '');
  // Tras el rewrite, la ruta original puede llegar en ?path=...
  if (path === '/api' || path === '/api/index') path = '/api/' + (query.get('path') || '');
  query.delete('path');

  let body = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = req.body;
      if (typeof body === 'string' || Buffer.isBuffer(body)) body = body.length ? JSON.parse(body.toString('utf8')) : {};
      if (!body || typeof body !== 'object') body = {};
    } catch (e) {
      return send(res, fail(Object.assign(new Error('Solicitud inválida.'), { code: 'json' })));
    }
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  send(res, await handle({ method: req.method, path: path, query: query, headers: req.headers, body: body, ip: ip }, store));
};
