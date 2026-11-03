// Importar un guion en Markdown o texto plano: cada título se convierte en una diapositiva.
//
//   # Título            → portada (el primero) o sección; si no hay «##», cada «#» es una diapositiva
//   ## Título           → diapositiva de contenido
//   ### Subtítulo       → subtítulo dentro de la diapositiva
//   - viñetas / 1. listas (hasta dos niveles) · **negrita** *cursiva* `código` [texto](https://…)
//   ```python … ```     → bloque de código con colores
//   $$ E = mc^2 $$      → fórmula (LaTeX)
//   ![](https://…)      → imagen (solo direcciones https)
//   | a | b |           → tabla
//   > cita              → cita
//   ---                 → fuerza una diapositiva nueva
//   Notas: …  o  <!-- … -->   → notas del orador

import { h, modal, aviso } from './ui.js?v=2026.11.03-b';
import {
  TEMAS, contraste, nuevoId, htmlTexto, htmlForma, htmlTabla, htmlCodigo, htmlFormula, construirNodo, limpiarHtmlElemento, parsearCodigo,
} from './slides.js?v=2026.11.03-b';
import { LENGUAJES } from './resaltar.js?v=2026.11.03-b';

export const MAX_DIAPOSITIVAS = 200;
const MAX_TEXTO = 300000;

export const EJEMPLO_GUION = `# Introducción a las funciones
Curso de Cálculo · Semestre 2026-2

Notas: Saludar y presentar los objetivos de la sesión.

## Qué es una función
- Una regla que asigna a cada entrada **una sola** salida
- Se escribe como *f(x)*
  - el dominio es el conjunto de entradas
  - el rango es el conjunto de salidas

## Un ejemplo en código
\`\`\`python
def f(x):
    return x ** 2

print(f(3))  # 9
\`\`\`

## Una integral famosa
$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$
El área bajo la parábola entre 0 y 1.

## Comparación
| Función | Fórmula | Gráfica |
|---|---|---|
| Lineal | f(x) = ax + b | Recta |
| Cuadrática | f(x) = ax² + bx + c | Parábola |

# Conclusiones
## Para recordar
> Una función es una máquina: entra un valor, sale otro.
`;

// ── Análisis del texto ──────────────────────────────────────────────────

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const urlOk = (u) => /^https:\/\/[^\s"'<>]+$/i.test(u) || /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(u);

/** Convierte Markdown en línea (negrita, cursiva, código, enlaces) a HTML seguro. */
export function enLinea(texto, suave = '#eeeeee') {
  const codigos = [];
  let s = esc(texto).replace(/`([^`]+)`/g, (m, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) =>
    `<code style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;background:${suave};padding:.05em .3em;border-radius:5px">${codigos[+i]}</code>`);
}

/**
 * Divide el guion en diapositivas con sus bloques.
 * @returns {{ slides: {titulo:string, nivel:number, bloques:object[], notas:string[]}[], ignoradas: number }}
 */
