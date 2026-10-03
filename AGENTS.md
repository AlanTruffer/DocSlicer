# AGENTS.md — DocSlicer

## Qué es

App de escritorio Electron para dividir, rotar, organizar y exportar páginas de PDF. UI en español (rioplatense: "seleccioná", "exportá"). Sin bundler, sin framework, sin tests.

Flujo real del producto: se abre un PDF → se ve una línea de tiempo de miniaturas → se seleccionan páginas y se agrupan en **lotes** → a cada lote se le asigna una **categoría** con campos variables → se arma el nombre `[LEGAJO]-[CATEGORÍA-VARIABLES].pdf` → se exporta un PDF por lote a una carpeta.

## Comandos

- `npm start` — lanza la app (`electron .`)
- `npm run pack` — build de directorio sin empaquetar (para testing rápido)
- `npm run dist` / `npm run build:win` — instalador Windows (NSIS + portable) con electron-builder
- `npm test` — **falla por diseño** (`echo "Error: no test specified" && exit 1`). No lo ejecutes esperando tests.
- No existen comandos de lint ni typecheck. La única verificación posible es abrir la app.

## Arquitectura

```
electron/          Proceso principal (CommonJS)
  main.js          Ventana frameless (90% del workArea del monitor bajo el cursor),
                   inicializa servicios y registra TODOS los ipcMain.handle en registerIpcHandlers().
  preload.js       contextBridge → window.api. nodeIntegration:false, contextIsolation:true.

backend/           Lógica de negocio (proceso principal, CommonJS)
  pdfProcessor.js  Divide/rota con pdf-lib. splitPdf(source, groups, outputDir, useSubfolders).
  storageManager.js Historial, categorías y borradores en JSON dentro de userData.
  thumbnailGenerator.js MD5(filePath) → PNG en disco. NO renderiza: recibe un dataURL del renderer.

frontend/          Proceso renderer (JS vanilla de navegador, sin paso de build)
  index.html       HTML único. 2 vistas + 4 modales + overlay de carga.
  assets/vendor/   NO TOCAR. Copias vendorizadas: lucide.min.js, sortable.min.js,
                   sweetalert2.min.js + sweetalert2.min.css, pdfjs/pdf.min.mjs, pdfjs/pdf.worker.min.mjs
  assets/js/       Solo pdfjsLoader.js (módulo ES, único del proyecto).
  assets/css/      bootstrap.min.css (vendor) + app.css (design system propio, 36 KB).
  views/           renderer.js (router/coordinador) + 8 módulos de vista.
  assets/icon.png  Ícono grande (~1.3 MB) usado en home, titlebar y fallback de miniaturas.

.agents/skills/    Skills de agentes instaladas (verde, find-skills, grill-me, frontend-design, using-superpowers)
skills-lock.json   Pin de versiones/ hashes de esas skills
build/icon.ico     Ícono para electron-builder y la barra de tareas de Windows
```

### Los 12 scripts del frontend (el orden importa)

```html
<script type="module" src="assets/js/pdfjsLoader.js"></script>  <!-- async, fuera de orden -->
<script src="assets/vendor/lucide.min.js"></script>
<script src="assets/vendor/sortable.min.js"></script>
<script src="assets/vendor/sweetalert2.min.js"></script>  <!-- ANTES de toastNotification -->
<script src="views/toastNotification.js"></script>   → window.toast (wrapper de SweetAlert2)
<script src="views/undoManager.js"></script>         → window.undoManager
<script src="views/categoryManager.js"></script>     → window.categoryManager + clase CategoryManager
<script src="views/zoomModal.js"></script>           → window.zoomModal
<script src="views/homeView.js"></script>            → window.homeView
<script src="views/sidePanel.js"></script>           → window.sidePanel
<script src="views/editorView.js"></script>          → window.editorView
<script src="views/renderer.js"></script>            → window.router (SIEMPRE último)
```

Cada módulo se auto-instancia en la última línea (`window.x = new X()`), así que el DOM **ya debe existir** cuando corre el script. `renderer.js` va último porque su constructor engancha la titlebar. `sweetalert2.min.js` tiene que preceder a `toastNotification.js`, que hace `Swal.mixin()` en su constructor.

