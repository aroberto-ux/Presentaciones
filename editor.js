// Editor: lienzo visual tipo Canva + editor de código + colaboración en vivo.

import { S, E } from './estado.js';
import { h, $, $$, aviso, modal, pedir, confirmar, abrirMenu, cerrarMenu, hayModal, copiarTexto, iniciales } from './ui.js';
import {
  ANCHO, ALTO, LIMITE_BYTES, TEMAS, LAYOUTS, r1, nuevoId, elementoNuevo, htmlImagen, htmlTexto,
  diapositivaDesdeLayout, reconciliar, pintarDiapositiva, aplicarFondo, htmlDeNodo, limpiarHtmlElemento,
  leerCaja, fijarRotacion, idsOrdenados, serializarCodigo, serializarElemento, parsearCodigo, parsearElemento,
  pesoDiapositiva,
} from './slides.js';
import { nodoDesdeHTML } from './sanitize.js';
import { descargarHTML, descargarJSON, imprimir } from './exportar.js';
import { crearEditorCodigo } from './codigo-editor.js';
import { iniciarPaneles, alternarModoCodigo, pestanaActiva, aplicar as aplicarPaneles } from './paneles.js';

let enEditor = false;
let cableado = false;
let subs = [];
let timers = {};
let miniaturas = new Map();
let indiceInicial = 0;
let irAPend = null;
let creandoInicial = false;
let panelClave = '';
let P = {};
let tabActual = 'diseno';
let codigoSucio = false;
let codigoBase = '';
let codigoPendiente = false;
let CE = null;                 // editor de código
let sesionAuto = null;         // cambios hechos con «aplicar al escribir» (un solo paso de deshacer)
let sincronizandoCursor = false;
let moverPendiente = false;
const ajustesCE = { tam: 13, ajuste: true, auto: false };
let arrastrandoDiap = null;
let nudge = null;
let pegados = 0;
const empuje = new Map();

// ── Acceso rápido ───────────────────────────────────────────────────────

const slideActual = () => S.slides.find((s) => s.id === S.sid) || null;
const slidePorId = (id) => S.slides.find((s) => s.id === id) || null;
const nodoPorId = (id) => (id ? Array.from(E.stage.children).find((c) => c.dataset && c.dataset.eid === id) || null : null);
const nodoSel = () => nodoPorId(S.sel);
const tema = () => TEMAS[S.pres && S.pres.tema] || TEMAS.claro;
const copiaEl = (id) => {
  const sl = slideActual();
  const e = sl && sl.el && sl.el[id];
  return e ? { z: e.z, h: e.h } : null;
};
const maxZ = (sl) => Object.values((sl && sl.el) || {}).reduce((m, e) => Math.max(m, e.z), 0);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escribiendoEn = (t) => !!(t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]'));

function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36) + s.length;
}
const firma = (s) => hashStr((s.bg || '') + JSON.stringify(s.el || {}));

// ═════════════════════════════════════════════════════════════════════════
//  Entrada y salida
// ═════════════════════════════════════════════════════════════════════════

export function entrarEditor(pid, n) {
  prepararUnaVez();
  const idx = Math.max(0, (parseInt(n, 10) || 1) - 1);
  if (enEditor && S.pid === pid) {
    const s = S.slides[idx];
    if (s) irADiapositiva(s.id);
    return;
  }
  if (enEditor) salirEditor();

  enEditor = true;
  S.pid = pid; S.pres = null; S.slides = []; S.sid = null; S.sel = null; S.editando = null;
  S.undo = []; S.redo = []; S.usuarios = []; S.ocupado = new Set();
  indiceInicial = idx; irAPend = null; creandoInicial = false; panelClave = ''; codigoSucio = false; codigoBase = '';
  document.body.classList.add('modo-editor');
  E.vistaEditor.hidden = false;
  aplicarPaneles();
  E.stage.replaceChildren();
  E.listaDiap.replaceChildren(); miniaturas = new Map();
  E.titulo.value = '';
  E.presencia.hidden = S.store.modo !== 'firebase';
  actualizarBotonesUndo();
  cambiarTab('diseno');
  ajustarEscala();

  subs.push(S.store.suscribirPresentacion(pid, (p) => {
    if (!enEditor) return;
    if (!p) { aviso('Esa presentación no existe o ya no tienes acceso.', 'error'); location.hash = '#presentaciones'; return; }
    S.pres = p;
    if (document.activeElement !== E.titulo) E.titulo.value = p.titulo || '';
    document.title = `${p.titulo || 'Presentación'} · Presentaciones`;
  }));
  subs.push(S.store.suscribirDiapositivas(pid, alRecibirSlides));
  subs.push(S.store.suscribirPresencia(pid, (lista) => { S.usuarios = lista; refrescarPresencia(); }));
  subs.push(S.store.suscribirEstado(pintarEstado));

  timers.latido = setInterval(() => publicarPresenciaYa(), 15000);
  timers.limpieza = setInterval(refrescarPresencia, 10000);
  publicarPresencia();
  pedirNombreSiHaceFalta();
  setTimeout(ajustarEscala, 0);
}

export function salirEditor() {
  if (!enEditor) return;
  if (S.editando) finalizarEdicion();
  vaciarPendientes();
  enEditor = false;
  subs.forEach((f) => { try { f(); } catch { /* ignorar */ } });
  subs = [];
  Object.values(timers).forEach((t) => { clearTimeout(t); clearInterval(t); });
  timers = {};
  if (S.pid) S.store.salirPresencia(S.pid);
  S.pid = null; S.pres = null; S.slides = []; S.sid = null; S.sel = null;
  E.vistaEditor.hidden = true;
  E.panelDer.classList.remove('abierto');
  document.body.classList.remove('modo-editor');
  document.title = 'Presentaciones';
}

function vaciarPendientes() {
  if (CE && codigoSucio && E.autoAplicar.checked) { clearTimeout(timers.auto); aplicarCodigo({ auto: true }); }
  cerrarSesionAuto();
  guardarNotas();
  if (nudge) { clearTimeout(nudge.t); const { id, antes } = nudge; nudge = null; terminarGesto(id, antes); }
  for (const [id, t] of empuje) { clearTimeout(t); empuje.delete(id); enviarEl(id); }
}

async function pedirNombreSiHaceFalta() {
  if (S.store.modo !== 'firebase') return;
  let guardado = '';
  try { guardado = localStorage.getItem('pres.nombre') || ''; } catch { /* ignorar */ }
  if (guardado || S.store.usuario.nombre !== 'Anónimo') return;
  await cambiarNombre('¿Cómo te llamas?');
}

async function cambiarNombre(titulo = 'Tu nombre') {
  const r = await pedir({ titulo, etiqueta: 'Así te verán las demás personas que editan', valor: S.store.usuario.nombre === 'Anónimo' ? '' : S.store.usuario.nombre, ok: 'Guardar' });
  if (r && enEditor) { S.store.setNombre(r.valor); publicarPresenciaYa(); refrescarPresencia(); }
}

// ═════════════════════════════════════════════════════════════════════════
//  Datos que llegan de la base
// ═════════════════════════════════════════════════════════════════════════

function alRecibirSlides(lista) {
  if (!enEditor) return;
  const idxPrev = Math.max(0, S.slides.findIndex((s) => s.id === S.sid));
  S.slides = lista;
  let cambioDeSlide = false;
  if (irAPend && lista.some((s) => s.id === irAPend)) {
    S.sid = irAPend; irAPend = null; cambioDeSlide = true;
  } else if (!S.sid && lista.length) {
    S.sid = lista[Math.min(indiceInicial, lista.length - 1)].id; cambioDeSlide = true;
  } else if (S.sid && !lista.some((s) => s.id === S.sid)) {
    S.sid = lista.length ? lista[Math.min(idxPrev, lista.length - 1)].id : null;
    cambioDeSlide = true;
  }
  if (cambioDeSlide) { S.sel = null; S.ocupado.clear(); E.stage.replaceChildren(); codigoSucio = false; }
  if (!lista.length && !creandoInicial) {
    creandoInicial = true;
    timers.inicial = setTimeout(async () => {
      if (enEditor && !S.slides.length) await nuevaDiapositiva('blanco', null);
      creandoInicial = false;
    }, 1800);
  }
  pintarMiniaturas();
  pintarLienzo();
  if (cambioDeSlide) actualizarHash();
}

function pintarLienzo() {
  const sl = slideActual();
  reconciliar(E.stage, sl, S.ocupado);
  if (S.sel && !nodoSel()) S.sel = null;
  actualizarOverlay();
  actualizarPanel();
  sincronizarCodigo();
  sincronizarNotas();
  actualizarInfo();
  pintarRemotos();
  actualizarBotonesUndo();
}

function actualizarInfo() {
  const i = S.slides.findIndex((s) => s.id === S.sid);
  const sl = slideActual();
  let t = S.slides.length ? `Diapositiva ${i + 1} de ${S.slides.length}` : '';
  if (sl && pesoDiapositiva(sl) > LIMITE_BYTES * 0.85) t += ' · ¡casi al límite de tamaño!';
  E.info.textContent = t;
}

function actualizarHash() {
  const i = S.slides.findIndex((s) => s.id === S.sid);
  if (i < 0 || !S.pid) return;
  try { history.replaceState(null, '', `#presentaciones/${S.pid}/${i + 1}`); } catch { /* ignorar */ }
}

function pintarEstado(est) {
  S.estadoPendiente = est.pendientes > 0;
  const e = E.estado;
  e.classList.remove('error');
  if (S.store.modo === 'local') e.textContent = est.error ? 'No se pudo guardar en el navegador' : 'Guardado en este navegador';
  else if (est.error) {
    e.classList.add('error');
    const cod = est.error && est.error.code;
    e.textContent = cod === 'permission-denied' ? 'Sin permiso: revisa las reglas de Firestore' : 'Error al guardar';
    e.title = String((est.error && est.error.message) || est.error);
  } else if (est.pendientes > 0) e.textContent = est.enLinea ? 'Guardando…' : 'Sin conexión · se guardará al volver';
  else e.textContent = est.enLinea ? 'Guardado ✓' : 'Sin conexión';
}

// ═════════════════════════════════════════════════════════════════════════
//  Miniaturas
// ═════════════════════════════════════════════════════════════════════════