export function parsearGuion(texto) {
  const lineas = String(texto || '').slice(0, MAX_TEXTO).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const slides = [];
  let cur = null;
  let ignoradas = 0;
  const nueva = (titulo, nivel) => { cur = { titulo, nivel, bloques: [], notas: [] }; slides.push(cur); return cur; };
  const asegurar = () => cur || nueva('', 2);
  let parrafo = null;
  let lista = null;
  const cerrar = () => {
    if (parrafo && parrafo.length) asegurar().bloques.push({ t: 'p', texto: parrafo.join(' ') });
    parrafo = null; lista = null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const t = linea.trim();

    // bloque de código
    let m = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(linea);
    if (m) {
      cerrar();
      const cierre = m[1], lang = m[2].toLowerCase(), buf = [];
      for (i++; i < lineas.length && !lineas[i].trim().startsWith(cierre); i++) buf.push(lineas[i]);
      asegurar().bloques.push({ t: 'code', lang, src: buf.join('\n').replace(/\s+$/, '') });
      continue;
    }
    // fórmula en bloque
    if (t.startsWith('$$')) {
      cerrar();
      let tex = t.slice(2);
      if (tex.endsWith('$$') && tex.length >= 2) tex = tex.slice(0, -2);
      else { const buf = [tex]; for (i++; i < lineas.length; i++) { const l = lineas[i]; if (l.includes('$$')) { buf.push(l.slice(0, l.indexOf('$$'))); break; } buf.push(l); } tex = buf.join(' '); }
      if (tex.trim()) asegurar().bloques.push({ t: 'formula', tex: tex.trim() });
      continue;
    }
    // comentario HTML → notas
    if (t.startsWith('<!--')) {
      cerrar();
      const buf = [t.slice(4)];
      while (!buf[buf.length - 1].includes('-->') && i + 1 < lineas.length) buf.push(lineas[++i]);
      const nota = buf.join('\n').replace(/-->[\s\S]*$/, '').replace(/^\s*notas?\s*:\s*/i, '').trim();
      if (nota) asegurar().notas.push(nota);
      continue;
    }
    if (!t) { cerrar(); continue; }
    // corte de diapositiva
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { cerrar(); cur = null; continue; }
    // títulos
    m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(t);
    if (m) {
      cerrar();
      if (m[1].length <= 2) nueva(m[2], m[1].length);
      else asegurar().bloques.push({ t: 'sub', texto: m[2] });
      continue;
    }
    // notas del orador
    m = /^(notas?|notes?)\s*:\s*(.*)$/i.exec(t);
    if (m) { cerrar(); if (m[2]) asegurar().notas.push(m[2]); continue; }
    // tabla
    if (t.startsWith('|') && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lineas[i + 1])) {
      cerrar();
      const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const filas = [celdas(t)];
      for (i += 2; i < lineas.length && lineas[i].trim().startsWith('|'); i++) filas.push(celdas(lineas[i]));
      i--;
      asegurar().bloques.push({ t: 'tabla', filas });
      continue;
    }
    // imagen sola
    m = /^!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)$/.exec(t);
    if (m) {
      cerrar();
      if (urlOk(m[2])) asegurar().bloques.push({ t: 'img', src: m[2], alt: m[1] }); else ignoradas++;
      continue;
    }
    // listas
    m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(linea);
    if (m) {
      if (parrafo) { asegurar().bloques.push({ t: 'p', texto: parrafo.join(' ') }); parrafo = null; }
      const sangria = m[1].replace(/\t/g, '    ').length;
      if (!lista) { lista = { t: 'ul', items: [], ordenada: /\d/.test(m[2]) }; asegurar().bloques.push(lista); }
      lista.items.push({ nivel: sangria >= 2 ? 1 : 0, texto: m[3] });
      continue;
    }
    // cita
    if (t.startsWith('>')) {
      cerrar();
      const prev = asegurar().bloques[cur.bloques.length - 1];
      const txt = t.replace(/^>\s?/, '');
      if (prev && prev.t === 'cita' && prev.abierta) prev.texto += ' ' + txt;
      else cur.bloques.push({ t: 'cita', texto: txt, abierta: true });
      continue;
    }
    // continuación de un elemento de lista (línea con sangría)
    if (lista && /^\s+\S/.test(linea)) { lista.items[lista.items.length - 1].texto += ' ' + t; continue; }
    lista = null;
    (parrafo = parrafo || []).push(t);
  }
  cerrar();
  for (const s of slides) for (const b of s.bloques) delete b.abierta;
  return { slides: slides.filter((s) => s.titulo || s.bloques.length || s.notas.length).slice(0, MAX_DIAPOSITIVAS), ignoradas };
}

// ── Construcción de las diapositivas ───────────────────────────────────

function crearMedidor() {
  const d = document.createElement('div');
  d.className = 'diap';
  d.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;visibility:hidden;pointer-events:none;overflow:visible';
  document.body.append(d);
  return {
    medir(html) {
      const limpio = limpiarHtmlElemento(html);
      const n = limpio && construirNodo(limpio, 'emedir', 1);
      if (!n) return { w: 0, h: 0 };
      d.append(n);
      const r = { w: n.offsetWidth, h: n.offsetHeight };
      n.remove();
      return r;
    },
    quitar() { d.remove(); },
  };
}

