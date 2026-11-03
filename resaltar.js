// Bloque de código con colores: resaltado de sintaxis sin dependencias.
//
// En la diapositiva solo se guarda el texto del código (dentro de un <pre>) y unos pocos atributos
// (lenguaje, tema…). El HTML coloreado se genera al mostrar el elemento y nunca se guarda.

import { tokenizar as tokenizarHtml } from './codigo-editor.js?v=2026.11.03-b';

export const LENGUAJES = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'],
  ['matlab', 'MATLAB / Octave'], ['r', 'R'], ['sql', 'SQL'], ['bash', 'Bash'], ['html', 'HTML'],
  ['css', 'CSS'], ['json', 'JSON'], ['texto', 'Texto sin colores'],
];

export const TEMAS_CODIGO = [['oscuro', 'Oscuro'], ['claro', 'Claro'], ['terminal', 'Terminal']];

const set = (s) => new Set(s.split(' '));

const C_KW = 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while';

const CONFIG = {
  python: {
    kw: set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self'),
    builtins: set('print len range int float str list dict set tuple open input sum min max abs enumerate zip map filter sorted type isinstance round bool'),
    linea: ['#'], triple: true, comillas: '"\'', decorador: true,
  },
  javascript: {
    kw: set('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield null true false undefined'),
    linea: ['//'], bloque: [['/*', '*/']], comillas: '"\'`',
  },
  java: {
    kw: set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch this throw throws try void volatile while null true false var'),
    linea: ['//'], bloque: [['/*', '*/']], comillas: '"\'', decorador: true,
  },
  c: { kw: set(C_KW + ' include define ifdef ifndef endif NULL'), linea: ['//'], bloque: [['/*', '*/']], comillas: '"\'' },
  cpp: {
    kw: set(C_KW + ' bool class namespace new delete template typename using public private protected virtual override this nullptr true false try catch throw include define std'),
    linea: ['//'], bloque: [['/*', '*/']], comillas: '"\'',
  },
  matlab: {
    kw: set('break case catch classdef continue else elseif end for function global if otherwise parfor persistent return spmd switch try while true false'),
    builtins: set('disp fprintf plot figure zeros ones eye size length numel sum mean max min abs sqrt sin cos tan exp log linspace meshgrid'),
    linea: ['%', '#'], bloque: [['%{', '%}']], comillas: '"\'', matlab: true,
  },
  r: {
    kw: set('if else for while repeat function return break next in TRUE FALSE NULL NA Inf NaN library require'),
    builtins: set('c list data.frame matrix print cat paste paste0 length sum mean sd plot lm summary seq rep apply sapply'),
    linea: ['#'], comillas: '"\'',
  },
  sql: {
    kw: set('select from where group by order having join inner left right outer full on as and or not null insert into values update set delete create table drop alter add primary key foreign references limit offset distinct union all like in between is case when then else end count sum avg min max asc desc exists index view'),
    ci: true, linea: ['--'], bloque: [['/*', '*/']], comillas: '"\'',
  },
  bash: {
    kw: set('if then else elif fi for while until do done case esac function in return exit export local select'),
    builtins: set('echo cd ls cat grep sed awk cp mv rm mkdir chmod sudo apt git python pip npm'),
    linea: ['#'], comillas: '"\'', variable: true,
  },
  json: { kw: set('true false null'), comillas: '"', json: true },
  css: { kw: set(''), bloque: [['/*', '*/']], comillas: '"\'', css: true },
};

