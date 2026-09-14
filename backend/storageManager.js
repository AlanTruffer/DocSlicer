const fs = require('fs');
const path = require('path');

/**
 * StorageManager - Gestiona la persistencia de datos en formato JSON
 * dentro del directorio userData de Electron.
 * Se ejecuta en el proceso principal (main process).
 */
class StorageManager {
  /**
   * @param {string} userDataPath - Ruta al directorio userData de Electron
   */
  constructor(userDataPath) {
    this.basePath = userDataPath;
    this.historyFile = path.join(this.basePath, 'history.json');
    this.categoriesFile = path.join(this.basePath, 'categories.json');
    this.thumbnailsDir = path.join(this.basePath, 'thumbnails');
    this._ensureDirs();
  }

  /**
   * Crea el directorio de thumbnails si no existe
   */
  _ensureDirs() {
    try {
      if (!fs.existsSync(this.thumbnailsDir)) {
        fs.mkdirSync(this.thumbnailsDir, { recursive: true });
      }
    } catch (err) {
      console.error('Error al crear directorio de thumbnails:', err.message);
    }
  }

  // ─────────────────────────────────────────────
  // Historial
  // ─────────────────────────────────────────────

  /**
   * Obtiene el historial de archivos abiertos recientemente.
   * @returns {Array} Array de entradas del historial (máximo 3)
   */
  getHistory() {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }
      const data = fs.readFileSync(this.historyFile, 'utf-8');
      const parsed = JSON.parse(data);
      // Asegurar que nunca devolvemos más de 3 entradas
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch (err) {
      console.error('Error al leer historial:', err.message);
      return [];
    }
  }

  /**
   * Guarda el historial en disco, limitando a máximo 3 entradas.
   * @param {Array} entries - Array de entradas del historial
   */
  saveHistory(entries) {
    try {
      // Limitar a máximo 3 entradas
      const limited = Array.isArray(entries) ? entries.slice(0, 3) : [];
      fs.writeFileSync(this.historyFile, JSON.stringify(limited, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error al guardar historial:', err.message);
    }
  }

  /**
   * Agrega una entrada al historial.
   * La nueva entrada se coloca al inicio, se eliminan duplicados por filePath,
   * y se mantiene un máximo de 3 entradas.
   * @param {Object} entry - Entrada del historial
   * @param {string} entry.filePath - Ruta completa del archivo
   * @param {string} entry.fileName - Nombre del archivo
   * @param {string} entry.thumbnailPath - Ruta de la miniatura
   * @param {string} entry.openedAt - Fecha/hora de apertura (ISO string)
   */
  addToHistory(entry) {
    try {
      const history = this.getHistory();

      // Eliminar duplicados por filePath
      const filtered = history.filter((item) => item.filePath !== entry.filePath);

      // Agregar la nueva entrada al inicio
      filtered.unshift(entry);

      // Mantener máximo 3 entradas
      const trimmed = filtered.slice(0, 3);

      this.saveHistory(trimmed);
    } catch (err) {
      console.error('Error al agregar entrada al historial:', err.message);
    }
  }

  // ─────────────────────────────────────────────
  // Categorías
  // ─────────────────────────────────────────────

  /**
   * Obtiene las categorías guardadas. Si el archivo no existe,
   * devuelve las categorías por defecto.
   * @returns {Array} Array de categorías
   */
  getCategories() {
    try {
      if (!fs.existsSync(this.categoriesFile)) {
        return this.getDefaultCategories();
      }
      const data = fs.readFileSync(this.categoriesFile, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : this.getDefaultCategories();
    } catch (err) {
      console.error('Error al leer categorías:', err.message);
      return this.getDefaultCategories();
    }
  }

  /**
   * Guarda las categorías en disco.
   * @param {Array} categories - Array de categorías a guardar
   */
  saveCategories(categories) {
    try {
      fs.writeFileSync(this.categoriesFile, JSON.stringify(categories, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error al guardar categorías:', err.message);
    }
  }

  /**
   * Devuelve las 4 categorías predeterminadas del sistema.
   * @returns {Array} Array con las categorías por defecto
   */
  getDefaultCategories() {
    return [
      {
        id: 'resolucion',
        name: 'Resolución',
        prefix: 'RESOL_',
        variables: [
          { name: 'AÑO', placeholder: '2024' },
          { name: 'NUMERO', placeholder: '001' }
        ],
        template: 'RESOL_[AÑO]_[NUMERO].pdf'
      },
      {
        id: 'nota',
        name: 'Nota',
        prefix: 'NOTA_',
        variables: [
          { name: 'AÑO', placeholder: '2024' },
          { name: 'NUMERO', placeholder: '001' }
        ],
        template: 'NOTA_[AÑO]_[NUMERO].pdf'
      },
      {
        id: 'factura',
        name: 'Factura',
        prefix: 'FAC_',
        variables: [
          { name: 'PROVEEDOR', placeholder: 'Empresa' },
          { name: 'FECHA', placeholder: '2024-01-01' }
        ],
        template: 'FAC_[PROVEEDOR]_[FECHA].pdf'
      },
      {
        id: 'otro',
        name: 'Otro',
        prefix: '',
        variables: [
          { name: 'NOMBRE', placeholder: 'documento' }
        ],
        template: '[NOMBRE].pdf'
      }
    ];
  }

  // ─────────────────────────────────────────────
  // Thumbnails
  // ─────────────────────────────────────────────

  /**
   * Obtiene la ruta esperada de un thumbnail dado un hash de archivo.
   * @param {string} fileHash - Hash MD5 del archivo
   * @returns {string} Ruta completa al archivo PNG del thumbnail
   */
  getThumbnailPath(fileHash) {
    return path.join(this.thumbnailsDir, `${fileHash}.png`);
  }

  /**
   * Guarda un buffer PNG como thumbnail en disco.
   * @param {string} fileHash - Hash MD5 del archivo
   * @param {Buffer} pngBuffer - Buffer con los datos PNG de la miniatura
   * @returns {string} Ruta donde se guardó el thumbnail
   */
  saveThumbnail(fileHash, pngBuffer) {
    try {
      const thumbnailPath = this.getThumbnailPath(fileHash);
      fs.writeFileSync(thumbnailPath, pngBuffer);
      return thumbnailPath;
    } catch (err) {
      console.error('Error al guardar thumbnail:', err.message);
      return null;
    }
  }
}

module.exports = StorageManager;