const NOMBRES_LANG = Object.fromEntries(LENGUAJES);
const ext = { python: 'py', javascript: 'js', java: 'java', c: 'c', cpp: 'cpp', matlab: 'm', r: 'R', sql: 'sql', bash: 'sh', html: 'html', css: 'css', json: 'json' };
const alias = { py: 'python', js: 'javascript', ts: 'javascript', typescript: 'javascript', 'c++': 'cpp', octave: 'matlab', sh: 'bash', shell: 'bash', zsh: 'bash', htm: 'html', xml: 'html', latex: 'texto', tex: 'texto', txt: 'texto', text: 'texto' };
const normalizarLang = (l) => { const x = alias[l] || l; return NOMBRES_LANG[x] ? x : 'texto'; };

/**
 * Convierte el guion en datos de diapositivas listos para guardar: [{ bg, el, notas }].
 * @param {string} texto
 * @param {object} tema  uno de TEMAS (o una paleta personalizada)
 */
export function guionADiapositivas(texto, tema = TEMAS.claro) {
  const { slides, ignoradas } = parsearGuion(texto);
  const t = tema;
  const acHex = /^#[0-9a-f]{6}$/i.test(t.ac) ? t.ac : '#1f7a4d';
  const medidor = crearMedidor();
  const salida = [];
  const hayH2 = slides.some((s) => s.nivel === 2 && s.titulo);
  let nSeccion = 0;

  const nuevaSalida = (bg = t.bg) => { const o = { bg, el: [], notas: [] }; salida.push(o); return o; };
  const poner = (o, html) => o.el.push(html);
  const titulo = (txt, size = 52) => htmlTexto(80, 56, 1120, enLinea(txt, t.suave), { size, weight: 700, color: t.fg, font: t.titulo, lh: 1.15 });
  const barra = (x, y) => htmlForma('rect', x, y, 96, 8, t.ac, 'border-radius:4px');

  slides.forEach((s, idx) => {
    const soloEncabezado = s.bloques.every((b) => b.t === 'p') && s.bloques.length <= 1;
    const esH1Especial = s.nivel === 1 && s.titulo && soloEncabezado && (hayH2 || idx === 0);
    if (esH1Especial) {
      const o = nuevaSalida(idx === 0 ? t.bg : (/^rgba/i.test(t.suave) ? t.bg : t.suave));
      o.notas.push(...s.notas);
      if (idx === 0) {
        poner(o, barra(96, 228));
        poner(o, htmlTexto(96, 258, 1088, enLinea(s.titulo, t.suave), { size: 72, weight: 700, color: t.fg, font: t.titulo, lh: 1.15 }));
        if (s.bloques[0]) poner(o, htmlTexto(96, 420, 1088, enLinea(s.bloques[0].texto, t.suave), { size: 34, color: t.fg, font: t.fuente, extra: 'opacity:.8' }));
      } else {
        nSeccion++;
        poner(o, htmlTexto(96, 250, 1088, String(nSeccion).padStart(2, '0'), { size: 120, weight: 800, color: t.ac, font: t.titulo, lh: 1 }));
        poner(o, htmlTexto(96, 400, 1088, enLinea(s.titulo, t.suave), { size: 60, weight: 700, color: t.fg, font: t.titulo, lh: 1.15 }));
        if (s.bloques[0]) poner(o, htmlTexto(96, 500, 1088, enLinea(s.bloques[0].texto, t.suave), { size: 30, color: t.fg, font: t.fuente, extra: 'opacity:.8' }));
      }
      return;
    }

    // diapositiva de contenido (puede continuar en otra si no cabe)
    let o = nuevaSalida();
    o.notas.push(...s.notas);
    const conTitulo = !!s.titulo;
    const inicioY = conTitulo ? 186 : 80;
    const finY = 676;
    const colocarTitulo = (txt) => { if (conTitulo) { poner(o, titulo(txt)); poner(o, barra(80, 140)); } };
    colocarTitulo(s.titulo);
    let y = inicioY;
    let n = 0;

    const imagenes = s.bloques.filter((b) => b.t === 'img');
    const dosColumnas = imagenes.length === 1 && !s.bloques.some((b) => b.t === 'tabla' || b.t === 'code');
    const ancho = dosColumnas ? 600 : 1120;
    if (dosColumnas) {
      poner(o, htmlForma('rect', 700, inicioY, 500, 440, t.suave, 'border-radius:16px;opacity:.5'));
      poner(o, `<img data-t="img" src="${esc(imagenes[0].src)}" alt="${esc(imagenes[0].alt || '')}" style="position:absolute;left:700px;top:${inicioY}px;width:500px;height:440px;object-fit:contain;border-radius:16px">`);
    }

    const ajustar = (html, reducir) => {
      let k = 0, m = medidor.medir(html);
      while (reducir && y + m.h > finY && k < 3) { html = reducir(++k); m = medidor.medir(html); }
      return { html, m };
    };

    for (const b of s.bloques) {
      if (b.t === 'img' && dosColumnas) continue;
      let r = null;
      if (b.t === 'p') {
        const mk = (k = 0) => htmlTexto(80, y, ancho, enLinea(b.texto, t.suave), { size: Math.round(30 * 0.86 ** k), color: t.fg, font: t.fuente, lh: 1.5 });
        r = ajustar(mk(), mk);
      } else if (b.t === 'ul') {
        const tag = b.ordenada ? 'ol' : 'ul';
        const cuerpo = (() => {
          let out = '', nivel = 0;
          for (const it of b.items) {
            if (it.nivel > nivel) { out += `<${tag}>`; nivel = 1; }
            else if (it.nivel < nivel) { out += `</li></${tag}></li>`; nivel = 0; }
            else if (out) out += '</li>';
            out += `<li>${enLinea(it.texto, t.suave)}`;
          }
          if (nivel) out += `</li></${tag}>`;
          return `<${tag}>${out}</li></${tag}>`;
        })();
        const mk = (k = 0) => htmlTexto(80, y, ancho, cuerpo, { size: Math.round(32 * 0.86 ** k), color: t.fg, font: t.fuente, lh: 1.5 });
        r = ajustar(mk(), mk);
      } else if (b.t === 'sub') {
        r = ajustar(htmlTexto(80, y, ancho, enLinea(b.texto, t.suave), { size: 36, weight: 700, color: t.ac, font: t.titulo, lh: 1.2 }));
      } else if (b.t === 'cita') {
        const mk = (k = 0) => htmlTexto(80, y, ancho, enLinea(b.texto, t.suave), {
          size: Math.round(32 * 0.86 ** k), color: t.fg, font: t.fuente, lh: 1.5, extra: `font-style:italic;border-left:8px solid ${t.ac};padding-left:28px;box-sizing:border-box`,
        });
        r = ajustar(mk(), mk);
      } else if (b.t === 'code') {
        const lang = normalizarLang(b.lang);
        const lineasSrc = b.src.split('\n');
        const largo = Math.max(...lineasSrc.map((l) => l.length), 10);
        const mk = (k = 0) => {
          const size = Math.max(14, Math.round((lineasSrc.length > 12 ? 20 : 24) * 0.85 ** k));
          const w = Math.min(ancho, Math.max(480, Math.round(largo * size * 0.62 + 130)));
          return htmlCodigo(80, y, b.src, { lang, tema: 'oscuro', titulo: `ejemplo.${ext[lang] || 'txt'}`, w }).replace('font-size:24px', `font-size:${size}px`);
        };
        r = ajustar(mk(), mk);
      } else if (b.t === 'formula') {
        const mk = (k = 0) => htmlFormula(80, y, b.tex, { size: Math.round(60 * 0.85 ** k), color: t.fg, display: true });
        r = ajustar(mk(), mk);
        const x = Math.max(40, Math.round((dosColumnas ? 380 : 640) - r.m.w / 2));
        r.html = r.html.replace('left:80px', `left:${x}px`);
      } else if (b.t === 'tabla') {
        const cols = Math.max(...b.filas.map((f) => f.length));
        const mk = (k = 0) => {
          const base = htmlTabla(b.filas.length, cols, t, 80, y);
          const trs = b.filas.map((fila, i) => `<tr>${Array.from({ length: cols }, (_, j) => `<${i ? 'td' : 'th'}>${enLinea(fila[j] || '', t.suave)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('');
          const ancho = Math.min(1120, Math.max(480, Array.from({ length: cols }, (_, j) => Math.max(140, 64 + 17 * Math.max(...b.filas.map((f) => (f[j] || '').length)))).reduce((x, y) => x + y, 0)));
          return base.replace(/width:\d+px/, `width:${ancho}px`).replace(/<tbody>[\s\S]*<\/tbody>/, `<tbody>${trs}</tbody>`).replace('font-size:26px', `font-size:${Math.round(26 * 0.86 ** k)}px`);
        };
        r = ajustar(mk(), mk);
        const x = Math.max(40, Math.round(640 - r.m.w / 2));
        r.html = r.html.replace('left:80px', `left:${x}px`);
      } else if (b.t === 'img') {
        const w = 560, hh = 340;
        r = { html: `<img data-t="img" src="${esc(b.src)}" alt="${esc(b.alt || '')}" style="position:absolute;left:${Math.round(640 - w / 2)}px;top:${y}px;width:${w}px;height:${hh}px;object-fit:contain;border-radius:12px">`, m: { w, h: hh } };
      }
      if (!r) continue;
      // si no cabe, sigue en otra diapositiva
      if (n > 0 && y + r.m.h > finY) {
        o = nuevaSalida();
        colocarTitulo(conTitulo ? `${s.titulo} (cont.)` : '');
        y = inicioY; n = 0;
        // se vuelve a colocar con la nueva posición vertical
        r.html = r.html.replace(/top:[\d.]+px/, `top:${y}px`);
      }
      poner(o, r.html);
      y += r.m.h + 22;
      n++;
    }
  });
  medidor.quitar();

  const datos = salida.map((o) => {
    const el = {};
    o.el.forEach((html, i) => { const limpio = limpiarHtmlElemento(html); if (limpio) el[nuevoId()] = { z: i + 1, h: limpio }; });
    return { bg: o.bg, el, notas: o.notas.join('\n\n').slice(0, 5000) };
  }).filter((d) => Object.keys(d.el).length || d.notas);
  return { diapositivas: datos, ignoradas, contraste: contraste(acHex) };
}

/** Varias diapositivas en HTML (una <section> por diapositiva), por ejemplo la respuesta de una IA. */
export function htmlADiapositivas(texto, tema = TEMAS.claro) {
  const secciones = String(texto || '').slice(0, 2_000_000).match(/<section\b[\s\S]*?<\/section>/gi) || [];
  const diapositivas = [];
  let avisos = 0;
  for (const sec of secciones.slice(0, MAX_DIAPOSITIVAS)) {
    const r = parsearCodigo(sec, null);
    avisos += r.quitados || 0;
    if (Object.keys(r.el).length) diapositivas.push({ bg: r.bg || tema.bg, el: r.el, notas: '' });
  }
  return { diapositivas, ignoradas: 0, quitados: avisos, cantidad: secciones.length };
}

const esHtml = (t) => /<section\b/i.test(t);
export function convertirTexto(texto, tema = TEMAS.claro) {
  return esHtml(texto) ? htmlADiapositivas(texto, tema) : guionADiapositivas(texto, tema);
}

// ── Ventana de importación ─────────────────────────────────────────────

/**
 * @param {object}   o
 * @param {Function} o.tema       () => tema vigente
 * @param {Function} o.alCrear    (diapositivas: object[]) => Promise<void>
 */
export function abrirImportador({ tema, alCrear }) {
  const ta = h('textarea', {
    class: 'imp-ta', rows: 14, spellcheck: 'false', 'aria-label': 'Guion en Markdown o texto',
    placeholder: '# Título de la presentación\nSubtítulo\n\n## Primera diapositiva\n- punto uno\n- punto dos\n\n## Código\n```python\nprint("hola")\n```',
  });
  const archivo = h('input', { type: 'file', accept: '.md,.markdown,.txt,text/plain,text/markdown', hidden: true });
  const cuenta = h('p', { class: 'vacio-panel', role: 'status' });
  const actualizar = () => {
    if (!ta.value.trim()) { cuenta.textContent = ''; return; }
    if (esHtml(ta.value)) {
      const n = (ta.value.match(/<section\b/gi) || []).length;
      cuenta.textContent = `Se detectó HTML: se crearán ${n} diapositiva${n === 1 ? '' : 's'} (una por cada <section>).`;
      return;
    }
    const { slides, ignoradas } = parsearGuion(ta.value);
    cuenta.textContent = `Se crearán unas ${slides.length} diapositiva${slides.length === 1 ? '' : 's'}${ignoradas ? ` (${ignoradas} imagen${ignoradas === 1 ? '' : 'es'} se omitirá${ignoradas === 1 ? '' : 'n'}: solo se aceptan direcciones https).` : '.'}`;
  };
  ta.addEventListener('input', actualizar);
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    if (f.size > 1_000_000) { aviso('El archivo es demasiado grande (máximo 1 MB).', 'error'); return; }
    ta.value = await f.text();
    actualizar();
  });
  const botonArchivo = h('button', { type: 'button', class: 'btn', onclick: () => archivo.click() }, 'Abrir un archivo .md o .txt…');
  const botonEjemplo = h('button', { type: 'button', class: 'btn', onclick: () => { ta.value = EJEMPLO_GUION; actualizar(); } }, 'Cargar un ejemplo');
  const ayuda = h('details', { class: 'paleta' }, h('summary', {}, 'Cómo escribir el guion'),
    h('ul', { class: 'imp-ayuda' },
      h('li', {}, h('code', {}, '# Título'), ' portada o sección · ', h('code', {}, '## Título'), ' una diapositiva · ', h('code', {}, '---'), ' diapositiva nueva sin título'),
      h('li', {}, h('code', {}, '- punto'), ' o ', h('code', {}, '1. paso'), ' listas (dos niveles con sangría) · ', h('code', {}, '**negrita** *cursiva* `código`')),
      h('li', {}, h('code', {}, '```python'), ' … ', h('code', {}, '```'), ' bloque de código con colores'),
      h('li', {}, h('code', {}, '$$ \\frac{a}{b} $$'), ' fórmula · ', h('code', {}, '![](https://…)'), ' imagen · ', h('code', {}, '| a | b |'), ' tabla · ', h('code', {}, '> cita')),
      h('li', {}, h('code', {}, 'Notas: …'), ' notas del orador'),
      h('li', {}, 'También puedes pegar HTML: cada ', h('code', {}, '<section>…</section>'), ' se convierte en una diapositiva (útil con la respuesta de una IA).')));

  modal({
    titulo: 'Importar un guion o diapositivas', ancho: 720,
    cuerpo: h('div', {},
      h('p', { class: 'vacio-panel' }, 'Pega tu texto en Markdown (o texto simple) y se convertirá en diapositivas con el tema de la presentación. Se añaden después de la diapositiva actual.'),
      ta, h('div', { class: 'fila', style: { marginTop: '8px' } }, botonArchivo, botonEjemplo, archivo), cuenta, ayuda),
    acciones: [
      { texto: 'Cancelar', fn: (c) => c(null) },
      {
        texto: 'Crear diapositivas', primario: true,
        fn: async (cerrar) => {
          if (!ta.value.trim()) { aviso('Escribe o pega primero el guion.'); return; }
          const r = convertirTexto(ta.value, tema());
          if (!r.diapositivas.length) { aviso('No se encontró contenido para crear diapositivas.', 'error'); return; }
          cerrar(true);
          await alCrear(r.diapositivas, r.ignoradas);
        },
      },
    ],
  });
  setTimeout(() => ta.focus(), 50);
}
