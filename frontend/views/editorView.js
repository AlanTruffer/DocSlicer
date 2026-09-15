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

    this.initElements();
    this.bindEvents();
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

      if (e.key === 'Delete' || e.key === 'Backspace') {
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
      window.toast.success('Se recuperó tu sesión guardada pendiente');
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

    this.pageOrder.forEach((pageIdx) => {
      const pageData = this.pages[pageIdx];
      const card = this.createPageCard(pageData, categories);
      this.timelineContainer.appendChild(card);
      this.renderCardThumbnail(pageData, card);
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

    // Soporte inferior / banner del grupo en la línea de tiempo
    let groupFooterHtml = '';
    if (group) {
      const currentCat = categories.find(c => c.id === group.categoryId) || categories[0];
      const catName = currentCat ? currentCat.name : 'Categoría';

      let catOptions = '';
      categories.forEach(c => {
        const selected = c.id === group.categoryId ? 'selected' : '';
        catOptions += `<option value="${c.id}" ${selected}>${c.name}</option>`;
      });

      groupFooterHtml = `
        <div class="timeline-group-footer" style="border-top: 2px solid ${group.color}; background: ${group.color}15;">
          <div class="timeline-group-label-wrapper">
            <span class="timeline-group-cat-title" style="color: ${group.color}" title="Categoría de este lote">${catName}</span>
            <select class="timeline-group-cat-select" data-group-id="${group.id}" title="Cambiar categoría con un clic">
              ${catOptions}
            </select>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="page-header-info">
        <span class="page-num">Pág. ${pageData.originalIndex + 1}</span>
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
      ${groupFooterHtml}
    `;

    // Click para seleccionar
    card.addEventListener('click', (e) => {
      if (e.target.closest('.page-controls') || e.target.closest('.timeline-group-footer')) return;
      this.handleCardClick(pageData.originalIndex, e);
    });

    // Doble click para Zoom
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('.page-controls') || e.target.closest('.timeline-group-footer')) return;
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

    // Cambio rápido de categoría desde la barra inferior de la línea de tiempo
    const catSelect = card.querySelector('.timeline-group-cat-select');
    if (catSelect && group) {
      catSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        this.updateGroupCategory(group.id, e.target.value);
      });
      catSelect.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    return card;
  }

  async renderCardThumbnail(pageData, cardElement) {
    if (!this.pdfDoc) return;
    try {
      const page = await this.pdfDoc.getPage(pageData.originalIndex + 1);
      const canvas = cardElement.querySelector('.page-thumb-canvas');
      if (!canvas) return;

      const viewport = page.getViewport({ scale: 0.3, rotation: pageData.rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error('Error renderizando miniatura:', err);
    }
  }

  initSortable() {
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
    }

    if (!this.timelineContainer || !window.Sortable) return;

    this.sortableInstance = new window.Sortable(this.timelineContainer, {
      animation: 200,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      filter: '.btn-icon, .timeline-group-cat-select',
      preventOnFilter: false,
      onEnd: (evt) => {
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;
        if (oldIndex === newIndex) return;

        const previousOrder = [...this.pageOrder];
        const movedItem = this.pageOrder.splice(oldIndex, 1)[0];
        this.pageOrder.splice(newIndex, 0, movedItem);

        const newOrder = [...this.pageOrder];

        if (window.undoManager) {
          window.undoManager.pushAction({
            type: 'reorder',
            description: `Reordenar página ${movedItem + 1}`,
            undo: () => {
              this.pageOrder = [...previousOrder];
              this.renderTimeline();
              this.syncGroupsPageOrder();
              this.scheduleAutoSave();
            },
            redo: () => {
              this.pageOrder = [...newOrder];
              this.renderTimeline();
              this.syncGroupsPageOrder();
              this.scheduleAutoSave();
            }
          });
        }

        this.syncGroupsPageOrder();
        this.scheduleAutoSave();
      }
    });
  }

  syncGroupsPageOrder() {
    this.groups.forEach(g => {
      g.pageIndices.sort((a, b) => this.pageOrder.indexOf(a) - this.pageOrder.indexOf(b));
    });
    this.updateSidePanel();
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
    if (window.toast) window.toast.show(`${pagesToExclude.length} página(s) excluida(s)`, 'warning', 2500);
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

    if (window.toast) window.toast.success(`Grupo creado con ${selectedSorted.length} página(s)`);

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
      const categories = window.categoryManager ? window.categoryManager.categories : [];
      window.sidePanel.renderGroups(this.groups, categories);
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
