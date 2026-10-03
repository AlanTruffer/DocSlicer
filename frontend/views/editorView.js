/**
 * Vista Editor: Línea de Tiempo, Reordenar (SortableJS), Rotaciones, Selección, Agrupamiento y Autoguardado
 */
class EditorView {
  constructor() {
    this.pdfBuffer = null;
    this.pdfBufferCopy = null;
    this.pdfDoc = null;
    this.filePath = '';
    this.fileName = '';
    this._autoSaveTimer = null;

    // Paleta de colores para distinguir grupos
    this.groupColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308'];

    /**
     * pages: Array de objetos por hoja original:
     * {
     *   originalIndex: number (0-based),
     *   rotation: number (0, 90, 180, 270),
     *   excluded: boolean,
     *   groupId: string | null,
     *   thumbnailDataUrl: string
     * }
     */
    this.pages = [];
    this.pageOrder = [];
    this.groups = [];

this.selectedPages = new Set(); // Set de originalIndex
    this.sortableInstance = null;

    // Cola de renders de miniaturas con concurrencia limitada
    this._thumbQueue = [];
    this._thumbInFlight = 0;
    this._thumbMaxConcurrent = 4;

    this.initElements();
    this.bindEvents();
    this.initTimelineScroll();
    this.initAutoScroll();
  }