function crearMini(sid) {
  const m = h('div', { class: 'mini', dataset: { sid }, draggable: true, tabindex: 0, role: 'button', 'aria-label': 'Diapositiva' },
    h('span', { class: 'mini-num' }),
    h('div', { class: 'mini-lienzo' }, h('div', { class: 'diap' }), h('div', { class: 'mini-puntos' })),
    h('button', { class: 'mini-menu', 'aria-label': 'Opciones de la diapositiva', onclick: (e) => { e.stopPropagation(); menuDiap(e.currentTarget, sid); } }, '⋯'));
  m.addEventListener('click', () => irADiapositiva(sid));
  m.addEventListener('keydown', (e) => {
    if (e.target === m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); irADiapositiva(sid); }
  });
  m.addEventListener('dragstart', (e) => {
    arrastrandoDiap = sid;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', sid); } catch { /* ignorar */ }
  });
  m.addEventListener('dragend', () => { arrastrandoDiap = null; limpiarMarcasDrag(); });
  m.addEventListener('dragover', (e) => {
    if (!arrastrandoDiap || arrastrandoDiap === sid) return;
    e.preventDefault();
    const r = m.getBoundingClientRect();
    const horiz = getComputedStyle(E.listaDiap).flexDirection === 'row';
    const despues = horiz ? e.clientX - r.left > r.width / 2 : e.clientY - r.top > r.height / 2;
    limpiarMarcasDrag();
    m.classList.add(despues ? 'abajo' : 'arriba');
  });
  m.addEventListener('drop', (e) => {
    if (!arrastrandoDiap || arrastrandoDiap === sid) return;
    e.preventDefault();
    const despues = m.classList.contains('abajo');
    const mover = arrastrandoDiap;
    arrastrandoDiap = null; limpiarMarcasDrag();
    const otros = S.slides.filter((s) => s.id !== mover);
    let destino = otros.findIndex((s) => s.id === sid);
    if (despues) destino++;
    moverDiap(mover, destino);
  });
  return m;
}

function limpiarMarcasDrag() { $$('.mini.arriba,.mini.abajo', E.listaDiap).forEach((m) => m.classList.remove('arriba', 'abajo')); }

function pintarMiniaturas() {
  const cont = E.listaDiap;
  const vivos = new Set();
  S.slides.forEach((s, i) => {
    vivos.add(s.id);
    let m = miniaturas.get(s.id);
    if (!m) { m = crearMini(s.id); miniaturas.set(s.id, m); }
    if (cont.children[i] !== m) cont.insertBefore(m, cont.children[i] || null);
    m.querySelector('.mini-num').textContent = i + 1;
    const f = firma(s);
    if (m.__firma !== f) { m.__firma = f; pintarDiapositiva(m.querySelector('.diap'), s); }
    const activa = s.id === S.sid;
    m.classList.toggle('act', activa);
    if (activa) m.setAttribute('aria-current', 'true'); else m.removeAttribute('aria-current');
  });
  for (const [id, m] of miniaturas) if (!vivos.has(id)) { m.remove(); miniaturas.delete(id); }
  pintarPuntosPresencia();
  const act = miniaturas.get(S.sid);
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function programarMiniatura(sid) {
  clearTimeout(timers['m' + sid]);
  timers['m' + sid] = setTimeout(() => {
    const m = miniaturas.get(sid), s = slidePorId(sid);
    if (!m || !s) return;
    m.__firma = firma(s);
    pintarDiapositiva(m.querySelector('.diap'), s);
  }, 350);
}

function menuDiap(ancla, sid) {
  const i = S.slides.findIndex((s) => s.id === sid);
  abrirMenu(ancla, [
    { texto: 'Duplicar', icono: '⧉', fn: () => duplicarDiap(sid) },
    { texto: 'Mover arriba', icono: '↑', deshabilitado: i <= 0, fn: () => moverDiap(sid, i - 1) },
    { texto: 'Mover abajo', icono: '↓', deshabilitado: i >= S.slides.length - 1, fn: () => moverDiap(sid, i + 1) },
    '-',
    { texto: 'Eliminar', icono: '🗑', peligro: true, fn: () => eliminarDiap(sid) },
  ], { alineado: 'der' });
}

// ═════════════════════════════════════════════════════════════════════════
//  Diapositivas: crear, mover, duplicar, eliminar
// ═════════════════════════════════════════════════════════════════════════

function ordenTras(sid) {
  const i = S.slides.findIndex((s) => s.id === sid);
  const prev = S.slides[i], sig = S.slides[i + 1];
  if (prev && sig) return (prev.orden + sig.orden) / 2;
  if (prev) return prev.orden + 1;
  return (S.slides[S.slides.length - 1] ? S.slides[S.slides.length - 1].orden : 0) + 1;
}

async function nuevaDiapositiva(layoutId, tras = S.sid) {
  const datos = { ...diapositivaDesdeLayout(layoutId, tema()), orden: ordenTras(tras) };
  const id = 's' + nuevoId().slice(1);
  irAPend = id;
  const r = await S.store.crearDiapositiva(S.pid, datos, id);
  if (!r) { irAPend = null; aviso('No se pudo crear la diapositiva.', 'error'); }
}

async function duplicarDiap(sid) {
  const s = slidePorId(sid);
  if (!s) return;
  const { id, ...resto } = s;
  const nuevo = { ...JSON.parse(JSON.stringify(resto)), orden: ordenTras(sid) };
  const nid = 's' + nuevoId().slice(1);
  irAPend = nid;
  await S.store.crearDiapositiva(S.pid, nuevo, nid);
}

async function eliminarDiap(sid) {
  if (S.slides.length <= 1) { aviso('La presentación necesita al menos una diapositiva.'); return; }
  if (!(await confirmar('Esta diapositiva se eliminará para todas las personas que editan. No se puede deshacer.', 'Eliminar', '¿Eliminar diapositiva?'))) return;
  S.undo = S.undo.filter((op) => op.sid !== sid);
  S.redo = S.redo.filter((op) => op.sid !== sid);
  await S.store.eliminarDiapositiva(S.pid, sid);
}

async function moverDiap(sid, destino) {
  const otros = S.slides.filter((s) => s.id !== sid);
  destino = Math.max(0, Math.min(otros.length, destino));
  const prev = otros[destino - 1], sig = otros[destino];
  let orden;
  if (prev && sig) orden = (prev.orden + sig.orden) / 2;
  else if (prev) orden = prev.orden + 1;
  else if (sig) orden = sig.orden - 1;
  else orden = 1;
  const agotado = (prev && orden <= prev.orden) || (sig && orden >= sig.orden);
  if (agotado) {
    const final = [...otros.slice(0, destino), slidePorId(sid), ...otros.slice(destino)];
    for (let i = 0; i < final.length; i++) {
      if (final[i].orden !== i + 1) { final[i].orden = i + 1; S.store.actualizarDiapositiva(S.pid, final[i].id, { orden: i + 1 }); }
    }
  } else {
    const s = slidePorId(sid);
    if (s) s.orden = orden;
    S.store.actualizarDiapositiva(S.pid, sid, { orden });
  }
  S.slides.sort((a, b) => a.orden - b.orden);
  pintarMiniaturas();
  actualizarInfo();
  actualizarHash();
}

function irADiapositiva(sid) {
  if (!slidePorId(sid) || sid === S.sid) return;
  if (S.editando) finalizarEdicion();
  vaciarPendientes();
  S.sid = sid; S.sel = null; S.ocupado.clear(); panelClave = '';
  codigoSucio = false;
  E.stage.replaceChildren();
  pintarMiniaturas();
  pintarLienzo();
  sincronizarCodigo(true);
  actualizarHash();
  publicarPresencia();
}

function irRelativo(d) {
  const i = S.slides.findIndex((s) => s.id === S.sid);
  const s = S.slides[Math.max(0, Math.min(S.slides.length - 1, i + d))];
  if (s) irADiapositiva(s.id);
}

// ═════════════════════════════════════════════════════════════════════════
//  Cambios sobre elementos (todo pasa por aquí)
// ═════════════════════════════════════════════════════════════════════════

function aplicarCambios(sid, cambios, bg, { registrar = true } = {}) {
  const sl = slidePorId(sid);
  if (!sl) return;
  sl.el = sl.el || {};
  const parche = {};
  for (const c of cambios) {
    if (c.despues) {
      sl.el[c.id] = { z: c.despues.z, h: c.despues.h };
      parche['el.' + c.id] = { z: c.despues.z, h: c.despues.h };
    } else {
      delete sl.el[c.id];
      parche['el.' + c.id] = S.store.BORRAR;
    }
  }
  if (bg) { sl.bg = bg.despues; parche.bg = bg.despues; }
  if (Object.keys(parche).length) S.store.actualizarDiapositiva(S.pid, sid, parche);
  if (registrar) registrarOp({ sid, cambios: cambios.map((c) => ({ id: c.id, antes: c.antes, despues: c.despues })), bg });
  if (sid === S.sid) { reconciliar(E.stage, sl, S.ocupado); programarSyncCodigo(); }
  programarMiniatura(sid);
  if (pesoDiapositiva(sl) > LIMITE_BYTES) aviso('Esta diapositiva ya es demasiado pesada y puede no guardarse. Quita imágenes incrustadas o usa direcciones web.', 'error', 6000);
}

function registrarOp(op) {
  S.undo.push(op);
  if (S.undo.length > 100) S.undo.shift();
  S.redo = [];
  actualizarBotonesUndo();
}

function actualizarBotonesUndo() {
  E.btnDeshacer.disabled = !S.undo.length && !sesionAuto;
  E.btnRehacer.disabled = !S.redo.length;
}

function revertir(op, atras) {
  if (op.sid !== S.sid) { if (!slidePorId(op.sid)) return; irADiapositiva(op.sid); }
  const cambios = op.cambios.map((c) => (atras ? { id: c.id, antes: c.despues, despues: c.antes } : c));
  const bg = op.bg ? (atras ? { antes: op.bg.despues, despues: op.bg.antes } : op.bg) : null;
  aplicarCambios(op.sid, cambios, bg, { registrar: false });
  refrescarTrasCambio();
}

function deshacer() {
  if (S.editando) return;
  cerrarSesionAuto();
  const op = S.undo.pop();
  if (!op) return;
  S.redo.push(op);
  revertir(op, true);
  actualizarBotonesUndo();
}

function rehacer() {
  if (S.editando) return;
  cerrarSesionAuto();
  const op = S.redo.pop();
  if (!op) return;
  S.undo.push(op);
  revertir(op, false);
  actualizarBotonesUndo();
}

function refrescarTrasCambio() {
  if (S.sel && !nodoSel()) S.sel = null;
  actualizarOverlay();
  actualizarPanel();
  sincronizarCodigo();
  pintarRemotos();
  publicarPresencia();
}

/** Envía a la base el estado actual de un nodo (sin registrar en el historial). */
function enviarEl(id) {
  const n = nodoPorId(id), sl = slideActual();
  if (!n || !sl || !sl.el || !sl.el[id]) return;
  const hn = htmlDeNodo(n);
  n.__h = hn;
  sl.el[id] = { z: sl.el[id].z, h: hn };
  S.store.actualizarDiapositiva(S.pid, sl.id, { ['el.' + id]: { z: sl.el[id].z, h: hn } });
  programarMiniatura(sl.id);
  programarSyncCodigo();
}

function empujarEl(id) {
  if (empuje.has(id)) return;
  empuje.set(id, setTimeout(() => { empuje.delete(id); enviarEl(id); }, 220));
}

/** Cierra un gesto (mover, redimensionar, editar texto…) y lo registra para deshacer. */
function terminarGesto(id, antes) {
  clearTimeout(empuje.get(id)); empuje.delete(id);
  const n = nodoPorId(id), sl = slideActual();
  if (!n || !sl) return;
  const hn = htmlDeNodo(n);
  n.__h = hn;
  if (antes && antes.h === hn) return;
  const z = sl.el && sl.el[id] ? sl.el[id].z : (antes ? antes.z : maxZ(sl) + 1);
  aplicarCambios(sl.id, [{ id, antes, despues: { z, h: hn } }], null);
}

function seleccionar(id) {
  if (S.editando && S.editando !== id) finalizarEdicion();
  if (nudge && nudge.id !== id) { clearTimeout(nudge.t); const { id: nid, antes } = nudge; nudge = null; terminarGesto(nid, antes); }
  S.sel = id;
  actualizarOverlay();
  actualizarPanel();
  if (E.alcance.value === 'elemento') sincronizarCodigo(true);
  else marcarElementoEnCodigo({ mover: !!id });
  publicarPresencia();
}

// ═════════════════════════════════════════════════════════════════════════
//  Crear, copiar y borrar elementos
// ═════════════════════════════════════════════════════════════════════════

function agregarEl(html, { editar = false, codigo = false } = {}) {
  const sl = slideActual();
  if (!sl) return null;
  const limpio = limpiarHtmlElemento(html);
  if (!limpio) { aviso('No se pudo insertar el elemento.', 'error'); return null; }
  const id = nuevoId();
  const nuevo = { z: maxZ(sl) + 1, h: limpio };
  if (pesoDiapositiva({ ...sl, el: { ...(sl.el || {}), [id]: nuevo } }) > LIMITE_BYTES) {
    aviso('La diapositiva ya pesa demasiado para añadir más.', 'error');
    return null;
  }
  aplicarCambios(sl.id, [{ id, antes: null, despues: nuevo }], null);
  seleccionar(id);
  if (editar) { const n = nodoPorId(id); if (n) iniciarEdicion(n, true); }
  if (codigo) { cambiarTab('codigo'); E.alcance.value = 'elemento'; sincronizarCodigo(true); }
  return id;
}

function eliminarSel() {
  const id = S.sel;
  if (!id) return;
  if (S.editando) finalizarEdicion();
  const sl = slideActual();
  const antes = copiaEl(id);
  if (!antes) return;
  S.sel = null;
  aplicarCambios(sl.id, [{ id, antes, despues: null }], null);
  refrescarTrasCambio();
}

function copiarSel() {
  const e = copiaEl(S.sel);
  if (!e) return false;
  S.portapapeles = { h: e.h };
  try { localStorage.setItem('pres.portapapeles', JSON.stringify(S.portapapeles)); } catch { /* ignorar */ }
  pegados = 0;
  return true;
}

function desplazarHtml(html, dx, dy) {
  const r = nodoDesdeHTML(html);
  if (!r) return html;
  const x = parseFloat(r.nodo.style.left) || 0, y = parseFloat(r.nodo.style.top) || 0;
  r.nodo.style.left = r1(x + dx) + 'px';
  r.nodo.style.top = r1(y + dy) + 'px';
  return htmlDeNodo(r.nodo);
}

function pegarEl() {
  let pc = S.portapapeles;
  if (!pc) { try { pc = JSON.parse(localStorage.getItem('pres.portapapeles') || 'null'); } catch { pc = null; } }
  if (!pc || typeof pc.h !== 'string') return;
  pegados++;
  agregarEl(desplazarHtml(pc.h, 24 * pegados, 24 * pegados));
}

function duplicarSel() {
  if (!copiarSel()) return;
  pegarEl();
}

function ordenCapas(modo) {
  const sl = slideActual(), id = S.sel;
  if (!sl || !id) return;
  const ids = idsOrdenados(sl);
  const i = ids.indexOf(id);
  let orden;
  if (modo === 'frente') orden = [...ids.filter((x) => x !== id), id];
  else if (modo === 'fondo') orden = [id, ...ids.filter((x) => x !== id)];
  else {
    const j = modo === 'adelante' ? i + 1 : i - 1;
    if (j < 0 || j >= ids.length) return;
    orden = ids.slice(); orden[i] = orden[j]; orden[j] = id;
  }
  const cambios = [];
  orden.forEach((x, k) => {
    const a = sl.el[x];
    if (a.z !== k + 1) cambios.push({ id: x, antes: { z: a.z, h: a.h }, despues: { z: k + 1, h: a.h } });
  });
  if (cambios.length) { aplicarCambios(sl.id, cambios, null); actualizarPanel(); }
}

// ═════════════════════════════════════════════════════════════════════════
//  Imágenes
// ═════════════════════════════════════════════════════════════════════════

function cargarImagen(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se pudo cargar la imagen.'));
    i.src = src;
  });
}

