'use strict';
// Casos de prueba automáticos de las reglas de negocio. Ejecutar: node --test server/test-core.js
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

const NOW = Date.parse('2026-11-17T22:00:00Z'); // 17 nov 2026, 19:00 en Chile
const base = { passHash: 'x', comuna: 'Santiago', adult: true, consent: true };
function setup() {
  const s = core.emptyState();
  const mk = (n) => core.registerUser(s, Object.assign({ name: 'Usuario ' + n, email: 'u' + n + '@correo.cl' }, base), NOW);
  return { s, mk };
}
function newMatch(s, org, cap) {
  return core.createMatch(s, org.id, { title: 'Pichanga del jueves', place: 'Cancha Plaza Brasil', comuna: 'Santiago', date: '2026-11-19', time: '20:00', capacity: cap }, NOW);
}

// F1. Registro e inicio de sesión
test('F1.1 registra una cuenta válida', () => {
  const { mk } = setup(); assert.equal(mk(1).email, 'u1@correo.cl');
});
test('F1.2 rechaza correo repetido', () => {
  const { s, mk } = setup(); mk(1);
  assert.throws(() => core.registerUser(s, Object.assign({ name: 'Otra Persona', email: 'U1@correo.cl' }, base), NOW), { code: 'email_taken' });
});
test('F1.3 rechaza correo inválido', () => {
  const { s } = setup();
  assert.throws(() => core.registerUser(s, Object.assign({ name: 'Ana Soto', email: 'ana@' }, base), NOW), { code: 'email' });
});
test('F1.4 exige ser mayor de 18 años', () => {
  const { s } = setup();
  assert.throws(() => core.registerUser(s, Object.assign({}, base, { name: 'Ana Soto', email: 'a@b.cl', adult: false }), NOW), { code: 'adult' });
});
test('F1.5 exige consentimiento de datos', () => {
  const { s } = setup();
  assert.throws(() => core.registerUser(s, Object.assign({}, base, { name: 'Ana Soto', email: 'a@b.cl', consent: false }), NOW), { code: 'consent' });
});
test('F1.6 contraseña de menos de 8 caracteres es inválida', () => {
  assert.equal(core.validatePassword('1234567').code, 'password');
  assert.equal(core.validatePassword('12345678'), null);
});
test('F1.7 guarda la fecha del consentimiento', () => {
  const { mk } = setup(); assert.ok(mk(1).consentAt);
});

// F2. Crear partido
test('F2.1 crea un partido y cuenta al organizador', () => {
  const { s, mk } = setup(); const o = mk(1); const m = newMatch(s, o, 10);
  const v = core.view(s, m.id, o.id);
  assert.equal(v.inCount, 1); assert.equal(v.free, 9); assert.equal(v.players[0].role, 'Organizador');
});
test('F2.2 rechaza fecha pasada', () => {
  const { s, mk } = setup(); const o = mk(1);
  assert.throws(() => core.createMatch(s, o.id, { title: 'Partido', place: 'Cancha', comuna: 'Santiago', date: '2026-11-17', time: '18:00', capacity: 10 }, NOW), { code: 'date' });
});
test('F2.3 rechaza cupos fuera de rango', () => {
  const { s, mk } = setup(); const o = mk(1);
  for (const c of [1, 31, 'x', 5.5]) assert.throws(() => newMatch(s, o, c), { code: 'capacity' });
});
test('F2.4 rechaza título y lugar vacíos', () => {
  const { s, mk } = setup(); const o = mk(1);
  assert.throws(() => core.createMatch(s, o.id, { title: '', place: 'Cancha', comuna: 'Santiago', date: '2026-11-19', time: '20:00', capacity: 10 }, NOW), { code: 'title' });
  assert.throws(() => core.createMatch(s, o.id, { title: 'Partido', place: '', comuna: 'Santiago', date: '2026-11-19', time: '20:00', capacity: 10 }, NOW), { code: 'place' });
});
test('F2.5 asigna la etiqueta según los cupos', () => {
  assert.equal(core.formatLabel(10), 'Fútbol 5'); assert.equal(core.formatLabel(12), 'Fútbol 7'); assert.equal(core.formatLabel(22), 'Fútbol 11');
});

