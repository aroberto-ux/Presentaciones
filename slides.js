// Modelo de diapositivas: plantillas, pintado, y conversión código ⇄ elementos.
//
// Una diapositiva se guarda así:
//   { orden, bg: 'css del fondo', notas: '', el: { <id>: { z: 1, h: '<div …>…</div>' } } }
// Cada elemento es un trozo de HTML con posición absoluta sobre un lienzo de 1280×720.

import { nodoDesdeHTML, limpiarRaiz, declaracionSegura, limpiarEstilo, dividirDecls, analizarCss, cssATexto, cssBonito, limpiarCss, nsDeCss } from './sanitize.js?v=2026.11.02-b';
import { pintarFormula } from './formula.js?v=2026.11.02-b';
import { pintarCodigo, textoDeCodigo } from './resaltar.js?v=2026.11.02-b';

export const ANCHO = 1280;
export const ALTO = 720;
export const LIMITE_BYTES = 950000; // Firestore admite ~1 MiB por documento

export function nuevoId() {
  return 'e' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export const r1 = (n) => Math.round(n * 10) / 10;

// ── Temas y plantillas ──────────────────────────────────────────────────

const SANS = "'Inter',system-ui,sans-serif";

export const TEMAS = {
  claro: { nombre: 'Claro', bg: '#ffffff', fg: '#1c1f23', ac: '#1f7a4d', suave: '#eaf3ee', fuente: SANS, titulo: SANS },
  oscuro: { nombre: 'Oscuro', bg: '#14181d', fg: '#f2f4f6', ac: '#5ad19a', suave: '#232a32', fuente: SANS, titulo: SANS },
  verde: {
    nombre: 'Verde institucional', bg: 'linear-gradient(135deg,#0b3d2a,#1f7a4d)', fg: '#ffffff', ac: '#f2c94c',
    suave: 'rgba(255,255,255,.14)', fuente: SANS, titulo: "'Poppins',system-ui,sans-serif",
  },
  calido: {
    nombre: 'Cálido', bg: '#fbf6ee', fg: '#2b2118', ac: '#c2410c', suave: '#f1e4cf',
    fuente: "'Lora',Georgia,serif", titulo: "'Playfair Display',Georgia,serif",
  },
};

export function htmlTexto(x, y, w, contenido, o = {}) {
  const { size = 28, weight = 400, color = '#1c1f23', align = 'left', font, lh = 1.3, extra = '' } = o;
  return `<div data-t="texto" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;` +
    `font-weight:${weight};color:${color};text-align:${align};line-height:${lh}` +
    `${font ? ';font-family:' + font : ''}${extra ? ';' + extra : ''}">${contenido}</div>`;
}

const FORMAS = {
  rect: 'border-radius:12px',
  circulo: 'border-radius:50%',
  triangulo: 'clip-path:polygon(50% 0,0 100%,100% 100%)',
  estrella: 'clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
  flecha: 'clip-path:polygon(0 35%,65% 35%,65% 10%,100% 50%,65% 90%,65% 65%,0 65%)',
  linea: 'border-radius:4px',
  rombo: 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)',
  hexagono: 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
};

export function htmlForma(tipo, x, y, w, h, color, extra = '') {
  return `<div data-t="forma" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
    `background:${color};${FORMAS[tipo] || FORMAS.rect};display:flex;align-items:center;justify-content:center;` +
    `color:#ffffff;font-size:28px;text-align:center${extra ? ';' + extra : ''}"></div>`;
}

export function htmlImagen(src, x, y, w, h) {
  return `<img data-t="img" src="${src}" alt="" style="position:absolute;left:${x}px;top:${y}px;` +
    `width:${w}px;height:${h}px;object-fit:cover">`;
}

export function htmlBloque(x, y) {
  return `<div data-t="html" style="position:absolute;left:${x}px;top:${y}px;width:460px;height:220px;` +
    `background:#f3f4f6;color:#1c1f23;padding:20px;font-size:24px;border-radius:12px">` +
    `<h3 style="margin:0 0 8px">Bloque HTML</h3><p style="margin:0">Edita su código en la pestaña «Código».</p></div>`;
}

