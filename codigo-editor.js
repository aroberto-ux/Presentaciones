// Editor de código ligero y sin dependencias (inspirado en el de Overleaf).
//
//   · números de línea (también con líneas largas ajustadas)
//   · colores de sintaxis para HTML y para el CSS de los atributos style
//   · buscar y reemplazar (Ctrl+F / Ctrl+H)
//   · autocompletado de etiquetas, propiedades CSS y valores (Ctrl+Espacio)
//   · sangría automática, Tab / Mayús+Tab, cierre de etiquetas y de comillas
//   · deshacer / rehacer nativos del navegador
//
// Truco de funcionamiento: un <textarea> transparente (el que recibe el teclado)
// encima de una capa con el mismo texto ya coloreado.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);

// ═════════════════════════════════════════════════════════════════════════
//  Resaltado
// ═════════════════════════════════════════════════════════════════════════

const RE_ETIQUETA = /<(\/?)([A-Za-z][\w:-]*)/y;
const RE_ENTIDAD = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/iy;
const RE_DECL = /([a-zA-Z-]+)(\s*:\s*)((?:[^;(]|\([^)]*\))*)(;?)/y;
const RE_VALOR = /(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+[a-z%]*|url\([^)]*\))/;

function tokensEstilo(v, push) {
  let i = 0;
  const n = v.length;
  while (i < n) {
    if (/\s/.test(v[i])) { let j = i + 1; while (j < n && /\s/.test(v[j])) j++; push('', v.slice(i, j)); i = j; continue; }
    RE_DECL.lastIndex = i;
    const m = RE_DECL.exec(v);
    if (m && m.index === i) {
      push('pr', m[1]); push('pn', m[2]);
      m[3].split(RE_VALOR).forEach((p, k) => {
        if (!p) return;
        if (k % 2 === 1) push(p.startsWith('url') ? 'st' : 'nm', p); else push('vl', p);
      });
      push('pn', m[4]);
      i += m[0].length;
      continue;
    }
    let j = v.indexOf(';', i);
    j = j < 0 ? n : j + 1;
    push('', v.slice(i, j)); i = j;
  }
}

function tokensAtributos(src, i, push) {
  const n = src.length;
  let attr = '';
  while (i < n) {
    const ch = src[i];
    if (ch === '>') { push('pn', '>'); return i + 1; }
    if (ch === '/' && src[i + 1] === '>') { push('pn', '/>'); return i + 2; }
    if (/\s/.test(ch)) { let j = i + 1; while (j < n && /\s/.test(src[j])) j++; push('', src.slice(i, j)); i = j; continue; }
    if (ch === '=') {
      push('pn', '='); i++;
      const q = src[i];
      if (q === '"' || q === "'") {
        let j = src.indexOf(q, i + 1);
        if (j < 0) j = n;
        const val = src.slice(i + 1, j);
        push('st', q);
        if (attr === 'style') tokensEstilo(val, push);
        else if (attr === 'data-eid') push('ei', val);
        else push('st', val);
        if (j < n) push('st', q);
        i = j < n ? j + 1 : n;
      } else {
        let j = i;
        while (j < n && !/[\s>]/.test(src[j])) j++;
        push('st', src.slice(i, j)); i = j;
      }
      continue;
    }
    let j = i;
    while (j < n && !/[\s=>/"']/.test(src[j])) j++;
    if (j === i) { push('', ch); i++; continue; }
    attr = src.slice(i, j).toLowerCase();
    push('at', src.slice(i, j));
    i = j;
  }
  return i;
}

export function tokenizar(src) {
  const out = [];
  const push = (c, t) => { if (t) out.push({ c, t }); };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '<') {
      if (src.startsWith('<!--', i)) {
        let j = src.indexOf('-->', i + 4);
        j = j < 0 ? n : j + 3;
        push('cm', src.slice(i, j)); i = j; continue;
      }
      RE_ETIQUETA.lastIndex = i;
      const m = RE_ETIQUETA.exec(src);
      if (m) {
        push('pn', '<' + m[1]); push('tg', m[2]);
        i = tokensAtributos(src, i + m[0].length, push);
        continue;
      }
      push('', '<'); i++; continue;
    }
    if (ch === '&') {
      RE_ENTIDAD.lastIndex = i;
      const m = RE_ENTIDAD.exec(src);
      if (m) { push('en', m[0]); i += m[0].length; } else { push('', '&'); i++; }
      continue;
    }
    let j = i + 1;
    while (j < n && src[j] !== '<' && src[j] !== '&') j++;
    push('', src.slice(i, j)); i = j;
  }
  return out;
}

