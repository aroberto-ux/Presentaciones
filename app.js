// Arranque y enrutador por hash:
//   #presentaciones              → lista
//   #presentaciones/<id>[/<n>]   → editor (diapositiva n)
//   #presentar/<id>[/<n>]        → modo presentar

import { S, E } from './estado.js?v=2026.11.03-b';
import { iniciarStore } from './store.js?v=2026.11.03-b';
import { opciones } from './firebase-config.js?v=2026.11.03-b';
import { $, aviso, h } from './ui.js?v=2026.11.03-b';
import { VERSION } from './version.js?v=2026.11.03-b';
import { entrarLista, salirLista } from './lista.js?v=2026.11.03-b';
import { entrarEditor, salirEditor } from './editor.js?v=2026.11.03-b';
import { entrarPresentar, salirPresentar } from './presentar.js?v=2026.11.03-b';

function referencias() {
  Object.assign(E, {
    vistaLogin: $('#vista-login'), vistaLista: $('#vista-lista'), vistaEditor: $('#vista-editor'), vistaPresentar: $('#vista-presentar'),
    rejilla: $('#rejilla'), listaVacia: $('#lista-vacia'), inputImportar: $('#input-importar'),
    titulo: $('#ed-titulo'), estado: $('#ed-estado'), presencia: $('#ed-presencia'),
    btnDeshacer: $('#btn-deshacer'), btnRehacer: $('#btn-rehacer'),
    listaDiap: $('#lista-diap'), lienzo: $('#lienzo'), marco: $('#marco'), stage: $('#stage'),
    remotos: $('#remotos'), guiaV: $('#guia-v'), guiaH: $('#guia-h'), selbox: $('#selbox'),
    info: $('#info-diap'), zoom: $('#zoom'), inputImagen: $('#input-imagen'),
    panelDer: $('#panel-der'), tabDiseno: $('#tab-diseno'), tabCodigo: $('#tab-codigo'), tabNotas: $('#tab-notas'),
    alcance: $('#codigo-alcance'), codigoEd: $('#codigo-ed'), codigoPos: $('#codigo-pos'), autoAplicar: $('#auto-aplicar'),
    codigoEstado: $('#codigo-estado'), notas: $('#notas'),
    cuerpo: $('#ed-cuerpo'), divisorDiap: $('#divisor-diap'), divisorDer: $('#divisor-der'),
    chevDiap: $('#chev-diap'), chevDer: $('#chev-der'), btnExpandir: $('#btn-expandir'),
    presDiap: $('#pres-diap'), presNotas: $('#pres-notas'), presCont: $('#pres-cont'), presProgreso: $('#pres-progreso'),
    presPrev: $('#pres-prev'), presSig: $('#pres-sig'), presFull: $('#pres-full'), presSalir: $('#pres-salir'),
  });
}

function ruta() {
  const partes = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [vista, id, n] = partes;
  if (vista === 'presentar' && id) return { vista: 'presentar', id, n };
  if (vista === 'presentaciones' && id) return { vista: 'editor', id, n };
  return { vista: 'lista' };
}

function ocultarTodo() {
  salirLista(); salirEditor(); salirPresentar();
  E.vistaLogin.hidden = true;
}

function enrutar() {
  if (S.store.necesitaLogin) { ocultarTodo(); E.vistaLogin.hidden = false; return; }
  const r = ruta();
  if (r.vista === 'presentar') { salirLista(); salirEditor(); entrarPresentar(r.id, r.n); }
  else if (r.vista === 'editor') { salirLista(); salirPresentar(); E.vistaLogin.hidden = true; entrarEditor(r.id, r.n); }
  else { salirEditor(); salirPresentar(); E.vistaLogin.hidden = true; entrarLista(); }
}

// ── Aviso visible de errores (para saber qué falla sin abrir la consola) ──
let totalFallos = 0;
function mostrarFallo(msg, detalle = '') {
  if (/ResizeObserver loop/i.test(msg)) return;
  totalFallos++;
  let b = document.getElementById('fallo');
  if (!b) { b = h('div', { id: 'fallo', class: 'fallo', role: 'alert' }); document.body.prepend(b); }
  const texto = `Algo falló: ${msg}`;
  const completo = `${texto}\nVersión: ${VERSION}\nNavegador: ${navigator.userAgent}\nPágina: ${location.href}\n${detalle}`;
  b.replaceChildren(
    h('span', { class: 'fallo-msg' }, texto + (totalFallos > 1 ? ` (+${totalFallos - 1} más)` : '')),
    h('span', { class: 'fallo-v' }, `versión ${VERSION}`),
    h('button', { class: 'btn', onclick: (ev) => { if (navigator.clipboard) navigator.clipboard.writeText(completo).then(() => { ev.target.textContent = 'Copiado'; }); } }, 'Copiar detalle'),
    h('button', { class: 'btn', onclick: () => location.reload() }, 'Recargar'),
    h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => { b.remove(); totalFallos = 0; } }, '×'),
  );
}
addEventListener('error', (ev) => mostrarFallo(ev.message || 'error desconocido', ev.error && ev.error.stack ? ev.error.stack : `${ev.filename}:${ev.lineno}`));
addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason;
  mostrarFallo(String((r && r.message) || r), r && r.stack ? r.stack : '');
});

async function arrancar() {
  referencias();
  // Si el navegador mezcla archivos de versiones distintas (caché), se avisa con claridad.
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta && meta.content !== VERSION) {
    mostrarFallo(`el navegador tiene archivos de dos versiones (${meta.content} y ${VERSION}). Recarga con Ctrl+Shift+R.`);
  }
  document.getElementById('lista-titulo').textContent = opciones.titulo || 'Presentaciones';
  try {
    S.store = await iniciarStore();
  } catch (e) {
    console.error(e);
    document.body.textContent = 'No se pudo iniciar la aplicación: ' + (e && e.message ? e.message : e);
    return;
  }
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = `Versión ${VERSION} · ${S.store.modo === 'firebase' ? 'conectado a Firebase' : 'modo local (sin Firebase)'}`;
  if (S.store.modo === 'local') {
    let cerrado = false;
    try { cerrado = sessionStorage.getItem('pres.bannerCerrado') === '1'; } catch { /* ignorar */ }
    $('#banner-local').hidden = cerrado;
    $('#banner-cerrar').addEventListener('click', () => {
      $('#banner-local').hidden = true;
      try { sessionStorage.setItem('pres.bannerCerrado', '1'); } catch { /* ignorar */ }
    });
    if (S.store.errorFirebase) aviso('No se pudo conectar con Firebase; se usa el modo local. Revisa firebase-config.js.', 'error', 7000);
  }
  $('#btn-google').addEventListener('click', async () => {
    try { await S.store.iniciarSesionGoogle(); location.reload(); }
    catch (e) { aviso('No se pudo iniciar sesión: ' + (e.message || e), 'error', 5000); }
  });
  addEventListener('hashchange', enrutar);
  enrutar();
}

arrancar();
