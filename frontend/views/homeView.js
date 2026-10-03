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

    this._historyLoad = null;
    this.bindEvents();
    window.addEventListener('focus', () => this._refreshHistoryIfHomeIsVisible());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._refreshHistoryIfHomeIsVisible();
    });
  }

  _refreshHistoryIfHomeIsVisible() {
    if (window.router && window.router.currentViewId === 'view-home') this.loadRecentHistory();
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
            if (window.toast) window.toast.error('Por favor, seleccioná un archivo PDF válido.');
          }
        }
      });
    }
}

  async loadRecentHistory() {
    if (this._historyLoad) return this._historyLoad;
    this._historyLoad = (async () => {
      try {
        if (!window.api || !window.api.getHistory) return;
        const history = await window.api.getHistory();
        if (history && history.length > 0) {
          await this.checkHistoryFiles(history);
          this.renderHistory(history);
          if (this.recentSection) this.recentSection.style.display = 'block';
        } else {
          const banner = document.getElementById('resume-session-banner');
          if (banner) banner.style.display = 'none';
          if (this.recentGrid) this.recentGrid.innerHTML = '';
          if (this.recentSection) this.recentSection.style.display = 'none';
        }
      } catch (err) {
        console.error('Error al cargar historial:', err);
      } finally {
        this._historyLoad = null;
      }
    })();
    return this._historyLoad;
  }

  // El banner exige una verificación positiva; un error no autoriza a reanudar.
  async checkHistoryFiles(items) {
    await Promise.all(items.map(async (item) => {
      if (!item.filePath) {
        item.fileExists = false;
        item.missing = true;
        item.availabilityUnknown = false;
        return;
      }
      if (!window.api || !window.api.fileExists) {
        item.fileExists = false;
        item.missing = false;
        item.availabilityUnknown = true;
        return;
      }
      try {
        const result = await window.api.fileExists(item.filePath);
        item.fileExists = !!(result && result.exists === true);
        item.missing = !!(result && result.exists === false);
        item.availabilityUnknown = !result || typeof result.exists !== 'boolean';
      } catch (err) {
        item.fileExists = false;
        item.missing = false;
        item.availabilityUnknown = true;
      }
    }));
    return items;
  }

  /**
   * Escapa texto para interpolarlo dentro de atributos o innerHTML.
   * Los nombres de archivo en Windows suelen traer comillas y acentos.
   */
  static escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  renderHistory(items) {
    if (!this.recentGrid) return;
    this.recentGrid.innerHTML = '';

    const mostRecentWithDraft = items.find(i => i.hasDraft && i.fileExists === true);
    const resumeBanner = document.getElementById('resume-session-banner');
    if (resumeBanner) {
      if (mostRecentWithDraft) {
        resumeBanner.style.display = 'flex';
        const nameEl = document.getElementById('resume-filename');
        if (nameEl) nameEl.textContent = `Continuar edición de "${mostRecentWithDraft.fileName}"`;
        const btnResume = document.getElementById('btn-resume-session');
        if (btnResume) {
          btnResume.onclick = () => this.resumePendingDraft(mostRecentWithDraft);
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
      const safeName = HomeView.escapeHtml(item.fileName);
      const safeThumbSrc = thumbSrc.replace(/"/g, '&quot;');

      const missingBadge = item.missing
        ? '<span class="history-card-missing-badge"><i data-lucide="file-question"></i> No se encontró</span>'
        : '';

      card.innerHTML = `
        <div class="history-thumb-container">
          ${missingBadge}
          <img src="${safeThumbSrc}" alt="${safeName}" class="history-thumb" onerror="this.src='assets/icon.png'">
          ${item.hasDraft ? '<span class="history-card-draft-badge"><i data-lucide="edit-3"></i> En edición</span>' : ''}
          <button class="history-card-remove" title="Quitar de recientes" aria-label="Quitar ${safeName} de recientes">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <div class="history-info">
          <span class="history-title" title="${safeName}">${safeName}</span>
          ${item.missing ? '<span class="history-missing-hint">El archivo fue movido o eliminado</span>' : ''}
        </div>
      `;

      if (!item.missing) {
        card.addEventListener('click', () => this.openRecentFile(item.filePath));
      } else {
        card.addEventListener('click', () => {
          if (window.toast) window.toast.warning('Este archivo ya no existe en su ubicación original.');
        });
      }

      // El botón de quitar vive dentro de la card, así que hay que frenar
      // la propagación o el click abriría el documento.
      const btnRemove = card.querySelector('.history-card-remove');
      if (btnRemove) {
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmRemoveFromHistory(item);
        });
      }

      this.recentGrid.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons({ root: this.recentGrid });
      if (resumeBanner) window.lucide.createIcons({ root: resumeBanner });
    }
  }

  /**
   * Pide confirmación y quita la entrada del historial.
   * El backend borra en cascada el thumbnail y el borrador. El PDF original
   * del disco nunca se toca.
   */
  async confirmRemoveFromHistory(item) {
    if (!window.api || !window.api.removeFromHistory) {
      if (window.toast) window.toast.error('La API de Electron no se encuentra disponible.');
      return;
    }

    const fileName = item.fileName || 'este documento';
    const consequences = item.hasDraft
      ? 'También se borra la sesión sin exportar que tenías guardada.'
      : 'Su miniatura guardada se borra junto con el acceso.';

    const confirmed = window.toast
      ? await window.toast.confirm({
          title: `¿Quitar "${fileName}" de recientes?`,
          message: `El PDF no se borra de tu equipo. ${consequences}`,
          confirmText: 'Quitar',
          cancelText: 'Dejarlo',
          danger: true,
        })
      : false;

    if (!confirmed) return;

    try {
      await window.api.removeFromHistory(item.filePath);
      await this.loadRecentHistory();
      if (window.toast) window.toast.success('El acceso directo se quitó de recientes correctamente.');
    } catch (err) {
      console.error('Error al quitar del historial:', err);
      if (window.toast) window.toast.error('No se pudo quitar el acceso directo del archivo.');
    }
  }

  async handleBrowseClick() {
    try {
      if (!window.api || !window.api.openFile) {
        if (window.toast) window.toast.error('La API de Electron no se encuentra disponible.');
        return;
      }

      const fileData = await window.api.openFile();
      if (!fileData) return; // Cancelado por el usuario

      await this.loadDocument(fileData);
    } catch (err) {
      console.error('Error al explorar archivo:', err);
      if (window.toast) window.toast.error('Ocurrió un error al abrir el archivo.');
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
      if (window.toast) window.toast.error('No se pudo abrir el PDF: ' + (err.message || '') + '.');
    }
  }

  async resumePendingDraft(item) {
    await this.checkHistoryFiles([item]);
    if (item.fileExists !== true) {
      const banner = document.getElementById('resume-session-banner');
      if (banner) banner.style.display = 'none';
      await this.loadRecentHistory();
      if (window.toast) window.toast.warning('El archivo ya no está disponible para continuar la edición.');
      return;
    }
    await this.openRecentFile(item.filePath);
  }

  async openRecentFile(filePath) {
    try {
      if (!window.api || !window.api.readFile) return;
      const fileData = await window.api.readFile(filePath);
      if (fileData.error) {
        await this.loadRecentHistory();
        if (window.toast) window.toast.error('El archivo ya no existe en la ruta original.');
        return;
      }
      await this.loadDocument(fileData);
    } catch (err) {
      console.error('Error al abrir archivo reciente:', err);
      await this.loadRecentHistory();
      if (window.toast) window.toast.error('No se pudo abrir el archivo reciente.');
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
      if (window.toast) window.toast.error('Ocurrió un error al procesar las páginas del PDF.');
    } finally {
      this.hideLoading();
    }
  }
}

window.homeView = new HomeView();
