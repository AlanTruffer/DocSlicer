const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Aquí exponerás funciones para comunicación con el proceso principal
});