// Operaciones sobre la tabla de un elemento «tabla» (filas, columnas, encabezado).
// Trabajan directamente sobre el DOM del elemento; quien las llama guarda el resultado.

const celdasPorFila = (t) => Math.max(1, ...Array.from(t.rows, (r) => r.cells.length));

function nuevaCelda(tag, texto = '') {
  const c = document.createElement(tag);
  if (texto) c.textContent = texto; else c.append(document.createElement('br'));
  return c;
}

function cambiarTag(celda, tag) {
  if (celda.localName === tag) return celda;
  const n = document.createElement(tag);
  for (const a of Array.from(celda.attributes)) n.setAttribute(a.name, a.value);
  while (celda.firstChild) n.appendChild(celda.firstChild);
  celda.replaceWith(n);
  return n;
}

/** Inserta una fila debajo de la de `celda`. Devuelve su primera celda. */
export function agregarFila(t, celda) {
  const fila = celda ? celda.closest('tr') : t.rows[t.rows.length - 1];
  const tr = document.createElement('tr');
  for (let j = 0; j < celdasPorFila(t); j++) tr.append(nuevaCelda('td'));
  if (fila) fila.after(tr); else (t.tBodies[0] || t).append(tr);
  return tr.cells[0];
}

/** Quita la fila de `celda` (nunca la última). Devuelve una celda cercana o null. */
export function quitarFila(t, celda) {
  if (t.rows.length <= 1) return null;
  const fila = celda ? celda.closest('tr') : t.rows[t.rows.length - 1];
  const vecina = fila.nextElementSibling || fila.previousElementSibling;
  const i = celda ? celda.cellIndex : 0;
  fila.remove();
  return vecina ? (vecina.cells[i] || vecina.cells[0]) : null;
}

/** Inserta una columna a la derecha de la de `celda`. Devuelve la nueva celda de la fila activa. */
export function agregarColumna(t, celda) {
  const idx = celda ? celda.cellIndex : celdasPorFila(t) - 1;
  const filaActiva = celda ? celda.closest('tr') : null;
  let activa = null;
  for (const fila of Array.from(t.rows)) {
    const ref = fila.cells[idx];
    const esEnc = ref ? ref.localName === 'th' : false;
    const n = nuevaCelda(esEnc ? 'th' : 'td', esEnc ? 'Encabezado' : '');
    if (ref) ref.after(n); else fila.append(n);
    if (fila === filaActiva) activa = n;
  }
  return activa || t.rows[0].cells[idx + 1] || null;
}

/** Quita la columna de `celda` (nunca la última). */
export function quitarColumna(t, celda) {
  if (celdasPorFila(t) <= 1) return null;
  const idx = celda ? celda.cellIndex : celdasPorFila(t) - 1;
  const fila = celda ? celda.closest('tr') : t.rows[0];
  for (const f of Array.from(t.rows)) if (f.cells[idx]) f.cells[idx].remove();
  return fila.cells[Math.min(idx, fila.cells.length - 1)] || null;
}

export const tieneEncabezado = (t) => !!t.rows[0] && Array.from(t.rows[0].cells).every((c) => c.localName === 'th');

/** Convierte la primera fila en encabezado (th) o en filas normales (td). */
export function alternarEncabezado(t) {
  const fila = t.rows[0];
  if (!fila) return;
  const a = tieneEncabezado(t) ? 'td' : 'th';
  for (const c of Array.from(fila.cells)) cambiarTag(c, a);
}

/** Celda a la que se llega con Tab (o Mayús+Tab). `crear` añade una fila al pasar de la última celda. */
export function celdaVecina(t, celda, atras, crear = true) {
  const todas = Array.from(t.querySelectorAll('td,th'));
  const i = todas.indexOf(celda);
  if (i < 0) return todas[0] || null;
  if (atras) return todas[i - 1] || celda;
  if (i === todas.length - 1) return crear ? agregarFila(t, celda) : celda;
  return todas[i + 1];
}
