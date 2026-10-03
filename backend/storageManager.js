const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    this.draftsDir = path.join(this.basePath, 'drafts');
    this._ensureDirs();
  }

  /**
   * Crea los directorios necesarios si no existen
   */
  _ensureDirs() {
    try {
      if (!fs.existsSync(this.thumbnailsDir)) {
        fs.mkdirSync(this.thumbnailsDir, { recursive: true });
      }
      if (!fs.existsSync(this.draftsDir)) {
        fs.mkdirSync(this.draftsDir, { recursive: true });
      }
    } catch (err) {
      console.error('Error al crear directorios de almacenamiento:', err.message);
    }
  }

  // ─────────────────────────────────────────────
  // Historial
  // ─────────────────────────────────────────────

  /**
   * Obtiene el historial de archivos abiertos recientemente.
   * @returns {Array} Array de entradas del historial (máximo 5)
   */
  getHistory() {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }
      const data = fs.readFileSync(this.historyFile, 'utf-8');
      const parsed = JSON.parse(data);
      const list = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
      // Añadir flag hasDraft a cada entrada
      return list.map((item) => ({
        ...item,
        hasDraft: this.hasDraft(item.filePath),
      }));
    } catch (err) {
      console.error('Error al leer historial:', err.message);
      return [];
    }
  }

  /**
   * Guarda el historial en disco, limitando a máximo 5 entradas.
   * @param {Array} entries - Array de entradas del historial
   */
  saveHistory(entries) {
    try {
      // Limitar a máximo 5 entradas
      const limited = Array.isArray(entries) ? entries.slice(0, 5) : [];
      // Limpiar propiedades dinámicas antes de guardar
      const cleanEntries = limited.map(({ hasDraft, ...rest }) => rest);
      fs.writeFileSync(this.historyFile, JSON.stringify(cleanEntries, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error al guardar historial:', err.message);
    }
  }

  /**
   * Agrega una entrada al historial.
   * La nueva entrada se coloca al inicio, se eliminan duplicados por filePath,
   * y se mantiene un máximo de 5 entradas.
   */
  addToHistory(entry) {
    try {
      const history = this.getHistory();

      // Eliminar duplicados por filePath
      const filtered = history.filter((item) => item.filePath !== entry.filePath);

      // Agregar la nueva entrada al inicio
      filtered.unshift(entry);

      // Mantener máximo 5 entradas
      const trimmed = filtered.slice(0, 5);

      this.saveHistory(trimmed);
    } catch (err) {
      console.error('Error al agregar entrada al historial:', err.message);
    }
  }

  /**
   * Elimina una entrada del historial por su filePath.
   * No toca el archivo original: solo la referencia desde la app.
   * @param {string} filePath - Ruta del archivo a quitar del historial
   * @returns {boolean} true si se quitó, false si no estaba en el historial
   */
  removeFromHistory(filePath) {
    try {
      const history = this.getHistory();
      const filtered = history.filter((item) => item.filePath !== filePath);
      if (filtered.length === history.length) return false;
      this.saveHistory(filtered);
      return true;
    } catch (err) {
      console.error('Error al quitar entrada del historial:', err.message);
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Borradores y Autoguardado de Sesión
  // ─────────────────────────────────────────────

  _getDraftPath(filePath) {
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    return path.join(this.draftsDir, `${hash}.json`);
  }

  /**
   * Guarda el estado actual de edición de un archivo.
   */
  saveDraft(filePath, draftData) {
    try {
      if (!filePath) return;
      const draftPath = this._getDraftPath(filePath);
      fs.writeFileSync(draftPath, JSON.stringify(draftData, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error al guardar borrador:', err.message);
    }
  }

  /**
   * Obtiene el borrador guardado para un archivo.
   */
  getDraft(filePath) {
    try {
      if (!filePath) return null;
      const draftPath = this._getDraftPath(filePath);
      if (fs.existsSync(draftPath)) {
        const data = fs.readFileSync(draftPath, 'utf-8');
        return JSON.parse(data);
      }
      return null;
    } catch (err) {
      console.error('Error al leer borrador:', err.message);
      return null;
    }
  }

  /**
   * Verifica si existe un borrador guardado para el archivo.
   */
  hasDraft(filePath) {
    try {
      if (!filePath) return false;
      const draftPath = this._getDraftPath(filePath);
      return fs.existsSync(draftPath);
    } catch (err) {
      return false;
    }
  }

  /**
   * Elimina el borrador de un archivo (por ejemplo, al terminar la exportación).
   */
  clearDraft(filePath) {
    try {
      if (!filePath) return;
      const draftPath = this._getDraftPath(filePath);
      if (fs.existsSync(draftPath)) {
        fs.unlinkSync(draftPath);
      }
    } catch (err) {
      console.error('Error al eliminar borrador:', err.message);
    }
  }

  // ─────────────────────────────────────────────
  // Categorías
  // ─────────────────────────────────────────────

  /**
   * Obtiene grupos de categorías. Los archivos con el formato anterior
   * (un array plano) se migran al grupo General al leerlos.
   * @returns {{ activeGroupId: string, groups: Array }}
   */
  getCategories() {
    try {
      if (!fs.existsSync(this.categoriesFile)) {
        return this.createDefaultCategoryGroups();
      }
      const data = fs.readFileSync(this.categoriesFile, 'utf-8');
      const parsed = JSON.parse(data);
      const normalized = this.normalizeCategoryGroups(parsed);

      // Migrate the old flat category array the first time it is read.
      if (Array.isArray(parsed)) this.saveCategories(normalized);
      return normalized;
    } catch (err) {
      console.error('Error al leer categorías:', err.message);
      return this.createDefaultCategoryGroups();
    }
  }

  /**
   * Guarda los grupos de categorías en disco; también acepta el array plano
   * antiguo para mantener la compatibilidad con una migración en curso.
   * @param {{ activeGroupId: string, groups: Array }|Array} categories
   */
  saveCategories(categories) {
    try {
      const normalized = this.normalizeCategoryGroups(categories);
      fs.writeFileSync(this.categoriesFile, JSON.stringify(normalized, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error al guardar categorías:', err.message);
    }
  }

  createDefaultCategoryGroups(categories = this.getDefaultCategories()) {
    return {
      activeGroupId: 'category_group_general',
      groups: [{
        id: 'category_group_general',
        name: 'General',
        categories
      }]
    };
  }

  normalizeCategoryGroups(data) {
    if (Array.isArray(data)) return this.createDefaultCategoryGroups(data);

    if (!data || !Array.isArray(data.groups)) {
      return this.createDefaultCategoryGroups();
    }

    const groups = data.groups
      .filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
      .map(group => ({
        id: group.id,
        name: group.name.trim() || 'Sin nombre',
        categories: Array.isArray(group.categories) ? group.categories : []
      }));

    if (groups.length === 0) return this.createDefaultCategoryGroups();

    const activeGroupId = groups.some(group => group.id === data.activeGroupId)
      ? data.activeGroupId
      : groups[0].id;

    return { activeGroupId, groups };
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
