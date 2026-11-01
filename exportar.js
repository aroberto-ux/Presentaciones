// Exportar: HTML autónomo, copia de seguridad JSON e impresión / PDF.

import { S } from './estado.js';
import { aviso, descargar, nombreArchivo, h, $ } from './ui.js';
import { htmlAutonomo, pintarDiapositiva } from './slides.js';

let cssCache = null;

async function cssDiapositiva() {
  if (cssCache) return cssCache;
  const r = await fetch('slide.css');
  cssCache = await r.text();
  return cssCache;
}

export async function descargarHTML(pres, slides) {
  try {
    const css = await cssDiapositiva();
    const html = htmlAutonomo(pres || {}, slides, css);
    descargar(`${nombreArchivo(pres && pres.titulo)}.html`, html, 'text/html');
    aviso('Descargado. Ábrelo en cualquier navegador y usa las flechas para avanzar.', 'ok', 4500);
  } catch (e) {
    console.error(e);
    aviso('No se pudo generar el HTML.', 'error');
  }
}

export async function descargarJSON(pid) {
  const datos = await S.store.exportar(pid);
  descargar(`${nombreArchivo(datos.titulo)}.json`, JSON.stringify(datos, null, 2), 'application/json');
  aviso('Copia de seguridad descargada.', 'ok');
}

export function imprimir(slides) {
  const raiz = $('#print-root');
  raiz.replaceChildren(...slides.map((s) => {
    const d = h('div', { class: 'diap print-slide' });
    pintarDiapositiva(d, s);
    return d;
  }));
  document.body.classList.add('imprimiendo');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo');
    raiz.replaceChildren();
    removeEventListener('afterprint', limpiar);
  };
  addEventListener('afterprint', limpiar);
  aviso('En el diálogo de impresión elige «Guardar como PDF» y desactiva encabezados y pies de página.', 'info', 5000);
  setTimeout(() => window.print(), 400);
}