Los estilos van en el mismo orden de cascada: `bootstrap.min.css` → `sweetalert2.min.css` → `app.css`. Invertir los dos últimos hace que el tema propio de la app pierda contra los defaults de SweetAlert2.

## Errores comunes que un agente probablemente cometería

### 1. No hay paso de build para el frontend
Un JS nuevo hay que registrarlo a mano en `frontend/index.html`. Sin bundler, sin auto-import, sin hot reload.

### 2. `pdfjsLoader.js` es el único módulo ES y carga asincrónicamente
Usa `import` + `type="module"`, por lo que **puede terminar después que todos los scripts clásicos**. Por eso `editorView.ensurePdfjsReady()` hace polling cada 50 ms hasta 2.5 s esperando `window.pdfjsLib`. El evento `pdfjs-ready` que emite el loader **no lo escucha nadie**: no confíes en él, usá `await this.ensurePdfjsReady()`.
El `workerSrc` es `'./assets/vendor/pdfjs/pdf.worker.min.mjs'` (con `./` relative a `index.html`); cambiarlo rompe todos los renders.

### 3. Todo se comunica vía globales `window`
No hay import/export entre archivos del frontend. Los módulos se hablan entre sí por `window.editorView`, `window.sidePanel`, etc. **Un agente que agregue un módulo nuevo tiene que decidir explícitamente si lo expone en `window` y si lo carga en el HTML.**

Ojo con la doble identidad de categorías:
- `window.categoryManager` → **instancia** (estado vivo, `categories`, `loadCategories()`)
- `CategoryManager` → **clase** global, usada por su static `CategoryManager.sortByName(...)`

### 4. Cambios en IPC requieren dos archivos
1. Registrar el `ipcMain.handle(...)` en `electron/main.js` (dentro de `registerIpcHandlers()`)
2. Exponer el método en `electron/preload.js` bajo `window.api`

**Excepción:** `window.api.getPathForFile` NO es un canal IPC. Es una función síncrona de `contextBridge` que envuelve `webUtils.getPathForFile` (Electron moderno ya no expone `File.path`). Necesaria para el drag & drop del home.

### 5. Las rutas de almacenamiento NO están en el proyecto
Todo lo persistente vive en `app.getPath('userData')`, fuera del árbol del proyecto:
```
userData/
  history.json          máx 5 entradas
  categories.json       si no existe → 4 categorías por defecto
  drafts/<md5(path)>.json
  thumbnails/<md5(path)>.png
```

### 6. Las cabeceras CSP son restrictivas
`index.html` línea 6: `script-src 'self' 'unsafe-inline'`, `img-src 'self' data: file:`, `worker-src 'self' blob:`.
- `img-src file:` es **imprescindible**: las miniaturas del historial se cargan como `file://${thumbnailPath}` en `homeView.renderHistory()`.
- `worker-src blob:` es lo que permite el worker de pdf.js.
- Cualquier CDN nuevo hay que agregarlo al meta tag CSP.

### 7. El tipo de paquete es CommonJS
`package.json` tiene `"type": "commonjs"`. Backend y electron usan `require()`/`module.exports`. El frontend NO: es JS de navegador puro.

### 8. El buffer del PDF se **desvincula** (detached ArrayBuffer)
En `editorView.loadPdf()` se hace `new Uint8Array(this.pdfBuffer)` y se lo pasa a `pdfjsLib.getDocument()`. pdf.js **transfiere** el buffer al worker y el `this.pdfBuffer` original queda inutilizable. Por eso existe `this.pdfBufferCopy` (`fileData.buffer.slice(0)`, tomado **antes** del render) y por eso el export manda `filePath` primero y el buffer solo como fallback. **Nunca leas `this.pdfBuffer` después de `getDocument()`.**
Los buffers llegan del main como ArrayBuffer limpio (`buffer.buffer.slice(byteOffset, byteOffset+byteLength)`) justamente para evitar offsets desalineados.

### 9. `pdf:process` lee desde disco, no desde IPC
El handler en `main.js` (buscalo por el nombre, la línea cambia seguido) intenta `fs.existsSync(source)` y usa la ruta; solo cae a `Buffer.from(optionalBuffer)` si no existe. El frontend manda `plan.filePath` + `plan.pdfBufferCopy` como fallback. Evitaría volver a mandar el PDF completo por IPC.