  initTimelineScroll() {
    const area = this.timelineContainer ? this.timelineContainer.closest('.timeline-area') : null;
    if (!area) return;
    this.timelineArea = area;

    let drag = null;

    // Arrastre sobre el espacio vacío de la tira para desplazarse en horizontal
    area.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.page-card, .group-band, .btn-icon, .group-band-cat-select')) return;
      drag = {
        startX: e.clientX,
        startScroll: area.scrollLeft,
      };
      area.classList.add('dragging-scroll');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      area.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
      e.preventDefault();
    });

    document.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = null;
      area.classList.remove('dragging-scroll');
    });

    // Rueda del mouse: desplaza en horizontal cuando hay desborde
    area.addEventListener('wheel', (e) => {
      if (area.scrollWidth <= area.clientWidth) return;
      e.preventDefault();
      area.scrollLeft += e.deltaY + e.deltaX;
    }, { passive: false });
  }

  // ==============================================================
  // Auto-scroll en bordes del visor durante el arrastre
  // ==============================================================

  initAutoScroll() {
    this._autoScrollSpeed = 0;
    this._autoScrollRaf = null;
  }

  _startAutoScroll(speed) {
    this._autoScrollSpeed = speed;
    if (!this._autoScrollRaf) {
      const step = () => {
        if (!this.timelineArea || this._autoScrollSpeed === 0) {
          this._autoScrollRaf = null;
          return;
        }
        this.timelineArea.scrollLeft += this._autoScrollSpeed;
        this.updatePageNumbersFromDom();
        this._autoScrollRaf = requestAnimationFrame(step);
      };
      this._autoScrollRaf = requestAnimationFrame(step);
    }
  }

  _stopAutoScroll() {
    this._autoScrollSpeed = 0;
    if (this._autoScrollRaf) {
      cancelAnimationFrame(this._autoScrollRaf);
      this._autoScrollRaf = null;
    }
  }

  _checkEdgeAutoScroll(clientX) {
    if (!this.timelineArea) return;
    const rect = this.timelineArea.getBoundingClientRect();
    const edgeThreshold = 100; // px desde el borde
    const maxSpeed = 18; // px por cuadro

    if (clientX < rect.left + edgeThreshold) {
      const dist = Math.max(0, clientX - rect.left);
      const factor = 1 - (dist / edgeThreshold);
      this._startAutoScroll(-Math.max(3, Math.round(factor * maxSpeed)));
    } else if (clientX > rect.right - edgeThreshold) {
      const dist = Math.max(0, rect.right - clientX);
      const factor = 1 - (dist / edgeThreshold);
      this._startAutoScroll(Math.max(3, Math.round(factor * maxSpeed)));
    } else {
      this._stopAutoScroll();
    }
  }

  /**
   * Actualiza en caliente el número visible (Pág. X) de todas las tarjetas
   * según su posición secuencial actual en el visor.
   */
  updatePageNumbersFromDom() {
    if (!this.timelineContainer) return;
    const cards = Array.from(this.timelineContainer.querySelectorAll('.page-card'));
    cards.forEach((card, idx) => {
      const numSpan = card.querySelector('.page-num');
      if (numSpan) {
        const origIdx = parseInt(card.getAttribute('data-page-index'), 10);
        numSpan.textContent = `Pág. ${idx + 1}`;
        numSpan.title = `Página original: ${origIdx + 1}`;
      }
    });
  }

  initElements() {
    this.viewElement = document.getElementById('view-editor');
    this.fileNameLabel = document.getElementById('editor-filename');
    this.timelineContainer = document.getElementById('timeline-container');
    this.btnBack = document.getElementById('btn-back');
    this.btnUndo = document.getElementById('btn-undo');
    this.btnRedo = document.getElementById('btn-redo');
    this.btnSelectAll = document.getElementById('btn-select-all');
    this.btnGroup = document.getElementById('btn-group');
    this.selectionCounter = document.getElementById('selection-counter');
    this.inputLegajoPrefix = document.getElementById('input-legajo-prefix');
  }

  bindEvents() {
    if (this.btnBack) {
      this.btnBack.addEventListener('click', () => {
        if (window.router) window.router.navigateTo('view-home');
      });
    }

    if (this.btnUndo) {
      this.btnUndo.addEventListener('click', () => {
        if (window.undoManager) window.undoManager.undo();
      });
    }

    if (this.btnRedo) {
      this.btnRedo.addEventListener('click', () => {
        if (window.undoManager) window.undoManager.redo();
      });
    }

    if (this.btnSelectAll) {
      this.btnSelectAll.addEventListener('click', () => this.toggleSelectAll());
    }

    if (this.btnGroup) {
      this.btnGroup.addEventListener('click', () => this.groupSelectedPages());
    }

    if (this.inputLegajoPrefix) {
      this.inputLegajoPrefix.addEventListener('input', () => {
        this.updateSidePanel();
        this.scheduleAutoSave();
      });
    }

    // Atajos de teclado en el editor
document.addEventListener('keydown', (e) => {
      if (!this.isActive()) return;

      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      // Con un modal abierto las teclas single-letter (Q/E) no deben llegar
      // al editor: se escribirían en los inputs del diálogo de categorías.
      if (this.isModalOpen()) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.groupSelectedPages();
      } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        this.rotateSelectedPages(e.key === 'ArrowRight' ? 90 : -90);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        this.rotateSelectedPages(-90);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.rotateSelectedPages(90);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.toggleExcludeSelected();
      } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        this.selectAll();
      } else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          if (window.undoManager) window.undoManager.redo();
        } else {
          if (window.undoManager) window.undoManager.undo();
        }
      } else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (window.undoManager) window.undoManager.redo();
      }
    });

    if (window.undoManager) {
      window.undoManager.setChangeCallback((state) => {
        if (this.btnUndo) this.btnUndo.disabled = !state.canUndo;
        if (this.btnRedo) this.btnRedo.disabled = !state.canRedo;
      });
    }
  }

  isActive() {
    return this.viewElement && this.viewElement.classList.contains('active');
  }

  /**
   * ¿Hay algún modal abierto sobre la app?
   * Los modales de la app se abren y cierran con `style.display`, así que
   * basta con buscar el primero que esté visible.
   */
  isModalOpen() {
    const overlays = document.querySelectorAll('.modal-overlay');
    for (const el of overlays) {
      if (el.style.display && el.style.display !== 'none') return true;
    }
    return false;
  }

  getLegajoPrefix() {
    if (this.inputLegajoPrefix && this.inputLegajoPrefix.value.trim()) {
      return this.inputLegajoPrefix.value.trim();
    }
    return (this.fileName || '').replace(/\.[^/.]+$/, '');
  }

  async ensurePdfjsReady() {
    if (window.pdfjsLib) return window.pdfjsLib;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.pdfjsLib) {
          clearInterval(interval);
          resolve(window.pdfjsLib);
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error('El motor PDF.js no se cargó a tiempo.'));
        }
      }, 50);
    });
  }

  async loadPdf(fileData) {
    this.filePath = fileData.filePath;
    this.fileName = fileData.fileName;
    this.pdfBuffer = fileData.buffer;
    // Copia segura inmutable del buffer
    this.pdfBufferCopy = fileData.buffer && fileData.buffer.slice ? fileData.buffer.slice(0) : fileData.buffer;

    if (this.fileNameLabel) {
      this.fileNameLabel.textContent = this.fileName;
      this.fileNameLabel.title = this.filePath || this.fileName;
    }

    // Prefijo predeterminado obtenido del nombre del archivo (ej. L16034.pdf -> L16034)
    const defaultLegajo = (this.fileName || '').replace(/\.[^/.]+$/, '');
    if (this.inputLegajoPrefix) {
      this.inputLegajoPrefix.value = defaultLegajo;
    }

    // Asegurar que pdfjsLib esté listo
    await this.ensurePdfjsReady();

    // Cargar documento en pdfjsLib con Uint8Array
    const uint8Array = new Uint8Array(this.pdfBuffer);
    const loadingTask = window.pdfjsLib.getDocument({ data: uint8Array });
    this.pdfDoc = await loadingTask.promise;
    const numPages = this.pdfDoc.numPages;

    this.pages = [];
    this.pageOrder = [];
    this.groups = [];
    this.selectedPages.clear();
    if (window.undoManager) window.undoManager.clear();

    for (let i = 0; i < numPages; i++) {
      this.pages.push({
        originalIndex: i,
        rotation: 0,
        excluded: false,
        groupId: null,
        thumbnailDataUrl: null
      });
      this.pageOrder.push(i);
    }

    // Comprobar si existe un borrador previo guardado para este archivo
    let restored = false;
    if (this.filePath && window.api && window.api.getDraft) {
      try {
        const draft = await window.api.getDraft(this.filePath);
        if (draft) {
          this.applyDraft(draft, numPages);
          restored = true;
        }
      } catch (e) {
        console.warn('No se pudo recuperar borrador previo:', e);
      }
    }

    // Renderizar tarjetas en línea de tiempo
    this.renderTimeline();

    // Guardar en historial y generar thumbnail de la primera página
    await this.processFirstPageThumbnail();

    this.updateSidePanel();

    if (restored && window.toast) {
      window.toast.success('Se recuperó tu sesión guardada pendiente.');
    }
  }

  applyDraft(draft, numPages) {
    if (draft.legajoPrefix && this.inputLegajoPrefix) {
      this.inputLegajoPrefix.value = draft.legajoPrefix;
    }

    if (Array.isArray(draft.rotations)) {
      draft.rotations.forEach(r => {
        if (this.pages[r.originalIndex]) {
          this.pages[r.originalIndex].rotation = r.rotation;
        }
      });
    }

    if (Array.isArray(draft.exclusions)) {
      draft.exclusions.forEach(idx => {
        if (this.pages[idx]) {
          this.pages[idx].excluded = true;
        }
      });
    }

    if (Array.isArray(draft.pageOrder) && draft.pageOrder.length === numPages) {
      this.pageOrder = [...draft.pageOrder];
    }

    if (Array.isArray(draft.groups)) {
      this.groups = draft.groups.map(g => ({
        id: g.id,
        color: g.color,
        pageIndices: [...g.pageIndices],
        categoryId: g.categoryId,
        variableValues: { ...(g.variableValues || {}) }
      }));

      this.groups.forEach(g => {
        g.pageIndices.forEach(idx => {
          if (this.pages[idx]) {
            this.pages[idx].groupId = g.id;
          }
        });
      });
    }
  }

  scheduleAutoSave() {
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      this.saveCurrentDraft();
    }, 400);
  }

  async saveCurrentDraft() {
    if (!this.filePath || !window.api || !window.api.saveDraft) return;
    const draftData = {
      filePath: this.filePath,
      fileName: this.fileName,
      legajoPrefix: this.getLegajoPrefix(),
      pageOrder: [...this.pageOrder],
      rotations: this.pages.map(p => ({ originalIndex: p.originalIndex, rotation: p.rotation })),
      exclusions: this.pages.filter(p => p.excluded).map(p => p.originalIndex),
      groups: this.groups.map(g => ({
        id: g.id,
        color: g.color,
        pageIndices: [...g.pageIndices],
        categoryId: g.categoryId,
        variableValues: { ...(g.variableValues || {}) }
      })),
      savedAt: new Date().toISOString()
    };
    await window.api.saveDraft(this.filePath, draftData);
  }

  async processFirstPageThumbnail() {
    try {
      if (this.pages.length === 0 || !this.pdfDoc) return;
      const firstPage = await this.pdfDoc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await firstPage.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/png');

      if (window.api && window.api.saveThumbnail && this.filePath) {
        const savedThumbPath = await window.api.saveThumbnail(this.filePath, dataUrl);
        if (window.api.addToHistory) {
          await window.api.addToHistory({
            filePath: this.filePath,
            fileName: this.fileName,
            thumbnailPath: savedThumbPath,
            openedAt: new Date().toISOString()
          });
        }
      }
} catch (err) {
      console.warn('No se pudo guardar thumbnail en historial:', err);
    }
  }

  renderTimeline() {
    if (!this.timelineContainer) return;
    this.timelineContainer.innerHTML = '';
    const categories = window.categoryManager ? window.categoryManager.categories : [];

    // Emitir grupos como bandas visuales (una sola vez) y páginas sueltas individualmente
    const emittedGroups = new Set();

    this.pageOrder.forEach((pageIdx) => {
      const pageData = this.pages[pageIdx];
      const groupId = pageData.groupId;
      const group = groupId ? this.groups.find(g => g.id === groupId) : null;

      if (group) {
        if (emittedGroups.has(group.id)) return; // ya se renderizó la banda completa
        emittedGroups.add(group.id);

        const band = document.createElement('div');
        band.className = 'group-band';
        band.setAttribute('data-group-id', group.id);
        band.style.setProperty('--group-color', group.color);

        const cardsRow = document.createElement('div');
        cardsRow.className = 'group-band-cards';

        group.pageIndices.forEach(gIdx => {
          if (!this.pages[gIdx]) return;
          const gData = this.pages[gIdx];
          const gCard = this.createPageCard(gData, categories);
          cardsRow.appendChild(gCard);
          this.renderCardThumbnail(gData, gCard);
        });

        band.appendChild(cardsRow);

        const rule = document.createElement('div');
        rule.className = 'group-band-rule';
        band.appendChild(rule);

        // Select de categoría centrado debajo del grupo
        const selectRow = document.createElement('div');
        selectRow.className = 'group-band-select';

        const sortedCategories = (window.CategoryManager && CategoryManager.sortByName)
          ? CategoryManager.sortByName(categories)
          : [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        let catOptions = '';
        sortedCategories.forEach(c => {
          const selected = c.id === group.categoryId ? 'selected' : '';
          catOptions += `<option value="${c.id}" ${selected}>${c.name}</option>`;
        });
        if (catOptions === '') {
          catOptions = '<option value="">Sin categorías</option>';
        }

        selectRow.innerHTML = `
          <span class="group-band-swatch" style="background:${group.color}"></span>
          <select class="group-band-cat-select" data-group-id="${group.id}" title="Categoría de este lote">
            ${catOptions}
          </select>
          <span class="group-band-count">${group.pageIndices.length} pág.</span>
        `;

        const select = selectRow.querySelector('.group-band-cat-select');
        if (select) {
          select.addEventListener('change', (e) => {
            e.stopPropagation();
            this.updateGroupCategory(group.id, e.target.value);
          });
        }

        band.appendChild(selectRow);
        this.timelineContainer.appendChild(band);

        // Click sobre la banda (fuera de cards y select) selecciona/deselecciona todo el lote
        band.addEventListener('click', (e) => {
          if (e.target.closest('.page-card')) return;
          if (e.target.closest('.group-band-cat-select')) return;
          if (e.target.closest('.btn-icon')) return;
          this.toggleSelectGroup(group);
        });
      } else {
        const card = this.createPageCard(pageData, categories);
        this.timelineContainer.appendChild(card);
        this.renderCardThumbnail(pageData, card);
      }
    });

    this.initSortable();
    this.updateSelectionUI();
    if (window.lucide) window.lucide.createIcons({ root: this.timelineContainer });
  }

  createPageCard(pageData, categories) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.setAttribute('data-page-index', pageData.originalIndex);

    if (pageData.excluded) {
      card.classList.add('excluded');
    }

    const group = this.groups.find(g => g.id === pageData.groupId);
    if (group) {
      card.style.borderColor = group.color;
      card.style.borderWidth = '2px';
      card.style.borderStyle = 'solid';
    }

    const currentPos = this.pageOrder ? (this.pageOrder.indexOf(pageData.originalIndex) + 1) : (pageData.originalIndex + 1);
    const origPos = pageData.originalIndex + 1;

    card.innerHTML = `
      <div class="page-header-info">
        <span class="page-num" title="Página original: ${origPos}">Pág. ${currentPos}</span>
        ${group ? `<span class="page-group-tag" style="background-color: ${group.color}">G</span>` : ''}
      </div>
      <div class="page-thumbnail-wrapper">
        <canvas class="page-thumb-canvas"></canvas>
        ${pageData.excluded ? '<div class="excluded-overlay"><i data-lucide="eye-off"></i></div>' : ''}
      </div>
      <div class="page-controls">
        <button class="btn-icon btn-rotate-left" title="Girar a la izquierda"><i data-lucide="rotate-ccw"></i></button>
        <button class="btn-icon btn-rotate-right" title="Girar a la derecha"><i data-lucide="rotate-cw"></i></button>
        <button class="btn-icon btn-exclude" title="${pageData.excluded ? 'Incluir página' : 'Excluir página'}">
          <i data-lucide="${pageData.excluded ? 'check' : 'trash-2'}"></i>
        </button>
      </div>
    `;

    // Click para seleccionar
    card.addEventListener('click', (e) => {
      if (e.target.closest('.page-controls')) return;
      this.handleCardClick(pageData.originalIndex, e);
    });

    // Doble click para Zoom
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('.page-controls')) return;
      if (window.zoomModal) {
        window.zoomModal.open(
          this.pdfDoc,
          pageData.originalIndex + 1,
          pageData.rotation,
          this.pages.length
        );
      }
    });

    // Rotar izquierda (-90)
    card.querySelector('.btn-rotate-left').addEventListener('click', (e) => {
      e.stopPropagation();
      this.rotatePage(pageData.originalIndex, -90);
    });

    // Rotar derecha (+90)
    card.querySelector('.btn-rotate-right').addEventListener('click', (e) => {
      e.stopPropagation();
      this.rotatePage(pageData.originalIndex, 90);
    });

    // Excluir / Incluir
    card.querySelector('.btn-exclude').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExcludePage(pageData.originalIndex);
    });

    return card;
  }

