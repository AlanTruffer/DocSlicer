/**
 * Modal de Vista Previa Ampliada (Zoom) para páginas de PDF
 */
class ZoomModal {
  constructor() {
    this.pdfDoc = null;
    this.currentPageNum = 1;
    this.totalPages = 1;
    this.currentRotation = 0;
    this.scale = 1.0;
    this.rendering = false;
    this.pendingRender = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.modal = document.getElementById('zoom-modal');
    this.canvas = document.getElementById('zoom-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.btnIn = document.getElementById('zoom-in');
    this.btnOut = document.getElementById('zoom-out');
    this.btnFit = document.getElementById('zoom-fit');
    this.btnClose = document.getElementById('zoom-close');
    this.btnPrev = document.getElementById('zoom-prev');
    this.btnNext = document.getElementById('zoom-next');
  }

  bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.hide());
    }
    if (this.btnIn) {
      this.btnIn.addEventListener('click', () => this.zoom(0.25));
    }
    if (this.btnOut) {
      this.btnOut.addEventListener('click', () => this.zoom(-0.25));
    }
    if (this.btnFit) {
      this.btnFit.addEventListener('click', () => this.fitToWindow());
    }
    if (this.btnPrev) {
      this.btnPrev.addEventListener('click', () => this.prevPage());
    }
    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => this.nextPage());
    }

    // Cerrar al presionar Escape o hacer click en fondo
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.hide();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!this.isVisible()) return;
      if (e.key === 'Escape') this.hide();
      if (e.key === 'ArrowLeft') this.prevPage();
      if (e.key === 'ArrowRight') this.nextPage();
    });
  }

  isVisible() {
    return this.modal && this.modal.style.display === 'flex';
  }

  async open(pdfDoc, pageNum, rotation = 0, totalPages = 1) {
    this.pdfDoc = pdfDoc;
    this.currentPageNum = pageNum;
    this.totalPages = totalPages;
    this.currentRotation = rotation;
    this.scale = 1.2;

    if (this.modal) this.modal.style.display = 'flex';
    await this.renderPage();
  }

  hide() {
    if (this.modal) this.modal.style.display = 'none';
  }

  zoom(delta) {
    const newScale = this.scale + delta;
    if (newScale >= 0.4 && newScale <= 3.5) {
      this.scale = newScale;
      this.renderPage();
    }
  }

  async fitToWindow() {
    if (!this.pdfDoc) return;
    try {
      const page = await this.pdfDoc.getPage(this.currentPageNum);
      const viewport = page.getViewport({ scale: 1, rotation: this.currentRotation });
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.8;

      const scaleW = maxWidth / viewport.width;
      const scaleH = maxHeight / viewport.height;
      this.scale = Math.min(scaleW, scaleH);
      await this.renderPage();
    } catch (err) {
      console.error('Error calculando fit zoom:', err);
    }
  }

  async prevPage() {
    if (this.currentPageNum > 1) {
      this.currentPageNum--;
      if (window.editorView) {
        this.currentRotation = window.editorView.getPageRotation(this.currentPageNum - 1);
      }
      await this.renderPage();
    }
  }

  async nextPage() {
    if (this.currentPageNum < this.totalPages) {
      this.currentPageNum++;
      if (window.editorView) {
        this.currentRotation = window.editorView.getPageRotation(this.currentPageNum - 1);
      }
      await this.renderPage();
    }
  }

  async renderPage() {
    if (!this.pdfDoc || !this.canvas) return;
    if (this.rendering) {
      this.pendingRender = true;
      return;
    }
    this.rendering = true;

    try {
      const page = await this.pdfDoc.getPage(this.currentPageNum);
      const viewport = page.getViewport({ scale: this.scale, rotation: this.currentRotation });

      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Error al renderizar zoom:', err);
    } finally {
      this.rendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        this.renderPage();
      }
    }
  }
}

window.zoomModal = new ZoomModal();