### 10. La forma del grupo cambia al cruzar el IPC
- En el estado del editor / borradores: `group.pageIndices` (array de índices originales)
- En el payload de `pdf:process`: `group.pages` (mismo array, otro nombre) + `group.rotations` (mapa `originalIndex → grados`, solo los ≠ 0) + `group.fileName` + `group.categoryName`

Es el mismo concepto con dos nombres. Si tocás `getExportPlan()` tocá `pdfProcessor.splitPdf()`.

### 11. El `template` de una categoría es decorativo
`categoryManager.updateTemplatePreview()` arma `PREFIX_[VAR1]_[VAR2].pdf` y ese string se muestra en la UI, pero **el nombre real del archivo lo calcula `sidePanel.calculateFileName()`**, que usa guiones, no underscores, y antepone el legajo: `[LEGAJO]-[PREFIX-VAR1-VAR2].pdf`. Si tocás uno, tocá el otro o se desincronizan.

### 12. El CSS escala con el viewport: usá `rem`, no `px`
`:root` define `font-size: clamp(11px, calc(100vw / 1728 * 13px), 15px)`. Todo el layout está en `rem` para acompañar esa escala; los `px` quedan reservados para filetes, radios, sombras y `letter-spacing`. Un `width: 300px` nuevo se ve disproportionado en pantallas grandes y no escala.

Tokens de diseño en `:root` (`--bg-deep`, `--accent`, `--text-primary`, `--font-body`, …). Nada de colores hex sueltos en selectores nuevos. **Los tokens `--group-color-1..6` están declarados pero NO se usan**: el color real del lote entra por JS con `band.style.setProperty('--group-color', group.color)`.

### 13. La ventana es frameless
`frame: false` + `titleBarStyle: 'hidden'`. `#titlebar` tiene `-webkit-app-region: drag` y sus hijos `no-drag`. Los botones llaman a `window.api.minimizeWindow/maximizeWindow/closeWindow`. Si agregás elementos interactivos a la titlebar, acordate del `no-drag` o la ventana no los deja pulsar.

`#titlebar` va en `z-index: 1100`, **por encima de `.modal-overlay` (1000) y sus hijos (1010)**: si no, el `backdrop-filter: blur(8px)` del overlay difumina la barra y el usuario pierde minimizar / maximizar / cerrar con un modal abierto. Y por debajo de los toasts (2000) y del loading overlay (5000). Si tocás cualquiera de esos cuatro z-index, revisá la pila completa.

### 14. Arrastre de páginas dentro y fuera de lotes
- El nivel raíz (`#timeline-container`) y cada `.group-band-cards` usan SortableJS con el mismo `group: 'pages'` y `draggable: '.page-card'`.
- Solo se arrastran páginas individuales. Las bandas (`.group-band`) nunca son arrastrables; el corchete y el selector de categoría conservan su comportamiento visual.
- Una página puede reordenarse en su ubicación actual, moverse a otro lote existente o salir de un lote al nivel raíz. El destino determina `page.groupId`; el DOM determina `pageOrder` y cada `group.pageIndices`.
- Si una transferencia deja un lote vacío, ese lote se elimina. `syncGroupsFromDom()` reconcilia membresías antes de guardar; la acción de ordenar guarda snapshots de grupos y orden para que undo/redo restaure ambas cosas.
- El `onEnd` de Sortable difiere el procesamiento a `queueMicrotask()` para leer el DOM final después de los eventos de origen y destino. No reintroduzcas renderizados concurrentes dentro de esos callbacks.

### 14b. Auto-scroll en bordes del visor
- Al arrastrar una hoja, acercar el cursor a los extremos izquierdo o derecho de `.timeline-area` (zona de ~100px) activa desplazamiento horizontal con `requestAnimationFrame`.
- Las páginas siguen siendo el único elemento arrastrable; no hay agarre ni movimiento de lotes completos.

### 15. Miniaturas: cola con concurrencia limitada + caché en canvas
`editorView` tiene una cola con `_thumbMaxConcurrent = 4` renders simultáneos de pdf.js (renderizar 200 páginas de golpe cuelga la UI). El resultado se cachea en el propio objeto de página: `pageData._thumbCanvas` + `pageData._thumbKey` (`"${originalIndex}:${rotation}"`), y se reusa con `drawThumbToCard()`. Al rotar, cambia el key y se vuelve a renderizar.
Estos campos con `_` son **runtime only**: `saveCurrentDraft()` serializa a mano un subconjunto de `pages`, así que nunca llegan al borrador. No los agregues al `draftData` sin filtrarlos.

