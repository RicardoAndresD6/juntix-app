'use strict';
/*
 * Genera un SQL para cargar los datos demo pegándolo en el editor "Query" de Neon/Vercel,
 * sin necesitar la DATABASE_URL en el computador.
 *   node scripts/seed-sql.js > seed.sql
 * Agrega los datos al estado existente (no borra nada) y no hace nada si ya hay cuentas demo.
 */
const core = require('../core.js');
const { hashPassword } = require('../lib/api.js');
const { DOMAIN, email, PEOPLE, addDemo } = require('./demo-data.js');

const PASSWORD = process.env.SEED_PASSWORD || 'juntix-demo-2026';
const s = core.emptyState();
s.seq = 1000000; // por sobre cualquier seq existente: el orden de llegada se mantiene
addDemo(s, hashPassword(PASSWORD), Date.now());

const demo = JSON.stringify({ seq: s.seq, users: s.users, matches: s.matches, regs: s.regs, notes: s.notes }).replace(/'/g, "''");
const first = email(PEOPLE[0][0]);
process.stdout.write(`-- Datos demo de Juntix (${s.users.length} usuarios, ${s.matches.length} partidos). Cuentas *${DOMAIN}
CREATE TABLE IF NOT EXISTS juntix_state (id int PRIMARY KEY, data jsonb NOT NULL);
INSERT INTO juntix_state (id, data) VALUES (1, '{"seq":0,"users":[],"matches":[],"regs":[],"notes":[]}') ON CONFLICT (id) DO NOTHING;
WITH d AS (SELECT '${demo}'::jsonb AS j)
UPDATE juntix_state SET data = data
  || jsonb_build_object('seq', GREATEST((data->>'seq')::bigint, (SELECT (j->>'seq')::bigint FROM d)))
  || jsonb_build_object('users',   COALESCE(data->'users',   '[]') || (SELECT j->'users'   FROM d))
  || jsonb_build_object('matches', COALESCE(data->'matches', '[]') || (SELECT j->'matches' FROM d))
  || jsonb_build_object('regs',    COALESCE(data->'regs',    '[]') || (SELECT j->'regs'    FROM d))
  || jsonb_build_object('notes',   COALESCE(data->'notes',   '[]') || (SELECT j->'notes'   FROM d))
WHERE id = 1 AND NOT (COALESCE(data->'users', '[]') @> '[{"email":"${first}"}]');
SELECT jsonb_array_length(data->'users') AS usuarios, jsonb_array_length(data->'matches') AS partidos FROM juntix_state WHERE id = 1;
`);
