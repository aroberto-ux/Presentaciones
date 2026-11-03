// Editor del JSON de la presentación: ver y modificar todo (título, tema, diapositivas y sus elementos)
// como texto. Al aplicar, se compara con lo que hay y solo se envían los cambios; todo el contenido
// pasa por el mismo limpiador de HTML que el resto de la página.

import { h, modal, aviso, confirmar } from './ui.js?v=2026.11.03-b';
import { TEMAS, paletaSegura, limpiarHtmlElemento, idsOrdenados, pesoDiapositiva, LIMITE_BYTES, nuevoId } from './slides.js?v=2026.11.03-b';
import { declaracionSegura } from './sanitize.js?v=2026.11.03-b';

const MAX_DIAPOSITIVAS = 300;
const ID_EL = /^e[a-z0-9]{3,24}$/;
const ID_DIAP = /^[A-Za-z0-9_-]{1,40}$/;

/** El JSON de una presentación tal como se muestra en el editor (con los id para poder actualizar sin duplicar). */
export function jsonDePresentacion(pres, slides) {
  const obj = { formato: 'presentaciones-v1', titulo: (pres && pres.titulo) || '', tema: (pres && pres.tema) || 'claro' };
  if (obj.tema === 'personalizado' && pres.paleta) obj.paleta = pres.paleta;
  obj.diapositivas = slides.map((s) => {
    const el = {};
    for (const id of idsOrdenados(s)) el[id] = { z: s.el[id].z, h: s.el[id].h };
    return { id: s.id, bg: s.bg || '#ffffff', notas: s.notas || '', el };
  });
  return JSON.stringify(obj, null, 2);
}

/** Línea y columna de un error de JSON.parse (los navegadores lo expresan de distintas formas). */
export function errorJson(texto, e) {
  const msg = String((e && e.message) || e);
  let pos = null;
  let m = /position (\d+)/i.exec(msg);
  if (m) pos = Number(m[1]);
  m = /line (\d+) column (\d+)/i.exec(msg);
  let linea = null, col = null;
  if (m) { linea = Number(m[1]); col = Number(m[2]); }
  if (pos == null && linea != null) {
    const ls = texto.split('\n');
    pos = ls.slice(0, linea - 1).reduce((a, l) => a + l.length + 1, 0) + col - 1;
  }
  if (pos != null && linea == null) {
    const antes = texto.slice(0, pos);
    linea = antes.split('\n').length;
    col = pos - antes.lastIndexOf('\n');
  }
  return { mensaje: msg.replace(/\s*\(line \d+ column \d+\)/i, '').replace(/\s*at position \d+.*$/i, ''), linea, col, pos };
}

const fallo = (mensaje) => ({ ok: false, error: { mensaje, linea: null, col: null, pos: null } });

/**
 * Convierte el texto en un plan de cambios respecto al estado actual. No escribe nada.
 * @returns {{ok:false, error}|{ok:true, plan, avisos:string[], resumen, stats}}
 */
