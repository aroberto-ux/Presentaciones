// Sanitizador de HTML y CSS para el contenido de las diapositivas.
//
// Como varias personas editan el mismo HTML, todo lo que se guarda y todo lo
// que se pinta pasa por aquí: se permiten etiquetas de presentación y estilos
// en línea, pero nunca scripts, manejadores on*, formularios ni URLs peligrosas.

const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_HTML = 'http://www.w3.org/1999/xhtml';

export const TIPOS = new Set(['texto', 'forma', 'img', 'html', 'formula', 'linea', 'tabla']);

const HTML_OK = new Set(('div span p br hr h1 h2 h3 h4 h5 h6 b strong i em u s del ins mark small sub sup ' +
  'code pre blockquote ul ol li dl dt dd a img figure figcaption table thead tbody tfoot tr td th caption ' +
  'colgroup col section article header footer aside nav main address cite q abbr time kbd').split(' '));

const SVG_OK = new Set(('svg g path circle rect ellipse line polyline polygon text tspan defs ' +
  'lineargradient radialgradient stop clippath').split(' '));

// Estas etiquetas se eliminan junto con su contenido.
const DESCARTAR = new Set(('script style iframe frame frameset object embed applet link meta base form input ' +
  'button textarea select option optgroup noscript template video audio source track canvas math foreignobject ' +
  'use image animate animatetransform animatemotion set title head xmp plaintext noembed noframes dialog map area').split(' '));

const ATTR_GLOBAL = new Set(['title', 'lang', 'dir', 'width', 'height', 'colspan', 'rowspan', 'alt']);
const ATTR_SVG = new Set(('viewbox xmlns d fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray ' +
  'cx cy r rx ry x y x1 x2 y1 y2 points transform offset stop-color stop-opacity opacity fill-opacity ' +
  'stroke-opacity font-size font-weight font-family text-anchor dominant-baseline preserveaspectratio id ' +
  'gradientunits gradienttransform fx fy clip-path').split(' '));

// ── URLs ────────────────────────────────────────────────────────────────

export function urlImagenSegura(u, { interna = false } = {}) {
  const s = String(u).replace(/[\u0000- \u007f]/g, '');
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(s)) return true;
  if (interna && /^#[\w-]{1,40}$/.test(s)) return true;
  return false;
}