renderCardThumbnail(pageData, cardElement) {
    if (!this.pdfDoc) return;

    const cached = pageData._thumbCanvas && pageData._thumbKey === `${pageData.originalIndex}:${pageData.rotation}`
      ? pageData._thumbCanvas
      : null;

    if (cached) {
      this.drawThumbToCard(cached, cardElement);
      return;
    }
    this.enqueueThumbRender(pageData.originalIndex);
  }

  drawThumbToCard(sourceCanvas, cardElement) {
    const canvas = cardElement.querySelector('.page-thumb-canvas');
    if (!canvas || !sourceCanvas) return;
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceCanvas, 0, 0);
  }

  enqueueThumbRender(pageIdx) {
    this._thumbQueue.push(pageIdx);
    this.pumpThumbQueue();
  }

  pumpThumbQueue() {
    while (this._thumbInFlight < this._thumbMaxConcurrent && this._thumbQueue.length > 0) {
      const idx = this._thumbQueue.shift();
      this._thumbInFlight++;
      this.renderThumbJob(idx).then(() => {
        this._thumbInFlight--;
        this.pumpThumbQueue();
      });
    }
  }

  async renderThumbJob(pageIdx) {
    const pageData = this.pages[pageIdx];
    if (!pageData || !this.pdfDoc) return;
    try {
      const page = await this.pdfDoc.getPage(pageIdx + 1);

      // Escala necesaria para verse nítida al tamaño real × dpr (con tope)
      const card = this.timelineContainer.querySelector(`.page-card[data-page-index="${pageIdx}"]`);
      const wrapper = card ? card.querySelector('.page-thumbnail-wrapper') : null;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      let targetW = 300;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width > 0) {
          targetW = Math.min(300, Math.max(80, rect.width * dpr));
        }
      }

      const base = page.getViewport({ scale: 1, rotation: pageData.rotation });
      const viewport = page.getViewport({ scale: targetW / base.width, rotation: pageData.rotation });

      const source = document.createElement('canvas');
      source.width = viewport.width;
      source.height = viewport.height;
      const ctx = source.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      pageData._thumbCanvas = source;
      pageData._thumbKey = `${pageData.originalIndex}:${pageData.rotation}`;

      const liveCard = this.timelineContainer.querySelector(`.page-card[data-page-index="${pageIdx}"]`);
      if (liveCard) this.drawThumbToCard(source, liveCard);
    } catch (err) {
      console.error('Error renderizando miniatura:', err);
    }
  }

  initSortable() {
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
    }
    if (this.bandSortables) {
      this.bandSortables.forEach(s => s.destroy());
    }
    this.bandSortables = [];

    if (!this.timelineContainer || !window.Sortable) return;

    const baseOptions = {
      animation: 200,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      filter: '.btn-icon, .group-band-cat-select, .group-band .page-card',
      preventOnFilter: false,
      scroll: this.timelineArea,
      scrollSensitivity: 100,
      scrollSpeed: 18,
      bubbleScroll: true,
      onMove: (evt) => {
        if (evt.originalEvent) {
          this._checkEdgeAutoScroll(evt.originalEvent.clientX);
        }
        return true;
      },
      onChange: () => {
        this.updatePageNumbersFromDom();
      },
      onEnd: (evt) => {
        this._stopAutoScroll();
        queueMicrotask(() => this.handleSortEnd(evt));
      },
    };

    // Nivel superior: solo páginas sueltas. Las bandas nunca se mueven.
    // Las páginas dentro de bandas las gestiona su Sortable interno.
    this.sortableInstance = new window.Sortable(this.timelineContainer, {
      ...baseOptions,
      draggable: '.page-card',
      filter: '.btn-icon, .group-band-cat-select, .group-band .page-card',
      group: 'pages',
    });

    // Nivel interno: reordenar páginas y permitir transferencias entre
    // bandas existentes y el nivel raíz.
    this.timelineContainer.querySelectorAll('.group-band-cards').forEach(bandEl => {
      const inner = new window.Sortable(bandEl, {
        ...baseOptions,
        draggable: '.page-card',
        group: 'pages',
      });
      this.bandSortables.push(inner);
    });
  }

  getDomPageOrder() {
    const order = [];
    if (!this.timelineContainer) return order;
    Array.from(this.timelineContainer.children).forEach(el => {
      if (el.classList.contains('page-card')) {
        order.push(parseInt(el.getAttribute('data-page-index'), 10));
      } else if (el.classList.contains('group-band')) {
        el.querySelectorAll('.page-card').forEach(card => {
          order.push(parseInt(card.getAttribute('data-page-index'), 10));
        });
      }
    });
    return order;
  }

  handleSortEnd(evt) {
    const previous = this.captureArrangementState();
    const newOrder = this.getDomPageOrder();
    this.updatePageNumbersFromDom();
    this.pageOrder = [...newOrder];
    this.syncGroupsFromDom();
    const next = this.captureArrangementState();

    if (JSON.stringify(previous) === JSON.stringify(next)) return;

    this.renderTimeline();
    this.syncGroupsPageOrder();
    this.scheduleAutoSave();

    if (window.undoManager) {
      window.undoManager.pushAction({
        type: 'reorder',
        description: 'Mover página',
        undo: () => this.restoreArrangementState(previous),
        redo: () => this.restoreArrangementState(next),
      });
    }
  }

  captureArrangementState() {
    return {
      pageOrder: [...this.pageOrder],
      groups: this.groups.map(group => ({
        ...group,
        pageIndices: [...group.pageIndices],
        variableValues: { ...(group.variableValues || {}) },
      })),
    };
  }

  restoreArrangementState(state) {
    this.pageOrder = [...state.pageOrder];
    this.groups = state.groups.map(group => ({
      ...group,
      pageIndices: [...group.pageIndices],
      variableValues: { ...(group.variableValues || {}) },
    }));
    const membership = new Map();
    this.groups.forEach(group => group.pageIndices.forEach(pageIdx => membership.set(pageIdx, group.id)));
    this.pages.forEach(page => { page.groupId = membership.get(page.originalIndex) || null; });
    this.renderTimeline();
    this.syncGroupsPageOrder();
    this.scheduleAutoSave();
  }

  syncGroupsFromDom() {
    const membership = new Map();
    const groupById = new Map(this.groups.map(group => [group.id, group]));

    this.timelineContainer.querySelectorAll('.group-band').forEach(band => {
      const group = groupById.get(band.getAttribute('data-group-id'));
      if (!group) return;
      group.pageIndices = Array.from(band.querySelectorAll('.group-band-cards > .page-card'))
        .map(card => Number(card.getAttribute('data-page-index')));
      group.pageIndices.forEach(pageIdx => membership.set(pageIdx, group.id));
    });

    // A lot that loses its last page is removed, matching exclusion/ungroup behavior.
    this.groups = this.groups.filter(group => group.pageIndices.length > 0);
    this.pages.forEach(page => { page.groupId = membership.get(page.originalIndex) || null; });
  }

  syncGroupsPageOrder() {
    this.groups.forEach(g => {
      g.pageIndices.sort((a, b) => this.pageOrder.indexOf(a) - this.pageOrder.indexOf(b));
    });
    this.updateSidePanel();
  }

  toggleSelectGroup(group) {
    const allSelected = group.pageIndices.length > 0 && group.pageIndices.every(idx => this.selectedPages.has(idx));
    this.selectedPages.clear();
    if (!allSelected) {
      group.pageIndices.forEach(idx => this.selectedPages.add(idx));
    }
    this.updateSelectionUI();
  }

  handleCardClick(pageIdx, event) {
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedPages.has(pageIdx)) {
        this.selectedPages.delete(pageIdx);
      } else {
        this.selectedPages.add(pageIdx);
      }
    } else if (event.shiftKey && this.selectedPages.size > 0) {
      const lastSelected = Array.from(this.selectedPages).pop();
      const idxA = this.pageOrder.indexOf(lastSelected);
      const idxB = this.pageOrder.indexOf(pageIdx);
      const start = Math.min(idxA, idxB);
      const end = Math.max(idxA, idxB);
      for (let i = start; i <= end; i++) {
        this.selectedPages.add(this.pageOrder[i]);
      }
    } else {
      const wasSelected = this.selectedPages.has(pageIdx) && this.selectedPages.size === 1;
      this.selectedPages.clear();
      if (!wasSelected) {
        this.selectedPages.add(pageIdx);
      }
    }
    this.updateSelectionUI();
  }

  updateSelectionUI() {
    const cards = this.timelineContainer.querySelectorAll('.page-card');
    cards.forEach(card => {
      const idx = parseInt(card.getAttribute('data-page-index'), 10);
      if (this.selectedPages.has(idx)) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    if (this.selectionCounter) {
      if (this.selectedPages.size > 0) {
        const count = this.selectedPages.size;
        this.selectionCounter.textContent = `${count} seleccionada${count > 1 ? 's' : ''}`;
        this.selectionCounter.style.display = 'inline-flex';
      } else {
        this.selectionCounter.style.display = 'none';
      }
    }

    if (this.btnGroup) {
      this.btnGroup.disabled = this.selectedPages.size === 0;
      this.btnGroup.title = this.selectedPages.size > 0 
        ? `Agrupar ${this.selectedPages.size} página(s) seleccionada(s)`
        : 'Seleccioná 1 o más páginas para agrupar';
    }
  }

  selectAll() {
    this.pages.forEach(p => {
      if (!p.excluded) this.selectedPages.add(p.originalIndex);
    });
    this.updateSelectionUI();
  }

  toggleSelectAll() {
    if (this.selectedPages.size === this.pages.filter(p => !p.excluded).length) {
      this.selectedPages.clear();
} else {
      this.selectAll();
    }
    this.updateSelectionUI();
  }

  rotatePage(pageIdx, degreesDelta) {
    const page = this.pages[pageIdx];
    const prevRotation = page.rotation;
    const newRotation = (prevRotation + degreesDelta + 360) % 360;

    page.rotation = newRotation;
    this.refreshPageCardThumbnail(pageIdx);
    this.scheduleAutoSave();

    if (window.undoManager) {
      window.undoManager.pushAction({
        type: 'rotate',
        description: `Girar página ${pageIdx + 1} (${newRotation}°)`,
        undo: () => {
          page.rotation = prevRotation;
          this.refreshPageCardThumbnail(pageIdx);
          this.scheduleAutoSave();
        },
        redo: () => {
          page.rotation = newRotation;
          this.refreshPageCardThumbnail(pageIdx);
          this.scheduleAutoSave();
        }
      });
    }
  }

  /**
   * Verifica si la selección actual puede rotarse en bloque.
   * Varias páginas solo rotan juntas si pertenecen al mismo lote, o si
   * ninguna tiene lote asignado. Una mezcla de ambos no es coherente como
   * operación: el lote es la unidad de exportación.
   *
   * @returns {{ ok: boolean, reason?: string }}
   */
  canRotateSelection() {
    const selected = Array.from(this.selectedPages).filter(idx => this.pages[idx]);
    if (selected.length <= 1) return { ok: true };

    const groupIds = new Set(selected.map(idx => this.pages[idx].groupId || null));
    if (groupIds.size === 1) return { ok: true };

    const hasGrouped = groupIds.has(null) === false;
    return {
      ok: false,
      reason: hasGrouped
        ? 'La selección mezcla páginas de distintos lotes. Rotá un lote a la vez.'
        : 'La selección mezcla páginas con y sin lote. Agrupá las sueltas o rotá un lote a la vez.'
    };
  }

  // Rota en bloque todas las páginas seleccionadas (atajos Shift + Flechas, Q, E)
  rotateSelectedPages(delta) {
    const selected = Array.from(this.selectedPages).filter(idx => this.pages[idx]);
    if (selected.length === 0) return;

    const check = this.canRotateSelection();
    if (!check.ok) {
      if (window.toast) window.toast.warning(check.reason, 3200);
      return;
    }

    const prevRotations = {};
    selected.forEach(idx => { prevRotations[idx] = this.pages[idx].rotation; });

    selected.forEach(idx => {
      const page = this.pages[idx];
      page.rotation = (page.rotation + delta + 360) % 360;
    });

    selected.forEach(idx => this.refreshPageCardThumbnail(idx));
    this.scheduleAutoSave();

    if (window.undoManager) {
      const dir = delta > 0 ? 'derecha' : 'izquierda';
      window.undoManager.pushAction({
        type: 'rotate',
        description: `Rotar ${selected.length} página(s) a la ${dir}`,
        undo: () => {
          selected.forEach(idx => {
            this.pages[idx].rotation = prevRotations[idx];
            this.refreshPageCardThumbnail(idx);
          });
          this.scheduleAutoSave();
        },
        redo: () => {
          selected.forEach(idx => {
            this.pages[idx].rotation = (prevRotations[idx] + delta + 360) % 360;
            this.refreshPageCardThumbnail(idx);
          });
          this.scheduleAutoSave();
        }
      });
    }
  }

  toggleExcludePage(pageIdx) {
    const page = this.pages[pageIdx];
    const wasExcluded = page.excluded;
    page.excluded = !wasExcluded;

    if (page.excluded) {
      this.selectedPages.delete(pageIdx);
      if (page.groupId) {
        this.removePageFromGroup(pageIdx, page.groupId);
      }
    }

    this.renderTimeline();
    this.updateSidePanel();
    this.scheduleAutoSave();

    if (window.undoManager) {
      window.undoManager.pushAction({
        type: 'exclude',
        description: page.excluded ? `Excluir página ${pageIdx + 1}` : `Incluir página ${pageIdx + 1}`,
        undo: () => {
          page.excluded = wasExcluded;
          this.renderTimeline();
          this.updateSidePanel();
          this.scheduleAutoSave();
        },
        redo: () => {
          page.excluded = !wasExcluded;
          this.renderTimeline();
          this.updateSidePanel();
          this.scheduleAutoSave();
        }
      });
    }
  }

  toggleExcludeSelected() {
    if (this.selectedPages.size === 0) return;
    const pagesToExclude = Array.from(this.selectedPages);
    pagesToExclude.forEach(idx => {
      this.pages[idx].excluded = true;
      if (this.pages[idx].groupId) {
        this.removePageFromGroup(idx, this.pages[idx].groupId);
      }
    });
    this.selectedPages.clear();
    this.renderTimeline();
    this.updateSidePanel();
    this.scheduleAutoSave();
    const count = pagesToExclude.length;
    if (window.toast) window.toast.show(`Se excluy${count === 1 ? 'ó 1 página' : `eron ${count} páginas`}.`, 'warning', 2500);
  }

  refreshPageCardThumbnail(pageIdx) {
    const card = this.timelineContainer.querySelector(`.page-card[data-page-index="${pageIdx}"]`);
    if (card) {
      this.renderCardThumbnail(this.pages[pageIdx], card);
    }
  }

  getPageRotation(pageIdx) {
    return this.pages[pageIdx] ? this.pages[pageIdx].rotation : 0;
  }

  groupSelectedPages() {
    if (this.selectedPages.size === 0) return;

const selectedSorted = this.pageOrder.filter(idx => this.selectedPages.has(idx) && !this.pages[idx].excluded);
    if (selectedSorted.length === 0) return;

    // Si la selección es EXACTAMENTE un lote completo → desagrupar ese lote
    const exactGroup = this.groups.find(g =>
      g.pageIndices.length === selectedSorted.length &&
      g.pageIndices.every(idx => this.selectedPages.has(idx))
    );
    if (exactGroup) {
      this.selectedPages.clear();
      this.ungroup(exactGroup.id);
      if (window.toast) window.toast.success('El lote se desagrupó correctamente.');
      return;
    }

    selectedSorted.forEach(idx => {
      if (this.pages[idx].groupId) {
        this.removePageFromGroup(idx, this.pages[idx].groupId);
      }
    });

    const groupId = 'group_' + Date.now();
    const color = this.groupColors[this.groups.length % this.groupColors.length];
    
    const categories = window.categoryManager ? window.categoryManager.categories : [];
    const defaultCat = categories.length > 0 ? categories[0].id : 'resolucion';

    const newGroup = {
      id: groupId,
      color: color,
      pageIndices: selectedSorted,
      categoryId: defaultCat,
      variableValues: {}
    };

    selectedSorted.forEach(idx => {
      this.pages[idx].groupId = groupId;
    });

    this.groups.push(newGroup);
    this.selectedPages.clear();

    this.renderTimeline();
    this.updateSidePanel();
    this.scheduleAutoSave();

    const count = selectedSorted.length;
    if (window.toast) window.toast.success(`Se creó el grupo con ${count} página${count === 1 ? '' : 's'}.`);

    if (window.undoManager) {
      window.undoManager.pushAction({
        type: 'group',
        description: `Crear lote de ${selectedSorted.length} páginas`,
        undo: () => {
          this.ungroup(groupId, false);
          this.scheduleAutoSave();
        },
        redo: () => {
          newGroup.pageIndices.forEach(idx => {
            this.pages[idx].groupId = groupId;
          });
          this.groups.push(newGroup);
          this.renderTimeline();
          this.updateSidePanel();
          this.scheduleAutoSave();
        }
      });
    }
  }

  removePageFromGroup(pageIdx, groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    group.pageIndices = group.pageIndices.filter(p => p !== pageIdx);
    this.pages[pageIdx].groupId = null;

    if (group.pageIndices.length === 0) {
      this.groups = this.groups.filter(g => g.id !== groupId);
    }
  }

  ungroup(groupId, registerUndo = true) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    const savedGroup = { ...group, pageIndices: [...group.pageIndices] };

    group.pageIndices.forEach(idx => {
      this.pages[idx].groupId = null;
    });

    this.groups = this.groups.filter(g => g.id !== groupId);

    this.renderTimeline();
    this.updateSidePanel();
    this.scheduleAutoSave();

    if (registerUndo && window.undoManager) {
      window.undoManager.pushAction({
        type: 'ungroup',
        description: `Desagrupar lote`,
        undo: () => {
          savedGroup.pageIndices.forEach(idx => {
            this.pages[idx].groupId = savedGroup.id;
          });
          this.groups.push(savedGroup);
          this.renderTimeline();
          this.updateSidePanel();
          this.scheduleAutoSave();
        },
        redo: () => {
          this.ungroup(savedGroup.id, false);
          this.scheduleAutoSave();
        }
      });
    }
  }

  updateGroupCategory(groupId, newCatId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    group.categoryId = newCatId;
    this.renderTimeline();
    this.updateSidePanel();
    this.scheduleAutoSave();
  }

updateGroupVariable(groupId, varName, val) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    if (!group.variableValues) group.variableValues = {};
    group.variableValues[varName] = val;

    if (window.sidePanel) {
      window.sidePanel.updateFilenamePreview(groupId);
    }
    this.scheduleAutoSave();
  }

  updateSidePanel() {
    if (window.sidePanel) {
      const categories = window.categoryManager ? window.categoryManager.categories : [];
      window.sidePanel.renderGroups(this.groups, categories);
    }
  }

  getExportPlan() {
    if (!this.filePath && !this.pdfBufferCopy) return null;

    const categories = window.categoryManager ? window.categoryManager.categories : [];
    const exportGroups = [];

    this.groups.forEach(g => {
      if (g.pageIndices.length === 0) return;

      const category = categories.find(c => c.id === g.categoryId) || categories[0];
      const fileName = window.sidePanel ? window.sidePanel.calculateFileName(g, category) : 'documento.pdf';

      const rotations = {};
      g.pageIndices.forEach(idx => {
        if (this.pages[idx].rotation !== 0) {
          rotations[idx] = this.pages[idx].rotation;
        }
      });

      exportGroups.push({
        pages: [...g.pageIndices],
        rotations: rotations,
        fileName: fileName,
        categoryName: category ? category.name : ''
      });
    });

    return {
      filePath: this.filePath,
      pdfBufferCopy: this.pdfBufferCopy,
      groups: exportGroups
    };
  }
}

window.editorView = new EditorView();
