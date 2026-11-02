// Paneles del editor: divisores arrastrables, plegado y «modo código»
// (código a la izquierda, diapositiva en vivo a la derecha, como en Overleaf).

import { E } from './estado.js?v=2026.11.02-a';

const CLAVE = 'pres.ui.v1';
const MIN_DIAP = 120, MAX_DIAP = 420, DEF_DIAP = 176;
const MIN_DER = 260, DEF_DER = 296, DEF_TAB = 420;
const MIN_CENTRO = 300;
const DIV = 8; // ancho de cada divisor

const ui = { wDiap: DEF_DIAP, wDer: DEF_DER, wTab: DEF_TAB, wCod: 0, colDiap: null, colDer: false, modo: false };
let pestCodigo = false; // la pestaña «Código» está activa (usa su propio ancho)
let cableado = false;
let alCambiar = () => {};

function cargar() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g && typeof g === 'object') {
      for (const k of ['wDiap', 'wDer', 'wTab', 'wCod']) if (Number.isFinite(g[k])) ui[k] = g[k];
      for (const k of ['colDiap', 'colDer']) if (typeof g[k] === 'boolean') ui[k] = g[k];
    }
  } catch { /* ignorar */ }
}

function guardar() {
  try {
    const { modo, ...resto } = ui; // el modo código no se recuerda: se abre siempre en vista normal
    localStorage.setItem(CLAVE, JSON.stringify(resto));
  } catch { /* ignorar */ }
}

const esMovil = () => window.matchMedia('(max-width: 1000px)').matches;
export const modoCodigo = () => ui.modo && !esMovil();

function anchoCuerpo() { return E.cuerpo.getBoundingClientRect().width; }

function anchoDerActual() {
  if (modoCodigo()) return ui.wCod || defCodigo();
  return pestCodigo ? ui.wTab : ui.wDer;
}

function defCodigo() { return Math.round(Math.max(380, Math.min(900, anchoCuerpo() * 0.46))); }

function limitar(w, min, max) { return Math.max(min, Math.min(max, w)); }

function maxDer() {
  const w = anchoCuerpo();
  if (!w) return 4000; // el editor aún está oculto: no se puede medir, no recortar
  return Math.max(MIN_DER, w - (ui.colDiap ? 0 : ui.wDiap) - DIV * 2 - MIN_CENTRO);
}

/** Pinta el estado actual en el DOM. */
export function aplicar() {
  if (!E.cuerpo) return;
  // Sin preferencia guardada: en pantallas estrechas la lista de diapositivas empieza plegada
  // para darle todo el espacio posible a la diapositiva.
  if (ui.colDiap === null) ui.colDiap = window.innerWidth < 1200;
  const modo = modoCodigo();
  const wDer = anchoDerActual();
  E.cuerpo.classList.toggle('modo-codigo', modo);
  E.cuerpo.classList.toggle('col-diap', ui.colDiap);
  E.cuerpo.classList.toggle('col-der', ui.colDer);
  E.cuerpo.style.setProperty('--w-diap', (ui.colDiap ? 0 : ui.wDiap) + 'px');
  // Las miniaturas se adaptan al ancho de la lista (en móvil usan su tamaño fijo).
  const pd = document.getElementById('panel-diap');
  if (pd) {
    if (esMovil()) { pd.style.removeProperty('--tw'); pd.style.removeProperty('--ms'); }
    else {
      const tw = limitar(ui.wDiap - 50, 70, 360);
      pd.style.setProperty('--tw', tw + 'px');
      pd.style.setProperty('--ms', String(tw / 1280));
    }
  }
  E.cuerpo.style.setProperty('--w-der', (ui.colDer ? 0 : limitar(wDer, MIN_DER, maxDer())) + 'px');
  // Flechas de los divisores: indican hacia dónde se pliega / despliega el panel.
  E.chevDiap.textContent = ui.colDiap ? '›' : '‹';
  E.chevDer.textContent = (modo ? !ui.colDer : ui.colDer) ? '‹' : '›';
  E.chevDiap.title = ui.colDiap ? 'Mostrar la lista de diapositivas' : 'Ocultar la lista de diapositivas';
  E.chevDer.title = ui.colDer ? 'Mostrar el panel' : 'Ocultar el panel';
  E.btnExpandir.classList.toggle('activo', modo);
  E.btnExpandir.setAttribute('aria-pressed', String(modo));
  E.btnExpandir.title = modo ? 'Volver a la vista normal' : 'Ampliar el editor: código a un lado y diapositiva al otro';
  E.btnExpandir.textContent = modo ? '⤡' : '⤢';
}