async function comprimirImagen(file) {
  if (!/^image\//.test(file.type)) throw new Error('El archivo no es una imagen.');
  const url = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    fr.readAsDataURL(file);
  });
  const img = await cargarImagen(url);
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    if (url.length > 450000) throw new Error('Este archivo pesa demasiado; usa una dirección web.');
    return { src: url, w: img.naturalWidth || 600, h: img.naturalHeight || 400 };
  }
  let escala = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  for (let intento = 0; intento < 6; intento++) {
    const w = Math.max(1, Math.round(img.naturalWidth * escala)), hh = Math.max(1, Math.round(img.naturalHeight * escala));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    c.getContext('2d').drawImage(img, 0, 0, w, hh);
    const q = [0.85, 0.75, 0.6][Math.min(intento, 2)];
    let out = c.toDataURL('image/webp', q);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q);
    if (out.length < 420000) return { src: out, w, h: hh };
    escala *= 0.8;
  }
  throw new Error('No se pudo reducir la imagen lo suficiente; usa una dirección web.');
}

function cajaImagen(w, hh) {
  const k = Math.min(1, 760 / w, 440 / hh);
  const W = Math.round(w * k), H = Math.round(hh * k);
  return { x: Math.round((ANCHO - W) / 2), y: Math.round((ALTO - H) / 2), w: W, h: H };
}

let reemplazoId = null;

async function usarImagen(src, w, hh) {
  if (reemplazoId) {
    const id = reemplazoId; reemplazoId = null;
    const n = nodoPorId(id);
    if (n && n.localName === 'img') {
      const antes = copiaEl(id);
      n.setAttribute('src', src);
      terminarGesto(id, antes);
      actualizarPanel();
      return;
    }
  }
  const b = cajaImagen(w || 600, hh || 400);
  agregarEl(htmlImagen(src, b.x, b.y, b.w, b.h));
}

async function insertarImagenArchivo(file) {
  try {
    aviso('Procesando imagen…', 'info', 1200);
    const r = await comprimirImagen(file);
    await usarImagen(r.src, r.w, r.h);
  } catch (e) {
    reemplazoId = null;
    aviso(e.message || 'No se pudo insertar la imagen.', 'error', 5000);
  }
}

async function insertarImagenURL() {
  const r = await pedir({ titulo: 'Imagen desde una dirección web', etiqueta: 'Dirección (debe empezar por https://)', valor: 'https://', ok: 'Insertar' });
  if (!r) return;
  const url = r.valor.trim();
  if (!/^https:\/\/\S+$/i.test(url)) { aviso('La dirección debe empezar por https://', 'error'); reemplazoId = null; return; }
  try {
    const img = await cargarImagen(url);
    await usarImagen(url, img.naturalWidth, img.naturalHeight);
  } catch {
    aviso('No se pudo cargar esa imagen. ¿Es pública y https?', 'error', 5000);
    reemplazoId = null;
  }
}

function elegirImagen(id = null) {
  reemplazoId = id;
  E.inputImagen.click();
}

// ═════════════════════════════════════════════════════════════════════════
//  Edición de texto en el lienzo
// ═════════════════════════════════════════════════════════════════════════

function iniciarEdicion(n, seleccionarTodo = true) {
  const id = n.dataset.eid;
  if (S.editando === id) return;
  if (S.editando) finalizarEdicion();
  S.editando = id;
  S.ocupado.add(id);
  S.antesEdicion = copiaEl(id);
  n.contentEditable = 'true';
  n.spellcheck = false;
  n.addEventListener('keydown', teclasEdicion);
  n.addEventListener('paste', pegarTextoPlano);
  n.addEventListener('blur', alPerderFoco, { once: true });
  n.focus();
  const rango = document.createRange();
  rango.selectNodeContents(n);
  if (!seleccionarTodo) rango.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(rango);
  actualizarOverlay();
}

function alPerderFoco() {
  // Si el foco se fue a un campo del panel, se cierra la edición de todos modos.
  setTimeout(() => { if (S.editando) finalizarEdicion(); }, 0);
}

function teclasEdicion(e) {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); finalizarEdicion(); }
}

function pegarTextoPlano(e) {
  e.preventDefault();
  const t = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, t);
}

