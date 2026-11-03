// Capa de datos. Dos implementaciones con la misma interfaz:
//   · Firebase (Firestore + Auth): edición colaborativa en tiempo real.
//   · Local (localStorage): para probar sin configurar nada.
//
// Estructura en Firestore:
//   presentaciones/{pid}                      { titulo, tema, creadoPor, creado, actualizado }
//   presentaciones/{pid}/diapositivas/{sid}   { orden, bg, notas, el: { <id>: { z, h } } }
//   presentaciones/{pid}/presencia/{uid}      { nombre, color, diap, sel, ts }

import { firebaseConfig, opciones } from './firebase-config.js?v=2026.11.02-b';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const COLORES = [210, 150, 28, 280, 340, 190, 100, 250, 12, 170];

function colorDe(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${COLORES[h % COLORES.length]} 62% 42%)`;
}

function nombreGuardado() {
  try { return localStorage.getItem('pres.nombre') || ''; } catch { return ''; }
}

function nuevoIdLocal(pref) {
  return pref + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

/** Aplica un parche con claves "a.b.c" (y BORRAR para eliminar). */
function aplicarParche(obj, parche, BORRAR) {
  for (const [k, v] of Object.entries(parche)) {
    const ruta = k.split('.');
    let o = obj;
    for (let i = 0; i < ruta.length - 1; i++) {
      if (typeof o[ruta[i]] !== 'object' || o[ruta[i]] === null) o[ruta[i]] = {};
      o = o[ruta[i]];
    }
    const ult = ruta[ruta.length - 1];
    if (v === BORRAR) delete o[ult];
    else o[ult] = JSON.parse(JSON.stringify(v));
  }
}

const copia = (o) => JSON.parse(JSON.stringify(o));

// ═════════════════════════════════════════════════════════════════════════
//  Modo local
// ═════════════════════════════════════════════════════════════════════════

function crearStoreLocal() {
  const CLAVE = 'pres.local.v1';
  const BORRAR = Symbol('borrar');
  const uid = (() => {
    try {
      let u = localStorage.getItem('pres.uid');
      if (!u) { u = nuevoIdLocal('u'); localStorage.setItem('pres.uid', u); }
      return u;
    } catch { return 'u-local'; }
  })();
  const usuario = { uid, nombre: nombreGuardado() || 'Tú', color: colorDe(uid) };

  let datos = { presentaciones: {}, diapositivas: {} };
  const leer = () => {
    try { datos = JSON.parse(localStorage.getItem(CLAVE)) || datos; } catch { /* vacío */ }
    datos.presentaciones ||= {};
    datos.diapositivas ||= {};
  };
  leer();
  let guardarT = null;
  const guardar = () => {
    clearTimeout(guardarT);
    guardarT = setTimeout(() => {
      try { localStorage.setItem(CLAVE, JSON.stringify(datos)); }
      catch (e) { estado.error = e; emitEstado(); }
    }, 120);
  };

  const oyentes = new Set(); // {tipo, pid, cb}
  const emitir = () => {
    for (const o of Array.from(oyentes)) o.disparar();
  };
  if (typeof addEventListener === 'function') {
    addEventListener('storage', (e) => { if (e.key === CLAVE) { leer(); emitir(); } });
  }

  const estado = { pendientes: 0, enLinea: true, error: null };
  const oyentesEstado = new Set();
  const emitEstado = () => oyentesEstado.forEach((cb) => cb({ ...estado }));

  const suscribir = (fn) => {
    const o = { disparar: fn };
    oyentes.add(o);
    queueMicrotask(fn);
    return () => oyentes.delete(o);
  };
  const listaPres = () => Object.values(datos.presentaciones).sort((a, b) => b.actualizado - a.actualizado).map(copia);
  const listaSlides = (pid) => Object.entries(datos.diapositivas[pid] || {})
    .map(([id, s]) => ({ id, ...copia(s) })).sort((a, b) => a.orden - b.orden);

  return {
    modo: 'local',
    BORRAR,
    usuario,
    necesitaLogin: false,
    setNombre(n) { usuario.nombre = n; try { localStorage.setItem('pres.nombre', n); } catch { /* ignorar */ } },
    async iniciarSesionGoogle() { return usuario; },

    suscribirEstado(cb) { oyentesEstado.add(cb); cb({ ...estado }); return () => oyentesEstado.delete(cb); },

    suscribirPresentaciones(cb) { return suscribir(() => cb(listaPres())); },
    suscribirPresentacion(pid, cb) {
      return suscribir(() => { const p = datos.presentaciones[pid]; cb(p ? copia(p) : null); });
    },
    suscribirDiapositivas(pid, cb) { return suscribir(() => cb(listaSlides(pid))); },

    async crearPresentacion({ titulo, tema }, diapositivas) {
      const id = nuevoIdLocal('p');
      const ahora = Date.now();
      datos.presentaciones[id] = { id, titulo, tema, creadoPor: uid, creado: ahora, actualizado: ahora };
      datos.diapositivas[id] = {};
      diapositivas.forEach((s, i) => { datos.diapositivas[id][nuevoIdLocal('s')] = { ...copia(s), orden: i + 1 }; });
      guardar(); emitir();
      return id;
    },
    async actualizarPresentacion(pid, parche) {
      const p = datos.presentaciones[pid]; if (!p) return false;
      aplicarParche(p, { ...parche, actualizado: Date.now() }, BORRAR);
      guardar(); emitir(); return true;
    },
    async eliminarPresentacion(pid) {
      delete datos.presentaciones[pid]; delete datos.diapositivas[pid];
      guardar(); emitir(); return true;
    },

    async crearDiapositiva(pid, s, idDado) {
      const id = idDado || nuevoIdLocal('s');
      (datos.diapositivas[pid] ||= {})[id] = copia(s);
      this._tocar(pid); guardar(); emitir();
      return id;
    },
    async actualizarDiapositiva(pid, sid, parche) {
      const s = (datos.diapositivas[pid] || {})[sid]; if (!s) return false;
      aplicarParche(s, parche, BORRAR);
      this._tocar(pid); guardar(); emitir(); return true;
    },
    async eliminarDiapositiva(pid, sid) {
      if (datos.diapositivas[pid]) delete datos.diapositivas[pid][sid];
      this._tocar(pid); guardar(); emitir(); return true;
    },
    _tocar(pid) { const p = datos.presentaciones[pid]; if (p) p.actualizado = Date.now(); },

    async primeraDiapositiva(pid) { return listaSlides(pid)[0] || null; },

    async exportar(pid) {
      const p = datos.presentaciones[pid]; if (!p) throw new Error('No existe la presentación');
      return { formato: 'presentaciones-v1', titulo: p.titulo, tema: p.tema, diapositivas: listaSlides(pid).map(({ id, ...r }) => r) };
    },
    async importar(obj) {
      const { titulo, tema, diapositivas } = obj;
      return this.crearPresentacion({ titulo, tema }, diapositivas);
    },

    suscribirPresencia(pid, cb) { queueMicrotask(() => cb([])); return () => {}; },
    async publicarPresencia() {},
    async salirPresencia() {},
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  Firebase
// ═════════════════════════════════════════════════════════════════════════

async function crearStoreFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);

  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }

  const BORRAR = F.deleteField();
  const estado = { pendientes: 0, enLinea: typeof navigator === 'undefined' ? true : navigator.onLine, error: null };
  const oyentesEstado = new Set();
  const emitEstado = () => oyentesEstado.forEach((cb) => cb({ ...estado }));
  if (typeof addEventListener === 'function') {
    addEventListener('online', () => { estado.enLinea = true; emitEstado(); });
    addEventListener('offline', () => { estado.enLinea = false; emitEstado(); });
  }

  function rastrear(promesa) {
    estado.pendientes++; emitEstado();
    return promesa.then(
      (r) => { estado.pendientes--; estado.error = null; emitEstado(); return r === undefined ? true : r; },
      (e) => { estado.pendientes--; estado.error = e; emitEstado(); console.error(e); return false; },
    );
  }

  // Sesión
  let user = await new Promise((res) => { const un = A.onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  const usaGoogle = opciones.autenticacion === 'google';
  if (!user && !usaGoogle) {
    await A.signInAnonymously(auth);
    user = auth.currentUser;
  }

  const usuario = { uid: '', nombre: '', color: '' };
  const fijarUsuario = (u) => {
    usuario.uid = u.uid;
    usuario.nombre = (usaGoogle && u.displayName) || nombreGuardado() || 'Anónimo';
    usuario.color = colorDe(u.uid);
  };
  if (user) fijarUsuario(user);

  const refPres = (pid) => F.doc(db, 'presentaciones', pid);
  const colSlides = (pid) => F.collection(db, 'presentaciones', pid, 'diapositivas');
  const refSlide = (pid, sid) => F.doc(db, 'presentaciones', pid, 'diapositivas', sid);
  const refPresencia = (pid) => F.doc(db, 'presentaciones', pid, 'presencia', usuario.uid);

  let ultimoToque = 0;
  const tocar = (pid) => {
    const ahora = Date.now();
    if (ahora - ultimoToque < 4000) return;
    ultimoToque = ahora;
    F.updateDoc(refPres(pid), { actualizado: ahora }).catch(() => {});
  };

  const alError = (e) => { estado.error = e; emitEstado(); console.error(e); };

  return {
    modo: 'firebase',
    BORRAR,
    usuario,
    get necesitaLogin() { return !user; },
    setNombre(n) {
      usuario.nombre = n;
      try { localStorage.setItem('pres.nombre', n); } catch { /* ignorar */ }
    },
    async iniciarSesionGoogle() {
      const r = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      user = r.user; fijarUsuario(user);
      return usuario;
    },
    async cerrarSesion() { await A.signOut(auth); user = null; },

    suscribirEstado(cb) { oyentesEstado.add(cb); cb({ ...estado }); return () => oyentesEstado.delete(cb); },

    suscribirPresentaciones(cb) {
      const q = F.query(F.collection(db, 'presentaciones'), F.orderBy('actualizado', 'desc'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), alError);
    },
    suscribirPresentacion(pid, cb) {
      return F.onSnapshot(refPres(pid), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), alError);
    },
    suscribirDiapositivas(pid, cb) {
      const q = F.query(colSlides(pid), F.orderBy('orden'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), alError);
    },

    async crearPresentacion({ titulo, tema }, diapositivas) {
      const ref = F.doc(F.collection(db, 'presentaciones'));
      const ahora = Date.now();
      const lote = F.writeBatch(db);
      lote.set(ref, { titulo, tema, creadoPor: usuario.uid, creado: ahora, actualizado: ahora });
      diapositivas.forEach((s, i) => {
        lote.set(F.doc(colSlides(ref.id)), { ...s, orden: i + 1 });
      });
      const ok = await rastrear(lote.commit());
      if (!ok) throw estado.error || new Error('No se pudo crear la presentación');
      return ref.id;
    },
    actualizarPresentacion(pid, parche) {
      return rastrear(F.updateDoc(refPres(pid), { ...parche, actualizado: Date.now() }));
    },
    async eliminarPresentacion(pid) {
      const snap = await F.getDocs(colSlides(pid));
      const pres = await F.getDocs(F.collection(db, 'presentaciones', pid, 'presencia'));
      for (const d of [...snap.docs, ...pres.docs]) await F.deleteDoc(d.ref).catch(() => {});
      return rastrear(F.deleteDoc(refPres(pid)));
    },

    async crearDiapositiva(pid, s, idDado) {
      const ref = idDado ? F.doc(colSlides(pid), idDado) : F.doc(colSlides(pid));
      const ok = await rastrear(F.setDoc(ref, s));
      if (ok) tocar(pid);
      return ok ? ref.id : null;
    },
    actualizarDiapositiva(pid, sid, parche) {
      tocar(pid);
      return rastrear(F.updateDoc(refSlide(pid, sid), parche));
    },
    eliminarDiapositiva(pid, sid) {
      tocar(pid);
      return rastrear(F.deleteDoc(refSlide(pid, sid)));
    },

    async primeraDiapositiva(pid) {
      const q = F.query(colSlides(pid), F.orderBy('orden'), F.limit(1));
      const s = await F.getDocs(q);
      return s.docs[0] ? { id: s.docs[0].id, ...s.docs[0].data() } : null;
    },

    async exportar(pid) {
      const [p, s] = await Promise.all([F.getDoc(refPres(pid)), F.getDocs(F.query(colSlides(pid), F.orderBy('orden')))]);
      if (!p.exists()) throw new Error('No existe la presentación');
      const d = p.data();
      return {
        formato: 'presentaciones-v1', titulo: d.titulo, tema: d.tema,
        diapositivas: s.docs.map((x) => { const { orden, ...r } = x.data(); return r; }),
      };
    },
    async importar(obj) {
      const { titulo, tema, diapositivas } = obj;
      return this.crearPresentacion({ titulo, tema }, diapositivas);
    },

    suscribirPresencia(pid, cb) {
      return F.onSnapshot(F.collection(db, 'presentaciones', pid, 'presencia'), (s) => {
        cb(s.docs.map((d) => ({ uid: d.id, ...d.data() })));
      }, () => {});
    },
    publicarPresencia(pid, datos) {
      return F.setDoc(refPresencia(pid), {
        nombre: usuario.nombre, color: usuario.color, diap: null, sel: null, ...datos, ts: Date.now(),
      }).catch(() => {});
    },
    salirPresencia(pid) { return F.deleteDoc(refPresencia(pid)).catch(() => {}); },
  };
}

// ═════════════════════════════════════════════════════════════════════════

export async function iniciarStore() {
  if (!firebaseConfig) return crearStoreLocal();
  try {
    return await crearStoreFirebase();
  } catch (e) {
    console.error('No se pudo iniciar Firebase; se usa el modo local.', e);
    const s = crearStoreLocal();
    s.errorFirebase = e;
    return s;
  }
}