### 15b. Las notificaciones pasan por SweetAlert2 con íconos vectoriales propios
`toastNotification.js` es un wrapper fino sobre SweetAlert2:
- Los toasts renderizan íconos SVG vectoriales limpios dentro de `.ds-toast-content` con `aspect-ratio: 1 / 1` y `flex-shrink: 0`, previniendo deformaciones o estiramientos.
- `_formatSentence()` asegura que todo mensaje sea una oración completa que inicie con mayúscula y termine con un punto.
- Los diálogos de confirmación (`toast.confirm()`) centran icono, título, texto y acciones, y configuran `heightAuto: false` para no alterar la altura del layout de la app. En acciones peligrosas el icono vectorial usa un trazo coherente con Lucide; los botones conservan foco visible, proporción uniforme y estados claros.
- Los toasts temporales conservan su posición y alineación actuales. El ancho se fija en `.swal2-toast-shown .swal2-container` (24rem).

Además: `Swal` es un singleton. Si dos notificaciones disparan casi juntas, la segunda **desplaza** a la primera en vez de apilarse. No confíes en que ambas se vean.

### 15c. Rotar varias páginas exige que la selección sea coherente
`editorView.canRotateSelection()` corre dentro de `rotateSelectedPages()`, así que el guard aplica igual a `Q`/`E` y a `Shift + ←/→`: no hay dos comportamientos que puedan divergir. Regla: si la selección tiene más de una página, todas deben compartir `groupId` — o ninguna tenerlo. Una mezcla se rechaza con un `toast.warning()` y no se toca ninguna rotación.

El motivo es de dominio, no de UI: el lote es la unidad de exportación, y rotar la mitad de un lote deja el PDF exportado con páginas en orientaciones que el usuario no pidió.

### 16. Undo/Redo es un command pattern, no un snapshot
`undoManager` guarda `{ type, description, undo, redo }` (máx 50). Cada closure captura el estado previo. Push de una acción nueva **vacía el redoStack**. `setChangeCallback()` es lo que habilita/deshabilita los botones.
Acciones registradas hoy: `reorder`, `rotate` (individual y en bloque), `exclude`, `group`, `ungroup`. **No** hay undo para cambios de categoría ni de variables del panel lateral. Si agregás una operación destructiva, registrala.

### 17. Excluir una página la saca de su lote
`toggleExcludePage()` / `toggleExcludeSelected()` ponen `excluded = true`, la eliminan de `selectedPages` y llaman `removePageFromGroup()`. Si el grupo queda vacío, el grupo desaparece. Una página excluida no se puede volver a seleccionar (`selectAll()` las filtra), hay que incluirlas con el botón del card.

### 18. Volver a agrupar un lote completo lo desagrupa
`groupSelectedPages()`: si la selección es **exactamente** un lote existente, en vez de crear uno nuevo llama `ungroup()`. Es un toggle implícito, no un bug.

### 19. IDs por timestamp pueden colisionar
Grupos: `'group_' + Date.now()`. Categorías nuevas: `'cat_' + Date.now()`. Dos operaciones dentro del mismo milisegundo generan el mismo id. Si creás elementos en un bucle o en tests, usá un contador o `crypto.randomUUID()`.

### 20. Categorías duplicadas en dos lugares
`storageManager.getDefaultCategories()` y `categoryManager.getDefaultFallback()` tienen la misma lista de 4 categorías hardcodeada. Si cambiás una, cambiá la otra.

### 21. No borres el `AGENTS.md` ni agregues tooling sin preguntar
El proyecto es deliberadamente sin build, sin framework y sin tests. Cualquier cosa nueva (Vite, TypeScript, ESLint, un test runner) es una decisión de producto, no una mejora de mantenimiento.

## Atajos de teclado (editor, `editorView.bindEvents`)