/** Devuelve un array con el HTML (ya escapado) de cada línea. */
export function lineasHtml(tokens) {
  const lineas = [[]];
  for (const { c, t } of tokens) {
    const partes = t.split('\n');
    partes.forEach((p, k) => {
      if (k > 0) lineas.push([]);
      if (p) lineas[lineas.length - 1].push(c ? `<span class="t-${c}">${esc(p)}</span>` : esc(p));
    });
  }
  return lineas.map((l) => `<div class="ln">${l.join('') || '​'}</div>`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Autocompletado: listas
// ═════════════════════════════════════════════════════════════════════════

const VACIAS = new Set(['img', 'br', 'hr', 'col', 'input', 'meta', 'link', 'source', 'wbr']);

const ETIQUETAS = ('div span p h1 h2 h3 h4 h5 h6 b strong i em u s mark small sub sup code pre blockquote ul ol li ' +
  'a img table thead tbody tr td th section article header footer aside figure figcaption br hr svg g path circle ' +
  'rect ellipse line polyline polygon text tspan defs lineargradient radialgradient stop').split(' ');

const PROPIEDADES = ('position left top right bottom width height min-width max-width min-height max-height ' +
  'z-index display flex-direction justify-content align-items gap padding padding-left padding-right padding-top ' +
  'padding-bottom margin background background-color background-image color opacity font-family font-size ' +
  'font-weight font-style line-height letter-spacing text-align text-decoration text-transform text-shadow ' +
  'white-space border border-radius border-left border-top border-color box-shadow outline overflow object-fit ' +
  'transform transform-origin filter clip-path').split(' ');

const VALORES = {
  position: ['absolute', 'relative'],
  display: ['block', 'flex', 'grid', 'inline-block', 'none'],
  'flex-direction': ['row', 'column'],
  'justify-content': ['center', 'flex-start', 'flex-end', 'space-between', 'space-around'],
  'align-items': ['center', 'flex-start', 'flex-end', 'stretch'],
  'text-align': ['left', 'center', 'right', 'justify'],
  'text-decoration': ['none', 'underline', 'line-through'],
  'text-transform': ['uppercase', 'lowercase', 'capitalize', 'none'],
  'font-weight': ['400', '500', '600', '700', '800', 'bold', 'normal'],
  'font-style': ['normal', 'italic'],
  'white-space': ['nowrap', 'pre-wrap', 'normal'],
  overflow: ['hidden', 'visible', 'auto'],
  'object-fit': ['cover', 'contain', 'fill'],
  transform: ['rotate(', 'scale(', 'translate('],
  filter: ['drop-shadow(', 'blur(', 'grayscale('],
};

// ═════════════════════════════════════════════════════════════════════════
//  Componente
// ═════════════════════════════════════════════════════════════════════════

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function crearEditorCodigo(raiz, opciones = {}) {
  const o = { alCambiar() {}, alAplicar() {}, alCursor() {}, alPerderFoco() {}, tam: 13, ajuste: true, ...opciones };
  raiz.classList.add('ce');
  raiz.replaceChildren();

  // ── DOM ──
  const bus = el('div', 'ce-bus'); bus.hidden = true;
  bus.innerHTML = `
    <div class="ce-bus-fila">
      <input class="ce-q" type="text" placeholder="Buscar" aria-label="Buscar" spellcheck="false">
      <span class="ce-cuenta" aria-live="polite"></span>
      <button type="button" data-a="prev" title="Anterior (Mayús+Enter)" aria-label="Coincidencia anterior">↑</button>
      <button type="button" data-a="sig" title="Siguiente (Enter)" aria-label="Coincidencia siguiente">↓</button>
      <button type="button" data-a="caso" title="Distinguir mayúsculas" aria-pressed="false">Aa</button>
      <button type="button" data-a="cerrar" title="Cerrar (Esc)" aria-label="Cerrar búsqueda">×</button>
    </div>
    <div class="ce-bus-fila">
      <input class="ce-r" type="text" placeholder="Reemplazar con" aria-label="Reemplazar con" spellcheck="false">
      <button type="button" data-a="uno">Reemplazar</button>
      <button type="button" data-a="todos">Todos</button>
    </div>`;
  const cuerpo = el('div', 'ce-cuerpo');
  const gutter = el('div', 'ce-gutter', { 'aria-hidden': 'true' });
  const gutterIn = el('div', 'ce-gutter-in');
  gutter.append(gutterIn);
  const area = el('div', 'ce-area');
  const marks = el('div', 'ce-capa ce-marks', { 'aria-hidden': 'true' });
  const hl = el('div', 'ce-capa ce-hl', { 'aria-hidden': 'true' });
  const mirror = el('div', 'ce-capa ce-mirror', { 'aria-hidden': 'true' });
  const ta = el('textarea', 'ce-ta', {
    spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', 'aria-label': 'Código HTML', wrap: 'soft',
  });
  const ac = el('div', 'ce-ac', { role: 'listbox' }); ac.hidden = true;
  area.append(marks, hl, ta, mirror);
  cuerpo.append(gutter, area, ac);
  raiz.append(bus, cuerpo);

  const q = bus.querySelector('.ce-q'), r = bus.querySelector('.ce-r'), cuenta = bus.querySelector('.ce-cuenta');
  const bCaso = bus.querySelector('[data-a=caso]');

  // ── Estado ──
  let tam = o.tam, ajuste = !!o.ajuste;
  let nLineas = 0, digitos = 0;
  let alturas = '';
  let rango = null; // {ini, fin} líneas resaltadas
  let activa = -1;
  let medirT = 0, cursorT = 0;
  let caso = false, coincidencias = [], actual = -1;
  let sugerencias = [], seleccionAC = 0, ctxAC = null;
  const el_ = { destruido: false };

  function aplicarFuente() {
    raiz.style.setProperty('--ce-fs', tam + 'px');
    ta.wrap = ajuste ? 'soft' : 'off';
    raiz.classList.toggle('ce-sin-ajuste', !ajuste);
  }

  // ── Render ──
  function contarLineas(s) { let n = 1; for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++; return n; }

  function render() {
    const src = ta.value;
    const lineas = src.length > 300000
      ? src.split('\n').map((l) => `<div class="ln">${esc(l) || '​'}</div>`)
      : lineasHtml(tokenizar(src));
    hl.innerHTML = lineas.join('');
    const n = lineas.length;
    const d = Math.max(2, String(n).length);
    if (n !== nLineas) {
      nLineas = n;
      gutterIn.innerHTML = Array.from({ length: n }, (_, k) => `<div class="gn">${k + 1}</div>`).join('');
      alturas = '';
    }
    if (d !== digitos) {
      digitos = d;
      gutter.style.width = `calc(${d}ch + 22px)`;
      area.style.left = `calc(${d}ch + 22px)`;
    }
    activa = -1;
    pintarActiva();
    pintarMarcas();
    programarMedida();
  }

  function programarMedida() {
    if (medirT) return;
    medirT = requestAnimationFrame(() => { medirT = 0; medirGutter(); });
  }

  function medirGutter() {
    if (el_.destruido || !raiz.isConnected || !ta.clientHeight) return;
    const filas = gutterIn.children;
    if (!ajuste) {
      if (alturas !== 'fija') { for (const f of filas) f.style.height = ''; alturas = 'fija'; }
      return;
    }
    const lns = hl.children;
    const hs = [];
    for (let i = 0; i < lns.length; i++) hs.push(lns[i].getBoundingClientRect().height);
    const clave = hs.join(',');
    if (clave === alturas) return;
    alturas = clave;
    for (let i = 0; i < filas.length && i < hs.length; i++) filas[i].style.height = hs[i] + 'px';
  }

  function medirBarras() {
    const sbw = Math.max(0, ta.offsetWidth - ta.clientWidth);
    const sbh = Math.max(0, ta.offsetHeight - ta.clientHeight);
    raiz.style.setProperty('--ce-sbw', sbw + 'px');
    raiz.style.setProperty('--ce-sbh', sbh + 'px');
  }

  function sincronizarScroll() {
    const t = ta.scrollTop, l = ta.scrollLeft;
    hl.scrollTop = t; hl.scrollLeft = l;
    marks.scrollTop = t; marks.scrollLeft = l;
    gutter.scrollTop = t;
  }

  function lineaDe(pos) {
    const v = ta.value;
    let n = 0;
    for (let i = v.indexOf('\n'); i >= 0 && i < pos; i = v.indexOf('\n', i + 1)) n++;
    return n;
  }

  function pintarActiva() {
    const colapsada = ta.selectionStart === ta.selectionEnd;
    const idx = colapsada ? lineaDe(ta.selectionStart) : -1;
    const lns = hl.children, gns = gutterIn.children;
    if (activa !== idx || true) {
      if (lns[activa]) lns[activa].classList.remove('act');
      if (gns[activa]) gns[activa].classList.remove('act');
      activa = idx;
      if (lns[idx]) lns[idx].classList.add('act');
      if (gns[idx]) gns[idx].classList.add('act');
    }
    for (let i = 0; i < lns.length; i++) {
      const dentro = !!rango && i >= rango.ini && i <= rango.fin;
      lns[i].classList.toggle('rango', dentro);
      if (gns[i]) gns[i].classList.toggle('rango', dentro);
    }
  }

  function pintarMarcas() {
    if (!q.value || !coincidencias.length || bus.hidden) { marks.textContent = ''; return; }
    const v = ta.value, L = q.value.length;
    let html = '', ult = 0;
    coincidencias.forEach((p, k) => {
      html += esc(v.slice(ult, p)) + `<mark${k === actual ? ' class="cur"' : ''}>${esc(v.slice(p, p + L))}</mark>`;
      ult = p + L;
    });
    marks.innerHTML = html + esc(v.slice(ult)) + '\n';
  }

  // ── Cursor ──
  function infoCursor() {
    const pos = ta.selectionStart;
    const v = ta.value;
    const linea = lineaDe(pos);
    const ini = v.lastIndexOf('\n', pos - 1) + 1;
    return { linea, col: pos - Math.min(ini, pos) + 1, pos, total: nLineas };
  }

  function alMoverCursor() {
    cancelAnimationFrame(cursorT);
    cursorT = requestAnimationFrame(() => {
      if (el_.destruido) return;
      pintarActiva();
      o.alCursor(infoCursor(), document.activeElement === ta);
    });
  }

  function revelar(pos, centrar = false) {
    const idx = lineaDe(pos);
    const ln = hl.children[idx];
    if (!ln) return;
    const top = ln.offsetTop, h = ln.offsetHeight, vh = ta.clientHeight;
    if (centrar || top < ta.scrollTop + 8 || top + h > ta.scrollTop + vh - 8) {
      ta.scrollTop = Math.max(0, top - vh / 2 + h / 2);
    }
    sincronizarScroll();
  }

  // ── Edición ──
  function insertar(t) {
    ta.focus();
    if (!document.execCommand('insertText', false, t)) {
      ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function indentar(inversa) {
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const ini = v.lastIndexOf('\n', a - 1) + 1;
    const fin = b > a && v[b - 1] === '\n' ? b - 1 : b;
    let finL = v.indexOf('\n', fin);
    if (finL < 0) finL = v.length;
    const nuevo = v.slice(ini, finL).split('\n').map((l) => (inversa ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l)).join('\n');
    ta.setSelectionRange(ini, finL);
    insertar(nuevo);
    ta.setSelectionRange(ini, ini + nuevo.length);
  }

  function tecla(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.isComposing) return;

    if (!ac.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); seleccionAC = (seleccionAC + 1) % sugerencias.length; pintarAC(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); seleccionAC = (seleccionAC - 1 + sugerencias.length) % sugerencias.length; pintarAC(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); aceptarAC(seleccionAC); return; }
      if (e.key === 'Escape') { e.preventDefault(); cerrarAC(); return; }
    }

    if (mod && e.key === 'Enter') { e.preventDefault(); o.alAplicar(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); abrirBuscar(false); return; }
    if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); abrirBuscar(true); return; }
    if (e.key === 'F3') { e.preventDefault(); if (!bus.hidden) mover(e.shiftKey ? -1 : 1); else abrirBuscar(false); return; }
    if (mod && e.code === 'Space') { e.preventDefault(); abrirAC(true); return; }
    if (e.key === 'Escape' && !bus.hidden) { cerrarBuscar(); return; }
    if (mod || e.altKey) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (ta.selectionStart === ta.selectionEnd && !e.shiftKey) insertar('  ');
      else indentar(e.shiftKey);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
      const iniL = v.lastIndexOf('\n', a - 1) + 1;
      const sangria = /^[ \t]*/.exec(v.slice(iniL, a))[0];
      if (v[a - 1] === '>' && v.slice(b, b + 2) === '</') {
        insertar('\n' + sangria + '  \n' + sangria);
        const p = a + 1 + sangria.length + 2;
        ta.setSelectionRange(p, p);
      } else insertar('\n' + sangria);
      return;
    }

    if (e.key === '>' && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value, a = ta.selectionStart;
      const antes = v.slice(Math.max(0, a - 600), a);
      const m = /<([a-zA-Z][\w:-]*)(?:\s[^<]*)?$/.exec(antes);
      if (m) {
        const dentro = antes.slice(m.index);
        const comillasPares = (dentro.match(/"/g) || []).length % 2 === 0;
        const nombre = m[1];
        if (comillasPares && !dentro.endsWith('/') && !VACIAS.has(nombre.toLowerCase()) && !v.slice(a).startsWith('</' + nombre)) {
          e.preventDefault();
          insertar(`></${nombre}>`);
          ta.setSelectionRange(a + 1, a + 1);
        }
      }
      return;
    }

    if (e.key === '"' && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value, a = ta.selectionStart;
      if (v[a] === '"' && v[a - 1] !== '=') { e.preventDefault(); ta.setSelectionRange(a + 1, a + 1); return; }
      if (v[a - 1] === '=') {
        e.preventDefault();
        insertar('""');
        ta.setSelectionRange(a + 1, a + 1);
      }
    }
  }

  // ── Autocompletado ──
  function contextoAC(manual) {
    if (ta.selectionStart !== ta.selectionEnd) return null;
    const pos = ta.selectionStart;
    const antes = ta.value.slice(Math.max(0, pos - 2500), pos);
    const iS = antes.lastIndexOf('style="');
    if (iS >= 0 && antes.indexOf('"', iS + 7) < 0) {
      const interior = antes.slice(iS + 7);
      const dec = interior.slice(interior.lastIndexOf(';') + 1);
      const c = dec.indexOf(':');
      if (c < 0) {
        const pref = dec.trim();
        if (!pref && !manual) return null;
        if (!/^[a-z-]*$/i.test(pref)) return null;
        return { tipo: 'prop', pref, desde: pos - pref.length, items: PROPIEDADES };
      }
      const prop = dec.slice(0, c).trim().toLowerCase();
      const pref = dec.slice(c + 1).replace(/^\s+/, '');
      if (!VALORES[prop] || /[\s(]/.test(pref) || (!pref && !manual)) return null;
      return { tipo: 'valor', pref, desde: pos - pref.length, items: VALORES[prop] };
    }
    const m = /<([a-zA-Z][\w:-]*)?$/.exec(antes);
    if (m) {
      const pref = m[1] || '';
      if (!pref && !manual) return null;
      return { tipo: 'tag', pref, desde: pos - pref.length, items: ETIQUETAS };
    }
    return null;
  }

  function abrirAC(manual = false) {
    const c = contextoAC(manual);
    if (!c) { cerrarAC(); return; }
    const p = c.pref.toLowerCase();
    const lista = c.items.filter((x) => x.startsWith(p) && x !== c.pref).slice(0, 8);
    if (!lista.length) { cerrarAC(); return; }
    ctxAC = c; sugerencias = lista; seleccionAC = 0;
    pintarAC();
    ubicarAC(c.desde);
  }

  function pintarAC() {
    ac.replaceChildren(...sugerencias.map((s, k) => {
      const d = el('div', 'ce-ac-i' + (k === seleccionAC ? ' sel' : ''), { role: 'option' });
      d.textContent = s;
      const t = el('span', 'ce-ac-t'); t.textContent = ctxAC.tipo === 'tag' ? 'etiqueta' : ctxAC.tipo === 'prop' ? 'css' : 'valor';
      d.append(t);
      d.addEventListener('mousedown', (e) => { e.preventDefault(); aceptarAC(k); });
      return d;
    }));
    ac.hidden = false;
  }

  function ubicarAC(pos) {
    const v = ta.value;
    mirror.textContent = '';
    const marca = el('span'); marca.textContent = '​';
    mirror.append(document.createTextNode(v.slice(0, pos)), marca, document.createTextNode(v.slice(pos) + '\n'));
    const x = marca.offsetLeft - ta.scrollLeft + area.offsetLeft;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const y = marca.offsetTop - ta.scrollTop + lh + 2;
    const anchoAC = ac.offsetWidth || 180, altoAC = ac.offsetHeight || 120;
    ac.style.left = Math.max(4, Math.min(x, cuerpo.clientWidth - anchoAC - 4)) + 'px';
    const abajo = y + altoAC > cuerpo.clientHeight;
    ac.style.top = (abajo ? Math.max(4, y - lh - altoAC - 4) : y) + 'px';
    mirror.textContent = '';
  }

  function cerrarAC() { ac.hidden = true; sugerencias = []; ctxAC = null; }

  function aceptarAC(k) {
    const s = sugerencias[k];
    if (s == null || !ctxAC) return;
    const { desde, tipo } = ctxAC;
    const pos = ta.selectionStart;
    cerrarAC();
    ta.setSelectionRange(desde, pos);
    insertar(tipo === 'prop' ? s + ':' : s);
  }

  // ── Buscar y reemplazar ──
  function buscarTodo() {
    coincidencias = [];
    const t = q.value;
    if (!t) return;
    const hay = caso ? ta.value : ta.value.toLowerCase();
    const aguja = caso ? t : t.toLowerCase();
    for (let i = hay.indexOf(aguja); i >= 0 && coincidencias.length < 5000; i = hay.indexOf(aguja, i + aguja.length)) coincidencias.push(i);
  }

  function pintarCuenta() {
    if (!q.value) cuenta.textContent = '';
    else if (!coincidencias.length) cuenta.textContent = 'Sin resultados';
    else cuenta.textContent = `${actual >= 0 ? actual + 1 : '–'} de ${coincidencias.length}`;
  }

  function actualizarBusqueda({ desdeCursor = false } = {}) {
    buscarTodo();
    if (!coincidencias.length) actual = -1;
    else if (desdeCursor || actual < 0 || actual >= coincidencias.length) {
      const pos = ta.selectionStart;
      const k = coincidencias.findIndex((p) => p >= pos);
      actual = k < 0 ? 0 : k;
    }
    pintarMarcas(); pintarCuenta();
  }

  function irAMatch(k) {
    if (!coincidencias.length) return;
    actual = (k + coincidencias.length) % coincidencias.length;
    const p = coincidencias[actual];
    ta.setSelectionRange(p, p + q.value.length);
    revelar(p, false);
    pintarMarcas(); pintarCuenta();
  }

  function mover(d) {
    if (!coincidencias.length) { actualizarBusqueda({ desdeCursor: true }); if (!coincidencias.length) return; }
    irAMatch((actual < 0 ? (d > 0 ? 0 : -1) : actual + d));
  }

  function reemplazarUno() {
    if (!coincidencias.length) return;
    if (actual < 0) { irAMatch(0); return; }
    const p = coincidencias[actual];
    ta.focus();
    ta.setSelectionRange(p, p + q.value.length);
    insertar(r.value);
    actualizarBusqueda({ desdeCursor: true });
    if (coincidencias.length) irAMatch(actual);
  }

  function reemplazarTodo() {
    buscarTodo();
    if (!coincidencias.length) return;
    const v = ta.value, L = q.value.length;
    let nuevo = '', ult = 0;
    for (const p of coincidencias) { nuevo += v.slice(ult, p) + r.value; ult = p + L; }
    nuevo += v.slice(ult);
    const n = coincidencias.length;
    ta.focus();
    ta.select();
    insertar(nuevo);
    ta.setSelectionRange(0, 0);
    actualizarBusqueda({ desdeCursor: true });
    cuenta.textContent = `${n} reemplazo${n === 1 ? '' : 's'}`;
  }

  function abrirBuscar(conReemplazo) {
    bus.hidden = false;
    bus.classList.toggle('con-reemplazo', true);
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && !sel.includes('\n') && sel.length < 200) q.value = sel;
    actualizarBusqueda({ desdeCursor: true });
    (conReemplazo && q.value ? r : q).focus();
    if (!(conReemplazo && q.value)) q.select();
    refrescar();
  }

  function cerrarBuscar() {
    bus.hidden = true;
    marks.textContent = '';
    ta.focus();
    refrescar();
  }

  bus.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'sig') mover(1);
    else if (a === 'prev') mover(-1);
    else if (a === 'cerrar') cerrarBuscar();
    else if (a === 'uno') reemplazarUno();
    else if (a === 'todos') reemplazarTodo();
    else if (a === 'caso') {
      caso = !caso; b.setAttribute('aria-pressed', String(caso)); b.classList.toggle('on', caso);
      actualizarBusqueda({ desdeCursor: true });
    }
  });
  q.addEventListener('input', () => actualizarBusqueda({ desdeCursor: true }));
  bus.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarBuscar(); }
    else if (e.key === 'Enter' && e.target === q) { e.preventDefault(); mover(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter' && e.target === r) { e.preventDefault(); reemplazarUno(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); o.alAplicar(); }
  });

  // ── Eventos del textarea ──
  ta.addEventListener('input', (e) => {
    render();
    if (!bus.hidden) actualizarBusqueda();
    o.alCambiar();
    if (e.inputType && e.inputType.startsWith('insert') && !e.isComposing) abrirAC(false); else cerrarAC();
    sincronizarScroll();
  });
  ta.addEventListener('scroll', () => { sincronizarScroll(); if (!ac.hidden) cerrarAC(); });
  ta.addEventListener('keydown', tecla);
  ta.addEventListener('blur', () => { cerrarAC(); o.alPerderFoco(); });
  ta.addEventListener('mousedown', () => cerrarAC());
  ['keyup', 'mouseup', 'focus', 'select', 'input'].forEach((ev) => ta.addEventListener(ev, alMoverCursor));
  const alSel = () => { if (document.activeElement === ta) alMoverCursor(); };
  document.addEventListener('selectionchange', alSel);

  const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refrescar()) : null;
  if (obs) obs.observe(cuerpo);

  function refrescar() {
    if (el_.destruido) return;
    medirBarras();
    alturas = '';
    programarMedida();
    sincronizarScroll();
  }

  aplicarFuente();
  render();

  return {
    textarea: ta,
    getValor: () => ta.value,
    setValor(v) {
      if (ta.value === v) return;
      const st = ta.scrollTop, sl = ta.scrollLeft, a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = v;
      ta.setSelectionRange(Math.min(a, v.length), Math.min(b, v.length));
      render();
      if (!bus.hidden) actualizarBusqueda();
      ta.scrollTop = st; ta.scrollLeft = sl;
      sincronizarScroll();
    },
    setDeshabilitado(d, placeholder = '') {
      ta.disabled = !!d; ta.placeholder = placeholder;
      raiz.classList.toggle('ce-off', !!d);
    },
    tieneFoco: () => document.activeElement === ta,
    enfocar: () => ta.focus(),
    cursor: infoCursor,
    /** Mueve el cursor al inicio de la línea n (0 = primera) y la deja visible. */
    irALinea(n, { foco = false } = {}) {
      const v = ta.value;
      let pos = 0;
      for (let k = 0; k < n; k++) { const i = v.indexOf('\n', pos); if (i < 0) break; pos = i + 1; }
      ta.setSelectionRange(pos, pos);
      revelar(pos, false);
      pintarActiva();
      if (foco) ta.focus();
    },
    /** Resalta un rango de líneas (el elemento seleccionado en el lienzo). */
    resaltarRango(ini, fin) {
      rango = ini == null ? null : { ini, fin };
      pintarActiva();
    },
    setTam(px) { tam = Math.max(10, Math.min(24, px)); aplicarFuente(); refrescar(); return tam; },
    getTam: () => tam,
    setAjuste(b) { ajuste = !!b; aplicarFuente(); render(); refrescar(); return ajuste; },
    getAjuste: () => ajuste,
    abrirBuscar,
    refrescar,
    destruir() {
      el_.destruido = true;
      document.removeEventListener('selectionchange', alSel);
      if (obs) obs.disconnect();
    },
  };
}
