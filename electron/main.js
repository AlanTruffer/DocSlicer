// electron/main.js
// Proceso principal de Electron para DocSlicer.
// Configura la ventana principal (sin marco), inicializa los servicios del backend
// y registra todos los handlers IPC para la comunicación con el renderer.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const StorageManager = require('../backend/storageManager');
const PdfProcessor = require('../backend/pdfProcessor');
const ThumbnailGenerator = require('../backend/thumbnailGenerator');

let mainWindow;
let storage;
let pdfProcessor;
let thumbnailGen;

/**
 * Crea la ventana principal de la aplicación.
 * Ventana sin marco (frameless) para usar una titlebar personalizada.
 */
function createWindow() {
  const iconIco = path.join(__dirname, '..', 'build', 'icon.ico');
  const iconPng = path.join(__dirname, '..', 'frontend', 'assets', 'icon.png');
  const appIcon = fs.existsSync(iconIco) ? iconIco : iconPng;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    titleBarStyle: 'hidden',
    icon: appIcon,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('frontend/index.html');
}

// --- Inicialización de la aplicación ---
app.whenReady().then(() => {
  // Configurar ID de modelo de usuario para que Windows vincule correctamente el ícono en la barra de tareas
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.docslicer.app');
  }

  const userDataPath = app.getPath('userData');

  // Inicializar servicios del backend
  storage = new StorageManager(userDataPath);
  pdfProcessor = new PdfProcessor();
  thumbnailGen = new ThumbnailGenerator(path.join(userDataPath, 'thumbnails'));

  // Registrar todos los handlers IPC antes de crear la ventana
  registerIpcHandlers();

  createWindow();

  // macOS: re-crear ventana al hacer clic en el ícono del dock si no hay ventanas
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Cerrar la aplicación cuando todas las ventanas se cierran (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Registra todos los handlers IPC para la comunicación con el proceso renderer.
 * Organizado en secciones: controles de ventana, diálogos, archivos,
 * almacenamiento, miniaturas y procesamiento PDF.
 */
function registerIpcHandlers() {
  // =============================================
  // Controles de ventana (titlebar personalizada)
  // =============================================
  ipcMain.handle('window:minimize', () => mainWindow.minimize());

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => mainWindow.close());

  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

  // =============================================
  // Diálogos de archivo
  // =============================================

  // Abrir diálogo para seleccionar un archivo PDF
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar archivo PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const buffer = fs.readFileSync(filePath);

    // Extraer un ArrayBuffer limpio sin problemas de offset
    const cleanArrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    return {
      filePath,
      fileName: path.basename(filePath),
      buffer: cleanArrayBuffer,
    };
  });

  // Abrir diálogo para seleccionar una carpeta de salida
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta de salida',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // =============================================
  // Lectura de archivos (para drag & drop)
  // =============================================

  // Leer archivo desde una ruta enviada por el renderer
  ipcMain.handle('file:read', async (event, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);

      // Extraer un ArrayBuffer limpio sin problemas de offset
      const cleanArrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );

      return {
        filePath,
        fileName: path.basename(filePath),
        buffer: cleanArrayBuffer,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // =============================================
  // Almacenamiento: Historial
  // =============================================
  ipcMain.handle('storage:getHistory', () => storage.getHistory());

  ipcMain.handle('storage:addToHistory', (event, entry) => {
    storage.addToHistory(entry);
  });

  // =============================================
  // Almacenamiento: Categorías
  // =============================================
  ipcMain.handle('storage:getCategories', () => storage.getCategories());

  ipcMain.handle('storage:saveCategories', (event, categories) => {
    storage.saveCategories(categories);
  });

  // =============================================
  // Almacenamiento: Borradores / Sesión
  // =============================================
  ipcMain.handle('storage:saveDraft', (event, filePath, draftData) => {
    storage.saveDraft(filePath, draftData);
  });

  ipcMain.handle('storage:getDraft', (event, filePath) => {
    return storage.getDraft(filePath);
  });

  ipcMain.handle('storage:hasDraft', (event, filePath) => {
    return storage.hasDraft(filePath);
  });

  ipcMain.handle('storage:clearDraft', (event, filePath) => {
    storage.clearDraft(filePath);
  });

  // =============================================
  // Miniaturas (thumbnails)
  // =============================================
  ipcMain.handle('thumbnail:save', (event, filePath, dataUrl) => {
    return thumbnailGen.saveThumbnail(filePath, dataUrl);
  });

  ipcMain.handle('thumbnail:getPath', (event, filePath) => {
    return thumbnailGen.getThumbnailPath(filePath);
  });

  ipcMain.handle('thumbnail:exists', (event, filePath) => {
    return thumbnailGen.thumbnailExists(filePath);
  });

  // =============================================
  // Procesamiento de PDF
  // =============================================
  ipcMain.handle('pdf:process', async (event, source, groups, outputDir, useSubfolders, optionalBuffer) => {
    // Si source es una ruta válida en disco, usarla directamente para evitar transferir megabytes por IPC y evitar el bug de detached ArrayBuffer
    let targetSource = source;
    if (typeof source === 'string' && fs.existsSync(source)) {
      targetSource = source;
    } else if (optionalBuffer && optionalBuffer.byteLength > 0) {
      targetSource = Buffer.from(optionalBuffer);
    } else if (source && typeof source !== 'string') {
      targetSource = Buffer.from(source);
    }
    return pdfProcessor.splitPdf(targetSource, groups, outputDir, useSubfolders);
  });
}