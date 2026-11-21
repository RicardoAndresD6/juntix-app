/* Juntix MVP: interfaz (HTML, CSS y JavaScript sin dependencias).
 * Si hay un servidor (api/health responde) usa la API; si no, funciona en modo demostración
 * con los datos guardados en el propio navegador. Las reglas viven en core.js. */
(function () {
  'use strict';
  var C = window.JuntixCore;
  var app = document.getElementById('app');

  /* ---------- utilidades ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICON = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    back: '<path d="m15 18-6-6 6-6"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
    check: '<path d="m5 12 5 5 9-10"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-3-5.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };
  var icon = function (n, c) { return '<svg class="ic ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>'; };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  var COMUNAS = ['Santiago', 'Providencia', 'Ñuñoa', 'Las Condes', 'Vitacura', 'La Reina', 'Macul', 'San Miguel', 'Recoleta', 'Independencia', 'Quinta Normal', 'Estación Central', 'Maipú', 'La Florida', 'Puente Alto', 'San Joaquín', 'Peñalolén', 'Lo Barnechea'];
  function mkErr(code, message, field) { var e = new Error(message); e.code = code; if (field) e.field = field; return e; }

  var mem = {};
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] == null ? null : mem[k]; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };

  /* ---------- acceso a datos: servidor ---------- */
  function mkRemote() {
    var TK = 'juntix.token';
    function call(method, path, body) {
      var headers = { 'Content-Type': 'application/json' };
      var t = ls.get(TK); if (t) headers.Authorization = 'Bearer ' + t;
      return fetch('api' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
        .catch(function () { throw mkErr('network', 'No hay conexión con Juntix. Revisa tu internet e inténtalo de nuevo.'); })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (!res.ok || !data || data.ok === false) {
              if (res.status === 401 && path !== '/login') ls.del(TK);
              throw mkErr((data && data.code) || 'error', (data && data.message) || 'Algo salió mal. Inténtalo de nuevo.', data && data.field);
            }
            return data;
          });
        });
    }
    var m = function (r) { return r.match; };
    return {
      mode: 'remote',
      register: function (d) { return call('POST', '/register', d).then(function (r) { ls.set(TK, r.token); return r.user; }); },
      login: function (d) { return call('POST', '/login', d).then(function (r) { ls.set(TK, r.token); return r.user; }); },
      logout: function () { return call('POST', '/logout').catch(function () {}).then(function () { ls.del(TK); }); },
      me: function () { if (!ls.get(TK)) return Promise.reject(mkErr('auth', 'Ingresa para continuar.')); return call('GET', '/me').then(function (r) { return r.user; }); },
      deleteAccount: function () { return call('DELETE', '/me').then(function () { ls.del(TK); }); },
      list: function (f) { return call('GET', '/matches?filter=' + encodeURIComponent(f)).then(function (r) { return r.matches; }); },
      mine: function () { return call('GET', '/my-matches').then(function (r) { return r.matches; }); },
      get: function (id) { return call('GET', '/matches/' + id).then(m); },
      create: function (d) { return call('POST', '/matches', d).then(m); },
      join: function (id) { return call('POST', '/matches/' + id + '/join').then(m); },
      waitlist: function (id) { return call('POST', '/matches/' + id + '/waitlist').then(m); },
      leave: function (id) { return call('POST', '/matches/' + id + '/leave').then(m); },
      seen: function (id) { return call('POST', '/matches/' + id + '/seen').then(m); },
      cancel: function (id) { return call('DELETE', '/matches/' + id); }
    };
  }

  /* ---------- acceso a datos: modo demostración (navegador) ---------- */
  function seedState(now) {
    var s = C.emptyState();
    var names = ['Diego Rojas', 'Ana Muñoz', 'Tomás Pérez', 'Camila Soto', 'Pablo Reyes', 'Joseth Alarcón', 'Manuel Ojeda', 'Sofía Lagos', 'Matías Vera', 'Javiera Núñez', 'Nicolás Fuentes', 'Francisca Díaz', 'Ignacio Parra', 'Constanza Vidal', 'Felipe Araya', 'Daniela Mora'];
    var us = names.map(function (n, i) { return C.registerUser(s, { name: n, email: 'jugador' + (i + 1) + '@demo.juntix', comuna: 'Santiago', adult: true, consent: true, passHash: 'sin-acceso' }, now); });
    var today = C.localParts(now).date;
    var nextDow = function (d) { var k = 1; while (C.dow(C.addDays(today, k)) !== d) k++; return C.addDays(today, k); };
    var m1 = C.createMatch(s, us[0].id, { title: 'Pichanga del jueves', place: 'Cancha Plaza Brasil', comuna: 'Santiago', date: nextDow(4), time: '20:00', capacity: 10 }, now);
    [1, 2, 3, 4, 5, 6].forEach(function (i) { C.join(s, us[i].id, m1.id, now); });
    var m2 = C.createMatch(s, us[7].id, { title: 'Fútbol 7 del sábado', place: "Parque O'Higgins", comuna: 'Santiago', date: nextDow(6), time: '11:00', capacity: 12 }, now);
    [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13].slice(0, 11).forEach(function (i) { C.join(s, us[i].id, m2.id, now); });
    C.joinWaitlist(s, us[14].id, m2.id, now); C.joinWaitlist(s, us[15].id, m2.id, now);
    var m3 = C.createMatch(s, us[8].id, { title: 'Baby fútbol del viernes', place: 'Gimnasio AIEP Bellavista', comuna: 'Providencia', date: nextDow(5), time: '19:30', capacity: 6 }, now);
    [9, 10, 11, 12].forEach(function (i) { C.join(s, us[i].id, m3.id, now); });
    var m4 = C.createMatch(s, us[5].id, { title: 'Fútbol 11 del domingo', place: 'Parque Quinta Normal', comuna: 'Quinta Normal', date: nextDow(0), time: '10:00', capacity: 22 }, now);
    [6, 1, 2, 3, 13, 14, 15].forEach(function (i) { C.join(s, us[i].id, m4.id, now); });
    return s;
  }
  function mkLocal() {
    var KEY = 'juntix.demo.v1', SES = 'juntix.demo.session', state;
    function persist() { ls.set(KEY, JSON.stringify(state)); }
    function fresh() { var r = ls.get(KEY); if (r) { try { state = JSON.parse(r); return; } catch (e) { /* se recrea */ } } if (!state) { state = seedState(Date.now()); persist(); } }
    fresh();
    function hash(p) {
      if (window.crypto && crypto.subtle && window.TextEncoder) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode('juntix:' + p)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
      }
      return Promise.resolve('p:' + btoa(unescape(encodeURIComponent(p))));
    }
    function cur() { fresh(); var u = state.users.find(function (x) { return x.id === ls.get(SES); }); if (!u) throw mkErr('auth', 'Ingresa para continuar.'); return u; }
    function run(fn) { return new Promise(function (ok, no) { try { ok(fn()); } catch (e) { no(e); } }); }
    var act = function (fn) { return function (id) { return run(function () { var u = cur(); fn(state, u.id, id, Date.now()); persist(); return C.view(state, id, u.id); }); }; };
    return {
      mode: 'local',
      register: function (d) {
        var pe = C.validatePassword(d.password); if (pe) return Promise.reject(pe);
        return hash(d.password).then(function (h) { fresh(); var u = C.registerUser(state, { name: d.name, email: d.email, comuna: d.comuna, adult: d.adult === true, consent: d.consent === true, passHash: h }, Date.now()); persist(); ls.set(SES, u.id); return C.publicUser(u); });
      },
      login: function (d) {
        return hash(String(d.password || '')).then(function (h) { fresh(); var u = C.findUserByEmail(state, d.email); if (!u || u.passHash !== h) throw mkErr('credentials', 'Correo o contraseña incorrectos.'); ls.set(SES, u.id); return C.publicUser(u); });
      },
      logout: function () { ls.del(SES); return Promise.resolve(); },
      me: function () { return run(function () { return C.publicUser(cur()); }); },
      deleteAccount: function () { return run(function () { var u = cur(); C.deleteUser(state, u.id); persist(); ls.del(SES); }); },
      reset: function () { ls.del(KEY); state = null; ls.del(SES); fresh(); return Promise.resolve(); },
      list: function (f) { return run(function () { var u = cur(); return C.list(state, u.id, Date.now(), f); }); },
      mine: function () { return run(function () { var u = cur(); return C.mine(state, u.id, Date.now()); }); },
      get: function (id) { return run(function () { var u = cur(); return C.view(state, id, u.id); }); },
      create: function (d) { return run(function () { var u = cur(); var m = C.createMatch(state, u.id, d, Date.now()); persist(); return C.view(state, m.id, u.id); }); },
      join: act(C.join), waitlist: act(C.joinWaitlist), leave: act(C.leave),
      seen: act(function (s, uid, id) { C.markSeen(s, uid, id); }),
      cancel: function (id) { return run(function () { var u = cur(); C.cancelMatch(state, u.id, id); persist(); }); }
    };
  }

  function detectApi() {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch('api/health', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(timer); return j && j.app === 'juntix' ? mkRemote() : mkLocal(); })
      .catch(function () { clearTimeout(timer); return mkLocal(); });
  }

  /* ---------- estado de la interfaz ---------- */
  var api = null;
  var S = { user: null, filter: 'todos', busy: false, lastJson: '', statuses: {}, refresh: null, route: 0, poll: null };

  function render(html, keep) {
    var y = window.scrollY;
    app.innerHTML = html;
    window.scrollTo(0, keep ? y : 0);
  }
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }

  function toast(title, sub, kind) {
    var old = document.getElementById('toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast' + (kind === 'err' ? ' err' : ''); t.setAttribute('role', 'status');
    t.innerHTML = '<div class="tick">' + icon(kind === 'err' ? 'info' : 'check') + '</div><div><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 4200);
  }
  function modal(o) {
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    var btns = (o.buttons || [{ label: 'Entendido' }]).map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + esc(b.label) + '</button>'; }).join('');
    scrim.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><h3>' + esc(o.title) + '</h3>' + o.body + btns + '</div>';
    var close = function () { scrim.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) return close();
      var b = e.target.closest('button[data-i]'); if (!b) return;
      var def = (o.buttons || [{}])[Number(b.getAttribute('data-i'))];
      close(); if (def && def.onClick) def.onClick();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    var first = scrim.querySelector('button'); if (first) first.focus();
  }

  /* ---------- piezas de interfaz ---------- */
  var MARK = '<svg class="logo-sm" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="115" fill="#2556F5"/><circle cx="187" cy="187" r="59" fill="#fff"/><circle cx="325" cy="187" r="59" fill="#fff"/><circle cx="187" cy="325" r="59" fill="#fff"/><circle cx="325" cy="325" r="59" fill="#F08A2C"/></svg>';
  function brand() { return '<div class="brand">' + MARK.replace('logo-sm', 'logo-lg') + '<span class="word">junt<span class="dl">ı</span>x</span></div>'; }
  function demoNote() {
    return api && api.mode === 'local' ? '<p class="demo">Modo demostración: no hay servidor conectado, así que los datos quedan solo en este navegador.</p>' : '';
  }
  function field(o) {
    return '<div class="field"><label for="' + o.id + '">' + esc(o.label) + '</label><div class="inp">' + (o.icon ? icon(o.icon) : '') +
      '<input id="' + o.id + '" name="' + o.id + '" type="' + (o.type || 'text') + '" value="' + esc(o.value || '') + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.min ? ' min="' + o.min + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + '></div>' +
      (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '') + '<p class="errmsg" id="e-' + o.id + '" hidden></p></div>';
  }
  function showErr(f, msg) {
    var e = document.getElementById('e-' + f);
    if (!e) e = document.getElementById('e-form');
    if (e) {
      e.textContent = msg; e.hidden = false;
      var prev = e.previousElementSibling, fld = e.closest('.field');
      var w = prev && prev.classList.contains('check') ? prev : (fld ? fld.querySelector('.inp') : null);
      if (w && e.id !== 'e-form') w.classList.add('bad');
    }
  }
  function clearErrs(form) {
    form.querySelectorAll('.errmsg').forEach(function (e) { e.hidden = true; e.textContent = ''; });
    form.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
  }
  function setBusy(form, on, label) {
    var b = form.querySelector('button[type=submit]'); if (!b) return;
    if (on) { b.dataset.l = b.textContent; b.textContent = label; b.disabled = true; } else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; }
  }
  function datalist() { return '<datalist id="comunas">' + COMUNAS.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>'; }
  function nav(active) {
    return '<nav class="nav" aria-label="Principal"><a href="#partidos" class="' + (active === 'p' ? 'on' : '') + '">' + icon('home') + 'Partidos</a>' +
      '<a href="#crear" class="fabw"><span class="fab">' + icon('plus', '') + '</span>Crear</a>' +
      '<a href="#perfil" class="' + (active === 'u' ? 'on' : '') + '">' + icon('user') + 'Perfil</a></nav>';
  }
  function deskNav() { return nav('').replace('class="nav"', 'class="nav desk"'); }
  function dots(v) {
    var out = '';
    for (var i = 0; i < v.capacity; i++) out += '<i class="dot' + (i < v.inCount ? '' : ' off') + '"></i>';
    return '<div class="dots' + (v.capacity > 14 ? ' tight' : '') + '" aria-hidden="true">' + out + '</div>';
  }
  function chip(v) {
    if (v.me.isOrganizer) return '<span class="chip solid">Organizador</span>';
    if (v.me.status === 'in') return '<span class="chip solid">Inscrito</span>';
    if (v.me.status === 'wait') return '<span class="chip dash">En espera · n.º ' + v.me.pos + '</span>';
    if (v.full) return '<span class="chip info">Completo</span>';
    return '<span class="chip warn">' + plural(v.free, 'cupo libre', 'cupos libres') + '</span>';
  }
  function card(v) {
    return '<button type="button" class="card" data-act="open" data-id="' + v.id + '"><div class="r1"><h3>' + esc(v.title) + '</h3>' + chip(v) + '</div>' +
      '<div class="meta">' + esc(v.label) + ' · ' + esc(v.dateLabel) + ' · ' + esc(v.time) + '</div>' +
      '<div class="meta">' + icon('pin', '') + esc(v.place) + ' · ' + esc(v.comuna) + '</div>' +
      '<div class="r3">' + dots(v) + '<span class="count">' + v.inCount + '/' + v.capacity + ' cupos</span></div></button>';
  }
  function initials(n) { var p = String(n).replace('.', '').trim().split(/\s+/); return (p[0].charAt(0) + (p[1] ? p[1].charAt(0) : (p[0].charAt(1) || ''))).toUpperCase(); }

  /* ---------- pantallas ---------- */
  function viewLogin() {
    render('<form class="screen" id="f-login" novalidate>' + brand() + demoNote() + '<h1 class="pad">Hola de nuevo</h1><p class="sub pad">Ingresa para ver los partidos cerca de ti.</p>' +
      '<div class="pad">' + field({ id: 'email', label: 'Correo', type: 'email', icon: 'mail', ph: 'tucorreo@correo.cl', auto: 'email' }) +
      field({ id: 'password', label: 'Contraseña', type: 'password', icon: 'lock', auto: 'current-password' }) +
      '<div style="text-align:right"><button type="button" class="linkbtn" data-act="forgot">¿Olvidaste tu contraseña?</button></div><p class="errmsg" id="e-form" hidden></p></div>' +
      '<div class="foot"><button class="btn" type="submit">Ingresar</button><p class="small">¿No tienes cuenta? <a class="linkbtn" href="#registro">Regístrate</a></p></div></form>');
  }
  function viewRegister() {
    render('<form class="screen" id="f-reg" novalidate><div class="top"><a class="round" href="#ingreso" aria-label="Volver">' + icon('back') + '</a><h2>Crear cuenta</h2></div>' +
      '<div class="pad"><h1>Crea tu cuenta</h1><p class="sub">Te pedimos solo lo necesario para jugar.</p>' + demoNote().replace('class="demo"', 'class="demo" style="margin:0 0 16px"') +
      field({ id: 'name', label: 'Nombre', icon: '', ph: 'Nombre y apellido', auto: 'name', max: 60 }) +
      field({ id: 'email', label: 'Correo', type: 'email', icon: 'mail', ph: 'tucorreo@correo.cl', auto: 'email' }) +
      field({ id: 'password', label: 'Contraseña', type: 'password', icon: 'lock', auto: 'new-password', hint: 'Mínimo 8 caracteres.' }) +
      field({ id: 'comuna', label: 'Comuna', icon: 'pin', ph: 'Tu comuna', list: 'comunas', hint: 'La usamos para mostrarte partidos cerca.', max: 40 }) + datalist() +
      '<label class="check"><input type="checkbox" id="adult"><span>Soy mayor de 18 años</span></label><p class="errmsg" id="e-adult" hidden></p>' +
      '<label class="check"><input type="checkbox" id="consent"><span>Acepto que Juntix use mis datos para crear mi cuenta y mostrarme partidos, según la <a href="#registro" data-act="privacy">política de privacidad</a></span></label><p class="errmsg" id="e-consent" hidden></p>' +
      '<p class="errmsg" id="e-form" hidden></p></div>' +
      '<div class="foot"><button class="btn" type="submit">Crear cuenta</button><p class="small">¿Ya tienes cuenta? <a class="linkbtn" href="#ingreso">Ingresa</a></p></div></form>');
  }

  function viewList(quiet) {
    var rid = S.route;
    return api.list(S.filter).then(function (matches) {
      if (rid !== S.route) return;
      var json = JSON.stringify(matches) + S.filter;
      matches.forEach(function (m) {
        if (S.statuses[m.id] === 'wait' && m.me.status === 'in') toast('Entraste a «' + m.title + '»', 'Se liberó un cupo y te tocaba a ti.');
        S.statuses[m.id] = m.me.status;
      });
      if (quiet && json === S.lastJson) return;
      S.lastJson = json;
      var f = [['todos', 'Todos'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['cupos', 'Con cupos']];
      render('<div class="screen"><div class="head"><div><div class="loc">' + icon('pin') + esc(S.user.comuna) + '</div><h1>Partidos cerca</h1></div>' + MARK + '</div>' + demoNote() +
        '<div class="filters" role="group" aria-label="Filtrar partidos">' + f.map(function (x) { return '<button type="button" data-act="filter" data-v="' + x[0] + '" aria-pressed="' + (S.filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<div class="list">' + (matches.length ? matches.map(card).join('') : '<div class="empty"><h3>Aún no hay partidos aquí</h3>Prueba otro filtro o crea el primero con el botón +.</div>') + '</div>' + nav('p') + '</div>', quiet);
    });
  }

  function viewCreate() {
    var today = C.localParts(Date.now()).date;
    render('<form class="screen" id="f-new" novalidate><div class="top"><a class="round" href="#partidos" aria-label="Cerrar">' + icon('close') + '</a><h2>Crear partido</h2></div>' +
      '<div class="pad"><h1>Crea tu partido</h1><p class="sub">Lo publicamos para que se sumen jugadores cerca.</p>' +
      field({ id: 'title', label: 'Título', ph: 'Pichanga del jueves', hint: 'Ej.: Fútbol 7 del sábado', max: 60 }) +
      field({ id: 'place', label: 'Lugar', icon: 'map', ph: 'Cancha o recinto', max: 80 }) +
      field({ id: 'address', label: 'Dirección o referencia (opcional)', icon: 'pin', ph: 'Ej.: Av. Grecia 1234, entrada por calle Roma', hint: 'Para que los demás encuentren la cancha.', max: 120 }) +
      field({ id: 'comuna', label: 'Comuna', icon: 'pin', value: S.user.comuna, list: 'comunas', max: 40 }) + datalist() +
      '<div class="row2">' + field({ id: 'date', label: 'Fecha', type: 'date', icon: 'cal', value: C.addDays(today, 1), min: today }) + field({ id: 'time', label: 'Hora', type: 'time', icon: 'clock', value: '20:00' }) + '</div>' +
      '<div class="field"><span class="lbl" id="l-cap">Cupos</span><div class="stepper" role="group" aria-labelledby="l-cap"><button type="button" data-act="cap" data-d="-1" aria-label="Quitar un cupo">−</button><b id="cap" aria-live="polite">10</b><button type="button" data-act="cap" data-d="1" aria-label="Agregar un cupo">+</button></div>' +
      '<p class="hint">Total de jugadores, contándote a ti.</p><p class="errmsg" id="e-capacity" hidden></p></div><p class="errmsg" id="e-form" hidden></p></div>' +
      '<div class="foot"><button class="btn" type="submit">Publicar partido</button></div>' + deskNav() + '</form>');
  }

  function matchHTML(v) {
    var st = v.me.status, org = v.me.isOrganizer;
    var banner = '', foot = '';
    if (v.note) banner = '<div class="banner ok">' + icon('check') + '<div><b>Entraste al partido</b><span>' + esc(v.note.by) + ' se bajó y tomaste su cupo automáticamente desde la lista de espera.</span></div></div>';
    else if (org) banner = '<div class="banner note">' + icon('info') + '<div>Eres el organizador de este partido. Si ya no se juega, puedes cancelarlo.</div></div>';
    else if (st === 'in') banner = '<div class="banner ok">' + icon('check') + '<div><b>Estás inscrito</b><span>Te esperamos en la cancha. Si no puedes ir, bájate para liberar tu cupo.</span></div></div>';
    else if (st === 'wait') banner = '<div class="queue"><div class="t">Tu posición en la lista de espera</div><div class="big">n.º ' + v.me.pos + '</div><div class="pos">' +
      Array.from({ length: Math.min(v.me.pos, 5) }, function (_, i) { var n = v.me.pos - Math.min(v.me.pos, 5) + 1 + i; return '<i class="' + (n === v.me.pos ? 'me' : '') + '">n.º ' + n + '</i>'; }).join('') + '</div></div>' +
      '<div class="banner note">' + icon('bell') + '<div>Si alguien se baja, entras automáticamente. Abre Juntix para ver tu lugar; no tienes que hacer nada más.</div></div>';
    else if (v.full) banner = '<div class="banner note">' + icon('users') + '<div>Este partido está completo. Anótate y entras solo si alguien se baja.</div></div>';

    if (org) foot = '<button type="button" class="btn red" data-act="cancel">Cancelar partido</button>';
    else if (st === 'in') foot = v.note ? '<button type="button" class="btn" data-act="seen">Volver a partidos</button><button type="button" class="linkbtn" data-act="leave">Bajarme del partido</button>'
      : '<button type="button" class="btn red" data-act="leave">Bajarme del partido</button><p class="small">' + (v.waitCount ? 'Si te bajas, avisamos al primero de la lista de espera.' : 'Si te bajas, tu cupo queda libre para otra persona.') + '</p>';
    else if (st === 'wait') foot = '<button type="button" class="btn ghost" data-act="leave">Salir de la lista de espera</button>';
    else if (v.full) foot = '<button type="button" class="btn" data-act="waitlist">Anotarme en la lista de espera</button><p class="small">' + (v.waitCount ? plural(v.waitCount, 'persona', 'personas') + ' en la lista de espera' : 'Aún no hay nadie en la lista de espera') + '</p>';
    else foot = '<div class="buy"><div class="q">Quedan<b>' + plural(v.free, 'cupo', 'cupos') + '</b></div><button type="button" class="btn orange" data-act="join">Inscribirme</button></div>';

    var people = v.players.map(function (p) {
      return '<div class="person' + (p.isMe ? ' me' : '') + '"><div class="av">' + esc(initials(p.name)) + '</div><div><b>' + esc(p.name) + (p.isMe ? ' (tú)' : '') + '</b><span>' + (p.role === 'Organizador' ? 'Organizador' : (p.isMe && v.note ? 'Entró desde la lista de espera' : 'Inscrito')) + '</span></div>' + (p.isMe ? '<span class="chip solid tu">Tú</span>' : '') + '</div>';
    }).join('');
    return '<div class="screen"><div class="hero"><div class="bar"><a class="round" href="#partidos" aria-label="Volver">' + icon('back') + '</a><button type="button" class="round" data-act="share" aria-label="Compartir partido">' + icon('share') + '</button></div>' +
      '<div class="tags"><span class="chip tag">' + esc(v.label) + '</span>' + chip(v) + '</div><h1>' + esc(v.title) + '</h1><div class="meta">' + icon('cal') + esc(v.dateLabel) + ' · ' + esc(v.time) + '</div>' +
      '<div class="meta">' + icon('pin') + esc(v.place) + ' · ' + esc(v.comuna) + '</div>' +
      (v.address ? '<div class="meta">' + icon('map') + esc(v.address) + '</div>' : '') + '</div>' + banner +
      '<div class="sect"><div class="hd"><h2>Inscritos</h2><div style="display:flex;gap:10px;align-items:center">' + dots(v) + '<span class="count">' + v.inCount + '/' + v.capacity + '</span></div></div><div class="people">' + people + '</div></div><div class="pad-b"></div>' +
      '<div class="foot">' + foot + '</div>' + deskNav() + '</div>';
  }
  function viewMatch(id, quiet) {
    var rid = S.route;
    return api.get(id).then(function (v) {
      if (rid !== S.route) return;
      var json = JSON.stringify(v);
      S.statuses[v.id] = v.me.status;
      if (quiet && json === S.lastJson) return;
      S.lastJson = json; S.cur = v;
      render(matchHTML(v), quiet);
    }, function (e) {
      if (rid !== S.route) return;
      if (e.code === 'not_found') { toast('Ese partido ya no existe', 'Lo cancelaron o ya se jugó.', 'err'); return go('partidos'); }
      throw e;
    });
  }

  function viewProfile() {
    var rid = S.route;
    return api.mine().then(function (ms) {
      if (rid !== S.route) return;
      render('<div class="screen"><div class="head"><div><div class="loc">' + icon('user') + 'Tu cuenta</div><h1>Perfil</h1></div>' + MARK + '</div>' + demoNote() +
        '<div class="me-card"><div class="av">' + esc(initials(S.user.name)) + '</div><div><b>' + esc(S.user.name) + '</b><span>' + esc(S.user.email) + '</span><span>' + esc(S.user.comuna) + '</span></div></div>' +
        '<div class="sect"><div class="hd"><h2>Mis partidos</h2></div><div class="mini">' + (ms.length ? ms.map(function (v) { return '<button type="button" class="card" data-act="open" data-id="' + v.id + '"><div><h3>' + esc(v.title) + '</h3><div class="meta">' + esc(v.dateLabel) + ' · ' + esc(v.time) + '</div></div>' + chip(v) + '</button>'; }).join('') : '<p class="hint">Todavía no te inscribes a ningún partido.</p>') + '</div></div>' +
        '<div class="stack"><button type="button" class="btn ghost" data-act="privacy">Política de privacidad</button><button type="button" class="btn ghost" data-act="logout">Cerrar sesión</button>' +
        (api.mode === 'local' ? '<button type="button" class="btn ghost" data-act="reset">Restablecer datos de demostración</button>' : '') +
        '<button type="button" class="btn red" data-act="delete">Eliminar mi cuenta</button></div><div class="pad-b"></div>' + nav('u') + '</div>');
    });
  }

  /* ---------- rutas ---------- */
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } S.refresh = null; }
  function route() {
    stopPoll();
    var rid = ++S.route;
    var h = (location.hash || '').slice(1), name = h, id = null;
    if (h.indexOf('partido-') === 0) { name = 'partido'; id = h.slice(8); }
    if (!S.user && name !== 'ingreso' && name !== 'registro') return go('ingreso');
    if (S.user && (name === '' || name === 'ingreso' || name === 'registro')) return go('partidos');
    S.lastJson = '';
    var p;
    if (name === 'ingreso') { viewLogin(); return; }
    if (name === 'registro') { viewRegister(); return; }
    if (name === 'crear') { viewCreate(); return; }
    if (name === 'partidos') { p = viewList(false); S.refresh = function () { return viewList(true); }; }
    else if (name === 'partido') { p = viewMatch(id, false); S.refresh = function () { return viewMatch(id, true); }; }
    else if (name === 'perfil') { p = viewProfile(); }
    else return go('partidos');
    p.catch(function (e) { if (rid !== S.route) return; if (e.code === 'auth') { S.user = null; return go('ingreso'); } toast('No pudimos cargar', e.message, 'err'); });
    if (S.refresh) S.poll = setInterval(function () { if (!document.hidden && !S.busy && S.refresh) S.refresh().catch(function () {}); }, 10000);
  }

  /* ---------- acciones ---------- */
  function lock(fn) {
    if (S.busy) return Promise.resolve();      // evita el doble clic (defecto D1)
    S.busy = true;
    app.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    return Promise.resolve().then(fn).catch(function (e) {
      if (e.code === 'auth') { S.user = null; return go('ingreso'); }
      toast('No se pudo completar', e.message, 'err');
      if (S.refresh) return S.refresh().catch(function () {});
    }).then(function () { S.busy = false; app.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); });
  }
  function showMatch(v) { S.lastJson = JSON.stringify(v); S.cur = v; S.statuses[v.id] = v.me.status; render(matchHTML(v), true); }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = S.cur && S.cur.id;
    if (act !== 'privacy') e.preventDefault();
    if (act === 'open') return go('partido-' + el.getAttribute('data-id'));
    if (act === 'filter') { S.filter = el.getAttribute('data-v'); S.lastJson = ''; return viewList(false); }
    if (act === 'cap') { var c = document.getElementById('cap'), n = Number(c.textContent) + Number(el.getAttribute('data-d')); c.textContent = Math.max(C.MIN_CAP, Math.min(C.MAX_CAP, n)); return; }
    if (act === 'forgot') return modal({ title: 'Restablecer contraseña', body: '<p>Esta función aún no está disponible en el piloto. Pide ayuda al equipo de Juntix o crea una cuenta con otro correo.</p>' });
    if (act === 'privacy') { e.preventDefault(); return privacy(); }
    if (act === 'join') return lock(function () { return api.join(id).then(showMatch); });
    if (act === 'waitlist') return lock(function () { return api.waitlist(id).then(showMatch); });
    if (act === 'leave') return lock(function () {
      var was = S.cur.me.status, waiting = S.cur.waitCount;
      return api.leave(id).then(function (v) {
        showMatch(v);
        if (was === 'in') toast('Liberaste tu cupo.', waiting ? 'Ya avisamos a la lista de espera.' : 'Tu cupo quedó libre para otra persona.');
        else toast('Saliste de la lista de espera.', '');
      });
    });
    if (act === 'seen') return lock(function () { return api.seen(id).then(function () { go('partidos'); }); });
    if (act === 'cancel') return modal({ title: '¿Cancelar este partido?', body: '<p>Se borra el partido y se quitan todos los inscritos. Esta acción no se puede deshacer.</p>', buttons: [
      { label: 'Sí, cancelar partido', cls: 'red', onClick: function () { lock(function () { return api.cancel(id).then(function () { go('partidos'); toast('Partido cancelado', ''); }); }); } }, { label: 'No, volver', cls: 'ghost' }] });
    if (act === 'share') {
      var url = location.href.split('#')[0] + '#partido-' + id, text = 'Juega conmigo: ' + (S.cur ? S.cur.title : 'partido en Juntix');
      if (navigator.share) return navigator.share({ title: 'Juntix', text: text, url: url }).catch(function () {});
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(function () { toast('Enlace copiado', 'Pégalo en tu grupo de mensajería.'); }, function () { toast('Copia este enlace', url); });
      return toast('Copia este enlace', url);
    }
    if (act === 'logout') return lock(function () { return api.logout().then(function () { S.user = null; S.statuses = {}; go('ingreso'); }); });
    if (act === 'reset') return lock(function () { return api.reset().then(function () { S.user = null; go('ingreso'); toast('Datos restablecidos', 'Vuelve a crear tu cuenta.'); }); });
    if (act === 'delete') return modal({ title: '¿Eliminar tu cuenta?', body: '<p>Se borran tu cuenta y tus datos, te bajas de todos tus partidos y se cancelan los que organizas. Esta acción no se puede deshacer.</p>', buttons: [
      { label: 'Sí, eliminar mi cuenta', cls: 'red', onClick: function () { lock(function () { return api.deleteAccount().then(function () { S.user = null; go('ingreso'); toast('Cuenta eliminada', 'Borramos tus datos.'); }); }); } }, { label: 'No, volver', cls: 'ghost' }] });
  });

  function privacy() {
    modal({ title: 'Política de privacidad', body: '<ul><li>Guardamos solo tu nombre, correo y comuna. La contraseña se guarda protegida y nadie del equipo puede verla.</li><li>Usamos tus datos para crear tu cuenta, mostrarte partidos cerca y mostrar tu nombre y la inicial de tu apellido a quienes juegan contigo. Nunca mostramos tu correo.</li><li>No pedimos datos de pago ni compartimos tus datos con terceros.</li><li>Solo pueden usar Juntix personas de 18 años o más.</li><li>Puedes eliminar tu cuenta y tus datos cuando quieras desde Perfil.</li><li>Tratamos los datos según la Ley 19.628 sobre protección de la vida privada.</li></ul>' });
  }

  app.addEventListener('input', function (e) {
    var t = e.target, w = t.closest('.inp, .check');
    if (w) w.classList.remove('bad');
    var err = document.getElementById('e-' + t.id); if (err) err.hidden = true;
    var fe = document.getElementById('e-form'); if (fe) fe.hidden = true;
  });

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, id = f.id, v = function (k) { var el = f.querySelector('#' + k); return el ? el.value : ''; }, ch = function (k) { return !!f.querySelector('#' + k).checked; };
    if (S.busy) return;
    clearErrs(f);
    var fail = function (er) { S.busy = false; setBusy(f, false); showErr(er.field || 'form', er.message); var el = f.querySelector('#' + (er.field || '')); if (el && el.focus) el.focus(); };
    if (id === 'f-login') {
      S.busy = true; setBusy(f, true, 'Ingresando…');
      api.login({ email: v('email'), password: v('password') }).then(function (u) { S.busy = false; S.user = u; go('partidos'); }, fail);
    } else if (id === 'f-reg') {
      S.busy = true; setBusy(f, true, 'Creando cuenta…');
      api.register({ name: v('name'), email: v('email'), password: v('password'), comuna: v('comuna'), adult: ch('adult'), consent: ch('consent') }).then(function (u) { S.busy = false; S.user = u; go('partidos'); toast('Cuenta creada', 'Bienvenido a Juntix.'); }, fail);
    } else if (id === 'f-new') {
      S.busy = true; setBusy(f, true, 'Publicando…');
      api.create({ title: v('title'), place: v('place'), address: v('address'), comuna: v('comuna'), date: v('date'), time: v('time'), capacity: Number(document.getElementById('cap').textContent) })
        .then(function (m) { S.busy = false; go('partido-' + m.id); toast('Partido publicado', 'Ya aparece en el listado.'); }, fail);
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', function () { if (S.refresh && !S.busy) S.refresh().catch(function () {}); });

  detectApi().then(function (a) {
    api = a;
    return api.me().then(function (u) { S.user = u; }, function () { S.user = null; });
  }).then(function () {
    route();
    try { if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* sin service worker */ }
  });
})();
