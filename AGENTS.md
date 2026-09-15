# AGENTS.md — DocSlicer

## Qué es

App de escritorio Electron para dividir, rotar, organizar y exportar páginas de PDF. UI en español. Sin bundler, sin framework, sin tests.

## Comandos

- `npm start` — lanza la app (`electron .`)
- `npm run dist` o `npm run build:win` — genera instalador Windows con electron-builder
- `npm run pack` — build de directorio sin empaquetar (para testing rápido)
- No existen comandos de test, lint ni typecheck.

## Arquitectura

```
electron/          Proceso principal
  main.js          Punto de entrada. Crea BrowserWindow, registra handlers IPC, inicializa servicios backend.
  preload.js       Expone `window.api` al renderer via contextBridge. Todo canal IPC nuevo va aquí.

backend/           Lógica de negocio (corre en proceso principal)
  pdfProcessor.js  Divide/rota PDFs con pdf-lib. Acepta Buffer o ruta de archivo.
  storageManager.js Persiste historial, categorías, borradores en JSON dentro del directorio userData de Electron.
  thumbnailGenerator.js  Guarda miniaturas PNG en disco (el renderizado ocurre en el renderer).

frontend/          Proceso renderer (JS vanilla, sin paso de build)
  index.html       Archivo HTML único. Dos vistas: home + editor.
  assets/js/       Libs vendor: lucide (iconos), sortable (drag-drop), pdfjs-dist (renderizado).
  assets/css/      Bootstrap + app.css custom.
  views/           Módulos de la app (uno por archivo), todos conectados via globales `window.*`.
```

## Errores comunes que un agente probablemente cometería

### 1. No hay paso de build para el frontend
Los archivos JS nuevos deben agregarse manualmente como `<script>` en `frontend/index.html`. No hay bundler ni auto-import.

### 2. pdfjsLoader.js es el único módulo ES
`frontend/assets/js/pdfjsLoader.js` usa `import` y se carga con `type="module"`. Todos los demás scripts del frontend son globales del navegador cargados con `<script>` normal.

### 3. Todo se comunica via globales window
Los módulos del frontend se conectan via propiedades `window.*`: `window.router`, `window.editorView`, `window.homeView`, `window.sidePanel`, `window.categoryManager`, `window.undoManager`, `window.zoomModal`, `window.toast`. No hay import/export entre archivos del frontend.

### 4. Cambios en IPC requieren dos archivos
Para agregar una nueva funcionalidad del backend:
1. Registrar el `ipcMain.handle(...)` en `electron/main.js`
2. Exponer el método API en `electron/preload.js` bajo `window.api`

### 5. Las rutas de almacenamiento NO están en el proyecto
Todos los datos persistentes (historial, categorías, borradores, thumbnails) viven en `app.getPath('userData')`, un directorio específico del OS fuera del árbol del proyecto.

### 6. Las cabeceras CSP son restrictivas
`index.html` tiene Content-Security-Policy que limita scripts a `'self' 'unsafe-inline'` e imágenes a `'self' data: file:`. Agregar recursos de CDN requiere modificar el meta tag CSP.

### 7. El tipo de paquete es CommonJS
`package.json` tiene `"type": "commonjs"`. Los archivos backend usan `require()`/`module.exports`.

### 8. Optimización en procesamiento de PDF
El handler `pdf:process` en `main.js:220` prefiere leer desde disco (ruta de archivo) en vez de transferir el buffer por IPC. El frontend pasa tanto `plan.filePath` como `plan.pdfBufferCopy` como fallback.

### 9. Convenciones del modelo de datos
- Historial: máximo 5 entradas, indexado por `filePath`, incluye flag `hasDraft` al leer (no se persiste)
- Borradores: indexados por hash MD5 de la ruta del archivo, almacenados en subdir `drafts/`
- Thumbnails: indexados por hash MD5 de la ruta del archivo, almacenados en subdir `thumbnails/`
- Categorías: array de objetos con `id`, `name`, `prefix`, `variables[]`, `template`
- Grupos: array de objetos con `id`, `color`, `pageIndices[]`, `categoryId`, `variableValues{}`
