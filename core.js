/*
 * Juntix MVP: reglas de negocio (compartidas por el navegador y el servidor).
 * Funciones puras sobre un objeto de estado: no leen ni escriben en disco.
 * Corrige los defectos D1 (cupo superado por doble clic), D2 (sin promoción
 * automática) y D3 (orden de la lista de espera) del informe de pruebas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JuntixCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'America/Santiago';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MIN_CAP = 2, MAX_CAP = 30;

  function err(code, message, field) {
    var e = new Error(message);
    e.code = code;
    if (field) e.field = field;
    return e;
  }

  function emptyState() {
    return { seq: 0, users: [], matches: [], regs: [], notes: [] };
  }

  function uid(s, p) {
    s.seq += 1;
    return p + Math.random().toString(36).slice(2, 8) + s.seq.toString(36);
  }

  /* ---------- fechas (hora de Chile) ---------- */
  function localParts(ms) {
    var f = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    var p = {};
    f.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
  }
  function localNow(ms) { var p = localParts(ms); return p.date + 'T' + p.time; }
  function addDays(dateStr, n) {
    var a = dateStr.split('-').map(Number);
    return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)).toISOString().slice(0, 10);
  }
  function dow(dateStr) {
    var a = dateStr.split('-').map(Number);
    return new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay();
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s; }
  function isTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function formatDate(dateStr) {
    var a = dateStr.split('-').map(Number);
    return DAYS[dow(dateStr)] + ' ' + a[2] + ' ' + MONTHS[a[1] - 1];
  }
  function formatLabel(cap) {
    if (cap < 6) return 'Fútbol';
    if (cap <= 10) return 'Fútbol 5';
    if (cap <= 14) return 'Fútbol 7';
    if (cap <= 22) return 'Fútbol 11';
    return 'Fútbol';
  }
  function isOver(m, now) { return (m.date + 'T' + m.time) < localNow(now - 2 * 3600 * 1000); }

  /* ---------- usuarios ---------- */
  function shortName(name) {
    var p = String(name).trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[1].charAt(0).toUpperCase() + '.' : p[0];
  }
  function validatePassword(p) {
    if (typeof p !== 'string' || p.length < 8) return err('password', 'La contraseña debe tener al menos 8 caracteres.', 'password');
    if (p.length > 100) return err('password', 'La contraseña es demasiado larga.', 'password');
    return null;
  }
  function publicUser(u) { return { id: u.id, name: u.name, email: u.email, comuna: u.comuna }; }

  function registerUser(s, d, now) {
    now = now || Date.now();
    var name = String(d.name || '').trim().replace(/\s+/g, ' ');
    var email = String(d.email || '').trim().toLowerCase();
    var comuna = String(d.comuna || '').trim();
    if (name.length < 2 || name.length > 60) throw err('name', 'Escribe tu nombre (entre 2 y 60 letras).', 'name');
    if (!EMAIL.test(email) || email.length > 120) throw err('email', 'Escribe un correo válido, por ejemplo nombre@correo.cl.', 'email');
    if (!comuna || comuna.length > 40) throw err('comuna', 'Escribe tu comuna.', 'comuna');
    if (d.adult !== true) throw err('adult', 'Para usar Juntix debes ser mayor de 18 años.', 'adult');
    if (d.consent !== true) throw err('consent', 'Debes aceptar el uso de tus datos para crear la cuenta.', 'consent');
    if (s.users.some(function (u) { return u.email === email; })) {
      throw err('email_taken', 'Ya existe una cuenta con ese correo. Ingresa o usa otro correo.', 'email');
    }
    var user = {
      id: uid(s, 'u'), name: name, email: email, passHash: d.passHash, comuna: comuna,
      consentAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString()
    };
    s.users.push(user);
    return user;
  }

  function findUserByEmail(s, email) {
    email = String(email || '').trim().toLowerCase();
    return s.users.find(function (u) { return u.email === email; }) || null;
  }

  /* ---------- consultas ---------- */
  function userName(s, id) {
    var u = s.users.find(function (x) { return x.id === id; });
    return u ? u.name : 'Jugador';
  }
  function matchRegs(s, matchId) { return s.regs.filter(function (r) { return r.matchId === matchId; }); }
  function inRegs(s, matchId) { return matchRegs(s, matchId).filter(function (r) { return r.status === 'in'; }).sort(function (a, b) { return a.seq - b.seq; }); }
  function waitRegs(s, matchId) { return matchRegs(s, matchId).filter(function (r) { return r.status === 'wait'; }).sort(function (a, b) { return a.seq - b.seq; }); }

  function view(s, matchId, userId) {
    var m = s.matches.find(function (x) { return x.id === matchId; });
    if (!m) throw err('not_found', 'Ese partido ya no existe.');
    var ins = inRegs(s, matchId), waits = waitRegs(s, matchId);
    var mine = null, pos = null;
    ins.forEach(function (r) { if (r.userId === userId) mine = 'in'; });
    waits.forEach(function (r, i) { if (r.userId === userId) { mine = 'wait'; pos = i + 1; } });
    var players = ins.map(function (r) {
      return {
        userId: r.userId, name: shortName(userName(s, r.userId)),
        role: r.userId === m.organizerId ? 'Organizador' : 'Inscrito', isMe: r.userId === userId
      };
    }).sort(function (a, b) { return (a.role === 'Organizador' ? 0 : 1) - (b.role === 'Organizador' ? 0 : 1); });
    var note = s.notes.find(function (n) { return n.matchId === matchId && n.userId === userId && !n.seen; }) || null;
    return {
      id: m.id, title: m.title, label: formatLabel(m.capacity), place: m.place, comuna: m.comuna,
      date: m.date, time: m.time, dateLabel: formatDate(m.date), capacity: m.capacity,
      organizerId: m.organizerId, organizerName: shortName(userName(s, m.organizerId)),
      inCount: ins.length, free: Math.max(0, m.capacity - ins.length), waitCount: waits.length,
      full: ins.length >= m.capacity,
      me: { status: mine, pos: pos, isOrganizer: m.organizerId === userId },
      players: players,
      note: note ? { by: note.by } : null
    };
  }

  function list(s, userId, now, filter) {
    now = now || Date.now();
    var today = localParts(now).date;
    return s.matches
      .filter(function (m) { return !isOver(m, now); })
      .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })
      .map(function (m) { return view(s, m.id, userId); })
      .filter(function (v) {
        if (filter === 'hoy') return v.date === today;
        if (filter === 'semana') return v.date >= today && v.date <= addDays(today, 7);
        if (filter === 'cupos') return v.free > 0;
        return true;
      });
  }

  function mine(s, userId, now) {
    return list(s, userId, now, 'todos').filter(function (v) { return v.me.status; });
  }

  /* ---------- acciones ---------- */
  function createMatch(s, userId, d, now) {
    now = now || Date.now();
    var title = String(d.title || '').trim().replace(/\s+/g, ' ');
    var place = String(d.place || '').trim().replace(/\s+/g, ' ');
    var comuna = String(d.comuna || '').trim();
    var cap = Number(d.capacity);
    if (title.length < 3 || title.length > 60) throw err('title', 'Escribe un título de 3 a 60 letras. Ej.: Fútbol 7 del sábado.', 'title');
    if (place.length < 3 || place.length > 80) throw err('place', 'Escribe el lugar donde se juega.', 'place');
    if (!comuna || comuna.length > 40) throw err('comuna', 'Escribe la comuna.', 'comuna');
    if (!isDate(d.date)) throw err('date', 'Elige la fecha del partido.', 'date');
    if (!isTime(d.time)) throw err('time', 'Elige la hora del partido.', 'time');
    if ((d.date + 'T' + d.time) <= localNow(now)) throw err('date', 'La fecha y la hora deben ser posteriores a este momento.', 'date');
    if (!Number.isInteger(cap) || cap < MIN_CAP || cap > MAX_CAP) throw err('capacity', 'Los cupos deben ser entre ' + MIN_CAP + ' y ' + MAX_CAP + '.', 'capacity');
    var m = { id: uid(s, 'm'), title: title, place: place, comuna: comuna, date: d.date, time: d.time, capacity: cap, organizerId: userId, createdAt: new Date(now).toISOString() };
    s.matches.push(m);
    s.regs.push({ id: uid(s, 'r'), matchId: m.id, userId: userId, status: 'in', seq: ++s.seq });
    return m;
  }

  function requireMatch(s, matchId, now, allowOver) {
    var m = s.matches.find(function (x) { return x.id === matchId; });
    if (!m) throw err('not_found', 'Ese partido ya no existe.');
    if (!allowOver && isOver(m, now || Date.now())) throw err('over', 'Este partido ya se jugó.');
    return m;
  }
  function myReg(s, matchId, userId) {
    return s.regs.find(function (r) { return r.matchId === matchId && r.userId === userId; }) || null;
  }

  // D1: inscribir es idempotente y comprueba el cupo en el mismo paso en que escribe.
  function join(s, userId, matchId, now) {
    var m = requireMatch(s, matchId, now);
    var r = myReg(s, matchId, userId);
    if (r) return { already: true, status: r.status };
    if (inRegs(s, matchId).length >= m.capacity) throw err('full', 'El partido se llenó. Puedes anotarte en la lista de espera.');
    s.regs.push({ id: uid(s, 'r'), matchId: matchId, userId: userId, status: 'in', seq: ++s.seq });
    return { already: false, status: 'in' };
  }

  function joinWaitlist(s, userId, matchId, now) {
    var m = requireMatch(s, matchId, now);
    var r = myReg(s, matchId, userId);
    if (r) return { already: true, status: r.status };
    if (inRegs(s, matchId).length < m.capacity) throw err('has_spots', 'Todavía hay cupos: inscríbete directamente.');
    s.regs.push({ id: uid(s, 'r'), matchId: matchId, userId: userId, status: 'wait', seq: ++s.seq });
    return { already: false, status: 'wait' };
  }

  // D2 y D3: al liberarse un cupo entra la primera persona de la lista, por orden de llegada.
  function leave(s, userId, matchId, now) {
    var m = requireMatch(s, matchId, now, true);
    var r = myReg(s, matchId, userId);
    if (!r) return { removed: false, promotedUserId: null };
    if (m.organizerId === userId) throw err('organizer', 'El organizador no puede bajarse. Cancela el partido si ya no se juega.');
    s.regs = s.regs.filter(function (x) { return x.id !== r.id; });
    var promoted = null;
    if (r.status === 'in') {
      var first = waitRegs(s, matchId)[0];
      if (first && inRegs(s, matchId).length < m.capacity) {
        first.status = 'in';
        promoted = first.userId;
        s.notes.push({ id: uid(s, 'n'), userId: promoted, matchId: matchId, by: shortName(userName(s, userId)), seen: false });
      }
    }
    return { removed: true, promotedUserId: promoted };
  }

  function cancelMatch(s, userId, matchId) {
    var m = requireMatch(s, matchId, Date.now(), true);
    if (m.organizerId !== userId) throw err('forbidden', 'Solo el organizador puede cancelar el partido.');
    s.matches = s.matches.filter(function (x) { return x.id !== matchId; });
    s.regs = s.regs.filter(function (r) { return r.matchId !== matchId; });
    s.notes = s.notes.filter(function (n) { return n.matchId !== matchId; });
  }

  function markSeen(s, userId, matchId) {
    s.notes.forEach(function (n) { if (n.userId === userId && n.matchId === matchId) n.seen = true; });
  }

  // R6: el usuario puede eliminar su cuenta y sus datos.
  function deleteUser(s, userId) {
    s.matches.filter(function (m) { return m.organizerId === userId; }).forEach(function (m) { cancelMatch(s, userId, m.id); });
    s.regs.filter(function (r) { return r.userId === userId; }).forEach(function (r) { leave(s, userId, r.matchId); });
    s.notes = s.notes.filter(function (n) { return n.userId !== userId; });
    s.users = s.users.filter(function (u) { return u.id !== userId; });
  }

  return {
    TZ: TZ, MIN_CAP: MIN_CAP, MAX_CAP: MAX_CAP,
    emptyState: emptyState, err: err,
    localParts: localParts, localNow: localNow, addDays: addDays, dow: dow, formatDate: formatDate, formatLabel: formatLabel,
    shortName: shortName, validatePassword: validatePassword, publicUser: publicUser,
    registerUser: registerUser, findUserByEmail: findUserByEmail,
    view: view, list: list, mine: mine,
    createMatch: createMatch, join: join, joinWaitlist: joinWaitlist, leave: leave,
    cancelMatch: cancelMatch, markSeen: markSeen, deleteUser: deleteUser
  };
});