export function planDeCambios(texto, pres, slides, BORRAR) {
  let obj;
  try { obj = JSON.parse(texto); } catch (e) { return { ok: false, error: errorJson(texto, e) }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fallo('La raíz debe ser un objeto { … } con la lista «diapositivas».');
  if (!Array.isArray(obj.diapositivas)) return fallo('Falta «diapositivas»: debe ser una lista [ … ] con al menos una diapositiva.');
  if (!obj.diapositivas.length) return fallo('Debe haber al menos una diapositiva.');
  if (obj.diapositivas.length > MAX_DIAPOSITIVAS) return fallo(`Hay demasiadas diapositivas (máximo ${MAX_DIAPOSITIVAS}).`);

  const avisos = [];
  const actuales = new Map(slides.map((s) => [s.id, s]));

  // título y tema
  let titulo = typeof obj.titulo === 'string' ? obj.titulo.trim().slice(0, 120) : '';
  if (!titulo) { titulo = pres.titulo || 'Presentación'; avisos.push('El título está vacío o no es texto: se conserva el actual.'); }
  let tema = pres.tema || 'claro';
  let paleta = tema === 'personalizado' ? (pres.paleta || null) : null;
  if (TEMAS[obj.tema]) { tema = obj.tema; paleta = null; }
  else if (obj.tema === 'personalizado' && paletaSegura(obj.paleta)) { tema = 'personalizado'; paleta = paletaSegura(obj.paleta); }
  else if (obj.tema !== undefined) avisos.push('El tema no es válido: se conserva el actual.');

  // diapositivas
  const usados = new Set();
  const finales = [];
  let descartados = 0, fondosInvalidos = 0, elementos = 0;
  for (let i = 0; i < obj.diapositivas.length; i++) {
    const d = obj.diapositivas[i];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return fallo(`La diapositiva ${i + 1} debe ser un objeto { … }.`);
    let id = typeof d.id === 'string' && ID_DIAP.test(d.id) && !usados.has(d.id) ? d.id : null;
    if (!id) id = 's' + nuevoId().slice(1);
    usados.add(id);

    const entradas = Array.isArray(d.el) ? d.el.map((e) => [null, e]) : (d.el && typeof d.el === 'object' ? Object.entries(d.el) : []);
    const el = {};
    entradas.forEach(([k, e], j) => {
      const limpio = e && typeof e.h === 'string' ? limpiarHtmlElemento(e.h) : null;
      if (!limpio) { descartados++; return; }
      let eid = k && ID_EL.test(k) && !el[k] ? k : nuevoId();
      while (el[eid]) eid = nuevoId();
      el[eid] = { z: Number.isFinite(e.z) ? e.z : j + 1, h: limpio };
    });
    elementos += Object.keys(el).length;

    let bg = '#ffffff';
    if (typeof d.bg === 'string' && d.bg.length <= 500 && declaracionSegura('background:' + d.bg)) bg = d.bg;
    else if (d.bg !== undefined && d.bg !== null && d.bg !== '') fondosInvalidos++;
    const notas = String(d.notas == null ? '' : d.notas).slice(0, 5000);
    const datos = { bg, notas, el };
    if (pesoDiapositiva(datos) > LIMITE_BYTES) return fallo(`La diapositiva ${i + 1} pesa demasiado para guardarse (quita imágenes incrustadas o usa direcciones web).`);
    finales.push({ id, existente: actuales.has(id), datos });
  }
  if (descartados) avisos.push(`${descartados} elemento${descartados === 1 ? '' : 's'} sin HTML válido se descartó${descartados === 1 ? '' : 'ron'}.`);
  if (fondosInvalidos) avisos.push(`${fondosInvalidos} fondo${fondosInvalidos === 1 ? '' : 's'} no válido${fondosInvalidos === 1 ? '' : 's'} se reemplazó por blanco.`);

  // diferencias
  const secActual = slides.filter((s) => usados.has(s.id)).map((s) => s.id);
  const secNueva = finales.filter((f) => f.existente).map((f) => f.id);
  const mismoOrden = secActual.length === secNueva.length && secActual.every((id, i) => id === secNueva[i]);
  const crear = [], actualizar = [];
  finales.forEach((f, i) => {
    const orden = i + 1;
    if (!f.existente) { crear.push({ id: f.id, datos: f.datos, orden }); return; }
    const s = actuales.get(f.id);
    const parche = {};
    if ((s.bg || '#ffffff') !== f.datos.bg) parche.bg = f.datos.bg;
    if ((s.notas || '') !== f.datos.notas) parche.notas = f.datos.notas;
    for (const [eid, e] of Object.entries(f.datos.el)) {
      const c = s.el && s.el[eid];
      if (!c || c.z !== e.z || c.h !== e.h) parche['el.' + eid] = { z: e.z, h: e.h };
    }
    for (const eid of Object.keys(s.el || {})) if (!(eid in f.datos.el)) parche['el.' + eid] = BORRAR;
    const cambiaOrden = (!mismoOrden || crear.length || finales.some((x) => !x.existente)) && s.orden !== orden;
    const soloOrden = !Object.keys(parche).length;
    if (cambiaOrden) parche.orden = orden;
    if (Object.keys(parche).length) actualizar.push({ id: f.id, parche, soloOrden: soloOrden && cambiaOrden });
  });
  const eliminar = slides.filter((s) => !usados.has(s.id)).map((s) => s.id);

  const cambiaPres = titulo !== (pres.titulo || '') || tema !== (pres.tema || 'claro') || JSON.stringify(paleta || null) !== JSON.stringify((tema === 'personalizado' ? pres.paleta : null) || null);
  const modificadas = actualizar.filter((u) => !u.soloOrden).length;
  const reordenadas = actualizar.filter((u) => u.soloOrden).length;
  return {
    ok: true,
    plan: { pres: cambiaPres ? { titulo, tema, paleta } : null, crear, actualizar, eliminar },
    avisos,
    resumen: { crear: crear.length, modificadas, reordenadas, eliminar: eliminar.length, pres: cambiaPres },
    stats: { diapositivas: finales.length, elementos },
    hayCambios: cambiaPres || crear.length > 0 || actualizar.length > 0 || eliminar.length > 0,
  };
}

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export function describirResumen(r) {
  const p = [];
  if (r.pres) p.push('título o tema');
  if (r.modificadas) p.push(`se modificarán ${plural(r.modificadas, 'diapositiva', 'diapositivas')}`);
  if (r.crear) p.push(`se crearán ${plural(r.crear, 'diapositiva', 'diapositivas')}`);
  if (r.eliminar) p.push(`se eliminarán ${plural(r.eliminar, 'diapositiva', 'diapositivas')}`);
  if (r.reordenadas && !r.modificadas) p.push('cambia el orden de las diapositivas');
  return p;
}

// ── Ventana ─────────────────────────────────────────────────────────────

let respaldo = null; // { pid, texto } con el JSON anterior a la última aplicación

/**
 * @param {object}   o
 * @param {string}   o.pid
 * @param {Function} o.estado   () => ({ pres, slides }) estado actual
 * @param {*}        o.BORRAR   marca de borrado del almacén
 * @param {Function} o.aplicar  (plan) => Promise<void>
 */
export function abrirEditorJson({ pid, estado, BORRAR, aplicar }) {
  const inicial = (() => { const { pres, slides } = estado(); return jsonDePresentacion(pres, slides); })();
  let tam = 13, ajuste = true;
  const inicialRef = { texto: inicial }; // lo último cargado desde la presentación (para saber si hay cambios sin aplicar)

  const ta = h('textarea', { class: 'json-ta', spellcheck: 'false', 'aria-label': 'JSON de la presentación', autocapitalize: 'off', autocomplete: 'off' });
  const nums = h('pre', { class: 'json-nums', 'aria-hidden': 'true' });
  const estadoEl = h('span', { class: 'json-estado', role: 'status' });
  const irError = h('button', { type: 'button', class: 'btn', hidden: true }, 'Ir al error');
  const avisosEl = h('div', { class: 'json-avisos', role: 'status' });
  ta.value = inicial;

  let ultimoError = null;
  const sucio = () => ta.value !== inicialRef.texto;

  function pintarNums() {
    const n = (ta.value.match(/\n/g) || []).length + 1;
    let s = '';
    for (let i = 1; i <= n; i++) s += i + '\n';
    nums.textContent = s;
  }
  function pintarFuente() {
    ta.style.fontSize = nums.style.fontSize = tam + 'px';
    ta.style.whiteSpace = ajuste ? 'pre-wrap' : 'pre';
    ta.wrap = ajuste ? 'soft' : 'off';
    caja.classList.toggle('json-sin-nums', ajuste);
  }

  function validar() {
    let obj;
    try { obj = JSON.parse(ta.value); } catch (e) {
      ultimoError = errorJson(ta.value, e);
      estadoEl.className = 'json-estado err';
      estadoEl.textContent = `JSON no válido${ultimoError.linea ? ` · línea ${ultimoError.linea}, columna ${ultimoError.col}` : ''}: ${ultimoError.mensaje}`;
      irError.hidden = ultimoError.pos == null;
      return;
    }
    ultimoError = null; irError.hidden = true;
    const ds = obj && Array.isArray(obj.diapositivas) ? obj.diapositivas : null;
    if (!ds) { estadoEl.className = 'json-estado err'; estadoEl.textContent = 'Falta la lista «diapositivas».'; return; }
    const els = ds.reduce((a, d) => a + (d && d.el && typeof d.el === 'object' ? Object.keys(d.el).length : 0), 0);
    estadoEl.className = 'json-estado ok';
    estadoEl.textContent = `JSON válido · ${plural(ds.length, 'diapositiva', 'diapositivas')} · ${plural(els, 'elemento', 'elementos')}${sucio() ? ' · cambios sin aplicar' : ''}`;
  }
  let t = null;
  const alEscribir = () => { pintarNums(); clearTimeout(t); t = setTimeout(validar, 200); avisosEl.textContent = ''; };
  ta.addEventListener('input', alEscribir);
  ta.addEventListener('scroll', () => { nums.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); aplicarCambios(); }
    else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (!document.execCommand('insertText', false, '  ')) { ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    }
  });
  irError.addEventListener('click', () => {
    if (!ultimoError || ultimoError.pos == null) return;
    ta.focus();
    const p = Math.min(ultimoError.pos, ta.value.length);
    ta.setSelectionRange(p, Math.min(p + 1, ta.value.length));
    const linea = ultimoError.linea || 1;
    ta.scrollTop = Math.max(0, (linea - 5) * tam * 1.5);
  });

  function formatear() {
    try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); alEscribir(); validar(); aviso('JSON formateado.', 'ok', 1800); }
    catch { validar(); aviso('Corrige primero el error de sintaxis.', 'error'); }
  }
  async function recargar() {
    if (sucio() && !(await confirmar('Se descartarán tus cambios sin aplicar y se volverá a cargar el contenido actual de la presentación.', 'Recargar', '¿Descartar cambios?'))) return;
    const { pres, slides } = estado();
    const nuevo = jsonDePresentacion(pres, slides);
    ta.value = nuevo; inicialRef.texto = nuevo; alEscribir(); validar();
  }
  function descargar() {
    const blob = new Blob([ta.value], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'presentacion.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function restaurar() {
    if (!respaldo || respaldo.pid !== pid) return;
    if (sucio() && !(await confirmar('Se reemplazará el texto actual por la versión anterior a tu última aplicación.', 'Cargar versión anterior', '¿Reemplazar el texto?', false))) return;
    ta.value = respaldo.texto; alEscribir(); validar();
    aviso('Versión anterior cargada. Pulsa «Aplicar cambios» para restaurarla.', 'info', 4500);
  }

  let ocupado = false;
  async function aplicarCambios() {
    if (ocupado) return;
    const { pres, slides } = estado();
    const r = planDeCambios(ta.value, pres, slides, BORRAR);
    if (!r.ok) {
      validar();
      if (!r.error.linea) { estadoEl.className = 'json-estado err'; estadoEl.textContent = r.error.mensaje; }
      ta.focus();
      return;
    }
    avisosEl.textContent = r.avisos.join(' ');
    if (!r.hayCambios) { aviso('No hay cambios que aplicar.'); return; }
    const partes = describirResumen(r.resumen);
    const txt = `Se ${r.resumen.pres ? 'cambiará el ' : 'aplicarán estos cambios: '}${partes.join('; ')}. ` +
      'Los cambios llegan a todas las personas que editan y no se pueden deshacer con Ctrl+Z (puedes volver a esta ventana y usar «Cargar versión anterior»).' +
      (r.avisos.length ? ` Ojo: ${r.avisos.join(' ')}` : '');
    if (!(await confirmar(txt, 'Aplicar', '¿Aplicar los cambios?', !!r.resumen.eliminar))) return;
    ocupado = true;
    try {
      const { pres: p2, slides: s2 } = estado();
      respaldo = { pid, texto: jsonDePresentacion(p2, s2) };
      // el plan se vuelve a calcular con el estado más reciente por si alguien editó mientras tanto
      const r2 = planDeCambios(ta.value, p2, s2, BORRAR);
      await aplicar(r2.ok ? r2.plan : r.plan);
      inicialRef.texto = ta.value;
      cerrarVentana();
      aviso('Cambios aplicados a la presentación.', 'ok', 3500);
    } catch (e) {
      console.error(e);
      aviso('No se pudieron aplicar todos los cambios. Revisa la conexión y vuelve a intentarlo.', 'error', 5000);
    } finally { ocupado = false; }
  }

  const botones = h('div', { class: 'json-barra' },
    h('button', { type: 'button', class: 'btn', onclick: formatear, title: 'Dar formato al JSON (sangría de 2 espacios)' }, 'Formatear'),
    h('button', { type: 'button', class: 'btn-icono', title: 'Letra más pequeña', 'aria-label': 'Letra más pequeña', onclick: () => { tam = Math.max(9, tam - 1); pintarFuente(); } }, 'A−'),
    h('button', { type: 'button', class: 'btn-icono', title: 'Letra más grande', 'aria-label': 'Letra más grande', onclick: () => { tam = Math.min(24, tam + 1); pintarFuente(); } }, 'A+'),
    (() => {
      const c = h('input', { type: 'checkbox', checked: true });
      c.addEventListener('change', () => { ajuste = c.checked; pintarFuente(); });
      return h('label', { class: 'json-chk', title: 'Ajustar las líneas largas (oculta los números de línea)' }, c, 'Ajustar líneas');
    })(),
    h('span', { class: 'espacio' }),
    h('button', { type: 'button', class: 'btn', onclick: restaurar, hidden: !(respaldo && respaldo.pid === pid), title: 'Carga el JSON anterior a tu última aplicación' }, 'Cargar versión anterior'),
    h('button', { type: 'button', class: 'btn', onclick: recargar, title: 'Volver a leer la presentación actual' }, 'Recargar'),
    h('button', { type: 'button', class: 'btn', onclick: descargar }, 'Descargar .json'));

  const caja = h('div', { class: 'json-caja' },
    botones,
    h('div', { class: 'json-ed' }, nums, ta),
    h('div', { class: 'json-pie' }, estadoEl, irError),
    avisosEl,
    h('p', { class: 'vacio-panel' },
      'Cada diapositiva tiene su «id», su fondo («bg»), sus «notas» y sus elementos en «el» (cada uno con «z», el orden de capas, y «h», su HTML). ' +
      'Si conservas el id de una diapositiva o de un elemento se actualiza; si lo quitas se crea uno nuevo, y lo que borres del texto se elimina. El orden de la lista es el orden de las diapositivas. Ctrl+Enter aplica.'));

  let cerrarVentana = () => {};
  const m = modal({
    titulo: 'JSON de la presentación', ancho: 1180, clase: 'modal-json', cerrarFuera: false,
    cuerpo: caja,
    antesDeCerrar: () => (ta.value !== inicialRef.texto ? confirmar('Tienes cambios sin aplicar. Si cierras, se perderán.', 'Cerrar sin aplicar', '¿Cerrar el editor?') : true),
    acciones: [
      { texto: 'Cerrar', fn: (c) => c(null) },
      { texto: 'Aplicar cambios', primario: true, fn: () => aplicarCambios() },
    ],
  });
  cerrarVentana = () => { inicialRef.texto = ta.value; m.cerrar(true); };
  pintarNums(); pintarFuente(); validar();
  setTimeout(() => ta.focus(), 50);
  return m;
}