| Atajo | Acción |
|---|---|
| `Espacio` | Agrupar / desagrupar la selección |
| `Q` / `E` | Rotar la selección −90° / +90° |
| `Shift + ← / →` | Rotar la selección −90° / +90° (alias de `Q` / `E`) |
| `Supr` / `Retroceso` | Excluir la selección |
| `Ctrl + A` | Seleccionar todas las páginas no excluidas |
| `Ctrl + Z` | Deshacer |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Rehacer |

El handler global **aborta en tres casos**: foco en `INPUT` / `SELECT` / `TEXTAREA`, vista del editor no `.active`, o `isModalOpen()`. Los dos últimos existen por el mismo motivo: con `Q`/`E` como letras sueltas, escribir en el modal de categorías rotaría las páginas de atrás. `isModalOpen()` mira `style.display` de los `.modal-overlay`, que es como los modales de la app se abren y cierran.
Doble click en una card abre `window.zoomModal` (con `pdfDoc`, número de página, rotación actual y total de páginas).

## Convenciones del modelo de datos

**Páginas** (`editorView.pages[]`, indexado por `originalIndex`, 0-based):
```js
{ originalIndex, rotation /* 0|90|180|270 */, excluded, groupId, thumbnailDataUrl,
  _thumbCanvas, _thumbKey }   // los dos últimos son runtime-only
```

**Orden global**: `pageOrder: number[]` — los índices en el orden visual de la línea de tiempo. **El orden de las páginas dentro de un PDF exportado sale de acá, no del índice original.**

**Grupos / lotes**: `{ id, color, pageIndices[], categoryId, variableValues{} }`. El color se saca de `editorView.groupColors` (6 colores, asignados por posición: `groups.length % 6`).

**Categorías**: `{ id, name, prefix, variables: [{ name, placeholder }], template }`.
- `variables[].name` se normaliza a MAYÚSCULAS y solo `[A-Z0-9_]` al guardar.
- `placeholder` es doble uso: placeholder del input **y** valor por defecto del nombre del archivo.
- No se puede borrar la última categoría.
- Todos los selects de categoría se ordenan alfabéticamente con `CategoryManager.sortByName` (locale `es`, `sensitivity: 'base'`).

**Historial** (máx 5, indexado por `filePath`, la más nueva primero): `{ filePath, fileName, thumbnailPath, openedAt }`.
- `hasDraft` se agrega **al leer** (no se persiste): `storageManager.getHistory()` lo computa con `hasDraft()`.
- `missing` y `fileExists` los computa `homeView.checkHistoryFiles()` consultando `api.fileExists`; el banner de borrador exige `fileExists === true` y vuelve a validar justo antes de reanudar.
- Quitar una entrada (`homeView.confirmRemoveFromHistory()` → `api.removeFromHistory`) borra **en cascada** historial + thumbnail + borrador. El PDF del disco nunca se toca. El botón es `.history-card-remove`, aparece en hover, y frena la propagación con `stopPropagation()` para que el click no abra el documento.
- Los nombres de archivo van a `innerHTML`: usá `HomeView.escapeHtml()` antes de interpolarlos en atributos o texto.

**Borradores** (`drafts/<md5(filePath)>.json`): `{ filePath, fileName, legajoPrefix, pageOrder, rotations, exclusions, groups, savedAt }`.
- Se autoguardan con **debounce de 400 ms** (`scheduleAutoSave()`) ante cualquier cambio.
- Se aplican al reabrir el archivo (`applyDraft()`), solo si `draft.pageOrder.length === numPages`.
- **Se borran solas tras un export exitoso** (`api.clearDraft`), que es lo que hace desaparecer el banner "Continuar sesión" del home.

**Miniaturas**: `thumbnails/<md5(filePath)>.png`, una por archivo, de la **primera página a scale 0.5** (`processFirstPageThumbnail()`), generada al abrir y guardada junto con la entrada de historial.

## Puntos muertos y deuda técnica conocida

- `storageManager.getThumbnailPath(fileHash)` y `saveThumbnail(fileHash, pngBuffer)` quedaron sin uso: los reemplazó `ThumbnailGenerator` (que hashea la ruta en vez de recibir un hash). **No tocar `StorageManager` para thumbnails.**
- `api.getThumbnailPath` y `api.thumbnailExists` están expuestas en el preload y ningún módulo del renderer las llama.
- El evento `pdfjs-ready` se emite y nadie lo escucha.
- Los tokens CSS `--group-color-1..6` no se referencian en ningún selector.
