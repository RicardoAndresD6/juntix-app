'use strict';
// Datos de demostración compartidos por scripts/seed.js y scripts/seed-sql.js.
const core = require('../core.js');

const DOMAIN = '@demo.juntix.cl';
const PEOPLE = [
  ['Camila Rojas', 'Providencia'], ['Matías González', 'Ñuñoa'], ['Valentina Muñoz', 'Santiago'],
  ['Benjamín Soto', 'Las Condes'], ['Javiera Contreras', 'Macul'], ['Tomás Silva', 'La Florida'],
  ['Catalina Fuentes', 'Maipú'], ['Joaquín Pérez', 'San Miguel'], ['Fernanda Araya', 'La Reina'],
  ['Diego Morales', 'Peñalolén'], ['Antonia Herrera', 'Recoleta'], ['Nicolás Vargas', 'Independencia'],
  ['Isidora Castro', 'Vitacura'], ['Sebastián Reyes', 'Estación Central']
];
const email = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '.') + DOMAIN;

// [organizador, título, lugar, comuna, días desde hoy, hora, cupos, jugadores inscritos, en espera]
const MATCHES = [
  [0, 'Pichanga del barrio', 'Cancha Plaza Brasil', 'Santiago', 1, '20:00', 10, [1, 2, 3, 4, 5], []],
  [1, 'Futbolito después de la pega', 'Complejo Deportivo Ñuñoa', 'Ñuñoa', 2, '19:30', 10, [0, 2, 3, 5, 6, 7, 8, 9, 10], []],
  [3, 'Fútbol 7 mixto', 'Canchas Estadio Las Condes', 'Las Condes', 3, '21:00', 14, [4, 6, 8, 12], []],
  [5, 'Partido lleno con lista de espera', 'Multicancha Bellavista', 'La Florida', 2, '20:30', 6, [1, 7, 9, 11, 13], [2, 4, 10]],
  [8, 'Fútbol en familia', 'Parque O’Higgins, cancha 3', 'Santiago', 5, '11:00', 22, [0, 1, 2, 9, 11, 12, 13], []],
  [12, 'La revancha', 'Club Deportivo Vitacura', 'Vitacura', 7, '20:00', 10, [3, 5], []]
];

// Agrega las cuentas y partidos demo al estado s (mismas reglas que la app).
function addDemo(s, passHash, now) {
  const today = core.localParts(now).date;
  const users = PEOPLE.map(([name, comuna]) => core.registerUser(s, { name, email: email(name), comuna, adult: true, consent: true, passHash }, now));
  MATCHES.forEach(([org, title, place, comuna, days, time, capacity, ins, waits]) => {
    const m = core.createMatch(s, users[org].id, { title, place, comuna, date: core.addDays(today, days), time, capacity }, now);
    ins.forEach((i) => core.join(s, users[i].id, m.id, now));
    waits.forEach((i) => core.joinWaitlist(s, users[i].id, m.id, now));
  });
  return { users: users.length, matches: MATCHES.length };
}

module.exports = { DOMAIN, PEOPLE, MATCHES, email, addDemo };