/** Color de texto legible (oscuro o claro) sobre un fondo dado en hexadecimal. */
export function contraste(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#14181d' : '#ffffff';
}

/** Interior de una línea o flecha: se rehace cuando cambian las puntas, el grosor o el estilo. */
export function interiorLinea(puntas, g, estilo) {
  const hw = Math.max(14, Math.round(g * 3.5)), hh = Math.max(10, Math.round(g * 2.2));
  const punta = (borde) => `<div style="flex:none;width:0;height:0;border-top:${hh}px solid transparent;` +
    `border-bottom:${hh}px solid transparent;border-${borde}:${hw}px solid currentColor"></div>`;
  const cuerpo = estilo === 'solid'
    ? `<div style="flex:1;min-width:0;height:${g}px;background:currentColor;border-radius:${g / 2}px"></div>`
    : `<div style="flex:1;min-width:0;height:0;border-top:${g}px ${estilo} currentColor"></div>`;
  return (puntas === 2 ? punta('right') : '') + cuerpo + (puntas >= 1 ? punta('left') : '');
}

/** Línea o flecha (0 = sin puntas, 1 = al final, 2 = en ambos extremos). Se gira con el asa superior. */
export function htmlLinea(x, y, w, color, { puntas = 1, g = 6, estilo = 'solid' } = {}) {
  const hh = Math.max(10, Math.round(g * 2.2));
  return `<div data-t="linea" data-puntas="${puntas}" data-g="${g}" data-estilo="${estilo}" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${w}px;height:${hh * 2}px;display:flex;align-items:center;color:${color}">` +
    `${interiorLinea(puntas, g, estilo)}</div>`;
}

/** Tabla editable: la primera fila es el encabezado. */
export function htmlTabla(filas, cols, t = TEMAS.claro, x = 120, y = 200) {
  const w = Math.min(1040, Math.max(480, cols * 220));
  const ac = /^#[0-9a-f]{6}$/i.test(t.ac) ? t.ac : '#1f7a4d';
  let trs = '';
  for (let i = 0; i < filas; i++) {
    let celdas = '';
    for (let j = 0; j < cols; j++) celdas += i === 0 ? `<th>Encabezado ${j + 1}</th>` : '<td>Dato</td>';
    trs += `<tr>${celdas}</tr>`;
  }
  return `<div data-t="tabla" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:26px;color:${t.fg};` +
    `--tb-enc:${ac};--tb-encfg:${contraste(ac)}"><table style="width:100%"><tbody>${trs}</tbody></table></div>`;
}

const escAttrHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escTexto = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** CSS propio de la diapositiva: un elemento invisible con las reglas ya filtradas. */
export function htmlEstilo(css) {
  return `<div data-t="estilo" data-css="${escAttrHtml(css)}" style="position:absolute;left:0px;top:0px;display:none"></div>`;
}
export const esEstilo = (h) => /data-t="estilo"/.test(h || '');

export const CODIGO_EJEMPLO = 'def saludar(nombre):\n    mensaje = f"Hola, {nombre}"\n    return mensaje\n\nprint(saludar("mundo"))';

/** Bloque de código con colores. El texto va dentro de un <pre>; los colores se generan al mostrarlo. */
export function htmlCodigo(x, y, src = CODIGO_EJEMPLO, { lang = 'python', tema = 'oscuro', titulo = 'ejemplo.py', w = 760 } = {}) {
  return `<div data-t="codigo" data-lang="${lang}" data-tema="${tema}" data-nums="1" data-barra="1" data-titulo="${escAttrHtml(titulo)}" ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:24px"><pre>\n${escTexto(src)}</pre></div>`;
}

