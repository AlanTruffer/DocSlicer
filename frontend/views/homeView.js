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
        this.renderHistory(history);
        this.recentSection.style.display = 'block';
      } else {
        this.recentSection.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  }

  renderHistory(items) {
    if (!this.recentGrid) return;
    this.recentGrid.innerHTML = '';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      
      const thumbSrc = item.thumbnailPath ? `file://${item.thumbnailPath.replace(/\\/g, '/')}` : 'assets/icon.png';

      card.innerHTML = `
        <div class="history-thumb-container">
          <img src="${thumbSrc}" alt="${item.fileName}" class="history-thumb" onerror="this.src='assets/icon.png'">
        </div>
        <div class="history-info">
          <span class="history-title" title="${item.fileName}">${item.fileName}</span>
        </div>
      `;

      card.addEventListener('click', () => this.openRecentFile(item.filePath));
      this.recentGrid.appendChild(card);
    });
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

  async loadDocument(fileData) {
    try {
      if (window.editorView) {
        await window.editorView.loadPdf(fileData);
      }
      if (window.router) {
        window.router.navigateTo('view-editor');
      }
    } catch (err) {
      console.error('Error al cargar documento en editor:', err);
      if (window.toast) window.toast.error('Error al procesar las páginas del PDF');
    }
  }
}

window.homeView = new HomeView();
