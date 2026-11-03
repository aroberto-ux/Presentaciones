// Lista de presentaciones: tarjetas, crear, renombrar, duplicar, eliminar, importar.

import { S, E } from './estado.js?v=2026.11.03-b';
import { h, aviso, pedir, confirmar, abrirMenu, hace } from './ui.js?v=2026.11.03-b';
import { TEMAS, diapositivaDesdeLayout, pintarDiapositiva, sanearImportado } from './slides.js?v=2026.11.03-b';
import { descargarJSON } from './exportar.js?v=2026.11.03-b';

let unsub = null;
let cableado = false;
let ultima = [];
let miniaturaT = null;

export function entrarLista() {
  preparar();
  E.vistaLista.hidden = false;
  document.title = 'Presentaciones';
  if (!unsub) {
    unsub = S.store.suscribirPresentaciones((lista) => { ultima = lista; pintar(); });
  }
}

export function salirLista() {
  if (unsub) { unsub(); unsub = null; }
  E.vistaLista.hidden = true;
  E.rejilla.replaceChildren();
  clearTimeout(miniaturaT);
}

function preparar() {
  if (cableado) return;
  cableado = true;
  document.getElementById('btn-nueva').addEventListener('click', nueva);
  document.getElementById('btn-importar').addEventListener('click', () => E.inputImportar.click());
  E.inputImportar.addEventListener('change', async () => {
    const f = E.inputImportar.files && E.inputImportar.files[0];
    E.inputImportar.value = '';
    if (!f) return;
    try {
      const obj = sanearImportado(JSON.parse(await f.text()));
      const id = await S.store.importar(obj);
      aviso('Presentación importada.', 'ok');
      location.hash = `#presentaciones/${id}`;
    } catch (e) {
      aviso(e.message || 'No se pudo importar el archivo.', 'error', 5000);
    }
  });
}

async function nueva() {
  const select = h('select', { 'aria-label': 'Tema' }, Object.entries(TEMAS).map(([k, t]) => h('option', { value: k }, t.nombre)));
  const r = await pedir({
    titulo: 'Nueva presentación', etiqueta: 'Título', valor: 'Presentación sin título', ok: 'Crear',
    extra: { nodo: h('label', { class: 'campo' }, h('span', {}, 'Tema'), select), select },
  });
  if (!r) return;
  const tema = r.extra.select.value;
  try {
    const id = await S.store.crearPresentacion({ titulo: r.valor, tema }, [diapositivaDesdeLayout('portada', TEMAS[tema])]);
    location.hash = `#presentaciones/${id}`;
  } catch (e) {
    console.error(e);
    aviso('No se pudo crear la presentación. Revisa la conexión y las reglas de Firestore.', 'error', 5000);
  }
}

async function renombrar(p) {
  const r = await pedir({ titulo: 'Cambiar título', etiqueta: 'Título', valor: p.titulo, ok: 'Guardar' });
  if (r) S.store.actualizarPresentacion(p.id, { titulo: r.valor });
}

async function duplicar(p) {
  try {
    const datos = await S.store.exportar(p.id);
    datos.titulo = `Copia de ${p.titulo}`;
    const id = await S.store.importar(sanearImportado(datos));
    aviso('Presentación duplicada.', 'ok');
    location.hash = `#presentaciones/${id}`;
  } catch (e) {
    console.error(e);
    aviso('No se pudo duplicar.', 'error');
  }
}

async function eliminar(p) {
  if (!(await confirmar(`«${p.titulo}» se eliminará para todas las personas. Antes puedes descargar una copia de seguridad.`, 'Eliminar', '¿Eliminar presentación?'))) return;
  await S.store.eliminarPresentacion(p.id);
  aviso('Presentación eliminada.');
}

function tarjeta(p) {
  const mini = h('button', { class: 'tarjeta-mini', 'aria-label': `Abrir ${p.titulo}`, onclick: () => { location.hash = `#presentaciones/${p.id}`; } },
    h('div', { class: 'diap' }));
  mini.dataset.pid = p.id;
  const menu = h('button', { class: 'btn-icono', 'aria-label': `Opciones de ${p.titulo}`, onclick: (e) => {
    abrirMenu(e.currentTarget, [
      { texto: 'Abrir', icono: '✎', fn: () => { location.hash = `#presentaciones/${p.id}`; } },
      { texto: 'Presentar', icono: '▶', fn: () => { location.hash = `#presentar/${p.id}/1`; } },
      { texto: 'Cambiar título', icono: 'T', fn: () => renombrar(p) },
      { texto: 'Duplicar', icono: '⧉', fn: () => duplicar(p) },
      { texto: 'Descargar copia (.json)', icono: '⇩', fn: () => descargarJSON(p.id).catch(() => aviso('No se pudo exportar.', 'error')) },
      '-',
      { texto: 'Eliminar', icono: '🗑', peligro: true, fn: () => eliminar(p) },
    ], { alineado: 'der' });
  } }, '⋯');
  return h('article', { class: 'tarjeta' }, mini,
    h('div', { class: 'tarjeta-info' },
      h('div', { class: 'tarjeta-texto', onclick: () => { location.hash = `#presentaciones/${p.id}`; } },
        h('b', {}, p.titulo || 'Sin título'), h('small', {}, `Editada ${hace(p.actualizado)}`)),
      menu));
}

function pintar() {
  E.listaVacia.hidden = ultima.length > 0;
  E.rejilla.replaceChildren(...ultima.map(tarjeta));
  // La miniatura es la primera diapositiva de cada presentación.
  clearTimeout(miniaturaT);
  miniaturaT = setTimeout(async () => {
    for (const mini of E.rejilla.querySelectorAll('.tarjeta-mini')) {
      const s = await S.store.primeraDiapositiva(mini.dataset.pid).catch(() => null);
      if (s && mini.isConnected) pintarDiapositiva(mini.querySelector('.diap'), s);
    }
  }, 50);
}
