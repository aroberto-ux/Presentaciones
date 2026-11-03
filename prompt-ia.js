// «Copiar prompt para IA»: genera instrucciones con las reglas del formato de esta página, el tema
// vigente y lo que la persona quiere, para pegarlas en un asistente de IA. La respuesta (una o varias
// <section>) se pega luego en «Importar» o en la pestaña Código.

import { h, modal, aviso, copiarTexto } from './ui.js?v=2026.11.03-b';
import { ENTRADAS, BUCLES } from './sanitize.js?v=2026.11.03-b';
import { LENGUAJES } from './resaltar.js?v=2026.11.03-b';

const lista = (a) => a.map((x) => `"${x}"`).join(', ');

/**
 * @param {object} o
 * @param {object} o.tema        tema vigente { bg, fg, ac, suave, fuente, titulo }
 * @param {string} o.pedido      lo que se quiere que la IA cree
 * @param {number} o.cantidad    diapositivas a crear
 * @param {boolean} o.animaciones
 */
export function construirPrompt({ tema, pedido, cantidad = 1, animaciones = true }) {
  const n = Math.max(1, Math.min(30, Number(cantidad) || 1));
  const lineas = [];
  lineas.push('Eres un diseñador de presentaciones. Crea diapositivas en HTML para una página de presentaciones con un formato muy concreto. Sigue estas reglas al pie de la letra.');
  lineas.push('');
  lineas.push('## Qué quiero');
  lineas.push((pedido || '').trim() || '(Describe aquí el tema, el público y lo que debe decir cada diapositiva.)');
  lineas.push('');
  lineas.push(`Número de diapositivas: ${n}.`);
  lineas.push('');
  lineas.push('## Formato de salida');
  lineas.push(n === 1
    ? '- Responde con UN solo bloque de código HTML con una `<section>`.'
    : `- Responde con UN solo bloque de código HTML que contenga ${n} elementos \`<section>\` seguidos, uno por diapositiva, en orden.`);
  lineas.push('- No añadas `<html>`, `<head>`, `<body>`, CSS externo, `<script>` ni imágenes locales. No expliques nada fuera del bloque de código.');
  lineas.push('');
  lineas.push('## Reglas del lienzo');
  lineas.push('- Cada diapositiva mide exactamente 1280 × 720 px. Todo elemento va con `position:absolute` y `left`, `top` y `width` en px (los de tipo imagen, forma y bloque HTML también `height`).');
  lineas.push('- Mantén márgenes de unos 80 px y nada fuera del lienzo. El texto no debe salirse de su caja: calcula bien el espacio (con 30 px de letra caben unos 70 caracteres en 1120 px de ancho).');
  lineas.push('- Cada `<section>` lleva el fondo: `<section style="background:…">`.');
  lineas.push('- Cada elemento es un `<div>` (o `<img>`) hijo directo de la `<section>` con un atributo `data-t`. Tipos permitidos:');
  lineas.push('  - `data-t="texto"`: texto. Admite `<b> <i> <u> <br> <ul> <ol> <li> <a href="https://…"> <span style="…"> <code>`. Usa `font-size`, `font-weight`, `color`, `line-height`, `text-align`, `font-family` en `style`.');
  lineas.push('  - `data-t="forma"`: rectángulos, círculos, etc. con `background`, `border-radius` o `clip-path`; puede contener texto centrado.');
  lineas.push('  - `data-t="img"`: `<img src="https://…" alt="">` solo con direcciones `https` reales (o `data:image/…`). Si no tienes una dirección segura, usa una forma con texto como marcador.');
  lineas.push('  - `data-t="linea"`: no la inventes; usa `forma` con altura pequeña para líneas.');
  lineas.push('  - `data-t="tabla"`: `<div data-t="tabla" style="…;font-size:26px"><table style="width:100%"><tbody><tr><th>…</th></tr><tr><td>…</td></tr></tbody></table></div>`.');
  lineas.push(`  - \`data-t="formula"\`: fórmula LaTeX (KaTeX) sin contenido dentro: \`<div data-t="formula" data-tex="\\int_0^1 x^2\\,dx" style="position:absolute;left:80px;top:300px;font-size:64px;color:${tema.fg}"></div>\` (añade \`data-d="1"\` para estilo de ecuación grande).`);
  lineas.push(`  - \`data-t="codigo"\`: bloque de código con colores. El código va como texto dentro de un \`<pre>\` (empieza con un salto de línea y escapa < > &): \`<div data-t="codigo" data-lang="python" data-tema="oscuro" data-nums="1" data-barra="1" data-titulo="ejemplo.py" data-res="2,4-6" style="position:absolute;left:80px;top:200px;width:720px;font-size:24px"><pre>\\n…código…</pre></div>\`. Lenguajes: ${lista(LENGUAJES.map(([v]) => v))}. Temas: "oscuro", "claro", "terminal". \`data-res\` (líneas resaltadas) y \`data-lin-anim="1"\` (aparece línea por línea al presentar) son opcionales.`);
  lineas.push('- No uses `data-eid`.');
  lineas.push('');
  lineas.push('## Diseño y tema');
  lineas.push('Usa este tema para que toda la presentación se vea coherente:');
  lineas.push(`- Fondo: \`${tema.bg}\``);
  lineas.push(`- Color del texto: \`${tema.fg}\``);
  lineas.push(`- Color de acento (barras, números, formas destacadas): \`${tema.ac}\``);
  lineas.push(`- Fondo suave (tarjetas): \`${tema.suave}\``);
  lineas.push(`- Fuente de los títulos: \`${tema.titulo}\``);
  lineas.push(`- Fuente del texto: \`${tema.fuente}\``);
  lineas.push('- Títulos de 52 a 72 px en negrita, texto de 28 a 34 px, nunca menos de 24 px. Una idea por diapositiva, poco texto, mucho espacio en blanco.');
  lineas.push('- Primera diapositiva como portada; si hay más de cinco, separa los temas con diapositivas de sección.');
  if (animaciones) {
    lineas.push('');
    lineas.push('## Animaciones (opcional pero deseadas)');
    lineas.push('Se añaden como atributos del elemento y solo se ven al presentar:');
    lineas.push(`- \`data-anim\` (entrada): ${lista(ENTRADAS)}.`);
    lineas.push(`- \`data-bucle\` (movimiento continuo): ${lista(BUCLES)}.`);
    lineas.push('- `data-disp="clic"`: el elemento espera oculto y aparece con un clic o la tecla → (úsalo para revelar los puntos de una lista, uno por uno).');
    lineas.push('- Duración y retraso en el `style`: `--dur:800ms;--delay:200ms`.');
    lineas.push('- Úsalas con moderación: una entrada suave en el título, aparición por clic en los puntos importantes. No pongas movimiento continuo en el texto.');
    lineas.push('- Para animaciones propias puedes poner al principio de la `<section>` un `<style>` solo con `@keyframes` (nombre único que no empiece por `pres-`) y reglas de clase simples (`.mi-clase { animation: nombre 2s infinite }`); `@import`, `@media` y `url()` externos se eliminan.');
  }
  lineas.push('');
  lineas.push('Entrega el HTML listo para pegar.');
  return lineas.join('\n');
}

