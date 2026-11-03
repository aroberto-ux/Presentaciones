// Barra flotante de formato de texto: aparece sobre el elemento mientras se escribe en él.
// Aplica el formato a la selección (negrita, cursiva, color, tamaño…) o a todo el elemento
// (alineación). El resultado pasa siempre por el sanitizador al guardarse.

import { h } from './ui.js?v=2026.11.03-b';

const COLORES = ['#1c1f23', '#ffffff', '#c0392b', '#e67e22', '#f2c94c', '#1f7a4d', '#2563eb', '#7c3aed', '#db2777', '#6b7280'];

/**
 * @param nodo      () => elemento que se está editando (o null)
 * @param selbox    recuadro de selección (para colocar la barra sobre el elemento)
 * @param lienzo    contenedor con scroll (la barra baja si no cabe arriba)
 * @param alCambiar () => void, se llama tras cada cambio de formato
 */
export function crearBarraTexto({ nodo, selbox, lienzo, alCambiar }) {
  const botones = {};

  const cmd = (nombre, valor = null) => {
    document.execCommand(nombre, false, valor);
    alCambiar();
    estado();
  };

  const btn = (clave, contenido, titulo, fn) => {
    const b = h('button', { type: 'button', class: 'bt', title: titulo, 'aria-label': titulo }, contenido);
    // Pulsar la barra no debe quitarle el foco al texto que se está editando.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    botones[clave] = b;
    return b;
  };
  const sep = () => h('span', { class: 'bt-sep', 'aria-hidden': 'true' });

  const colores = h('div', { class: 'bt-colores', hidden: true }, COLORES.map((c) => {
    const s = h('button', { type: 'button', class: 'bt-color', title: c, 'aria-label': `Color ${c}` });
    s.style.background = c;
    s.addEventListener('mousedown', (e) => e.preventDefault());
    s.addEventListener('click', (e) => { e.preventDefault(); cmd('foreColor', c); colores.hidden = true; });
    return s;
  }));

  function alinear(v) {
    const n = nodo();
    if (!n) return;
    n.style.textAlign = v;
    alCambiar();
    estado();
  }

  function tamano(delta) {
    const n = nodo();
    const sel = getSelection();
    if (!n || !sel || !sel.rangeCount) return;
    if (sel.isCollapsed) {
      // Sin selección: cambia el tamaño de todo el elemento.
      const fs = parseFloat(getComputedStyle(n).fontSize) || 28;
      n.style.fontSize = Math.max(8, Math.min(400, fs + delta)) + 'px';
      alCambiar();
      return;
    }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7'); // marca la selección con <font size=7>
    document.execCommand('styleWithCSS', false, true);
    const fuentes = Array.from(n.querySelectorAll('font[size="7"]'));
    if (!fuentes.length) return;
    const spans = fuentes.map((f) => {
      const base = parseFloat(getComputedStyle(f.parentElement || n).fontSize) || 28;
      const s = document.createElement('span');
      s.style.fontSize = Math.max(8, Math.min(400, Math.round(base + delta))) + 'px';
      while (f.firstChild) s.appendChild(f.firstChild);
      s.querySelectorAll('[style*="font-size"]').forEach((x) => x.style.removeProperty('font-size'));
      f.replaceWith(s);
      return s;
    });
    const r = document.createRange();
    r.setStartBefore(spans[0]);
    r.setEndAfter(spans[spans.length - 1]);
    sel.removeAllRanges();
    sel.addRange(r);
    alCambiar();
  }

  const raiz = h('div', { class: 'barra-texto', role: 'toolbar', 'aria-label': 'Formato de texto', hidden: true },
    btn('bold', h('b', {}, 'B'), 'Negrita (Ctrl+B)', () => cmd('bold')),
    btn('italic', h('i', {}, 'I'), 'Cursiva (Ctrl+I)', () => cmd('italic')),
    btn('underline', h('u', {}, 'U'), 'Subrayado (Ctrl+U)', () => cmd('underline')),
    btn('strikeThrough', h('s', {}, 'S'), 'Tachado', () => cmd('strikeThrough')),
    sep(),
    btn('menos', 'A−', 'Reducir el texto seleccionado (o todo el elemento)', () => tamano(-4)),
    btn('mas', 'A+', 'Aumentar el texto seleccionado (o todo el elemento)', () => tamano(4)),
    btn('color', h('span', { class: 'bt-a' }, 'A'), 'Color del texto', () => { colores.hidden = !colores.hidden; }),
    sep(),
    btn('al-left', '⇤', 'Alinear a la izquierda', () => alinear('left')),
    btn('al-center', '↔', 'Centrar', () => alinear('center')),
    btn('al-right', '⇥', 'Alinear a la derecha', () => alinear('right')),
    sep(),
    btn('ul', '•≡', 'Lista con viñetas', () => cmd('insertUnorderedList')),
    btn('ol', '1.', 'Lista numerada', () => cmd('insertOrderedList')),
    sep(),
    btn('limpiar', 'Tx', 'Quitar el formato de la selección', () => cmd('removeFormat')),
    colores);
  document.body.append(raiz);

  function estado() {
    for (const c of ['bold', 'italic', 'underline', 'strikeThrough']) {
      let on = false;
      try { on = document.queryCommandState(c); } catch { /* ignorar */ }
      botones[c].classList.toggle('activo', on);
    }
    const n = nodo();
    if (n) {
      const a = getComputedStyle(n).textAlign;
      const v = a === 'start' ? 'left' : a === 'end' ? 'right' : a;
      for (const k of ['left', 'center', 'right']) botones['al-' + k].classList.toggle('activo', v === k);
    }
  }

  function posicionar() {
    if (raiz.hidden) return;
    const r = selbox.getBoundingClientRect();
    const w = raiz.offsetWidth, alto = raiz.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    let y = r.top - alto - 14;
    const tope = lienzo.getBoundingClientRect().top;
    if (y < tope + 4) y = Math.min(r.bottom + 14, innerHeight - alto - 8);
    raiz.style.left = x + 'px';
    raiz.style.top = Math.max(4, y) + 'px';
  }

  function mostrar() {
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ignorar */ }
    raiz.hidden = false;
    colores.hidden = true;
    estado();
    posicionar();
  }

  function ocultar() { raiz.hidden = true; colores.hidden = true; }

  document.addEventListener('selectionchange', () => { if (!raiz.hidden) estado(); });
  addEventListener('resize', posicionar);
  lienzo.addEventListener('scroll', posicionar, { passive: true });

  return { mostrar, ocultar, posicionar, estado, raiz };
}
