import * as pdfjsLib from './pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/js/pdfjs/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
console.log('PDF.js cargado exitosamente');