/** Fórmula LaTeX: solo se guarda el código; KaTeX la dibuja al mostrarla. */
export function htmlFormula(x, y, tex, { size = 64, color = '#1c1f23', display = false } = {}) {
  const t = String(tex).replace(/"/g, '&quot;');
  return `<div data-t="formula" data-tex="${t}"${display ? ' data-d="1"' : ''} style="position:absolute;left:${x}px;top:${y}px;` +
    `font-size:${size}px;color:${color}"></div>`;
}

/** Elementos que se insertan desde la barra. */
export function elementoNuevo(tipo, t = TEMAS.claro) {
  const tb = /^tabla:(\d+)x(\d+)$/.exec(tipo);
  if (tb) return htmlTabla(Math.min(30, +tb[1]), Math.min(12, +tb[2]), t);
  switch (tipo) {
    case 'codigo': return htmlCodigo(240, 200);
    case 'linea-recta': return htmlLinea(380, 340, 520, t.ac, { puntas: 0 });
    case 'flecha-linea': return htmlLinea(380, 340, 520, t.ac, { puntas: 1 });
    case 'flecha-doble': return htmlLinea(380, 340, 520, t.ac, { puntas: 2 });
    case 'linea-punteada': return htmlLinea(380, 340, 520, t.ac, { puntas: 0, estilo: 'dashed' });
    case 'rombo': return htmlForma('rombo', 520, 240, 260, 240, t.ac);
    case 'hexagono': return htmlForma('hexagono', 500, 240, 280, 240, t.ac);
    case 'formula': return htmlFormula(420, 280, 'E = mc^{2}', { color: t.fg });
    case 'titulo': return htmlTexto(120, 90, 1040, 'Título', { size: 64, weight: 700, color: t.fg, font: t.titulo, lh: 1.15 });
    case 'subtitulo': return htmlTexto(120, 200, 1040, 'Subtítulo', { size: 36, weight: 500, color: t.fg, font: t.fuente });
    case 'cuerpo': return htmlTexto(120, 300, 760, 'Escribe aquí tu texto', { size: 28, color: t.fg, font: t.fuente });
    case 'lista':
      return htmlTexto(120, 300, 760, '<ul><li>Primer punto</li><li>Segundo punto</li><li>Tercer punto</li></ul>',
        { size: 30, color: t.fg, font: t.fuente, lh: 1.5 });
    case 'rect': return htmlForma('rect', 460, 250, 360, 220, t.ac);
    case 'circulo': return htmlForma('circulo', 520, 240, 240, 240, t.ac);
    case 'triangulo': return htmlForma('triangulo', 520, 240, 260, 230, t.ac);
    case 'estrella': return htmlForma('estrella', 520, 240, 240, 230, t.ac);
    case 'flecha': return htmlForma('flecha', 440, 290, 400, 140, t.ac);
    case 'linea': return htmlForma('linea', 400, 350, 480, 8, t.ac);
    case 'html': return htmlBloque(400, 250);
    default: return htmlTexto(120, 300, 760, 'Texto', { color: t.fg });
  }
}

export const LAYOUTS = [
  { id: 'portada', nombre: 'Portada' },
  { id: 'titulo-texto', nombre: 'Título y lista' },
  { id: 'dos-columnas', nombre: 'Dos columnas' },
  { id: 'imagen-texto', nombre: 'Imagen y texto' },
  { id: 'seccion', nombre: 'Sección' },
  { id: 'blanco', nombre: 'En blanco' },
];

function construirLayout(id, t) {
  const tit = (x, y, w, txt, size = 52) => htmlTexto(x, y, w, txt, { size, weight: 700, color: t.fg, font: t.titulo, lh: 1.15 });
  const cuerpo = (x, y, w, txt, size = 30) => htmlTexto(x, y, w, txt, { size, color: t.fg, font: t.fuente, lh: 1.5 });
  const barra = (x, y) => htmlForma('rect', x, y, 96, 8, t.ac, 'border-radius:4px');
  switch (id) {
    case 'portada':
      return { bg: t.bg, els: [
        barra(96, 228),
        tit(96, 258, 1088, 'Título de la presentación', 72),
        htmlTexto(96, 420, 1088, 'Subtítulo o nombre de quien presenta', { size: 34, color: t.fg, font: t.fuente, extra: 'opacity:.8' }),
      ] };
    case 'titulo-texto':
      return { bg: t.bg, els: [
        tit(80, 56, 1120, 'Título de la diapositiva'),
        barra(80, 140),
        cuerpo(80, 190, 1120, '<ul><li>Primer punto importante</li><li>Segundo punto importante</li><li>Tercer punto importante</li></ul>', 34),
      ] };
    case 'dos-columnas':
      return { bg: t.bg, els: [
        tit(80, 56, 1120, 'Título de la diapositiva'),
        barra(80, 140),
        cuerpo(80, 190, 540, '<b>Columna izquierda</b><br>Escribe aquí el contenido de esta columna.'),
        cuerpo(660, 190, 540, '<b>Columna derecha</b><br>Escribe aquí el contenido de esta columna.'),
      ] };
    case 'imagen-texto':
      return { bg: t.bg, els: [
        htmlForma('rect', 0, 0, 600, 720, t.suave, 'border-radius:0;font-size:26px;opacity:.9').replace('></div>', `><span style="color:${t.fg};opacity:.6">Imagen</span></div>`),
        tit(660, 120, 540, 'Título', 56),
        barra(660, 200),
        cuerpo(660, 240, 540, 'Describe aquí la imagen o el tema de esta diapositiva.', 28),
      ] };
    case 'seccion':
      return { bg: t.suave.startsWith('rgba') ? t.bg : t.suave, els: [
        htmlTexto(96, 250, 1088, '01', { size: 120, weight: 800, color: t.ac, font: t.titulo, lh: 1 }),
        tit(96, 400, 1088, 'Nombre de la sección', 60),
      ] };
    default:
      return { bg: t.bg, els: [] };
  }
}

/** Datos de una diapositiva nueva a partir de una plantilla. */
export function diapositivaDesdeLayout(layoutId, tema = TEMAS.claro) {
  const { bg, els } = construirLayout(layoutId, tema);
  const el = {};
  els.forEach((h, i) => {
    const limpio = limpiarHtmlElemento(h);
    if (limpio) el[nuevoId()] = { z: i + 1, h: limpio };
  });
  return { bg, el, notas: '' };
}

// ── Nodos ───────────────────────────────────────────────────────────────

const ID_OK = /^e[a-z0-9]{3,24}$/;

/** Serializa un nodo del editor (sin atributos de edición, ya limpio). */
export function htmlDeNodo(nodo) {
  const c = nodo.cloneNode(true);
  for (const a of ['data-eid', 'contenteditable', 'spellcheck', 'data-sel']) c.removeAttribute(a);
  const tipo = c.getAttribute('data-t');
  if (tipo === 'formula' || tipo === 'estilo') c.replaceChildren(); // lo dibujado (KaTeX, <style>) nunca se guarda
  else if (tipo === 'codigo') {
    const src = textoDeCodigo(c);
    const pre = document.createElement('pre');
    pre.textContent = '\n' + src; // el analizador HTML descarta el primer salto de línea de un <pre>
    c.replaceChildren(pre);
  }
  c.classList.remove('visto'); // estado de las animaciones al presentar, no forma parte del contenido
  if (!c.getAttribute('class')) c.removeAttribute('class');
  c.style.zIndex = '';
  if (!c.getAttribute('style')) c.removeAttribute('style');
  const limpio = limpiarRaiz(c, { quitados: 0 });
  return limpio ? limpio.outerHTML : '';
}

/** Limpia un string HTML de un elemento y lo devuelve normalizado (o null). */
export function limpiarHtmlElemento(html) {
  const r = nodoDesdeHTML(html);
  if (!r) return null;
  ajustarPosicion(r.nodo, 0);
  return htmlDeNodo(r.nodo);
}

function ajustarPosicion(n, i) {
  n.style.position = 'absolute';
  if (!n.style.left) n.style.left = '80px';
  if (!n.style.top) n.style.top = `${80 + i * 40}px`;
  const t = n.getAttribute('data-t');
  if (!t) n.setAttribute('data-t', n.localName === 'img' ? 'img' : 'html');
}

/** Crea el nodo vivo de un elemento (limpio otra vez al pintar, por seguridad). */
export function construirNodo(h, id, z) {
  const r = nodoDesdeHTML(h);
  if (!r) return null;
  const n = r.nodo;
  n.setAttribute('data-eid', id);
  n.style.position = 'absolute';
  n.style.zIndex = String(z);
  n.__h = h;
  const tipo = n.getAttribute('data-t');
  if (tipo === 'formula') pintarFormula(n);
  else if (tipo === 'codigo') pintarCodigo(n);
  else if (tipo === 'estilo') {
    const css = n.getAttribute('data-css') || '';
    const ns = nsDeCss(css);
    n.dataset.ns = ns;
    const st = document.createElement('style');
    st.textContent = cssATexto(analizarCss(css), ns);
    n.append(st);
  }
  return n;
}

export function aplicarFondo(nodo, bg) {
  const valor = bg || '#ffffff';
  nodo.style.background = declaracionSegura('background:' + valor) ? valor : '#ffffff';
}

export function idsOrdenados(slide) {
  const el = (slide && slide.el) || {};
  return Object.keys(el).sort((a, b) => (el[a].z - el[b].z) || (a < b ? -1 : 1));
}

/** Los estilos propios de la diapositiva se limitan a su contenedor con data-ns. */
function fijarNs(cont) {
  const est = Array.from(cont.children).find((c) => c.dataset && c.dataset.t === 'estilo');
  if (est && est.dataset.ns) cont.setAttribute('data-ns', est.dataset.ns); else cont.removeAttribute('data-ns');
}

/** Reconstruye por completo un contenedor .diap (miniaturas, presentar, imprimir). */
export function pintarDiapositiva(cont, slide) {
  cont.replaceChildren();
  aplicarFondo(cont, slide && slide.bg);
  if (!slide) { fijarNs(cont); return; }
  for (const id of idsOrdenados(slide)) {
    const n = construirNodo(slide.el[id].h, id, slide.el[id].z);
    if (n) cont.appendChild(n);
  }
  fijarNs(cont);
}

/** Actualiza el lienzo del editor tocando solo lo que cambió. */
export function reconciliar(stage, slide, ocupados = new Set()) {
  aplicarFondo(stage, slide && slide.bg);
  const els = (slide && slide.el) || {};
  const existentes = new Map();
  for (const c of Array.from(stage.children)) if (c.dataset && c.dataset.eid) existentes.set(c.dataset.eid, c);
  for (const [id, n] of existentes) if (!(id in els) && !ocupados.has(id)) n.remove();
  for (const id of idsOrdenados(slide)) {
    const { z, h } = els[id];
    const viejo = existentes.get(id);
    if (viejo) {
      viejo.style.zIndex = String(z);
      if (ocupados.has(id) || viejo.__h === h) continue;
    }
    const n = construirNodo(h, id, z);
    if (!n) continue;
    if (viejo) viejo.replaceWith(n); else stage.appendChild(n);
  }
  fijarNs(stage);
}

// ── Geometría ───────────────────────────────────────────────────────────

export function leerCaja(n) {
  const s = n.style;
  const f = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const x = f(s.left) ?? n.offsetLeft ?? 0;
  const y = f(s.top) ?? n.offsetTop ?? 0;
  const w = n.offsetWidth || f(s.width) || 0;
  const h = n.offsetHeight || f(s.height) || 0;
  const m = /rotate\((-?[\d.]+)deg\)/.exec(s.transform || '');
  return { x, y, w, h, r: m ? parseFloat(m[1]) : 0 };
}

export function fijarRotacion(n, deg) {
  let t = (n.style.transform || '').replace(/rotate\([^)]*\)/, '').trim();
  if (deg) t = (t + ` rotate(${deg}deg)`).trim();
  n.style.transform = t;
}

