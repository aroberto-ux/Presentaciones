# Presentaciones

Página web (sin servidor propio) para crear y presentar diapositivas entre varias personas.
Se publica como archivos estáticos (GitHub Pages) y guarda los datos en Firebase.

- **Editor visual** tipo Canva: mover, redimensionar, girar, imán de alineación, texto en el lienzo, formas, imágenes, capas.
- **Para quien no usa HTML**: barra de formato al escribir (negrita, color, tamaño, listas…), **fórmulas LaTeX**, **tablas**, **líneas y flechas**.
- **Editor de código**: el HTML de cada diapositiva (o de un solo elemento) se edita y se aplica con `Ctrl+Enter`.
- **Colaboración en tiempo real**: los cambios de otras personas aparecen al instante; se ve quién está conectado, en qué diapositiva y qué elemento selecciona.
- **Modo presentar** (`F` = pantalla completa, `N` = notas) y enlaces directos: `#presentar/<id>/4`.
- **Exportar**: HTML autónomo (funciona sin conexión), copia `.json`, PDF (imprimir).

## Probarla ya, sin configurar nada

```bash
cd presentaciones
python3 -m http.server 8000
```

Abre <http://localhost:8000>. Mientras `firebase-config.js` tenga `firebaseConfig = null`, todo se guarda en tu navegador (modo local).
No abras `index.html` con doble clic: los módulos de JavaScript necesitan un servidor.

## Activar la edición entre varias personas (Firebase, gratis)

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto**.
2. En el proyecto: **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Habilitar**.
   (Si quieres limitar quién edita, habilita **Google** y usa la variante B de las reglas; ver abajo.)
3. **Compilación → Firestore Database → Crear base de datos** (modo producción, la región más cercana).
4. En Firestore, pestaña **Reglas**: pega el contenido de `firestore.rules` y **Publicar**.
5. **Configuración del proyecto (⚙) → Tus apps → `</>` Web** → registra la app y copia el objeto `firebaseConfig`.
6. Pégalo en `firebase-config.js` en lugar de `null`.
7. **Authentication → Configuración → Dominios autorizados**: agrega tu dominio de GitHub Pages
   (por ejemplo `tu-usuario.github.io`). Sin esto el inicio de sesión falla en la web publicada.

## Publicar en GitHub Pages

1. Crea un repositorio y sube **el contenido de esta carpeta** (el `index.html` debe quedar en la raíz del repositorio o de la carpeta publicada).
2. **Settings → Pages → Deploy from a branch →** `main` / `(root)`.
3. Tu página queda en `https://tu-usuario.github.io/tu-repo/`.

Para añadirla a tu sitio de horarios, puedes subirla como subcarpeta (`horarios_unal/presentaciones/`) y enlazarla.

## Quién puede editar

| Variante | Quién edita | Cuándo usarla |
|---|---|---|
| **A · abierta con enlace** (por defecto) | Cualquiera que abra la página | Un grupo de clase o equipo de confianza |
| **B · lista de correos** | Solo los correos que pongas en las reglas | Cuando el contenido deba estar protegido |

La clave de `firebaseConfig` **no es secreta**: lo que protege tus datos son las reglas de Firestore.
Con la variante A, quien conozca la dirección de la página puede editar; no publiques el enlace en abierto.

## Cómo se guarda

```
presentaciones/{id}                     título, tema, fechas
presentaciones/{id}/diapositivas/{sid}  orden, fondo, notas, elementos
presentaciones/{id}/presencia/{uid}     nombre, color, diapositiva y elemento seleccionado
```

Cada elemento de una diapositiva se guarda por separado (`el.<id>`), así que dos personas que editen
elementos distintos de la misma diapositiva **no se pisan**. Si dos personas editan el *mismo* elemento a la vez, gana el último cambio.

Límite de Firestore: ≈ 1 MB por diapositiva. Las imágenes subidas se reducen y se incrustan; si una diapositiva se llena,
usa imágenes por dirección web (`https://…`).

## Editor de código (al estilo Overleaf)

En la pestaña **Código** del panel derecho:

- **Ensanchar**: arrastra el divisor entre la diapositiva y el panel (doble clic = restablecer; con el teclado, enfócalo y usa ← →). La pestaña Código recuerda su propio ancho.
- **Modo dividido** (botón ⤢): el código ocupa la izquierda y la diapositiva se ve en vivo a la derecha. Vuelve con ⤡.
- **Plegar** la lista de diapositivas o el panel con la flecha que aparece sobre cada divisor.
- **Editor real**: números de línea (también con líneas ajustadas), colores de HTML y de los estilos CSS, buscar y reemplazar (Ctrl+F / Ctrl+H), autocompletado de etiquetas, propiedades CSS y valores (Ctrl+Espacio), sangría automática, cierre de etiquetas y comillas, tamaño de letra (A− A+) y ajuste de líneas largas.
- **Código ordenado**: cada propiedad CSS va en su propia línea para que sea legible. Al aplicar, se vuelve a normalizar.
- **Sincronía con el lienzo**: al poner el cursor dentro de un elemento, se selecciona en el lienzo; al seleccionar un elemento en el lienzo, su código se resalta y el cursor salta a él.
- **Aplicar al escribir**: la diapositiva se actualiza sola poco después de dejar de teclear. Todo lo aplicado así cuenta como **un solo paso** de deshacer. También puedes aplicar a mano con Ctrl+Enter.

## Herramientas visuales

- **Fórmulas (∑ Fórmula)**: escribe código LaTeX (`\frac{a}{b}`, `\int_0^1 x^2\,dx`, `\ce{H2O}` para química) y se dibuja al instante.
  El panel trae una paleta de símbolos, letras griegas, matrices y ejemplos. Doble clic en la fórmula para editarla; se escala con las esquinas.
  KaTeX viene incluido en `vendor/katex`, así que funciona sin internet y también en el HTML exportado. Por seguridad no se permiten `\href`, `\url` ni imágenes.
- **Formato de texto**: al hacer doble clic en un texto aparece una barra sobre él con negrita, cursiva, subrayado, tachado, tamaño (de la selección),
  color, alineación y listas.
- **Tablas (Tabla ▾)**: elige el tamaño y escribe en las celdas. `Tab` pasa a la siguiente celda (en la última crea una fila).
  En el panel: añadir o quitar filas y columnas junto a la celda activa, encabezado, filas alternas y colores.
- **Líneas y flechas (Formas ▾)**: línea, flecha, flecha de doble punta y línea punteada. Se alargan con los puntos laterales, se giran con el de arriba,
  y en el panel se cambia grosor, color, puntas y estilo. También hay rombo y hexágono.
- **Bloques de código (‹/› Código ▾ → Bloque de código)**: ventana de código con colores para Python, JavaScript, Java, C, C++, MATLAB/Octave, R, SQL, Bash, HTML, CSS y JSON.
  En el panel: lenguaje, tema (oscuro, claro, terminal), números de línea, barra con título, líneas resaltadas (`2, 4-6`) y «mostrar línea por línea al presentar».
  Solo se guarda el texto; los colores se calculan al mostrarlo. Doble clic para editar; las esquinas cambian el tamaño de la letra.
- **Animaciones (panel Diseño → Animación)**: cualquier elemento puede tener un *efecto de entrada* (aparecer, subir, bajar, entrar de un lado, zoom, rebote, desenfoque, barrido),
  un *movimiento continuo* (pulso, flotar, girar, saltar, parpadeo, latido), duración, retraso y empezar *con un clic*: esos elementos aparecen uno a uno con espacio, → o un toque,
  y ← los vuelve a ocultar. «▶ Probar animaciones» las reproduce en el editor. Respetan «reducir movimiento» del sistema.

## El código HTML de una diapositiva

```html
<section style="background:#ffffff">
  <div data-eid="eab12cd" data-t="texto"
       style="position:absolute;left:96px;top:120px;width:900px;font-size:64px;font-weight:700">
    Mi título
  </div>
  <img data-eid="exy98zq" data-t="img" src="https://…"
       style="position:absolute;left:700px;top:300px;width:400px;height:260px;object-fit:cover">
</section>
```