/**
 * @param {object}   o
 * @param {Function} o.tema    () => tema vigente
 */
export function abrirPromptIA({ tema }) {
  const pedido = h('textarea', { class: 'imp-ta', rows: 4, 'aria-label': 'Qué debe crear la IA', placeholder: 'Ej.: 5 diapositivas sobre la fotosíntesis para estudiantes de bachillerato: qué es, fases, ecuación química, importancia.' });
  const cantidad = h('input', { type: 'number', min: 1, max: 30, value: '1', 'aria-label': 'Número de diapositivas' });
  const anim = h('input', { type: 'checkbox', checked: true });
  const vista = h('textarea', { class: 'imp-ta imp-vista', rows: 9, readonly: true, 'aria-label': 'Prompt generado', spellcheck: 'false' });
  const actualizar = () => { vista.value = construirPrompt({ tema: tema(), pedido: pedido.value, cantidad: cantidad.value, animaciones: anim.checked }); };
  for (const x of [pedido, cantidad]) x.addEventListener('input', actualizar);
  anim.addEventListener('change', actualizar);
  actualizar();

  modal({
    titulo: 'Crear diapositivas con una IA', ancho: 740,
    cuerpo: h('div', {},
      h('p', { class: 'vacio-panel' }, 'Describe lo que quieres, copia el prompt y pégalo en tu asistente de IA (Claude, ChatGPT, Gemini…). Incluye las reglas de esta página y el tema de tu presentación, así que la respuesta encaja a la primera.'),
      h('label', { class: 'campo' }, h('span', {}, 'Qué debe crear'), pedido),
      h('div', { class: 'fila', style: { alignItems: 'center', gap: '16px', marginTop: '8px' } },
        h('label', { class: 'num' }, 'Diapositivas', cantidad),
        h('label', { class: 'fila', style: { alignItems: 'center', gap: '8px' } }, anim, 'Pedir animaciones')),
      h('details', { class: 'paleta', style: { marginTop: '8px' } }, h('summary', {}, 'Ver el prompt completo'), vista),
      h('p', { class: 'vacio-panel' }, 'Cuando la IA responda, copia su código y usa «＋ → Importar guion o HTML…» (cada <section> será una diapositiva), o pégalo en la pestaña Código de una diapositiva.')),
    acciones: [
      { texto: 'Cerrar', fn: (c) => c(null) },
      {
        texto: 'Copiar prompt', primario: true,
        fn: async () => { actualizar(); let ok = true; try { await copiarTexto(vista.value); } catch { ok = false; } aviso(ok ? 'Prompt copiado. Pégalo en tu asistente de IA.' : 'No se pudo copiar; ábrelo en «Ver el prompt completo» y cópialo a mano.', ok ? 'ok' : 'error', 4500); },
      },
    ],
  });
  setTimeout(() => pedido.focus(), 50);
}