// ── Código ⇄ elementos ──────────────────────────────────────────────────

const RE_DATA = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{300,}/g;

// Las imágenes incrustadas se numeran en el orden en que aparecen en el código que se muestra.
function datosEn(id, h) {
  const r = nodoDesdeHTML(h);
  return r ? (bonito(r.nodo, id).match(RE_DATA) || []) : [];
}

function abreviar(h, id) {
  let i = 0;
  return h.replace(RE_DATA, () => `data:imagen-incrustada:${id}:${i++}`);
}

function restaurar(texto, previos) {
  return texto.replace(/data:imagen-incrustada:(e[a-z0-9]+):(\d+)/g, (_, id, i) => {
    const p = previos[id];
    return (p && datosEn(id, p.h)[Number(i)]) || '';
  });
}

function sangrar(txt, pref) {
  return txt.split('\n').map((l) => pref + l).join('\n');
}

const VACIAS = new Set(['img', 'br', 'hr', 'col']);
const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** HTML legible de un elemento: atributos primero y el estilo con una propiedad por línea. */
function bonito(nodo, id) {
  const tag = nodo.localName;
  const attrs = Array.from(nodo.attributes).filter((a) => a.name !== 'data-eid' && a.name !== 'style' && a.name !== 'data-t');
  const t = nodo.getAttribute('data-t');
  const partes = [`data-eid="${id}"`];
  if (t) partes.push(`data-t="${escAttr(t)}"`);
  for (const a of attrs) partes.push(`${a.name}="${escAttr(a.value)}"`);
  const st = limpiarEstilo(nodo.getAttribute('style') || '');
  let abre = `<${tag} ${partes.join(' ')}`;
  if (st) {
    const decls = dividirDecls(st).map((d) => d.trim()).filter(Boolean);
    abre += ` style="\n${decls.map((d) => `  ${escAttr(d)};`).join('\n')}\n"`;
  }
  abre += '>';
  return VACIAS.has(tag) ? abre : `${abre}${nodo.innerHTML}</${tag}>`;
}

