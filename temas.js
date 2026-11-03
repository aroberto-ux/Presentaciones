// Cambio de tema de toda la presentación: recolorea y cambia las fuentes de los elementos que
// usan los colores del tema anterior (los que tienen colores propios no se tocan).

import { nodoDesdeHTML } from './sanitize.js?v=2026.11.03-a';
import { htmlDeNodo, contraste } from './slides.js?v=2026.11.03-a';

const sc = document.createElement('div');

/** Forma canónica de un color CSS para poder compararlos (#1c1f23 = rgb(28, 31, 35)). */
function canon(v) {
  if (!v) return '';
  sc.style.cssText = '';
  sc.style.color = String(v);
  return (sc.style.color || String(v)).toLowerCase().replace(/\s+/g, '');
}
const canonFuente = (v) => String(v || '').toLowerCase().replace(/["'\s]/g, '');
const canonBg = (v) => String(v || '').toLowerCase().replace(/\s+/g, '');

/**
 * Devuelve el HTML del elemento con los colores y fuentes de `de` cambiados por los de `a`
 * (o el mismo texto si no hay nada que cambiar).
 */
export function retemarHtml(html, de, a) {
  const r = nodoDesdeHTML(html);
  if (!r) return html;
  const raiz = r.nodo;
  if (raiz.getAttribute('data-t') === 'estilo') return html;

  const mapa = new Map();
  for (const k of ['fg', 'ac', 'suave']) { const c = canon(de[k]); if (c && !mapa.has(c)) mapa.set(c, a[k]); }
  const fDe = canonFuente(de.fuente), tDe = canonFuente(de.titulo);
  let cambio = false;

  const nodos = [raiz, ...raiz.querySelectorAll('*')];
  for (const n of nodos) {
    if (!n.style || !n.getAttribute('style')) continue;
    const esFormaRaiz = n === raiz && raiz.getAttribute('data-t') === 'forma';
    const props = ['background-color', 'border-color', '--tb-enc', '--tb-linea'];
    if (!esFormaRaiz) props.unshift('color');
    for (const p of props) {
      const v = n.style.getPropertyValue(p);
      if (!v) continue;
      const nuevo = mapa.get(canon(v));
      if (nuevo && canon(nuevo) !== canon(v)) {
        n.style.setProperty(p, nuevo);
        if (p === '--tb-enc' && /^#[0-9a-f]{6}$/i.test(nuevo)) n.style.setProperty('--tb-encfg', contraste(nuevo));
        cambio = true;
      }
    }
    const fam = n.style.getPropertyValue('font-family');
    if (fam) {
      const cf = canonFuente(fam);
      let destino = null;
      if (fDe === tDe) { if (cf === fDe) destino = (parseInt(n.style.fontWeight, 10) || 400) >= 600 ? a.titulo : a.fuente; }
      else if (cf === tDe) destino = a.titulo;
      else if (cf === fDe) destino = a.fuente;
      if (destino && canonFuente(destino) !== cf) { n.style.setProperty('font-family', destino); cambio = true; }
    }
  }
  return cambio ? htmlDeNodo(raiz) : html;
}

/** Fondo de la diapositiva en el tema nuevo (conserva los fondos personalizados). */
export function retemarFondo(bg, de, a) {
  const v = canonBg(bg || '#ffffff');
  if (v === canonBg(de.bg)) return a.bg;
  if (v === canonBg(de.suave)) return /^rgba/i.test(a.suave) ? a.bg : a.suave;
  return bg;
}

/**
 * Cambios para pasar una diapositiva de un tema a otro, en el formato de aplicarCambios:
 * { cambios: [{id, antes, despues}], bg: {antes, despues} | null }
 */
export function retemarDiapositiva(sl, de, a) {
  const cambios = [];
  for (const [id, e] of Object.entries(sl.el || {})) {
    const h = retemarHtml(e.h, de, a);
    if (h !== e.h) cambios.push({ id, antes: { z: e.z, h: e.h }, despues: { z: e.z, h } });
  }
  const antes = sl.bg || '#ffffff';
  const despues = retemarFondo(antes, de, a);
  return { cambios, bg: despues !== antes ? { antes, despues } : null };
}

/** Multiplica el tamaño de letra de un elemento de texto (texto, tabla, fórmula, código). */
export function escalarTextoHtml(html, factor) {
  const r = nodoDesdeHTML(html);
  if (!r) return html;
  const raiz = r.nodo;
  if (!['texto', 'tabla', 'formula', 'codigo'].includes(raiz.getAttribute('data-t'))) return html;
  const nodos = [raiz, ...raiz.querySelectorAll('[style*="font-size"]')];
  let cambio = false;
  for (const n of nodos) {
    const v = n.style && n.style.getPropertyValue('font-size');
    const m = /^([\d.]+)px$/.exec(v || '');
    if (!m) continue;
    n.style.setProperty('font-size', Math.max(8, Math.min(400, Math.round(parseFloat(m[1]) * factor * 10) / 10)) + 'px');
    cambio = true;
  }
  return cambio ? htmlDeNodo(raiz) : html;
}
