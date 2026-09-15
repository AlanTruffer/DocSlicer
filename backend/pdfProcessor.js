const { PDFDocument, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * PdfProcessor - Procesa archivos PDF usando pdf-lib.
 * Permite dividir, rotar y exportar páginas de un PDF.
 * Se ejecuta en el proceso principal (main process) de Electron.
 */
class PdfProcessor {
  /**
   * Divide un PDF en múltiples archivos según las definiciones de grupos.
   *
   * @param {Buffer} pdfBuffer - Buffer del archivo PDF original
   * @param {Array} groups - Array de definiciones de grupo, cada uno con:
   *   @param {number[]} groups[].pages - Índices de páginas (0-based) en el orden deseado
   *   @param {Object} groups[].rotations - Mapa de pageIndex -> grados de rotación a aplicar
   *   @param {string} groups[].fileName - Nombre del archivo de salida generado
   *   @param {string} groups[].categoryName - Nombre de la categoría (usado para subcarpeta)
   * @param {string} outputDir - Directorio base de salida
   * @param {boolean} useSubfolders - Si es true, crea una subcarpeta por categoría
   * @returns {Promise<{success: boolean, filesCreated: string[], errors: string[]}>}
   */
  async splitPdf(source, groups, outputDir, useSubfolders) {
    const results = { success: true, filesCreated: [], errors: [] };

    try {
      let pdfBuffer;
      if (typeof source === 'string') {
        if (!fs.existsSync(source)) {
          throw new Error(`El archivo de origen no existe en la ruta: ${source}`);
        }
        pdfBuffer = fs.readFileSync(source);
      } else if (Buffer.isBuffer(source)) {
        pdfBuffer = source;
      } else if (source && source.byteLength > 0) {
        pdfBuffer = Buffer.from(source);
      } else {
        throw new Error('No se recibió un archivo o buffer válido para procesar.');
      }

      const sourcePdf = await PDFDocument.load(pdfBuffer);

      for (const group of groups) {
        try {
          const newPdf = await PDFDocument.create();
          const copiedPages = await newPdf.copyPages(sourcePdf, group.pages);

          for (let i = 0; i < copiedPages.length; i++) {
            const page = copiedPages[i];
            const originalPageIdx = group.pages[i];

            // Aplicar rotación si está especificada para esta página
            if (group.rotations && group.rotations[originalPageIdx] !== undefined) {
              const currentRotation = page.getRotation().angle;
              page.setRotation(degrees(currentRotation + group.rotations[originalPageIdx]));
            }

            newPdf.addPage(page);
          }

          // Determinar el directorio de salida (con o sin subcarpeta de categoría)
          let targetDir = outputDir;
          if (useSubfolders && group.categoryName) {
            targetDir = path.join(outputDir, group.categoryName);
          }

          // Crear el directorio de destino si no existe
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          const outputPath = path.join(targetDir, group.fileName);
          const pdfBytes = await newPdf.save();
          fs.writeFileSync(outputPath, pdfBytes);
          results.filesCreated.push(outputPath);
        } catch (groupErr) {
          results.errors.push(`Error procesando grupo "${group.fileName}": ${groupErr.message}`);
          results.success = false;
        }
      }
    } catch (err) {
      results.success = false;
      results.errors.push(`Error cargando PDF de origen: ${err.message}`);
    }

    return results;
  }
}

module.exports = PdfProcessor;
