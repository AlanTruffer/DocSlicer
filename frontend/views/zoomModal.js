/**
 * Modal de Vista Previa Ampliada (Zoom) para páginas de PDF
 * Soporta zoom con rueda del mouse, pan con arrastre y botones de control.
 */
class ZoomModal {
  constructor() {
    this.pdfDoc = null;
    this.currentPageNum = 1;
    this.totalPages = 1;
    this.currentRotation = 0;

    // Escala visual (1 = ajustado a la ventana) y desplazamiento del canvas
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.baseW = 0;
    this.baseH = 0;
    this.minScale = 0.5;
    this.maxScale = 4.0;

    // Estado de interacción
    this.rendering = false;
    this.pendingRender = false;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragPanX = 0;
    this.dragPanY = 0;
    this._panDistance = 0;
    this._ignoreNextClick = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.modal = document.getElementById('zoom-modal');
    this.canvas = document.getElementById('zoom-canvas');
    this.stage = this.modal ? this.modal.querySelector('.zoom-stage') : null;
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
      this.btnIn.addEventListener('click', () => this.zoomAtCenter(0.25));
    }
    if (this.btnOut) {
      this.btnOut.addEventListener('click', () => this.zoomAtCenter(-0.25));
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

    // Cerrar al presionar Escape o hacer click fuera del visor
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (this._ignoreNextClick) {
          this._ignoreNextClick = false;
          return;
        }
        if (e.target.closest('#zoom-canvas')) return;
        if (e.target.closest('.zoom-controls')) return;
        if (e.target.closest('.zoom-nav')) return;
        this.hide();
      });
    }

    // Zoom con la rueda del mouse sobre el canvas
    if (this.canvas) {
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.zoomAtPoint(cx, cy, factor);
      }, { passive: false });

      // Arrastrar para desplazarse
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.dragging = true;
        this._panDistance = 0;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragPanX = this.panX;
        this.dragPanY = this.panY;
        this.canvas.classList.add('grabbing');
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this._panDistance = Math.max(Math.abs(dx), Math.abs(dy));
      this.panX = this.dragPanX + dx;
      this.panY = this.dragPanY + dy;
      this.applyTransform();
    });

    document.addEventListener('mouseup', () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this._panDistance > 3) this._ignoreNextClick = true;
      if (this.canvas) this.canvas.classList.remove('grabbing');
      document.body.style.cursor = '';
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isVisible()) return;
      if (e.key === 'Escape') this.hide();
      if (e.key === 'ArrowLeft') this.prevPage();
      if (e.key === 'ArrowRight') this.nextPage();
    });

    window.addEventListener('resize', () => {
      if (this.isVisible()) this.applyTransform();
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
    this.scale = 1;

    if (this.modal) this.modal.style.display = 'flex';
    await this.renderPage();
    this.resetView();
  }

  hide() {
    if (this.modal) this.modal.style.display = 'none';
  }

  // Dimensiones visibles del contenedor del canvas
  getStageSize() {
    if (this.stage) {
      return { w: this.stage.clientWidth, h: this.stage.clientHeight };
    }
    return {
      w: window.innerWidth * 0.9,
      h: window.innerHeight * 0.88
    };
  }

  resetView() {
    if (!this.pdfDoc) return;
    this.scale = 1; // 1 = el render base ya está ajustado
    this.centerContent();
  }

  centerContent() {
    const { w, h } = this.getStageSize();
    this.panX = (w - this.baseW * this.scale) / 2;
    this.panY = (h - this.baseH * this.scale) / 2;
    this.applyTransform();
  }

  // Clampa el pan para que el contenido no se desplace fuera de la vista
  clampPan() {
    const { w, h } = this.getStageSize();
    const contentW = this.baseW * this.scale;
    const contentH = this.baseH * this.scale;

    const rangeX = contentW - w;
    if (rangeX <= 0) {
      this.panX = (w - contentW) / 2;
    } else {
      this.panX = Math.min(0, Math.max(-rangeX, this.panX));
    }

    const rangeY = contentH - h;
    if (rangeY <= 0) {
      this.panY = (h - contentH) / 2;
    } else {
      this.panY = Math.min(0, Math.max(-rangeY, this.panY));
    }
  }

  applyTransform() {
    this.clampPan();
    if (this.canvas) {
      this.canvas.style.transformOrigin = '0 0';
      this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
      this.canvas.style.cursor = this.scale > 1.05 ? 'grab' : 'default';
    }
    const levelEl = document.getElementById('zoom-level');
    if (levelEl) {
      levelEl.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  zoomAtPoint(px, py, factor) {
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    if (newScale === this.scale) return;

    // Mantener el punto bajo el cursor en la misma posición
    const wx = (px - this.panX) / this.scale;
    const wy = (py - this.panY) / this.scale;
    this.scale = newScale;
    this.panX = px - wx * this.scale;
    this.panY = py - wy * this.scale;
    this.applyTransform();
  }

  zoomAtCenter(delta) {
    const { w, h } = this.getStageSize();
    this.zoomAtPoint(w / 2, h / 2, delta > 0 ? 1.25 : 1 / 1.25);
  }

  async fitToWindow() {
    if (!this.pdfDoc) return;
    try {
      await this.renderPage();
      this.resetView();
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
      this.resetView();
    }
  }

  async nextPage() {
    if (this.currentPageNum < this.totalPages) {
      this.currentPageNum++;
      if (window.editorView) {
        this.currentRotation = window.editorView.getPageRotation(this.currentPageNum - 1);
      }
      await this.renderPage();
      this.resetView();
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

      // Escala base: ajustar la página al contenedor (con márgenes)
      const stageSize = this.getStageSize();
      const baseViewport = page.getViewport({ scale: 1, rotation: this.currentRotation });
      const availW = stageSize.w * 0.9;
      const availH = stageSize.h * 0.9;
      const fitScale = Math.min(availW / baseViewport.width, availH / baseViewport.height);
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      const renderScale = fitScale * dpr;
      const renderViewport = page.getViewport({ scale: renderScale, rotation: this.currentRotation });

      this.baseW = renderViewport.width / dpr;
      this.baseH = renderViewport.height / dpr;

      this.canvas.width = renderViewport.width;
      this.canvas.height = renderViewport.height;

      const renderContext = {
        canvasContext: this.ctx,
        viewport: renderViewport
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