/**
 * Vista Principal / Home: Dropzone y Tarjetas de Historial
 */
class HomeView {
  constructor() {
    this.viewElement = document.getElementById('view-home');
    this.dropzone = document.getElementById('dropzone');
    this.btnBrowse = document.getElementById('btn-browse');
    this.recentSection = document.getElementById('recent-section');
    this.recentGrid = document.getElementById('recent-grid');

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnBrowse) {
      this.btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleBrowseClick();
      });
    }

    if (this.dropzone) {
      this.dropzone.addEventListener('click', (e) => {
        // Abrir explorador si se hace click en cualquier parte de la dropzone
        this.handleBrowseClick();
      });

      this.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('dragover');
      });

      this.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('dragover');
      });

      this.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.name.toLowerCase().endsWith('.pdf')) {
            this.handleFileDrop(file);
          } else {
            if (window.toast) window.toast.error('Por favor, seleccioná un archivo PDF válido');
          }
        }
      });
    }
}

  async loadRecentHistory() {
    try {
      if (!window.api || !window.api.getHistory) return;
      const history = await window.api.getHistory();
      if (history && history.length > 0) {
        await this.checkHistoryFiles(history);
        this.renderHistory(history);
        this.recentSection.style.display = 'block';
      } else {
        this.recentSection.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  }

  // Marca con flag missing a las entradas del historial cuyo archivo ya no existe en disco
  async checkHistoryFiles(items) {
    if (!window.api || !window.api.fileExists) return items;
    await Promise.all(items.map(async (item) => {
      if (!item.filePath) return;
      try {
        const res = await window.api.fileExists(item.filePath);
        item.missing = !(res && res.exists);
      } catch (e) {
        item.missing = false;
      }
    }));
    return items;
  }

  renderHistory(items) {
    if (!this.recentGrid) return;
    this.recentGrid.innerHTML = '';

    const mostRecentWithDraft = items.find(i => i.hasDraft);
    const resumeBanner = document.getElementById('resume-session-banner');
    if (resumeBanner) {
      if (mostRecentWithDraft) {
        resumeBanner.style.display = 'flex';
        const nameEl = document.getElementById('resume-filename');
        if (nameEl) nameEl.textContent = `Continuar edición de "${mostRecentWithDraft.fileName}"`;
        const btnResume = document.getElementById('btn-resume-session');
        if (btnResume) {
          btnResume.onclick = () => this.openRecentFile(mostRecentWithDraft.filePath);
        }
} else {
        resumeBanner.style.display = 'none';
      }
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      if (item.hasDraft) card.classList.add('has-draft');
      if (item.missing) card.classList.add('history-card-missing');

      const thumbSrc = item.thumbnailPath ? `file://${item.thumbnailPath.replace(/\\/g, '/')}` : 'assets/icon.png';

      const missingBadge = item.missing
        ? '<span class="history-card-missing-badge"><i data-lucide="file-question"></i> No se encontró</span>'
        : '';

      card.innerHTML = `
        <div class="history-thumb-container">
          ${missingBadge}
          <img src="${thumbSrc}" alt="${item.fileName}" class="history-thumb" onerror="this.src='assets/icon.png'">
          ${item.hasDraft ? '<span class="history-card-draft-badge"><i data-lucide="edit-3"></i> En edición</span>' : ''}
        </div>
        <div class="history-info">
          <span class="history-title" title="${item.fileName}">${item.fileName}</span>
          ${item.missing ? '<span class="history-missing-hint">El archivo fue movido o eliminado</span>' : ''}
        </div>
      `;

      if (!item.missing) {
        card.addEventListener('click', () => this.openRecentFile(item.filePath));
      } else {
        card.addEventListener('click', () => {
          if (window.toast) window.toast.warning('Este archivo ya no existe en su ubicación original');
        });
      }
      this.recentGrid.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons({ root: this.recentGrid });
      if (resumeBanner) window.lucide.createIcons({ root: resumeBanner });
    }
  }

  async handleBrowseClick() {
    try {
      if (!window.api || !window.api.openFile) {
        if (window.toast) window.toast.error('API de Electron no disponible');
        return;
      }

      const fileData = await window.api.openFile();
      if (!fileData) return; // Cancelado por el usuario

      await this.loadDocument(fileData);
    } catch (err) {
      console.error('Error al explorar archivo:', err);
      if (window.toast) window.toast.error('Error al abrir el archivo');
    }
  }

  async handleFileDrop(file) {
    try {
      // En Electron moderno, la ruta se obtiene con getPathForFile
      let filePath = '';
      if (window.api && window.api.getPathForFile) {
        try {
          filePath = window.api.getPathForFile(file);
        } catch (e) {
          console.warn('getPathForFile warning:', e);
        }
      }
      if (!filePath && file.path) {
        filePath = file.path;
      }

      if (filePath && window.api && window.api.readFile) {
        const fileData = await window.api.readFile(filePath);
        if (fileData.error) {
          throw new Error(fileData.error);
        }
        await this.loadDocument(fileData);
      } else {
        // Fallback leyendo como ArrayBuffer nativo
        const buffer = await file.arrayBuffer();
        await this.loadDocument({
          filePath: filePath || file.name,
          fileName: file.name,
          buffer: buffer
        });
      }
    } catch (err) {
      console.error('Error al procesar archivo soltado:', err);
      if (window.toast) window.toast.error('No se pudo abrir el PDF: ' + (err.message || ''));
    }
  }

  async openRecentFile(filePath) {
    try {
      if (!window.api || !window.api.readFile) return;
      const fileData = await window.api.readFile(filePath);
      if (fileData.error) {
        if (window.toast) window.toast.error('El archivo ya no existe en la ruta original');
        return;
      }
      await this.loadDocument(fileData);
} catch (err) {
      console.error('Error al abrir archivo reciente:', err);
      if (window.toast) window.toast.error('No se pudo abrir el archivo reciente');
    }
  }

  showLoading() {
    this._loadingEl = document.getElementById('loading-overlay');
    if (this._loadingEl) {
      this._loadingEl.style.display = 'flex';
      // Forzar cursor de carga sobre toda la app mientras se procesa
      document.body.style.cursor = 'progress';
    }
  }

  hideLoading() {
    if (this._loadingEl) {
      this._loadingEl.style.display = 'none';
    }
    document.body.style.cursor = '';
  }

  async loadDocument(fileData) {
    try {
      this.showLoading();
      if (window.editorView) {
        await window.editorView.loadPdf(fileData);
      }
      if (window.router) {
        window.router.navigateTo('view-editor');
      }
    } catch (err) {
      console.error('Error al cargar documento en editor:', err);
      if (window.toast) window.toast.error('Error al procesar las páginas del PDF');
    } finally {
      this.hideLoading();
    }
  }
}

window.homeView = new HomeView();
