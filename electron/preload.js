// electron/preload.js
// Script de precarga para DocSlicer.
// Expone una API segura al proceso renderer a través de contextBridge,
// manteniendo el aislamiento de contexto (contextIsolation: true).
// Todas las funciones usan ipcRenderer.invoke() para comunicación asíncrona.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Obtener ruta absoluta de un archivo soltado (drag & drop en Electron)
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {
      console.warn('Error en webUtils.getPathForFile:', e);
    }
    return file.path || '';
  },

  // =============================================
  // Controles de ventana (titlebar personalizada)
  // =============================================
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // =============================================
  // Diálogos de archivo
  // =============================================
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Lectura directa de archivo (usado para drag & drop)
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // =============================================
  // Almacenamiento: Historial
  // =============================================
  getHistory: () => ipcRenderer.invoke('storage:getHistory'),
  addToHistory: (entry) => ipcRenderer.invoke('storage:addToHistory', entry),

  // =============================================
  // Almacenamiento: Categorías
  // =============================================
  getCategories: () => ipcRenderer.invoke('storage:getCategories'),
  saveCategories: (categories) => ipcRenderer.invoke('storage:saveCategories', categories),

  // =============================================
  // Miniaturas (thumbnails)
  // =============================================
  saveThumbnail: (filePath, dataUrl) => ipcRenderer.invoke('thumbnail:save', filePath, dataUrl),
  getThumbnailPath: (filePath) => ipcRenderer.invoke('thumbnail:getPath', filePath),
  thumbnailExists: (filePath) => ipcRenderer.invoke('thumbnail:exists', filePath),

  // =============================================
  // Procesamiento de PDF
  // =============================================
  processPdf: (pdfBuffer, groups, outputDir, useSubfolders) =>
    ipcRenderer.invoke('pdf:process', pdfBuffer, groups, outputDir, useSubfolders),
});