const RE_NUM = /^(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
const RE_IDENT = /^[A-Za-z_$][\w$]*/;

/** Tokens [clase, texto] de un fragmento de código. Las clases se pintan como `cb-<clase>`. */
function escanear(src, L) {
  const out = [];
  const push = (c, t) => { if (t) out.push([c, t]); };
  const n = src.length;
  let i = 0;
  let ultimo = ''; // último carácter significativo (para distinguir ' de transposición en MATLAB)
  while (i < n) {
    const ch = src[i];

    if (L.bloque) {
      const b = L.bloque.find(([a]) => src.startsWith(a, i));
      if (b) {
        let j = src.indexOf(b[1], i + b[0].length);
        j = j < 0 ? n : j + b[1].length;
        push('cm', src.slice(i, j)); i = j; ultimo = ''; continue;
      }
    }
    if (L.linea && L.linea.some((c) => src.startsWith(c, i))) {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      push('cm', src.slice(i, j)); i = j; continue;
    }

    if (L.triple && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      let j = src.indexOf(q, i + 3);
      j = j < 0 ? n : j + 3;
      push('st', src.slice(i, j)); i = j; ultimo = '"'; continue;
    }

    if (L.comillas && L.comillas.includes(ch)) {
      const transpuesta = L.matlab && ch === "'" && /[\w)\]}'.]/.test(ultimo);
      if (!transpuesta) {
        let j = i + 1;
        const multi = ch === '`';
        while (j < n && src[j] !== ch && (multi || src[j] !== '\n')) j += src[j] === '\\' ? 2 : 1;
        j = Math.min(n, j + (src[j] === ch ? 1 : 0));
        const texto = src.slice(i, j);
        // En JSON, una cadena seguida de «:» es una clave.
        let clase = 'st';
        if (L.json && /^\s*:/.test(src.slice(j, j + 8))) clase = 'at';
        push(clase, texto); i = j; ultimo = ch; continue;
      }
    }

    if (L.css && ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(src.slice(i, i + 10))) {
      const m = /^#[0-9a-fA-F]{3,8}/.exec(src.slice(i, i + 10));
      push('nm', m[0]); i += m[0].length; ultimo = '0'; continue;
    }

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || ''))) {
      const m = RE_NUM.exec(src.slice(i, i + 40));
      if (m) {
        let fin = m[0].length;
        if (L.css) { const u = /^(?:%|[a-zA-Z]+)/.exec(src.slice(i + fin, i + fin + 6)); if (u) fin += u[0].length; }
        push('nm', src.slice(i, i + fin)); i += fin; ultimo = '0'; continue;
      }
    }

    if (L.decorador && ch === '@') {
      const m = /^@[\w.]+/.exec(src.slice(i, i + 60));
      if (m) { push('dc', m[0]); i += m[0].length; ultimo = 'a'; continue; }
    }
    if (L.variable && ch === '$') {
      const m = /^\$(?:\{[^}\n]*\}|[\w@*#?]+)/.exec(src.slice(i, i + 60));
      if (m) { push('vr', m[0]); i += m[0].length; ultimo = 'a'; continue; }
    }
    if (L.css && ch === '@') {
      const m = /^@[\w-]+/.exec(src.slice(i, i + 40));
      if (m) { push('kw', m[0]); i += m[0].length; ultimo = 'a'; continue; }
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const m = RE_IDENT.exec(src.slice(i, i + 80));
      const palabra = m[0];
      const resto = src.slice(i + palabra.length, i + palabra.length + 40);
      const clave = L.ci ? palabra.toLowerCase() : palabra;
      let clase = '';
      if (L.css) {
        if (/^\s*:(?!:)/.test(resto) && !/^\s*:\s*[^;{}]*\{/.test(resto)) clase = 'at';
      } else if (L.kw.has(clave)) clase = 'kw';
      else if (L.builtins && L.builtins.has(clave)) clase = 'fn';
      else if (/^\s*\(/.test(resto)) clase = 'fn';
      else if (!L.json && /^[A-Z]/.test(palabra) && /[a-z]/.test(palabra)) clase = 'ty';
      // Guiones dentro de nombres CSS (font-size, ease-in-out…)
      let fin = palabra.length;
      if (L.css) { const g = /^(?:-[A-Za-z0-9_]+)+/.exec(src.slice(i + fin, i + fin + 40)); if (g) fin += g[0].length; }
      const texto = src.slice(i, i + fin);
      if (L.css && clase === '') {
        const r2 = src.slice(i + fin, i + fin + 40);
        if (/^\s*:(?!:)/.test(r2) && !/^\s*:\s*[^;{}]*\{/.test(r2)) clase = 'at';
      }
      push(clase, texto); i += fin; ultimo = 'a'; continue;
    }

    if (L.css && (ch === '.' || ch === '#') && /[A-Za-z_-]/.test(src[i + 1] || '')) {
      const m = /^[.#][\w-]+/.exec(src.slice(i, i + 60));
      push('fn', m[0]); i += m[0].length; ultimo = 'a'; continue;
    }

    if (/[{}()[\];,.:]/.test(ch)) push('pn', ch);
    else if (/[+\-*/%=<>!&|^~?]/.test(ch)) push('op', ch);
    else push('', ch);
    if (!/\s/.test(ch)) ultimo = ch;
    i++;
  }
  return out;
}

// HTML: se reutiliza el tokenizador del editor de código y se traducen sus clases.
const CLASES_HTML = { tg: 'tg', pn: 'pn', cm: 'cm', en: 'nm', at: 'at', st: 'st', pr: 'at', vl: 'nm', ei: 'st' };

function tokensHtml(src) {
  return tokenizarHtml(src).map(({ c, t }) => [CLASES_HTML[c] || '', t]);
}

function aLineas(tokens) {
  const lineas = [[]];
  for (const [c, t] of tokens) {
    const partes = t.split('\n');
    partes.forEach((p, k) => {
      if (k > 0) lineas.push([]);
      if (p) lineas[lineas.length - 1].push([c, p]);
    });
  }
  return lineas;
}

/** Líneas de tokens de un código en el lenguaje dado. */
export function tokenizarLineas(src, lang) {
  if (src.length > 40000) src = src.slice(0, 40000);
  let tokens;
  if (lang === 'html') tokens = tokensHtml(src);
  else if (CONFIG[lang]) tokens = escanear(src, CONFIG[lang]);
  else tokens = [['', src]];
  return aLineas(tokens);
}

/** «2,4-6» → Set {2,4,5,6}. */
export function lineasResaltadas(txt) {
  const s = new Set();
  for (const parte of String(txt || '').split(',')) {
    const m = /^\s*(\d{1,4})\s*(?:-\s*(\d{1,4}))?\s*$/.exec(parte);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let k = Math.min(a, b); k <= Math.min(Math.max(a, b), 2000) && s.size < 2000; k++) s.add(k);
  }
  return s;
}

/** Texto del código de un elemento, esté o no ya dibujado. */
export function textoDeCodigo(n) {
  const lineas = n.querySelectorAll('.cb-t');
  if (lineas.length || n.querySelector('.cb-cuerpo')) return Array.from(lineas, (l) => l.textContent).join('\n');
  const pre = n.querySelector('pre');
  return pre ? pre.textContent : '';
}

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

/** Dibuja el código (con colores, números y barra de ventana) dentro del elemento. */
export function pintarCodigo(n, src) {
  if (src == null) src = textoDeCodigo(n);
  const lang = n.getAttribute('data-lang') || 'texto';
  const nums = n.getAttribute('data-nums') === '1';
  const res = lineasResaltadas(n.getAttribute('data-res'));
  const frag = document.createDocumentFragment();

  if (n.getAttribute('data-barra') === '1') {
    const b = el('div', 'cb-barra');
    for (const c of ['cb-d1', 'cb-d2', 'cb-d3']) b.append(el('i', c));
    b.append(el('span', 'cb-tit', n.getAttribute('data-titulo') || ''));
    frag.append(b);
  }

  const cuerpo = el('div', 'cb-cuerpo');
  tokenizarLineas(src, lang).forEach((toks, i) => {
    const l = el('div', 'cb-l' + (res.has(i + 1) ? ' cb-res' : ''));
    l.style.setProperty('--i', String(i));
    if (nums) l.append(el('span', 'cb-n', String(i + 1)));
    const t = el('span', 'cb-t');
    for (const [c, txt] of toks) {
      if (c) t.append(el('span', 'cb-' + c, txt)); else t.append(document.createTextNode(txt));
    }
    l.append(t);
    cuerpo.append(l);
  });
  frag.append(cuerpo);
  n.replaceChildren(frag);
}
