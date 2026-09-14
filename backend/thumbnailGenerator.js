const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * ThumbnailGenerator - Gestiona el guardado de miniaturas (thumbnails) de PDFs.
 * El renderizado real del PDF a canvas ocurre en el renderer (navegador) usando pdfjs-dist.
 * El proceso principal solo recibe los datos PNG y los guarda en disco.
 */
class ThumbnailGenerator {
  /**
   * @param {string} thumbnailsDir - Ruta al directorio donde se almacenan los thumbnails
   */
  constructor(thumbnailsDir) {
    this.thumbnailsDir = thumbnailsDir;
    if (!fs.existsSync(this.thumbnailsDir)) {
      fs.mkdirSync(this.thumbnailsDir, { recursive: true });
    }
  }

  /**
   * Genera un hash MD5 a partir de la ruta del archivo para usar como nombre del thumbnail.
   * @param {string} filePath - Ruta completa del archivo PDF original
   * @returns {string} Hash MD5 en formato hexadecimal
   */
  getFileHash(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  /**
   * Guarda un thumbnail PNG a partir de un data URL en base64.
   * @param {string} filePath - Ruta del archivo PDF original (se usa para generar el hash)
   * @param {string} dataUrl - Data URL en base64 del PNG (obtenido de canvas.toDataURL())
   * @returns {string} Ruta donde se guardó el thumbnail
   */
  saveThumbnail(filePath, dataUrl) {
    const hash = this.getFileHash(filePath);
    const thumbnailPath = path.join(this.thumbnailsDir, `${hash}.png`);

    // Extraer los datos base64 del data URL
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFileSync(thumbnailPath, buffer);
    return thumbnailPath;
  }

  /**
   * Verifica si ya existe un thumbnail para un archivo dado.
   * @param {string} filePath - Ruta completa del archivo PDF original
   * @returns {boolean} true si el thumbnail existe, false en caso contrario
   */
  thumbnailExists(filePath) {
    const hash = this.getFileHash(filePath);
    const thumbnailPath = path.join(this.thumbnailsDir, `${hash}.png`);
    return fs.existsSync(thumbnailPath);
  }

  /**
   * Obtiene la ruta del thumbnail para un archivo dado.
   * @param {string} filePath - Ruta completa del archivo PDF original
   * @returns {string} Ruta completa al archivo PNG del thumbnail
   */
  getThumbnailPath(filePath) {
    const hash = this.getFileHash(filePath);
    return path.join(this.thumbnailsDir, `${hash}.png`);
  }
}

module.exports = ThumbnailGenerator;