function finalizarEdicion() {
  const id = S.editando;
  if (!id) return;
  const n = nodoPorId(id);
  S.editando = null;
  S.ocupado.delete(id);
  if (n) {
    n.removeEventListener('keydown', teclasEdicion);
    n.removeEventListener('paste', pegarTextoPlano);
    n.removeEventListener('blur', alPerderFoco);
    n.removeAttribute('contenteditable');
    n.removeAttribute('spellcheck');
    const sel = getSelection();
    if (sel) sel.removeAllRanges();
    const vacio = n.dataset.t === 'texto' && !n.textContent.trim() && !n.querySelector('img,svg');
    if (vacio) {
      S.sel = id;
      const antes = S.antesEdicion;
      if (antes) { S.sel = null; aplicarCambios(slideActual().id, [{ id, antes, despues: null }], null); }
      else { S.sel = null; n.remove(); }
    } else {
      terminarGesto(id, S.antesEdicion);
    }
  }
  S.antesEdicion = null;
  refrescarTrasCambio();
}

// ═════════════════════════════════════════════════════════════════════════
//  Interacción con el ratón / dedo
// ═════════════════════════════════════════════════════════════════════════

function aStage(e) {
  const r = E.stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) / S.escala, y: (e.clientY - r.top) / S.escala };
}

function arrastrar(e, mover, fin) {
  const pid = e.pointerId;
  const mv = (ev) => { if (ev.pointerId === pid) mover(ev); };
  const up = (ev) => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    fin(ev);
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function alPresionarLienzo(e) {
  if (e.button > 0) return;
  const n = e.target.closest ? e.target.closest('[data-eid]') : null;
  if (S.editando) {
    if (n && n.dataset.eid === S.editando) return;
    finalizarEdicion();
  }
  if (!n || n.parentNode !== E.stage) { seleccionar(null); return; }
  e.preventDefault();
  seleccionar(n.dataset.eid);
  iniciarMover(e, n);
}

function cajasOtros(id) {
  return Array.from(E.stage.children).filter((c) => c.dataset && c.dataset.eid && c.dataset.eid !== id).map(leerCaja);
}

function ajustarSnap(x, y, w, hh, otros) {
  const umbral = 6 / S.escala;
  const xs = [0, ANCHO / 2, ANCHO], ys = [0, ALTO / 2, ALTO];
  for (const o of otros) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
  let gx = null, gy = null, mx = umbral, my = umbral, nx = x, ny = y;
  for (const m of [0, w / 2, w]) for (const c of xs) { const d = Math.abs(x + m - c); if (d < mx) { mx = d; nx = c - m; gx = c; } }
  for (const m of [0, hh / 2, hh]) for (const c of ys) { const d = Math.abs(y + m - c); if (d < my) { my = d; ny = c - m; gy = c; } }
  return { x: nx, y: ny, gx, gy };
}

function mostrarGuias(gx, gy) {
  E.guiaV.hidden = gx == null; if (gx != null) E.guiaV.style.left = gx + 'px';
  E.guiaH.hidden = gy == null; if (gy != null) E.guiaH.style.top = gy + 'px';
}

function iniciarMover(e, n) {
  const id = n.dataset.eid;
  const inicio = aStage(e);
  const c0 = leerCaja(n);
  const antes = copiaEl(id);
  const otros = cajasOtros(id);
  let movido = false;
  S.ocupado.add(id);
  arrastrar(e, (ev) => {
    const p = aStage(ev);
    const dx = p.x - inicio.x, dy = p.y - inicio.y;
    if (!movido && Math.hypot(dx, dy) * S.escala < 3) return;
    movido = true;
    let x = c0.x + dx, y = c0.y + dy;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) y = c0.y; else x = c0.x; }
    let gx = null, gy = null;
    if (!ev.altKey) { const s = ajustarSnap(x, y, c0.w, c0.h, otros); x = s.x; y = s.y; gx = s.gx; gy = s.gy; }
    mostrarGuias(gx, gy);
    n.style.left = r1(x) + 'px';
    n.style.top = r1(y) + 'px';
    actualizarOverlay();
    empujarEl(id);
  }, () => {
    mostrarGuias(null, null);
    S.ocupado.delete(id);
    if (movido) { terminarGesto(id, antes); refrescarTrasCambio(); }
  });
}

function iniciarRedimension(e, dir) {
  const n = nodoSel();
  if (!n) return;
  const id = n.dataset.eid;
  const antes = copiaEl(id);
  const c0 = leerCaja(n);
  const tipo = n.dataset.t;
  const hx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
  const hy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
  const th = (c0.r * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
  const inicio = aStage(e);
  const fs0 = parseFloat(getComputedStyle(n).fontSize) || 28;
  const esquina = hx !== 0 && hy !== 0;
  const tieneAlto = !!n.style.height;
  S.ocupado.add(id);
  arrastrar(e, (ev) => {
    const p = aStage(ev);
    const dx = p.x - inicio.x, dy = p.y - inicio.y;
    const dxl = dx * cos + dy * sin, dyl = -dx * sin + dy * cos;
    let w = c0.w + hx * dxl, hh = c0.h + hy * dyl;
    let esc = 1;
    if (esquina && (tipo === 'texto' || tipo === 'img' || ev.shiftKey)) {
      esc = Math.max(w / c0.w, hh / c0.h);
      esc = Math.max(esc, 24 / c0.w);
      w = c0.w * esc; hh = c0.h * esc;
    }
    w = Math.max(24, w);
    hh = Math.max(12, hh);
    // el ancla (lado opuesto) se queda fija en pantalla aunque el elemento esté girado
    const ax = -hx * c0.w / 2, ay = -hy * c0.h / 2;
    const cx0 = c0.x + c0.w / 2, cy0 = c0.y + c0.h / 2;
    const Ax = cx0 + ax * cos - ay * sin, Ay = cy0 + ax * sin + ay * cos;
    const bx = hx * w / 2, by = hy * hh / 2;
    const cx = Ax + bx * cos - by * sin, cy = Ay + bx * sin + by * cos;
    n.style.left = r1(cx - w / 2) + 'px';
    n.style.top = r1(cy - hh / 2) + 'px';
    if (hx !== 0) n.style.width = r1(w) + 'px';
    if (tipo === 'texto') {
      if (esquina) n.style.fontSize = r1(Math.max(8, fs0 * esc)) + 'px';
    } else if (hy !== 0 || (esquina) || tieneAlto) {
      if (hy !== 0 || tieneAlto) n.style.height = r1(hh) + 'px';
    }
    actualizarOverlay();
    empujarEl(id);
  }, () => {
    S.ocupado.delete(id);
    terminarGesto(id, antes);
    refrescarTrasCambio();
  });
}

function iniciarRotacion(e) {
  const n = nodoSel();
  if (!n) return;
  const id = n.dataset.eid;
  const antes = copiaEl(id);
  const c0 = leerCaja(n);
  const cx = c0.x + c0.w / 2, cy = c0.y + c0.h / 2;
  S.ocupado.add(id);
  arrastrar(e, (ev) => {
    const p = aStage(ev);
    let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
    a = ((a % 360) + 540) % 360 - 180;
    if (ev.shiftKey) a = Math.round(a / 15) * 15;
    else for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(a - t) < 3) a = t;
    fijarRotacion(n, r1(a));
    actualizarOverlay();
    empujarEl(id);
  }, () => {
    S.ocupado.delete(id);
    terminarGesto(id, antes);
    refrescarTrasCambio();
  });
}

function alPresionarManija(e) {
  const t = e.target.closest ? e.target.closest('[data-h]') : null;
  if (!t || S.lectura) return;
  e.preventDefault();
  e.stopPropagation();
  if (t.dataset.h === 'rot') iniciarRotacion(e); else iniciarRedimension(e, t.dataset.h);
}

function alDobleClic(e) {
  const n = e.target.closest ? e.target.closest('[data-eid]') : null;
  if (!n) return;
  e.preventDefault();
  const tipo = n.dataset.t;
  if (tipo === 'img') { elegirImagen(n.dataset.eid); return; }
  if (tipo === 'html') { seleccionar(n.dataset.eid); cambiarTab('codigo'); E.alcance.value = 'elemento'; sincronizarCodigo(true); return; }
  seleccionar(n.dataset.eid);
  iniciarEdicion(n, false);
}

// ═════════════════════════════════════════════════════════════════════════
//  Selección: recuadro y asas
// ═════════════════════════════════════════════════════════════════════════

function actualizarOverlay() {
  const n = nodoSel();
  if (!n) { E.selbox.hidden = true; return; }
  const c = leerCaja(n);
  const st = E.selbox.style;
  st.left = c.x + 'px'; st.top = c.y + 'px'; st.width = c.w + 'px'; st.height = c.h + 'px';
  st.transform = c.r ? `rotate(${c.r}deg)` : '';
  E.selbox.dataset.tipo = n.dataset.t || '';
  E.selbox.classList.toggle('editando', S.editando === S.sel);
  E.selbox.hidden = false;
  sincronizarValores();
}

// ═════════════════════════════════════════════════════════════════════════
//  Presencia
// ═════════════════════════════════════════════════════════════════════════

const usuariosActivos = () => S.usuarios.filter((u) => u.uid !== S.store.usuario.uid && Date.now() - (u.ts || 0) < 45000);

function publicarPresencia() {
  clearTimeout(timers.pres);
  timers.pres = setTimeout(publicarPresenciaYa, 250);
}

function publicarPresenciaYa() {
  if (!enEditor || !S.pid) return;
  S.store.publicarPresencia(S.pid, { diap: S.sid, sel: S.sel });
}

function refrescarPresencia() {
  if (!enEditor) return;
  pintarPresencia();
  pintarPuntosPresencia();
  pintarRemotos();
}