export function alternarModoCodigo(forzar) {
  ui.modo = typeof forzar === 'boolean' ? forzar : !ui.modo;
  if (ui.modo) ui.colDer = false;
  aplicar();
  alCambiar(modoCodigo());
  return modoCodigo();
}

function reiniciar(cual) {
  if (cual === 'diap') { ui.wDiap = DEF_DIAP; ui.colDiap = false; }
  else if (modoCodigo()) { ui.wCod = 0; ui.colDer = false; }
  else if (pestCodigo) { ui.wTab = DEF_TAB; ui.colDer = false; }
  else { ui.wDer = DEF_DER; ui.colDer = false; }
  aplicar(); guardar(); alCambiar(modoCodigo());
}

function fijarDer(w) {
  ui.colDer = false;
  const v = Math.round(limitar(w, MIN_DER, maxDer()));
  if (modoCodigo()) ui.wCod = v; else if (pestCodigo) ui.wTab = v; else ui.wDer = v;
  aplicar();
}

function fijarDiap(w) {
  ui.colDiap = false;
  ui.wDiap = Math.round(limitar(w, MIN_DIAP, MAX_DIAP));
  aplicar();
}


function arrastrar(div, cual) {
  div.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || (e.target.closest && e.target.closest('.chev'))) return;
    e.preventDefault();
    div.setPointerCapture(e.pointerId);
    div.classList.add('activo');
    document.body.classList.add('arrastrando-divisor');
    const rect = E.cuerpo.getBoundingClientRect();
    const mover = (ev) => {
      const x = ev.clientX - rect.left;
      if (cual === 'diap') fijarDiap(x - DIV / 2);
      else if (modoCodigo()) fijarDer(x - (ui.colDiap ? 0 : ui.wDiap) - DIV - DIV / 2);
      else fijarDer(rect.width - x - DIV / 2);
    };
    const fin = () => {
      div.classList.remove('activo');
      document.body.classList.remove('arrastrando-divisor');
      div.removeEventListener('pointermove', mover);
      div.removeEventListener('pointerup', fin);
      div.removeEventListener('pointercancel', fin);
      guardar(); alCambiar(modoCodigo());
    };
    div.addEventListener('pointermove', mover);
    div.addEventListener('pointerup', fin);
    div.addEventListener('pointercancel', fin);
  });
  div.addEventListener('dblclick', (e) => { if (!(e.target.closest && e.target.closest('.chev'))) reiniciar(cual); });
  div.addEventListener('keydown', (e) => {
    const paso = e.shiftKey ? 64 : 16;
    // En vista normal el panel derecho crece hacia la izquierda; en modo código hacia la derecha.
    const sentido = cual === 'diap' ? 1 : (modoCodigo() ? 1 : -1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = (e.key === 'ArrowRight' ? 1 : -1) * sentido * paso;
      if (cual === 'diap') fijarDiap((ui.colDiap ? 0 : ui.wDiap) + d); else fijarDer((ui.colDer ? 0 : anchoDerActual()) + d);
      guardar(); alCambiar(modoCodigo());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); plegar(cual);
    } else if (e.key === 'Home') { e.preventDefault(); reiniciar(cual); }
  });
}

function plegar(cual) {
  if (cual === 'diap') ui.colDiap = !ui.colDiap; else ui.colDer = !ui.colDer;
  aplicar(); guardar(); alCambiar(modoCodigo());
}

/** Avisa de qué pestaña del panel derecho está activa (la de código recuerda su propio ancho). */
export function pestanaActiva(t) {
  const c = t === 'codigo';
  if (c === pestCodigo) return;
  pestCodigo = c;
  if (cableado) { aplicar(); alCambiar(modoCodigo()); }
}

/** `cb(modoCodigoActivo)` se llama cada vez que cambia la disposición. */
export function iniciarPaneles(cb) {
  if (cb) alCambiar = cb;
  if (cableado) { aplicar(); return; }
  cableado = true;
  cargar();
  arrastrar(E.divisorDiap, 'diap');
  arrastrar(E.divisorDer, 'der');
  E.chevDiap.addEventListener('click', (e) => { e.stopPropagation(); plegar('diap'); });
  E.chevDer.addEventListener('click', (e) => { e.stopPropagation(); plegar('der'); });
  addEventListener('resize', () => { aplicar(); });
  aplicar();
}
