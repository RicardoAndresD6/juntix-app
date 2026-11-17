'use strict';
/*
 * Almacenamiento en Postgres (Vercel). El estado completo vive en una fila JSONB;
 * cada escritura la bloquea con SELECT ... FOR UPDATE dentro de una transacción,
 * así dos solicitudes simultáneas en instancias distintas nunca superan el cupo (D1).
 * Suficiente para el piloto; para escalar, se pasa a tablas normalizadas sin tocar core.js.
 */
const { Pool } = require('pg');
const core = require('../core.js');

const URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let pool = null;
let init = null;

function getPool() {
  if (!URL) throw new Error('Falta la variable DATABASE_URL (conecta una base Postgres al proyecto en Vercel).');
  if (!pool) pool = new Pool({ connectionString: URL, max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 8000 });
  return pool;
}

async function setup() {
  const p = getPool();
  const sql = [
    'CREATE TABLE IF NOT EXISTS juntix_state (id int PRIMARY KEY, data jsonb NOT NULL)',
    'CREATE TABLE IF NOT EXISTS juntix_hits (key text NOT NULL, t bigint NOT NULL)',
    'CREATE INDEX IF NOT EXISTS juntix_hits_key_t ON juntix_hits (key, t)'
  ];
  for (const q of sql) {
    // Dos instancias creando la tabla a la vez pueden chocar: se reintenta una vez.
    try { await p.query(q); } catch (e) { await p.query(q); }
  }
  await p.query('INSERT INTO juntix_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(core.emptyState())]);
}
function ready() {
  if (!init) init = setup().catch((e) => { init = null; throw e; });
  return init;
}

async function read() {
  await ready();
  const r = await getPool().query('SELECT data FROM juntix_state WHERE id = 1');
  return r.rows[0].data;
}

async function write(fn) {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT data FROM juntix_state WHERE id = 1 FOR UPDATE');
    const state = r.rows[0].data;
    let result;
    try { result = fn(state); } catch (e) { await client.query('ROLLBACK'); throw e; }
    await client.query('UPDATE juntix_state SET data = $1 WHERE id = 1', [JSON.stringify(state)]);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) { /* ya cerrada */ }
    throw e;
  } finally {
    client.release();
  }
}

async function limited(key, max, windowMs) {
  await ready();
  const now = Date.now();
  const p = getPool();
  await p.query('DELETE FROM juntix_hits WHERE t < $1', [now - 3600 * 1000]);
  await p.query('INSERT INTO juntix_hits (key, t) VALUES ($1, $2)', [key, now]);
  const r = await p.query('SELECT count(*)::int AS n FROM juntix_hits WHERE key = $1 AND t >= $2', [key, now - windowMs]);
  return r.rows[0].n > max;
}

module.exports = { ready: ready, read: read, write: write, limited: limited };