function colorSeguro(c) { return /^(hsl|rgb)a?\([\d\s.,%\/]+\)$|^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#666'; }

function pintarPresencia() {
  if (S.store.modo !== 'firebase') return;
  const yo = S.store.usuario;
  const todos = [{ ...yo, propio: true }, ...usuariosActivos()];
  const av = (u) => {
    const a = h(u.propio ? 'button' : 'span', {
      class: 'avatar', title: `${u.nombre}${u.propio ? ' (tú) · clic para cambiar tu nombre' : ''}`,
      'aria-label': u.nombre,
    }, iniciales(u.nombre));
    a.style.setProperty('--c', colorSeguro(u.color));
    if (u.propio) { a.style.cursor = 'pointer'; a.style.border = '2px solid var(--sup)'; a.addEventListener('click', () => cambiarNombre()); }
    return a;
  };
  const nodos = todos.slice(0, 6).map(av);
  if (todos.length > 6) { const m = h('span', { class: 'avatar', title: todos.slice(6).map((u) => u.nombre).join(', ') }, `+${todos.length - 6}`); m.style.setProperty('--c', '#555'); nodos.push(m); }
  E.presencia.replaceChildren(...nodos);
}

function pintarPuntosPresencia() {
  const otros = usuariosActivos();
  for (const [sid, m] of miniaturas) {
    const cont = m.querySelector('.mini-puntos');
    const aqui = otros.filter((u) => u.diap === sid);
    cont.replaceChildren(...aqui.map((u) => { const i = h('i', { title: u.nombre }); i.style.setProperty('--c', colorSeguro(u.color)); return i; }));
  }
}

function pintarRemotos() {
  E.remotos.replaceChildren();
  for (const u of usuariosActivos()) {
    if (u.diap !== S.sid || !u.sel) continue;
    const n = nodoPorId(u.sel);
    if (!n) continue;
    const c = leerCaja(n);
    const d = h('div', { class: 'remoto' }, h('span', {}, String(u.nombre || '')));
    d.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;${c.r ? `transform:rotate(${c.r}deg);` : ''}`;
    d.style.setProperty('--c', colorSeguro(u.color));
    E.remotos.append(d);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Panel «Diseño»
// ═════════════════════════════════════════════════════════════════════════

const FUENTES = [
  ['Inter', "'Inter',system-ui,sans-serif"], ['Poppins', "'Poppins',system-ui,sans-serif"],
  ['Montserrat', "'Montserrat',system-ui,sans-serif"], ['Space Grotesk', "'Space Grotesk',system-ui,sans-serif"],
  ['Playfair Display', "'Playfair Display',Georgia,serif"], ['Lora', "'Lora',Georgia,serif"],
  ['Roboto Slab', "'Roboto Slab',Georgia,serif"], ['Caveat (manuscrita)', "'Caveat',cursive"],
  ['Georgia', 'Georgia,serif'], ['Arial', 'Arial,Helvetica,sans-serif'], ['Courier New', "'Courier New',monospace"],
];

const FONDOS = [
  '#ffffff', '#f3f4f6', '#14181d', '#fbf6ee', '#eaf3ee', '#f2c94c',
  'linear-gradient(135deg,#0b3d2a,#1f7a4d)', 'linear-gradient(135deg,#1e3a8a,#7c3aed)', 'linear-gradient(135deg,#f97316,#ec4899)',
  'linear-gradient(135deg,#0f172a,#334155)', 'linear-gradient(135deg,#fde68a,#fca5a5)', 'linear-gradient(135deg,#a7f3d0,#93c5fd)',
];

function aHex(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '#000000';
  const p = m[1].split(/[\s,\/]+/).map(parseFloat);
  return '#' + [0, 1, 2].map((i) => Math.round(p[i] || 0).toString(16).padStart(2, '0')).join('');
}
const esTransparente = (c) => !c || c === 'transparent' || /rgba\(.*[,\/]\s*0\)$/.test(c);

function setVal(input, v) {
  if (!input || document.activeElement === input) return;
  const s = String(v);
  if (input.value !== s) input.value = s;
}

function campoNum(etiqueta, clave, alCambiar, { min, max, paso = 1 } = {}) {
  const input = h('input', { type: 'number', step: paso, min, max, 'aria-label': etiqueta });
  input.addEventListener('change', () => { const v = parseFloat(input.value); if (Number.isFinite(v)) alCambiar(v); else sincronizarValores(); });
  P[clave] = input;
  return h('label', { class: 'num' }, etiqueta, input);
}

function botonCorto(texto, alClic, { titulo, clave, clase = '' } = {}) {
  const b = h('button', { class: `btn ${clase}`.trim(), title: titulo || texto, 'aria-label': titulo || texto, onclick: alClic }, texto);
  if (clave) P[clave] = b;
  return b;
}

/** Color con vista previa en vivo y un solo registro en el historial. */
function campoColor(clave, etiqueta, propiedad, alDefinir) {
  const input = h('input', { type: 'color', 'aria-label': etiqueta, title: etiqueta });
  let antes = null, id = null;
  input.addEventListener('input', () => {
    const n = nodoSel();
    if (!n) return;
    if (!antes) { id = n.dataset.eid; antes = copiaEl(id); S.ocupado.add(id); }
    if (alDefinir) alDefinir(n, input.value); else n.style.setProperty(propiedad, input.value);
    actualizarOverlay();
    empujarEl(id);
  });
  input.addEventListener('change', () => {
    if (!antes) return;
    S.ocupado.delete(id);
    terminarGesto(id, antes);
    antes = null; id = null;
  });
  P[clave] = input;
  return input;
}

function estilo(prop, valor) {
  const n = nodoSel();
  if (!n) return;
  const id = n.dataset.eid, antes = copiaEl(id);
  if (valor === '' || valor == null) n.style.removeProperty(prop); else n.style.setProperty(prop, valor);
  terminarGesto(id, antes);
  actualizarOverlay();
}

function aplicarCaja(k, v) {
  const n = nodoSel();
  if (!n) return;
  const id = n.dataset.eid, antes = copiaEl(id);
  if (k === 'x') n.style.left = r1(v) + 'px';
  else if (k === 'y') n.style.top = r1(v) + 'px';
  else if (k === 'w') n.style.width = Math.max(8, r1(v)) + 'px';
  else if (k === 'h') n.style.height = Math.max(8, r1(v)) + 'px';
  else if (k === 'r') fijarRotacion(n, r1(((v % 360) + 540) % 360 - 180));
  terminarGesto(id, antes);
  actualizarOverlay();
}

function aplicarBorde() {
  const g = parseFloat(P.bordeGrosor.value) || 0;
  if (g <= 0) estilo('border', '');
  else estilo('border', `${g}px solid ${P.bordeColor.value}`);
}

function seccion(titulo, ...hijos) { return h('div', { class: 'sec' }, h('h3', {}, titulo), ...hijos); }

function panelElemento(n) {
  P = {};
  const tipo = n.dataset.t || 'html';
  const nombres = { texto: 'Texto', forma: 'Forma', img: 'Imagen', html: 'Bloque HTML' };
  const raiz = h('div');
  raiz.append(h('div', { class: 'tipo-sel' }, nombres[tipo] || 'Elemento',
    h('span', { class: 'grupo' }, botonCorto('⧉', duplicarSel, { titulo: 'Duplicar (Ctrl+D)' }), botonCorto('🗑', eliminarSel, { titulo: 'Eliminar (Supr)', clase: 'peligro' }))));

  raiz.append(seccion('Posición y tamaño',
    h('div', { class: 'fila' }, campoNum('X', 'x', (v) => aplicarCaja('x', v)), campoNum('Y', 'y', (v) => aplicarCaja('y', v))),
    h('div', { class: 'fila' }, campoNum('Ancho', 'w', (v) => aplicarCaja('w', v), { min: 8 }), campoNum('Alto', 'h', (v) => aplicarCaja('h', v), { min: 8 }),
      campoNum('Giro °', 'r', (v) => aplicarCaja('r', v)))));

  if (tipo !== 'img') {
    const fuente = h('select', { 'aria-label': 'Fuente' }, h('option', { value: '' }, 'Personalizada'), FUENTES.map(([nom, val]) => h('option', { value: val }, nom)));
    fuente.addEventListener('change', () => { if (fuente.value) estilo('font-family', fuente.value); });
    P.fuente = fuente;
    raiz.append(seccion('Texto',
      h('div', { class: 'fila' }, h('label', { class: 'num' }, 'Fuente', fuente)),
      h('div', { class: 'fila' }, campoNum('Tamaño', 'tam', (v) => estilo('font-size', Math.max(6, v) + 'px'), { min: 6 }),
        campoNum('Interlineado', 'lh', (v) => estilo('line-height', String(Math.max(0.6, v))), { min: 0.6, paso: 0.05 }),
        h('label', { class: 'num' }, 'Color', campoColor('color', 'Color del texto', 'color'))),
      h('div', { class: 'fila' },
        h('span', { class: 'grupo' },
          botonCorto('B', () => estilo('font-weight', parseInt(getComputedStyle(nodoSel()).fontWeight, 10) >= 600 ? '400' : '700'), { titulo: 'Negrita', clave: 'neg', clase: 'neg' }),
          botonCorto('I', () => estilo('font-style', getComputedStyle(nodoSel()).fontStyle === 'italic' ? 'normal' : 'italic'), { titulo: 'Cursiva', clave: 'cur' }),
          botonCorto('U', () => estilo('text-decoration', /underline/.test(getComputedStyle(nodoSel()).textDecorationLine) ? 'none' : 'underline'), { titulo: 'Subrayado', clave: 'sub' })),
        h('span', { class: 'grupo' },
          botonCorto('⇤', () => estilo('text-align', 'left'), { titulo: 'Alinear a la izquierda', clave: 'al-left' }),
          botonCorto('↔', () => estilo('text-align', 'center'), { titulo: 'Centrar', clave: 'al-center' }),
          botonCorto('⇥', () => estilo('text-align', 'right'), { titulo: 'Alinear a la derecha', clave: 'al-right' })))));
    P.neg.style.fontWeight = '800'; P.cur.style.fontStyle = 'italic'; P.sub.style.textDecoration = 'underline';

    raiz.append(seccion('Relleno',
      h('div', { class: 'fila' },
        h('label', { class: 'num' }, 'Color de fondo', campoColor('fondo', 'Color de relleno', 'background-color', (nn, v) => { nn.style.setProperty('background', v); })),
        botonCorto('Sin relleno', () => estilo('background', 'none'), { titulo: 'Quitar relleno' }))));
  }

  const bordeColor = campoColor('bordeColor', 'Color del borde', 'border-color', () => { /* se aplica abajo */ });
  bordeColor.addEventListener('input', () => { const nn = nodoSel(); if (nn && parseFloat(P.bordeGrosor.value) > 0) nn.style.setProperty('border', `${P.bordeGrosor.value}px solid ${bordeColor.value}`); });
  raiz.append(seccion('Borde y efectos',
    h('div', { class: 'fila' }, campoNum('Grosor borde', 'bordeGrosor', () => aplicarBorde(), { min: 0, max: 40 }),
      h('label', { class: 'num' }, 'Color', bordeColor),
      campoNum('Radio', 'radio', (v) => estilo('border-radius', Math.max(0, v) + 'px'), { min: 0 })),
    h('div', { class: 'fila' }, h('label', { class: 'num' }, 'Opacidad', (() => {
      const r = h('input', { type: 'range', min: 5, max: 100, step: 1, 'aria-label': 'Opacidad' });
      let antes = null, id = null;
      r.addEventListener('input', () => {
        const nn = nodoSel(); if (!nn) return;
        if (!antes) { id = nn.dataset.eid; antes = copiaEl(id); S.ocupado.add(id); }
        nn.style.opacity = String(r.value / 100); empujarEl(id);
      });
      r.addEventListener('change', () => { if (!antes) return; S.ocupado.delete(id); terminarGesto(id, antes); antes = null; });
      P.opac = r; return r;
    })())),
    h('label', { class: 'fila', style: { alignItems: 'center', gap: '8px' } }, (() => {
      const c = h('input', { type: 'checkbox' });
      c.addEventListener('change', () => estilo('filter', c.checked ? 'drop-shadow(0 8px 14px rgba(0,0,0,.3))' : ''));
      P.sombra = c; return c;
    })(), 'Sombra')));

  if (tipo === 'img') {
    const aj = h('select', { 'aria-label': 'Ajuste de la imagen' },
      h('option', { value: 'cover' }, 'Rellenar (recortar)'), h('option', { value: 'contain' }, 'Contener'), h('option', { value: 'fill' }, 'Estirar'));
    aj.addEventListener('change', () => estilo('object-fit', aj.value));
    P.ajuste = aj;
    raiz.append(seccion('Imagen',
      h('div', { class: 'fila' }, h('label', { class: 'num' }, 'Ajuste', aj)),
      h('div', { class: 'fila' }, botonCorto('Cambiar imagen…', () => elegirImagen(n.dataset.eid)))));
  }

  if (tipo === 'html') {
    raiz.append(seccion('Código', h('div', { class: 'fila' }, botonCorto('Editar el HTML de este bloque', () => { cambiarTab('codigo'); E.alcance.value = 'elemento'; sincronizarCodigo(true); }))));
  }

  raiz.append(seccion('Capas',
    h('div', { class: 'fila' },
      botonCorto('Al frente', () => ordenCapas('frente')), botonCorto('Adelante', () => ordenCapas('adelante')),
      botonCorto('Atrás', () => ordenCapas('atras')), botonCorto('Al fondo', () => ordenCapas('fondo')))));
  return raiz;
}

function cambiarFondo(valor, { registrar = true } = {}) {
  const sl = slideActual();
  if (!sl) return;
  const antes = sl.bg || '#ffffff';
  if (antes === valor) return;
  aplicarCambios(sl.id, [], { antes, despues: valor }, { registrar });
}

function panelSlide() {
  P = {};
  const raiz = h('div');
  const color = h('input', { type: 'color', 'aria-label': 'Color de fondo', title: 'Color de fondo' });
  let antes = null;
  color.addEventListener('input', () => { if (antes == null) antes = (slideActual() || {}).bg || '#ffffff'; aplicarFondo(E.stage, color.value); });
  color.addEventListener('change', () => {
    const sl = slideActual();
    if (!sl || antes == null) return;
    sl.bg = antes; // para que cambiarFondo registre el valor anterior correcto
    cambiarFondo(color.value);
    antes = null;
  });
  P.bgColor = color;
  raiz.append(seccion('Fondo de la diapositiva',
    h('div', { class: 'fila' }, h('label', { class: 'num' }, 'Color', color)),
    h('div', { class: 'fondos' }, FONDOS.map((f) => {
      const b = h('button', { class: 'fondo-op', 'aria-label': 'Usar este fondo', title: f.startsWith('#') ? f : 'Degradado' });
      b.style.background = f;
      b.addEventListener('click', () => cambiarFondo(f));
      return b;
    })),
    h('div', { class: 'fila', style: { marginTop: '10px' } }, botonCorto('Aplicar este fondo a todas', async () => {
      const sl = slideActual();
      if (!sl) return;
      if (!(await confirmar('El fondo de esta diapositiva se copiará a todas las demás.', 'Aplicar', '¿Aplicar a todas?'))) return;
      for (const s of S.slides) if (s.id !== sl.id && s.bg !== sl.bg) { s.bg = sl.bg; S.store.actualizarDiapositiva(S.pid, s.id, { bg: sl.bg }); programarMiniatura(s.id); }
      aviso('Fondo aplicado a todas las diapositivas.', 'ok');
    }))));
  raiz.append(seccion('Consejos', h('p', { class: 'vacio-panel' },
    'Haz clic en un elemento para moverlo, redimensionarlo o girarlo. Doble clic en un texto para escribir. ' +
    'Con Mayús al mover se bloquea el eje; con Alt se desactiva el imán. En «Código» puedes editar el HTML.')));
  return raiz;
}

function actualizarPanel() {
  const n = nodoSel();
  const clave = `${S.sid}|${S.sel}|${n ? n.dataset.t : ''}`;
  if (clave !== panelClave) {
    panelClave = clave;
    E.tabDiseno.replaceChildren(n ? panelElemento(n) : panelSlide());
  }
  sincronizarValores();
}

function sincronizarValores() {
  const sl = slideActual();
  const n = nodoSel();
  if (!n) {
    if (P.bgColor && sl && document.activeElement !== P.bgColor) {
      const m = /^#[0-9a-f]{6}$/i.test(sl.bg || '') ? sl.bg : '#ffffff';
      P.bgColor.value = m;
    }
    return;
  }
  if (!P.x) return;
  const c = leerCaja(n);
  const cs = getComputedStyle(n);
  setVal(P.x, r1(c.x)); setVal(P.y, r1(c.y)); setVal(P.w, r1(c.w)); setVal(P.h, r1(c.h)); setVal(P.r, r1(c.r));
  if (P.tam) {
    const fs = parseFloat(cs.fontSize) || 0;
    setVal(P.tam, Math.round(fs * 10) / 10);
    const lh = parseFloat(cs.lineHeight);
    setVal(P.lh, Number.isFinite(lh) && fs ? Math.round((lh / fs) * 100) / 100 : 1.2);
    if (document.activeElement !== P.color) P.color.value = aHex(cs.color);
    const fam = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim().toLowerCase();
    const op = Array.from(P.fuente.options).find((o) => o.value && o.value.toLowerCase().replace(/['"]/g, '').startsWith(fam));
    P.fuente.value = op ? op.value : '';
    P.neg.classList.toggle('activo', parseInt(cs.fontWeight, 10) >= 600);
    P.cur.classList.toggle('activo', cs.fontStyle === 'italic');
    P.sub.classList.toggle('activo', /underline/.test(cs.textDecorationLine));
    const al = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign;
    for (const k of ['left', 'center', 'right']) P['al-' + k].classList.toggle('activo', al === k);
  }
  if (P.fondo && document.activeElement !== P.fondo && !esTransparente(cs.backgroundColor)) P.fondo.value = aHex(cs.backgroundColor);
  const bg = parseFloat(cs.borderTopWidth) || 0;
  setVal(P.bordeGrosor, bg);
  if (document.activeElement !== P.bordeColor && bg > 0) P.bordeColor.value = aHex(cs.borderTopColor);
  const rad = cs.borderTopLeftRadius;
  setVal(P.radio, rad.endsWith('%') ? '' : Math.round(parseFloat(rad) || 0));
  if (document.activeElement !== P.opac) P.opac.value = String(Math.round((parseFloat(cs.opacity) || 1) * 100));
  P.sombra.checked = /drop-shadow/.test(n.style.filter || '');
  if (P.ajuste) P.ajuste.value = n.style.objectFit || 'cover';
}

// ═════════════════════════════════════════════════════════════════════════
//  Panel «Código»
// ═════════════════════════════════════════════════════════════════════════

function estadoCodigo(texto, tipo = '') {
  E.codigoEstado.textContent = texto;
  E.codigoEstado.className = 'codigo-estado' + (tipo ? ' ' + tipo : '');
}

function textoCodigo() {
  const sl = slideActual();
  if (!sl) return '';
  if (E.alcance.value === 'elemento') return S.sel ? serializarElemento(S.sel, sl) : '';
  return serializarCodigo(sl);
}

// Relación entre líneas del código y elementos del lienzo. Cada elemento empieza en una
// línea con «<etiqueta data-eid="…"», así que basta mirar hacia arriba desde el cursor.
const RE_EID = /^\s*<[A-Za-z][\w:-]*\s+data-eid="(e[a-z0-9]+)"/;
const RE_SECCION = /^\s*<\/?section/;

function eidEnLinea(texto, linea) {
  const ls = texto.split('\n');
  if (linea < 0 || linea >= ls.length || RE_SECCION.test(ls[linea])) return null;
  for (let i = linea; i >= 0; i--) {
    if (RE_SECCION.test(ls[i])) return null;
    const m = RE_EID.exec(ls[i]);
    if (m) return m[1];
  }
  return null;
}

function rangoDeEid(texto, id) {
  const ls = texto.split('\n');
  const ini = ls.findIndex((l) => { const m = RE_EID.exec(l); return m && m[1] === id; });
  if (ini < 0) return null;
  let fin = ls.length - 1;
  for (let i = ini + 1; i < ls.length; i++) if (RE_EID.test(ls[i]) || RE_SECCION.test(ls[i])) { fin = i - 1; break; }
  while (fin > ini && !ls[fin].trim()) fin--;
  return { ini, fin };
}

/** Resalta en el código el elemento seleccionado y, si se pide, lleva el cursor hasta él. */
function marcarElementoEnCodigo({ mover = false } = {}) {
  if (!CE || tabActual !== 'codigo') return;
  if (E.alcance.value !== 'slide' || !S.sel) { CE.resaltarRango(null); return; }
  const r = rangoDeEid(CE.getValor(), S.sel);
  if (!r) { CE.resaltarRango(null); if (mover) moverPendiente = true; return; }
  CE.resaltarRango(r.ini, r.fin);
  if (mover && !sincronizandoCursor) {
    const l = CE.cursor().linea;
    if (l < r.ini || l > r.fin) CE.irALinea(r.ini);
  }
}

function alCursorCodigo(info, porUsuario) {
  E.codigoPos.textContent = `Ln ${info.linea + 1}, Col ${info.col}`;
  if (!porUsuario || E.alcance.value !== 'slide') return;
  const id = eidEnLinea(CE.getValor(), info.linea);
  if (id && id !== S.sel && nodoPorId(id)) {
    sincronizandoCursor = true;
    try { seleccionar(id); } finally { sincronizandoCursor = false; }
  }
}

function programarSyncCodigo() {
  if (!CE || tabActual !== 'codigo' || timers.syncCodigo) return;
  timers.syncCodigo = setTimeout(() => { timers.syncCodigo = 0; if (enEditor) sincronizarCodigo(); }, 160);
}

function sincronizarCodigo(forzar = false) {
  if (!CE) return;
  if (tabActual !== 'codigo') { codigoPendiente = true; if (forzar) codigoSucio = false; return; }
  const esEl = E.alcance.value === 'elemento';
  if (esEl && !S.sel) {
    CE.setValor('');
    CE.setDeshabilitado(true, 'Selecciona un elemento en el lienzo para editar su HTML.');
    codigoSucio = false; codigoBase = ''; estadoCodigo('');
    return;
  }
  CE.setDeshabilitado(false);
  const texto = textoCodigo();
  if (codigoSucio && !forzar) {
    if (texto !== codigoBase) estadoCodigo('Alguien cambió esta diapositiva. «Recargar» descarta tu texto y muestra la versión nueva.', 'error');
    return;
  }
  if (CE.tieneFoco() && !forzar) return; // no pisar lo que la persona está escribiendo
  if (CE.getValor() !== texto) CE.setValor(texto);
  codigoBase = texto; codigoSucio = false; codigoPendiente = false;
  if (forzar) estadoCodigo('');
  marcarElementoEnCodigo({ mover: moverPendiente });
  moverPendiente = false;
}

function alCambiarCodigo() {
  codigoSucio = CE.getValor() !== codigoBase;
  if (!codigoSucio) { estadoCodigo(''); return; }
  if (E.autoAplicar.checked) {
    estadoCodigo('Se aplicará al dejar de escribir…');
    clearTimeout(timers.auto);
    timers.auto = setTimeout(() => { if (enEditor && codigoSucio) aplicarCodigo({ auto: true }); }, 900);
  } else {
    estadoCodigo('Cambios sin aplicar · Ctrl+Enter para aplicar');
  }
}

/** Convierte en UN solo paso de deshacer todo lo aplicado automáticamente mientras se escribía. */
function cerrarSesionAuto() {
  const ses = sesionAuto;
  sesionAuto = null;
  if (!ses) return;
  const sl = slidePorId(ses.sid);
  if (!sl) return;
  const cambios = [];
  for (const [id, antes] of ses.antes) {
    const despues = sl.el && sl.el[id] ? { z: sl.el[id].z, h: sl.el[id].h } : null;
    if (!antes && !despues) continue;
    if (antes && despues && antes.z === despues.z && antes.h === despues.h) continue;
    cambios.push({ id, antes, despues });
  }
  const bgAhora = sl.bg || '#ffffff';
  const bg = ses.bgAntes !== undefined && ses.bgAntes !== bgAhora ? { antes: ses.bgAntes, despues: bgAhora } : null;
  if (cambios.length || bg) registrarOp({ sid: ses.sid, cambios, bg });
}

function aplicarCodigo({ auto = false } = {}) {
  const sl = slideActual();
  if (!sl || !CE) return;
  const txt = CE.getValor();
  let cambios = [], bg = null, info;
  if (E.alcance.value === 'elemento') {
    if (!S.sel) return;
    const r = parsearElemento(txt, S.sel, sl);
    if (!r.h) { estadoCodigo(r.avisos[0] || 'El código no contiene un elemento válido.', 'error'); return; }
    const antes = copiaEl(S.sel);
    if (!antes) { estadoCodigo('Ese elemento ya no existe.', 'error'); return; }
    if (antes.h !== r.h) cambios.push({ id: S.sel, antes, despues: { z: antes.z, h: r.h } });
    info = r;
  } else {
    const r = parsearCodigo(txt, sl);
    const ids = new Set([...Object.keys(sl.el || {}), ...Object.keys(r.el)]);
    for (const id of ids) {
      const a = (sl.el || {})[id] || null, d = r.el[id] || null;
      if (!a && !d) continue;
      if (a && d && a.h === d.h && a.z === d.z) continue;
      cambios.push({ id, antes: a ? { z: a.z, h: a.h } : null, despues: d });
    }
    if (r.bg && r.bg !== (sl.bg || '')) bg = { antes: sl.bg || '#ffffff', despues: r.bg };
    if (pesoDiapositiva({ el: r.el, bg: r.bg || sl.bg, notas: sl.notas }) > LIMITE_BYTES) {
      estadoCodigo('Esa diapositiva pesaría demasiado (límite ≈ 1 MB). Quita imágenes incrustadas.', 'error'); return;
    }
    info = r;
  }
  const extra = [...(info.avisos || [])];
  if (info.quitados) extra.push(`Se eliminaron ${info.quitados} etiquetas o atributos no permitidos.`);
  if (!cambios.length && !bg) {
    if (auto) { codigoBase = txt; codigoSucio = false; estadoCodigo(extra.join(' ')); }
    else estadoCodigo(['Sin cambios.', ...extra].join(' '));
    return;
  }
  if (auto) {
    // Se aplica en vivo, pero el historial recibe un único paso al terminar de escribir.
    if (sesionAuto && sesionAuto.sid !== sl.id) cerrarSesionAuto();
    if (!sesionAuto) sesionAuto = { sid: sl.id, antes: new Map(), bgAntes: undefined };
    for (const c of cambios) if (!sesionAuto.antes.has(c.id)) sesionAuto.antes.set(c.id, c.antes);
    if (bg && sesionAuto.bgAntes === undefined) sesionAuto.bgAntes = bg.antes;
    aplicarCambios(sl.id, cambios, bg, { registrar: false });
    actualizarBotonesUndo();
    codigoBase = txt; codigoSucio = false;
    refrescarTrasCambio();
    estadoCodigo(['Aplicado automáticamente.', ...extra].join(' '), 'ok');
    return;
  }
  cerrarSesionAuto();
  aplicarCambios(sl.id, cambios, bg);
  codigoSucio = false;
  refrescarTrasCambio();
  sincronizarCodigo(true);
  estadoCodigo([`Aplicado (${cambios.length} elemento${cambios.length === 1 ? '' : 's'} cambiado${cambios.length === 1 ? '' : 's'}).`, ...extra].join(' '), 'ok');
}

function sincronizarNotas() {
  if (document.activeElement === E.notas) return;
  const sl = slideActual();
  const v = sl ? (sl.notas || '') : '';
  if (E.notas.value !== v) E.notas.value = v;
}

function guardarNotas() {
  clearTimeout(timers.notas);
  const sl = slideActual();
  if (!sl || !enEditor) return;
  const v = E.notas.value;
  if (v === (sl.notas || '')) return;
  sl.notas = v;
  S.store.actualizarDiapositiva(S.pid, sl.id, { notas: v });
}

function cambiarTab(t) {
  tabActual = t;
  pestanaActiva(t);
  $$('.tab', E.panelDer).forEach((b) => { const a = b.dataset.tab === t; b.classList.toggle('activa', a); b.setAttribute('aria-selected', a); });
  E.tabDiseno.hidden = t !== 'diseno';
  E.tabCodigo.hidden = t !== 'codigo';
  E.tabNotas.hidden = t !== 'notas';
  if (t === 'codigo') { sincronizarCodigo(); if (CE) CE.refrescar(); }
  if (t === 'notas') sincronizarNotas();
}

// ═════════════════════════════════════════════════════════════════════════
//  Zoom
// ═════════════════════════════════════════════════════════════════════════

function ajustarEscala() {
  const l = E.lienzo;
  if (!l) return;
  const cs = getComputedStyle(l);
  const dw = l.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const dh = l.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let s = S.zoom === 'ajustar' ? Math.min(dw / ANCHO, dh / ALTO) : parseFloat(S.zoom);
  if (!Number.isFinite(s) || s <= 0.05) return;
  s = Math.min(s, 2);
  S.escala = s;
  E.marco.style.width = ANCHO * s + 'px';
  E.marco.style.height = ALTO * s + 'px';
  E.marco.style.setProperty('--s', String(s));
}

// ═════════════════════════════════════════════════════════════════════════
//  Barra de inserción, compartir, exportar
// ═════════════════════════════════════════════════════════════════════════

function menuTexto(ancla) {
  abrirMenu(ancla, [
    { texto: 'Título', icono: 'T', fn: () => agregarEl(elementoNuevo('titulo', tema()), { editar: true }) },
    { texto: 'Subtítulo', icono: 't', fn: () => agregarEl(elementoNuevo('subtitulo', tema()), { editar: true }) },
    { texto: 'Párrafo', icono: '¶', fn: () => agregarEl(elementoNuevo('cuerpo', tema()), { editar: true }) },
    { texto: 'Lista con viñetas', icono: '•', fn: () => agregarEl(elementoNuevo('lista', tema()), { editar: true }) },
  ]);
}

function menuFormas(ancla) {
  const f = (t, n, i) => ({ texto: n, icono: i, fn: () => agregarEl(elementoNuevo(t, tema())) });
  abrirMenu(ancla, [f('rect', 'Rectángulo', '▭'), f('circulo', 'Círculo', '●'), f('triangulo', 'Triángulo', '▲'),
    f('estrella', 'Estrella', '★'), f('flecha', 'Flecha', '➜'), f('linea', 'Línea', '―')]);
}

function menuImagen(ancla) {
  abrirMenu(ancla, [
    { texto: 'Subir desde mi equipo…', icono: '⇪', fn: () => elegirImagen(null) },
    { texto: 'Desde una dirección web…', icono: '🔗', fn: () => { reemplazoId = null; insertarImagenURL(); } },
  ]);
}

function compartir() {
  const base = location.origin + location.pathname;
  const fila = (etq, url) => {
    const input = h('input', { type: 'text', value: url, readonly: true, 'aria-label': etq });
    input.addEventListener('focus', () => input.select());
    return h('label', { class: 'campo' }, h('span', {}, etq),
      h('div', { class: 'enlace-fila' }, input, h('button', { class: 'btn', onclick: () => copiarTexto(url).then(() => aviso('Enlace copiado', 'ok')) }, 'Copiar')));
  };
  const cuerpo = [
    fila('Para editar', `${base}#presentaciones/${S.pid}`),
    fila('Para presentar (solo lectura)', `${base}#presentar/${S.pid}/1`),
  ];
  if (S.store.modo === 'local') cuerpo.push(h('p', {}, 'Estás en modo local: estos enlaces solo funcionan en este navegador. Configura Firebase para compartir de verdad.'));
  else cuerpo.push(h('p', {}, 'Quien tenga el enlace y acceso a la página podrá editar, según las reglas de Firestore que hayas publicado.'));
  modal({ titulo: 'Compartir presentación', cuerpo, acciones: [{ texto: 'Listo', primario: true, fn: (c) => c(true) }], ancho: 520 });
}

function menuExportar(ancla) {
  abrirMenu(ancla, [
    { texto: 'Descargar como HTML (para presentar sin conexión)', icono: '⇩', fn: () => descargarHTML(S.pres, S.slides) },
    { texto: 'Copia de seguridad (.json)', icono: '⇩', fn: () => descargarJSON(S.pid).catch(() => aviso('No se pudo exportar.', 'error')) },
    { texto: 'Imprimir / guardar como PDF', icono: '🖶', fn: () => imprimir(S.slides) },
  ], { alineado: 'der' });
}

// ═════════════════════════════════════════════════════════════════════════
//  Teclado y portapapeles
// ═════════════════════════════════════════════════════════════════════════

function empujarTeclado(dx, dy) {
  const n = nodoSel();
  if (!n) return;
  const id = n.dataset.eid;
  if (!nudge || nudge.id !== id) nudge = { id, antes: copiaEl(id) };
  const c = leerCaja(n);
  n.style.left = r1(c.x + dx) + 'px';
  n.style.top = r1(c.y + dy) + 'px';
  actualizarOverlay();
  clearTimeout(nudge.t);
  nudge.t = setTimeout(() => { const a = nudge && nudge.antes; nudge = null; terminarGesto(id, a); refrescarTrasCambio(); }, 350);
}

function alTeclear(e) {
  if (!enEditor || hayModal()) return;
  const escribiendo = escribiendoEn(e.target);
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (escribiendo) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); }
    else if (k === 'y') { e.preventDefault(); rehacer(); }
    else if (k === 'd') { e.preventDefault(); duplicarSel(); }
    else if (k === 'c' && S.sel) { copiarSel(); e.preventDefault(); }
    else if (k === 'x' && S.sel) { copiarSel(); eliminarSel(); e.preventDefault(); }
    else if (e.key === ']') { e.preventDefault(); ordenCapas(e.shiftKey ? 'frente' : 'adelante'); }
    else if (e.key === '[') { e.preventDefault(); ordenCapas(e.shiftKey ? 'fondo' : 'atras'); }
    return;
  }
  if (escribiendo) return;
  const paso = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case 'Delete': case 'Backspace': if (S.sel) { e.preventDefault(); eliminarSel(); } break;
    case 'Escape': if (S.sel) seleccionar(null); break;
    case 'ArrowLeft': if (S.sel) { e.preventDefault(); empujarTeclado(-paso, 0); } break;
    case 'ArrowRight': if (S.sel) { e.preventDefault(); empujarTeclado(paso, 0); } break;
    case 'ArrowUp': if (S.sel) { e.preventDefault(); empujarTeclado(0, -paso); } break;
    case 'ArrowDown': if (S.sel) { e.preventDefault(); empujarTeclado(0, paso); } break;
    case 'PageUp': e.preventDefault(); irRelativo(-1); break;
    case 'PageDown': e.preventDefault(); irRelativo(1); break;
    case 'Enter': if (S.sel) { const n = nodoSel(); if (n && n.dataset.t !== 'img' && n.dataset.t !== 'html') { e.preventDefault(); iniciarEdicion(n, false); } } break;
    default:
  }
}

