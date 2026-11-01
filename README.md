# Presentaciones

Página web (sin servidor propio) para crear y presentar diapositivas entre varias personas.
Se publica como archivos estáticos (GitHub Pages) y guarda los datos en Firebase.

- **Editor visual** tipo Canva: mover, redimensionar, girar, imán de alineación, texto en el lienzo, formas, imágenes, capas.
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
  `<script>`, `<style>`, `<iframe>`, formularios, eventos (`onclick`…) y URLs `javascript:`. Esto protege a quienes abren
  la presentación de código malicioso pegado por otra persona.
- Para animaciones o scripts propios, exporta el HTML autónomo y edítalo fuera de la página.

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
| Ctrl+Enter (en Código) | Aplicar el código |
| ← → / Espacio (presentar) | Anterior / siguiente · `F` pantalla completa · `N` notas · `Esc` salir |

## Archivos

- `index.html`, `styles.css`, `slide.css` — estructura y estilos (`slide.css` también se usa al exportar).
- `app.js` (arranque y rutas), `lista.js`, `editor.js`, `presentar.js`, `exportar.js` — pantallas.
- `store.js` — acceso a datos (Firebase o modo local). `slides.js` — modelo de diapositivas. `sanitize.js` — limpieza del HTML.
- `firebase-config.js` — **el único archivo que debes editar** para activar Firebase.
- `firestore.rules` — reglas de seguridad.
