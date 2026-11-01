// Arranque y enrutador por hash:
//   #presentaciones              → lista
//   #presentaciones/<id>[/<n>]   → editor (diapositiva n)
//   #presentar/<id>[/<n>]        → modo presentar

import { S, E } from './estado.js';
import { iniciarStore } from './store.js';
import { opciones } from './firebase-config.js';
import { $, aviso } from './ui.js';
import { entrarLista, salirLista } from './lista.js';
import { entrarEditor, salirEditor } from './editor.js';
import { entrarPresentar, salirPresentar } from './presentar.js';

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
    alcance: $('#codigo-alcance'), codigo: $('#codigo'), codigoEstado: $('#codigo-estado'), notas: $('#notas'),
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

async function arrancar() {
  referencias();
  document.getElementById('lista-titulo').textContent = opciones.titulo || 'Presentaciones';
  try {
    S.store = await iniciarStore();
  } catch (e) {
    console.error(e);
    document.body.textContent = 'No se pudo iniciar la aplicación: ' + (e && e.message ? e.message : e);
    return;
  }
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