function conId(id, h) {
  const r = nodoDesdeHTML(h);
  if (!r) return '';
  return abreviar(bonito(r.nodo, id), id);
}

/** Reglas CSS (ya filtradas) del elemento de estilo de la diapositiva, o ''. */
function cssDeSlide(slide) {
  for (const id of idsOrdenados(slide)) {
    const h = slide.el[id].h;
    if (!esEstilo(h)) continue;
    const r = nodoDesdeHTML(h);
    return r ? (r.nodo.getAttribute('data-css') || '') : '';
  }
  return '';
}

export function serializarCodigo(slide) {
  const ids = idsOrdenados(slide);
  const partes = ids.filter((id) => !esEstilo(slide.el[id].h)).map((id) => conId(id, slide.el[id].h)).filter(Boolean);
  const css = cssDeSlide(slide);
  if (css) partes.unshift(`<style>\n${cssBonito(analizarCss(css))}\n</style>`);
  const bg = String(slide.bg || '#ffffff').replace(/"/g, "'");
  return `<section style="background:${bg}">\n${partes.map((p) => sangrar(p, '  ')).join('\n\n')}\n</section>`;
}

export function serializarElemento(id, slide) {
  const e = slide.el && slide.el[id];
  return e ? conId(id, e.h) : '';
}

function parsearHtml(texto) {
  return new DOMParser().parseFromString('<!doctype html><body>' + texto, 'text/html').body;
}

function avisosDe(texto) {
  const av = [];
  if (/<script/i.test(texto)) av.push('Los <script> no se permiten y se eliminaron.');
  if (/\son[a-z]+\s*=/i.test(texto)) av.push('Se quitaron los atributos de eventos (onclick, etc.).');
  return av;
}

/** Interpreta el código de toda la diapositiva. */
export function parsearCodigo(texto, slide) {
  const previos = (slide && slide.el) || {};
  texto = restaurar(texto, previos);
  const body = parsearHtml(texto);
  // <style> se admite solo con @keyframes y reglas simples; se guarda aparte como CSS de la diapositiva.
  const estilos = Array.from(body.querySelectorAll('style'));
  const cssTexto = estilos.map((s) => s.textContent).join('\n');
  estilos.forEach((s) => s.remove());
  const hijosBody = Array.from(body.childNodes).filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
  let bg = null;
  let hijos = hijosBody;
  if (hijosBody.length === 1 && hijosBody[0].nodeType === 1 && hijosBody[0].localName === 'section') {
    const sec = hijosBody[0];
    const st = limpiarEstilo(sec.getAttribute('style') || '');
    const m = /(?:^|;)background(?:-color|-image)?:([^;]+)/i.exec(st);
    if (m) bg = m[1].trim();
    hijos = Array.from(sec.childNodes).filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
  }
  const el = {};
  const usados = new Set();
  let z = 0;
  let quitados = 0;
  hijos.forEach((hijo, i) => {
    let nodo = hijo;
    if (hijo.nodeType === 3) {
      nodo = body.ownerDocument.createElement('div');
      nodo.setAttribute('data-t', 'texto');
      nodo.setAttribute('style', 'width:600px;font-size:28px');
      nodo.textContent = hijo.textContent.trim();
    }
    let id = nodo.getAttribute('data-eid');
    if (!ID_OK.test(id || '') || usados.has(id)) id = nuevoId();
    const ctx = { quitados: 0 };
    const limpio = limpiarRaiz(nodo, ctx);
    quitados += ctx.quitados;
    if (!limpio) return;
    ajustarPosicion(limpio, i);
    const h = htmlDeNodo(limpio);
    if (!h) return;
    usados.add(id);
    el[id] = { z: ++z, h };
  });
  const avisos = avisosDe(texto);
  const css = limpiarCss(cssTexto);
  if (css) {
    const previo = Object.keys(previos).find((k) => esEstilo(previos[k].h));
    const idE = previo || nuevoId();
    const h = limpiarHtmlElemento(htmlEstilo(css));
    if (h) el[idE] = { z: previo ? previos[previo].z : 0, h };
    if (analizarCss(cssTexto).length < (cssTexto.match(/\{/g) || []).length / 2) {
      avisos.push('En <style> solo se permiten @keyframes y reglas con selectores simples; lo demás se quitó.');
    }
  } else if (cssTexto.trim()) {
    avisos.push('En <style> solo se permiten @keyframes y reglas con selectores simples (sin @media ni @import).');
  }
  return { bg, el, quitados, avisos };
}

/** Interpreta el código de un solo elemento. Devuelve su nuevo HTML. */
export function parsearElemento(texto, id, slide) {
  const previos = (slide && slide.el) || {};
  texto = restaurar(texto, previos);
  const body = parsearHtml(texto);
  const nodos = Array.from(body.childNodes).filter((n) => n.nodeType === 1);
  if (nodos.length === 0) return { h: null, quitados: 0, avisos: ['No hay ningún elemento en el código.'] };
  const ctx = { quitados: 0 };
  const limpio = limpiarRaiz(nodos[0], ctx);
  if (!limpio) return { h: null, quitados: ctx.quitados, avisos: avisosDe(texto) };
  ajustarPosicion(limpio, 0);
  const avisos = avisosDe(texto);
  if (nodos.length > 1) avisos.push('Solo se usó el primer elemento; para varios, edita la diapositiva completa.');
  return { h: htmlDeNodo(limpio), quitados: ctx.quitados, avisos };
}

export function pesoDiapositiva(slide) {
  const s = JSON.stringify((slide && slide.el) || {}) + (slide && slide.bg || '') + (slide && slide.notas || '');
  return Math.round(s.length * 1.05);
}

// ── Exportar / importar ─────────────────────────────────────────────────

function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Un único archivo HTML que se puede abrir en cualquier lugar para presentar. */
export function htmlAutonomo(pres, slides, cssDiapositiva) {
  const secciones = slides.map((s) => {
    const d = document.createElement('div');
    d.className = 'diap anima';
    pintarDiapositiva(d, s);
    return d.outerHTML;
  }).join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(pres.titulo || 'Presentación')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Lora:wght@400;600&family=Roboto+Slab:wght@400;700&family=Space+Grotesk:wght@400;600;700&family=Caveat:wght@500;700&display=swap" rel="stylesheet">
<style>
${cssDiapositiva}
html,body{margin:0;height:100%;background:#000;overflow:hidden}
.diap{position:absolute;left:50%;top:50%;margin:-360px 0 0 -640px;display:none;transform-origin:center center}
.diap.act{display:block}
#n{position:fixed;right:14px;bottom:10px;color:#fff;opacity:.45;font:13px system-ui,sans-serif}
</style></head><body>
${secciones}
<div id="n"></div>
<script>
(function(){
  var d=[].slice.call(document.querySelectorAll('.diap')),i=0,v=0,n=document.getElementById('n');
  function pa(){return [].slice.call(d[i].querySelectorAll('[data-disp="clic"]'))}
  function m(){var s=Math.min(innerWidth/1280,innerHeight/720);d.forEach(function(e,k){e.classList.toggle('act',k===i);e.style.transform='scale('+s+')'});n.textContent=(i+1)+' / '+d.length;history.replaceState(null,'','#'+(i+1))}
  function ir(k,todo){i=Math.max(0,Math.min(d.length-1,k));var p=pa();p.forEach(function(x){x.classList.toggle('visto',!!todo)});v=todo?p.length:0;m()}
  function sig(){var p=pa();if(v<p.length){p[v++].classList.add('visto')}else if(i<d.length-1)ir(i+1)}
  function ant(){var p=pa();if(v>0){p[--v].classList.remove('visto')}else if(i>0)ir(i-1,true)}
  addEventListener('keydown',function(e){var t=e.key;if(['ArrowRight','ArrowDown',' ','PageDown','Enter'].indexOf(t)>-1){sig();e.preventDefault()}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].indexOf(t)>-1){ant();e.preventDefault()}else if(t==='Home')ir(0);else if(t==='End')ir(d.length-1);else if(t==='f'||t==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
  addEventListener('click',function(e){if(e.clientX<innerWidth*0.3)ant();else sig()});
  addEventListener('resize',m);
  var h=parseInt(location.hash.slice(1),10);if(h)i=h-1;ir(i);
})();
</script></body></html>`;
}

/** Valida y limpia un objeto importado desde JSON. */
export function sanearImportado(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.diapositivas)) throw new Error('El archivo no parece una presentación.');
  const titulo = String(obj.titulo || 'Presentación importada').slice(0, 120);
  const tema = TEMAS[obj.tema] ? obj.tema : 'claro';
  const diapositivas = obj.diapositivas.slice(0, 300).map((s) => {
    const el = {};
    const entradas = Array.isArray(s.el) ? s.el : Object.values(s.el || {});
    entradas.forEach((e, i) => {
      const h = e && typeof e.h === 'string' ? limpiarHtmlElemento(e.h) : null;
      if (h) el[nuevoId()] = { z: Number.isFinite(e.z) ? e.z : i + 1, h };
    });
    const bg = typeof s.bg === 'string' && declaracionSegura('background:' + s.bg) ? s.bg : '#ffffff';
    return { bg, notas: String(s.notas || '').slice(0, 5000), el };
  });
  if (!diapositivas.length) throw new Error('La presentación no tiene diapositivas.');
  return { titulo, tema, diapositivas };
}