function hrefSeguro(u) {
  const s = String(u).replace(/[\u0000- \u007f]/g, '');
  return /^(https?:\/\/|mailto:|#)/i.test(s) && !/^(javascript|data|vbscript):/i.test(s);
}

// ── CSS en línea ────────────────────────────────────────────────────────

export function dividirDecls(css) {
  const out = [];
  let cur = '';
  let depth = 0;
  let q = null;
  for (const ch of css) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Devuelve "prop:valor" si la declaración es segura (o null si no). */
export function declaracionSegura(decl) {
  const i = decl.indexOf(':');
  if (i < 1) return null;
  const prop = decl.slice(0, i).trim().toLowerCase();
  let val = decl.slice(i + 1).trim();
  if (!val || !/^-{0,2}[a-z][a-z0-9-]*$/.test(prop)) return null;
  if (prop === 'behavior' || prop === '-moz-binding' || prop === '-ms-behavior') return null;
  if (/[\\<]/.test(val)) return null;
  const low = val.toLowerCase();
  if (/expression\s*\(|javascript:|vbscript:|@import|-moz-binding|image-set\s*\(|element\s*\(|attr\s*\(/.test(low)) return null;

  const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let m;
  let encontrados = 0;
  while ((m = re.exec(val))) {
    encontrados++;
    if (!urlImagenSegura(m[2], { interna: true })) return null;
  }
  const total = (low.match(/url\s*\(/g) || []).length;
  if (total !== encontrados) return null;

  if (prop === 'position' && /^(fixed|sticky)$/.test(low)) val = 'absolute';
  return `${prop}:${val}`;
}

export function limpiarEstilo(css) {
  return dividirDecls(String(css)).map(declaracionSegura).filter(Boolean).join(';');
}

// ── Atributos ───────────────────────────────────────────────────────────

function valorGlobalSeguro(n, v) {
  if (n === 'width' || n === 'height') return /^[\d.]+(px|%)?$/.test(v);
  if (n === 'colspan' || n === 'rowspan') return /^\d{1,2}$/.test(v);
  if (n === 'dir') return /^(ltr|rtl|auto)$/.test(v);
  return v.length <= 300 && !/[<>]/.test(v);
}

function valorSvgSeguro(n, v) {
  if (n === 'id') return /^[\w-]{1,40}$/.test(v);
  if (n === 'xmlns') return v === NS_SVG;
  if (/url\s*\(/i.test(v)) return /^url\(#[\w-]{1,40}\)$/.test(v.trim());
  return v.length < 2000 && !/javascript:|[<>]/i.test(v);
}

function limpiarAtributos(el, esRaiz, esSvg) {
  const tag = el.localName.toLowerCase();
  for (const a of Array.from(el.attributes)) {
    const n = a.name.toLowerCase();
    const v = a.value;
    if (n === 'style') {
      const s = limpiarEstilo(v);
      if (s) el.setAttribute('style', s); else el.removeAttributeNode(a);
      continue;
    }
    let ok = false;
    if (n.startsWith('on')) ok = false;
    else if (esRaiz && n === 'data-t') ok = TIPOS.has(v);
    else if (esRaiz && n === 'data-eid') ok = /^e[a-z0-9]{3,24}$/.test(v);
    // Fórmulas: el código LaTeX es un dato (KaTeX lo dibuja con trust:false); no se interpreta como HTML.
    else if (esRaiz && n === 'data-tex') ok = el.getAttribute('data-t') === 'formula' && v.length <= 2000;
    else if (esRaiz && n === 'data-d') ok = el.getAttribute('data-t') === 'formula' && v === '1';
    // Líneas y flechas (puntas, grosor, estilo) y tablas (filas alternas).
    else if (esRaiz && n === 'data-puntas') ok = el.getAttribute('data-t') === 'linea' && /^[012]$/.test(v);
    else if (esRaiz && n === 'data-g') ok = el.getAttribute('data-t') === 'linea' && /^\d{1,2}$/.test(v);
    else if (esRaiz && n === 'data-estilo') ok = el.getAttribute('data-t') === 'linea' && /^(solid|dashed|dotted)$/.test(v);
    else if (esRaiz && n === 'data-cebra') ok = el.getAttribute('data-t') === 'tabla' && v === '1';
    else if (ATTR_GLOBAL.has(n)) ok = valorGlobalSeguro(n, v);
    else if (esSvg && ATTR_SVG.has(n)) ok = valorSvgSeguro(n, v);
    else if (tag === 'img' && n === 'src') ok = urlImagenSegura(v);
    else if (tag === 'a' && n === 'href') ok = hrefSeguro(v);
    if (!ok) el.removeAttributeNode(a);
  }
  if (tag === 'a') {
    if (el.hasAttribute('href')) {
      el.setAttribute('rel', 'noopener noreferrer');
      el.setAttribute('target', '_blank');
    }
  }
}

// ── Árbol ───────────────────────────────────────────────────────────────

function limpiarHijos(padre, ctx) {
  for (const h of Array.from(padre.childNodes)) {
    if (h.nodeType === 3) continue;
    if (h.nodeType !== 1) { padre.removeChild(h); continue; }
    const name = h.localName.toLowerCase();
    const ns = h.namespaceURI;
    if (DESCARTAR.has(name)) { padre.removeChild(h); ctx.quitados++; continue; }
    if (ns === NS_SVG) {
      if (!SVG_OK.has(name)) { padre.removeChild(h); ctx.quitados++; continue; }
      limpiarAtributos(h, false, true);
      limpiarHijos(h, ctx);
      continue;
    }
    if (ns !== NS_HTML) { padre.removeChild(h); ctx.quitados++; continue; }
    if (!HTML_OK.has(name)) {
      // Etiqueta desconocida e inocua: se conserva el contenido, sin la etiqueta.
      limpiarHijos(h, ctx);
      while (h.firstChild) padre.insertBefore(h.firstChild, h);
      padre.removeChild(h);
      ctx.quitados++;
      continue;
    }
    limpiarAtributos(h, false, false);
    limpiarHijos(h, ctx);
  }
}

/**
 * Limpia en su sitio un elemento que será raíz de una pieza de la diapositiva.
 * Devuelve el elemento (puede ser uno nuevo si hubo que envolverlo) o null.
 */
export function limpiarRaiz(raiz, ctx = { quitados: 0 }) {
  const name = raiz.localName.toLowerCase();
  if (DESCARTAR.has(name)) { ctx.quitados++; return null; }
  const svg = raiz.namespaceURI === NS_SVG;
  if (svg ? !SVG_OK.has(name) : (raiz.namespaceURI !== NS_HTML || !HTML_OK.has(name))) {
    if (svg || raiz.namespaceURI !== NS_HTML) { ctx.quitados++; return null; }
    const div = raiz.ownerDocument.createElement('div');
    while (raiz.firstChild) div.appendChild(raiz.firstChild);
    const st = raiz.getAttribute('style');
    if (st) div.setAttribute('style', st);
    raiz = div;
    ctx.quitados++;
  }
  limpiarAtributos(raiz, true, svg);
  limpiarHijos(raiz, ctx);
  return raiz;
}

/** Convierte un string HTML en un nodo ya limpio (o null si no queda nada). */
export function nodoDesdeHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html);
  const primero = Array.from(t.content.childNodes).find((n) => n.nodeType === 1);
  if (!primero) return null;
  const ctx = { quitados: 0 };
  const nodo = limpiarRaiz(primero, ctx);
  return nodo ? { nodo, quitados: ctx.quitados } : null;
}
