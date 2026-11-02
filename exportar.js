// Exportar: HTML autónomo, copia de seguridad JSON e impresión / PDF.

import { S } from './estado.js?v=2026.11.02-a';
import { aviso, descargar, nombreArchivo, h, $ } from './ui.js?v=2026.11.02-a';
import { htmlAutonomo, pintarDiapositiva } from './slides.js?v=2026.11.02-a';

let cssCache = null;

async function cssDiapositiva() {
  if (cssCache) return cssCache;
  const r = await fetch('slide.css?v=2026.11.02-a');
  cssCache = await r.text();
  return cssCache;
}

const hayFormulas = (slides) => slides.some((s) => Object.values((s && s.el) || {}).some((e) => e && /data-t="formula"/.test(e.h)));

function base64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

let katexCache = null;

/** CSS de KaTeX con las fuentes incrustadas, para que las fórmulas se vean sin conexión. */
async function cssKatex() {
  if (katexCache) return katexCache;
  let css = await (await fetch('vendor/katex/katex.min.css?v=2026.11.02-a')).text();
  const re = /url\((fonts\/[^)]+\.woff2)\)/g;
  const urls = [...new Set([...css.matchAll(re)].map((m) => m[1]))];
  const datos = {};
  await Promise.all(urls.map(async (u) => {
    const r = await fetch('vendor/katex/' + u);
    datos[u] = 'data:font/woff2;base64,' + base64(await r.arrayBuffer());
  }));
  css = css.replace(re, (_, u) => `url(${datos[u]})`);
  katexCache = css;
  return css;
}

export async function descargarHTML(pres, slides) {
  try {
    let css = await cssDiapositiva();
    if (hayFormulas(slides)) css += '\n' + (await cssKatex());
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
