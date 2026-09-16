import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/vendor/pdfjs/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
console.log('PDF.js cargado exitosamente');
