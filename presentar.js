// Modo presentar: pantalla completa, solo lectura, actualizado en vivo.

import { S, E } from './estado.js?v=2026.11.02-a';
import { pintarDiapositiva } from './slides.js?v=2026.11.02-a';
import { aviso } from './ui.js?v=2026.11.02-a';

let activo = false;
let cableado = false;
let sub = null;
let subPres = null;
let pid = null;
let quietoT = null;
let hashPendiente = 0;

function escalar() {
  if (!activo) return;
  const s = Math.min(innerWidth / 1280, innerHeight / 720);
  E.presDiap.style.transform = `scale(${s})`;
}

function pintar(animar = false) {
  const sl = S.slides[S.idx];
  pintarDiapositiva(E.presDiap, sl);
  E.presCont.textContent = S.slides.length ? `${S.idx + 1} / ${S.slides.length}` : '';
  E.presProgreso.style.width = S.slides.length ? `${((S.idx + 1) / S.slides.length) * 100}%` : '0';
  E.presNotas.textContent = (sl && sl.notas) || '(Sin notas en esta diapositiva)';
  if (animar) { E.presDiap.classList.remove('entra'); void E.presDiap.offsetWidth; E.presDiap.classList.add('entra'); }
  escalar();
  try { history.replaceState(null, '', `#presentar/${pid}/${S.idx + 1}`); } catch { /* ignorar */ }
}

function ir(i) {
  const n = Math.max(0, Math.min(S.slides.length - 1, i));
  if (n === S.idx) return;
  S.idx = n;
  pintar(true);
}

function despertar() {
  E.vistaPresentar.classList.remove('quieto');
  clearTimeout(quietoT);
  quietoT = setTimeout(() => E.vistaPresentar && E.vistaPresentar.classList.add('quieto'), 2500);
}

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (E.vistaPresentar.requestFullscreen) E.vistaPresentar.requestFullscreen().catch(() => {});
}

function salir() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  location.hash = `#presentaciones/${pid}/${S.idx + 1}`;
}

function teclas(e) {
  if (!activo) return;
  const k = e.key;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); ir(S.idx + 1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); ir(S.idx - 1); }
  else if (k === 'Home') ir(0);
  else if (k === 'End') ir(S.slides.length - 1);
  else if (k === 'f' || k === 'F') pantallaCompleta();
  else if (k === 'n' || k === 'N') E.presNotas.hidden = !E.presNotas.hidden;
  else if (k === 'Escape' && !document.fullscreenElement) salir();
  despertar();
}

function preparar() {
  if (cableado) return;
  cableado = true;
  document.addEventListener('keydown', teclas);
  addEventListener('resize', escalar);
  E.vistaPresentar.addEventListener('pointermove', despertar);
  E.presDiap.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    const r = E.vistaPresentar.getBoundingClientRect();
    ir(e.clientX - r.left < r.width * 0.3 ? S.idx - 1 : S.idx + 1);
  });
  E.presDiap.addEventListener('dragstart', (e) => e.preventDefault());
  E.vistaPresentar.addEventListener('click', (e) => {
    if (e.target === E.vistaPresentar) ir(S.idx + 1);
  });
  E.presPrev.addEventListener('click', () => ir(S.idx - 1));
  E.presSig.addEventListener('click', () => ir(S.idx + 1));
  E.presFull.addEventListener('click', pantallaCompleta);
  E.presSalir.addEventListener('click', salir);

  // deslizar en pantallas táctiles
  let x0 = null;
  E.vistaPresentar.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  E.vistaPresentar.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) ir(S.idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

export function entrarPresentar(id, n) {
  preparar();
  const idx = Math.max(0, (parseInt(n, 10) || 1) - 1);
  if (activo && pid === id) { ir(idx); return; }
  if (activo) salirPresentar();
  activo = true;
  pid = id;
  S.slides = []; S.idx = idx;
  document.body.classList.add('modo-presentar');
  E.vistaPresentar.hidden = false;
  E.presNotas.hidden = true;
  E.presDiap.replaceChildren();
  despertar();
  let primera = true;
  sub = S.store.suscribirDiapositivas(id, (lista) => {
    if (!activo) return;
    S.slides = lista;
    if (!lista.length) {
      if (primera) { primera = false; E.presCont.textContent = 'Esta presentación no tiene diapositivas.'; }
      return;
    }
    if (S.idx >= lista.length) S.idx = lista.length - 1;
    pintar(false);
    primera = false;
  });
  subPres = S.store.suscribirPresentacion(id, (p) => {
    if (activo && !p) { aviso('Esa presentación no existe o ya no tienes acceso.', 'error'); location.hash = '#presentaciones'; }
    if (p) document.title = `${p.titulo || 'Presentación'} · Presentar`;
  });
}

export function salirPresentar() {
  if (!activo) return;
  activo = false;
  for (const f of [sub, subPres]) if (f) { try { f(); } catch { /* ignorar */ } }
  sub = null; subPres = null;
  clearTimeout(quietoT);
  E.vistaPresentar.hidden = true;
  document.body.classList.remove('modo-presentar');
  document.title = 'Presentaciones';
  S.slides = [];
}