// F3. Inscripción
test('F3.1 inscribe a un jugador', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 10);
  core.join(s, a.id, m.id, NOW); const v = core.view(s, m.id, a.id);
  assert.equal(v.inCount, 2); assert.equal(v.me.status, 'in');
});
test('F3.2 D1: el doble clic no inscribe dos veces ni supera el cupo', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 2);
  const r1 = core.join(s, a.id, m.id, NOW), r2 = core.join(s, a.id, m.id, NOW);
  assert.equal(r1.already, false); assert.equal(r2.already, true);
  assert.equal(core.view(s, m.id, a.id).inCount, 2);
});
test('F3.3 rechaza la inscripción cuando el partido está lleno', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW);
  assert.throws(() => core.join(s, b.id, m.id, NOW), { code: 'full' });
  assert.equal(core.view(s, m.id, b.id).inCount, 2);
});
test('F3.4 D1: 30 intentos seguidos nunca superan el cupo', () => {
  const { s, mk } = setup(); const o = mk(1); const m = newMatch(s, o, 5);
  const users = Array.from({ length: 10 }, (_, i) => mk(i + 2));
  for (let k = 0; k < 3; k++) users.forEach((u) => { try { core.join(s, u.id, m.id, NOW); } catch (e) { /* lleno */ } });
  assert.equal(core.view(s, m.id, o.id).inCount, 5);
});
test('F3.5 rechaza inscribirse a un partido ya jugado', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 10);
  assert.throws(() => core.join(s, a.id, m.id, Date.parse('2026-11-21T12:00:00Z')), { code: 'over' });
});
test('F3.6 el jugador puede bajarse y el cupo se libera', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 10);
  core.join(s, a.id, m.id, NOW); core.leave(s, a.id, m.id, NOW);
  assert.equal(core.view(s, m.id, a.id).inCount, 1); assert.equal(core.view(s, m.id, a.id).me.status, null);
});
test('F3.7 el organizador no puede bajarse', () => {
  const { s, mk } = setup(); const o = mk(1); const m = newMatch(s, o, 10);
  assert.throws(() => core.leave(s, o.id, m.id, NOW), { code: 'organizer' });
});

// F4. Lista de espera automática
test('F4.1 solo se puede anotar en la lista si el partido está lleno', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 3);
  assert.throws(() => core.joinWaitlist(s, a.id, m.id, NOW), { code: 'has_spots' });
});
test('F4.2 la lista asigna posiciones por orden de llegada', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3), c = mk(4); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW); core.joinWaitlist(s, b.id, m.id, NOW); core.joinWaitlist(s, c.id, m.id, NOW);
  assert.equal(core.view(s, m.id, b.id).me.pos, 1); assert.equal(core.view(s, m.id, c.id).me.pos, 2);
  assert.equal(core.view(s, m.id, o.id).waitCount, 2);
});
test('F4.3 D2: al liberarse un cupo entra automáticamente la primera persona en espera', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW); core.joinWaitlist(s, b.id, m.id, NOW);
  const r = core.leave(s, a.id, m.id, NOW);
  assert.equal(r.promotedUserId, b.id); assert.equal(core.view(s, m.id, b.id).me.status, 'in');
  assert.equal(core.view(s, m.id, b.id).inCount, 2);
});
test('F4.4 D3: se respeta el orden de llegada aunque alguien salga de la lista', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), w1 = mk(3), w2 = mk(4), w3 = mk(5); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW);
  core.joinWaitlist(s, w1.id, m.id, NOW); core.joinWaitlist(s, w2.id, m.id, NOW); core.joinWaitlist(s, w3.id, m.id, NOW);
  core.leave(s, w1.id, m.id, NOW);                       // sale el primero de la lista
  assert.equal(core.view(s, m.id, w2.id).me.pos, 1);     // el segundo pasa a ser primero
  assert.equal(core.leave(s, a.id, m.id, NOW).promotedUserId, w2.id);
  assert.equal(core.view(s, m.id, w3.id).me.pos, 1);
});
test('F4.5 la persona promovida recibe un aviso que se marca como visto', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW); core.joinWaitlist(s, b.id, m.id, NOW); core.leave(s, a.id, m.id, NOW);
  assert.ok(core.view(s, m.id, b.id).note.by);
  core.markSeen(s, b.id, m.id); assert.equal(core.view(s, m.id, b.id).note, null);
});
test('F4.6 si baja alguien de la lista no se promueve a nadie', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW); core.joinWaitlist(s, b.id, m.id, NOW);
  assert.equal(core.leave(s, b.id, m.id, NOW).promotedUserId, null); assert.equal(core.view(s, m.id, o.id).inCount, 2);
});

// Cuenta y datos (R6) y listado
test('R6.1 eliminar la cuenta borra sus datos y promueve a quien esperaba', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2), b = mk(3); const m = newMatch(s, o, 2);
  core.join(s, a.id, m.id, NOW); core.joinWaitlist(s, b.id, m.id, NOW);
  core.deleteUser(s, a.id);
  assert.equal(s.users.some((u) => u.id === a.id), false); assert.equal(core.view(s, m.id, b.id).me.status, 'in');
});
test('R6.2 eliminar a un organizador cancela sus partidos', () => {
  const { s, mk } = setup(); const o = mk(1); newMatch(s, o, 4); core.deleteUser(s, o.id);
  assert.equal(s.matches.length, 0); assert.equal(s.regs.length, 0);
});
test('L1 el listado filtra por cupos y oculta partidos ya jugados', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m1 = newMatch(s, o, 2); newMatch(s, o, 10);
  core.join(s, a.id, m1.id, NOW);
  assert.equal(core.list(s, a.id, NOW, 'todos').length, 2); assert.equal(core.list(s, a.id, NOW, 'cupos').length, 1);
  assert.equal(core.list(s, a.id, Date.parse('2026-11-21T12:00:00Z'), 'todos').length, 0);
});
test('L2 el organizador cancela y el partido desaparece', () => {
  const { s, mk } = setup(); const o = mk(1), a = mk(2); const m = newMatch(s, o, 10);
  assert.throws(() => core.cancelMatch(s, a.id, m.id), { code: 'forbidden' });
  core.cancelMatch(s, o.id, m.id); assert.equal(s.matches.length, 0);
});