- El lienzo mide **1280 × 720 px**; todo es `position:absolute`.
- El orden en el código es el orden de capas (lo último queda encima).
- `data-eid` identifica el elemento: si lo conservas, el cambio se aplica a ese elemento; si lo quitas, se crea uno nuevo.
- Se permiten estilos en línea, SVG, tablas, listas, enlaces y `https`/`data:image`. Se eliminan automáticamente
  `<script>`, `<iframe>`, formularios, eventos (`onclick`…) y URLs `javascript:`. Esto protege a quienes abren
  la presentación de código malicioso pegado por otra persona.
- Elementos especiales: `data-t="formula"` con `data-tex="…"` (el LaTeX), `data-t="linea"` (línea/flecha) y `data-t="tabla"` (con un `<table>` dentro).
- Atributos de animación: `data-anim="zoom"` (aparecer, arriba, abajo, izquierda, derecha, zoom, pop, desenfoque, barrido),
  `data-bucle="flotar"` (pulso, flotar, girar, rebote, parpadeo, latido), `data-disp="clic"`, y `--dur` / `--delay` en el `style` (por ejemplo `--dur:900ms`).
- Bloque de código: `<div data-t="codigo" data-lang="python" data-tema="oscuro" data-nums="1" data-barra="1" data-titulo="ejemplo.py" data-res="2,4-6"><pre>…tu código…</pre></div>`.
- **Animaciones propias con CSS**: al principio de la diapositiva puedes escribir un `<style>` con `@keyframes` y reglas de selectores simples
  (`.clase`, `#id`, `etiqueta`, `[data-t="texto"]`), por ejemplo `.latir { animation: mi-latido 1.2s infinite; }`, y poner `class="latir"` en un elemento.
  Se permiten solo propiedades visuales seguras; `@import`, `@media`, `url()` externas y `position:fixed` se eliminan. Los nombres de `@keyframes` son globales:
  usa nombres únicos (no empiecen por `pres-`). Las animaciones solo corren al presentar, en el HTML exportado y con «Probar».
- No se permiten `<script>` propios (por seguridad); para eso exporta el HTML autónomo y edítalo fuera de la página.

## Atajos

| Tecla | Acción |
|---|---|
| Doble clic / Enter | Escribir en un texto |
| Supr | Eliminar elemento |
| Flechas (+ Mayús) | Mover 1 px (10 px) |
| Ctrl+C / X / V / D | Copiar / cortar / pegar / duplicar |
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer (solo tus cambios) |
| Ctrl+] / Ctrl+[ | Subir / bajar capa |
| Mayús al mover | Bloquear eje · Alt: sin imán |
| Tab / Mayús+Tab (en una tabla) | Celda siguiente / anterior |
| Enter (con una fórmula seleccionada) | Editar su LaTeX |
| Ctrl+Enter (en Código) | Aplicar el código |
| Ctrl+F / Ctrl+H (en Código) | Buscar / reemplazar |
| Ctrl+Espacio (en Código) | Autocompletar |
| Tab / Mayús+Tab (en Código) | Sangrar / quitar sangría |
| ← → / Espacio (presentar) | Anterior / siguiente · `F` pantalla completa · `N` notas · `Esc` salir |

## Archivos

- `index.html`, `styles.css`, `slide.css` — estructura y estilos (`slide.css` también se usa al exportar).
- `app.js` (arranque y rutas), `lista.js`, `editor.js`, `presentar.js`, `exportar.js` — pantallas.
- `codigo-editor.js` — el editor de código (sin dependencias). `paneles.js` — divisores y modo dividido.
- `store.js` — acceso a datos (Firebase o modo local). `slides.js` — modelo de diapositivas. `sanitize.js` — limpieza del HTML.
- `formula.js` (fórmulas LaTeX), `formato.js` (barra de formato de texto), `tabla.js` (operaciones de tablas), `vendor/katex/` (KaTeX 0.16, licencia MIT).
- `version.js` — número de versión (aparece al final de la lista y en los avisos de error).
- `firebase-config.js` — **el único archivo que debes editar** para activar Firebase.
- `firestore.rules` — reglas de seguridad.

## Si algo se ve raro después de subir cambios

GitHub Pages tarda unos minutos en actualizar los archivos. Recarga con **Ctrl+Shift+R**. Al final de la lista de presentaciones aparece la
**versión**; si la página mezcla archivos viejos y nuevos, un aviso rojo lo indica. El aviso también muestra cualquier error y tiene un botón para copiar el detalle.