async function alPegar(e) {
  if (!enEditor || hayModal() || escribiendoEn(e.target)) return;
  const archivos = Array.from((e.clipboardData && e.clipboardData.files) || []).filter((f) => f.type.startsWith('image/'));
  if (archivos.length) { e.preventDefault(); reemplazoId = null; await insertarImagenArchivo(archivos[0]); return; }
  let hayEl = !!S.portapapeles;
  if (!hayEl) { try { hayEl = !!localStorage.getItem('pres.portapapeles'); } catch { /* ignorar */ } }
  const txt = e.clipboardData && e.clipboardData.getData('text/plain');
  if (txt && txt.trim() && !hayEl) {
    e.preventDefault();
    agregarEl(htmlTexto(120, 300, 760, esc(txt.trim()).replace(/\n/g, '<br>'), { size: 28, color: tema().fg }));
    return;
  }
  if (hayEl) { e.preventDefault(); pegarEl(); }
}

// ═════════════════════════════════════════════════════════════════════════
//  Cableado de eventos (una sola vez)
// ═════════════════════════════════════════════════════════════════════════

function prepararUnaVez() {
  if (cableado) return;
  cableado = true;

  E.stage.addEventListener('pointerdown', alPresionarLienzo);
  E.stage.addEventListener('dblclick', alDobleClic);
  E.stage.addEventListener('dragstart', (e) => e.preventDefault());
  E.stage.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); });
  E.selbox.addEventListener('pointerdown', alPresionarManija);

  document.addEventListener('keydown', alTeclear);
  document.addEventListener('paste', alPegar);
  addEventListener('pagehide', () => { if (enEditor && S.pid) { vaciarPendientes(); S.store.salirPresencia(S.pid); } });
  addEventListener('beforeunload', (e) => { if (enEditor && S.store.modo === 'firebase' && S.estadoPendiente) { e.preventDefault(); e.returnValue = ''; } });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (enEditor) { ajustarEscala(); actualizarOverlay(); } }).observe(E.lienzo);
  addEventListener('resize', () => { if (enEditor) ajustarEscala(); });

  $('#btn-volver').addEventListener('click', () => { location.hash = '#presentaciones'; });
  $('#btn-deshacer').addEventListener('click', deshacer);
  $('#btn-rehacer').addEventListener('click', rehacer);
  $('#btn-compartir').addEventListener('click', compartir);
  $('#btn-exportar').addEventListener('click', (e) => menuExportar(e.currentTarget));
  $('#btn-presentar').addEventListener('click', () => {
    vaciarPendientes();
    const i = Math.max(0, S.slides.findIndex((s) => s.id === S.sid));
    location.hash = `#presentar/${S.pid}/${i + 1}`;
  });
  $('#btn-panel').addEventListener('click', () => E.panelDer.classList.toggle('abierto'));
  $('#btn-nueva-diap').addEventListener('click', (e) => {
    abrirMenu(e.currentTarget, LAYOUTS.map((l) => ({ texto: l.nombre, icono: '▫', fn: () => nuevaDiapositiva(l.id) })));
  });
  $('#ins-texto').addEventListener('click', (e) => menuTexto(e.currentTarget));
  $('#ins-forma').addEventListener('click', (e) => menuFormas(e.currentTarget));
  $('#ins-imagen').addEventListener('click', (e) => menuImagen(e.currentTarget));
  $('#ins-html').addEventListener('click', () => agregarEl(elementoNuevo('html'), { codigo: true }));
  E.zoom.addEventListener('change', () => { S.zoom = E.zoom.value; ajustarEscala(); actualizarOverlay(); });
  E.inputImagen.addEventListener('change', async () => {
    const f = E.inputImagen.files && E.inputImagen.files[0];
    E.inputImagen.value = '';
    if (f) await insertarImagenArchivo(f); else reemplazoId = null;
  });

  E.titulo.addEventListener('change', () => {
    const t = E.titulo.value.trim();
    if (!t) { E.titulo.value = (S.pres && S.pres.titulo) || ''; return; }
    if (S.pres) S.pres.titulo = t;
    S.store.actualizarPresentacion(S.pid, { titulo: t });
  });
  E.titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') E.titulo.blur(); });

  $$('.tab', E.panelDer).forEach((b) => b.addEventListener('click', () => cambiarTab(b.dataset.tab)));

  // Editor de código (inspirado en Overleaf)
  try { Object.assign(ajustesCE, JSON.parse(localStorage.getItem('pres.ce.v1') || '{}')); } catch { /* ignorar */ }
  const guardarCE = () => { try { localStorage.setItem('pres.ce.v1', JSON.stringify(ajustesCE)); } catch { /* ignorar */ } };
  CE = crearEditorCodigo(E.codigoEd, {
    tam: ajustesCE.tam, ajuste: ajustesCE.ajuste,
    alCambiar: alCambiarCodigo,
    alAplicar: () => aplicarCodigo(),
    alCursor: alCursorCodigo,
    alPerderFoco: () => { cerrarSesionAuto(); if (enEditor) sincronizarCodigo(); },
  });
  E.autoAplicar.checked = !!ajustesCE.auto;
  const pintarAjuste = () => { $('#btn-ajuste').setAttribute('aria-pressed', String(CE.getAjuste())); };
  pintarAjuste();

  iniciarPaneles(() => { CE.refrescar(); ajustarEscala(); actualizarOverlay(); });
  $('#btn-expandir').addEventListener('click', () => {
    const on = alternarModoCodigo();
    if (on) cambiarTab('codigo');
    CE.refrescar(); ajustarEscala(); actualizarOverlay();
    if (on) CE.enfocar();
  });
  $('#btn-fuente-mas').addEventListener('click', () => { ajustesCE.tam = CE.setTam(CE.getTam() + 1); guardarCE(); });
  $('#btn-fuente-menos').addEventListener('click', () => { ajustesCE.tam = CE.setTam(CE.getTam() - 1); guardarCE(); });
  $('#btn-ajuste').addEventListener('click', () => { ajustesCE.ajuste = CE.setAjuste(!CE.getAjuste()); pintarAjuste(); guardarCE(); });
  $('#btn-buscar').addEventListener('click', () => CE.abrirBuscar(false));
  E.autoAplicar.addEventListener('change', () => {
    ajustesCE.auto = E.autoAplicar.checked; guardarCE();
    if (E.autoAplicar.checked) { if (codigoSucio) alCambiarCodigo(); }
    else { clearTimeout(timers.auto); cerrarSesionAuto(); if (codigoSucio) estadoCodigo('Cambios sin aplicar · Ctrl+Enter para aplicar'); }
  });

  E.alcance.addEventListener('change', () => { cerrarSesionAuto(); codigoSucio = false; sincronizarCodigo(true); });
  $('#btn-aplicar').addEventListener('click', () => aplicarCodigo());
  $('#btn-recargar').addEventListener('click', () => { clearTimeout(timers.auto); cerrarSesionAuto(); codigoSucio = false; sincronizarCodigo(true); estadoCodigo('Código recargado.'); });

  E.notas.addEventListener('input', () => { clearTimeout(timers.notas); timers.notas = setTimeout(guardarNotas, 700); });
  E.notas.addEventListener('blur', guardarNotas);
}
