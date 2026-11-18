'use strict';
/*
 * Carga datos de demostración en la base Postgres (la misma que usa Vercel).
 *   node --env-file=.env.local scripts/seed.js           agrega los datos demo
 *   node --env-file=.env.local scripts/seed.js --reset   borra los datos demo y los vuelve a crear
 * .env.local debe tener DATABASE_URL (cópiala de Vercel → Settings → Environment Variables).
 * Solo toca cuentas @demo.juntix.cl y sus partidos: no borra usuarios reales.
 * Contraseña de todas las cuentas demo: SEED_PASSWORD o la de abajo.
 */
const core = require('../core.js');
const { hashPassword } = require('../lib/api.js');
const store = require('../lib/store-pg.js');
const { DOMAIN, PEOPLE, email, addDemo } = require('./demo-data.js');

const PASSWORD = process.env.SEED_PASSWORD || 'juntix-demo-2026';
const RESET = process.argv.includes('--reset');

(async () => {
  const added = await store.write((s) => {
    s.sessions = s.sessions || {};
    const demoIds = new Set(s.users.filter((u) => u.email.endsWith(DOMAIN)).map((u) => u.id));
    if (demoIds.size && !RESET) return null;
    if (demoIds.size) demoIds.forEach((id) => core.deleteUser(s, id));
    return addDemo(s, hashPassword(PASSWORD), Date.now());
  });

  if (!added) console.log('Ya hay datos demo. Usa --reset para recrearlos.');
  else console.log('Listo: ' + added.users + ' usuarios y ' + added.matches + ' partidos de demostración.');
  console.log('Ejemplo de acceso: ' + email(PEOPLE[0][0]) + ' (contraseña en scripts/seed.js o SEED_PASSWORD)');
  process.exit(0);
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
