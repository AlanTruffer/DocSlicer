/**
 * Router SPA y Coordinador General de DocSlicer
 */
class AppRouter {
  constructor() {
    this.currentViewId = 'view-home';
    this.views = {
'view-home': document.getElementById('view-home'),
      'view-editor': document.getElementById('view-editor')
    };

    this.initTitlebar();
    this.initHelp();
}

  navigateTo(viewId) {
    if (!this.views[viewId]) return;

    Object.keys(this.views).forEach(id => {
      if (this.views[id]) {
        this.views[id].classList.remove('active');
      }
    });

    this.views[viewId].classList.add('active');
    this.currentViewId = viewId;

    // El botón de ayuda solo se muestra en la vista de inicio
    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
      btnHelp.style.display = viewId === 'view-home' ? 'flex' : 'none';
    }

    if (viewId === 'view-home') {
      if (window.homeView) {
        window.homeView.loadRecentHistory();
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
}

  initTitlebar() {
    const btnMin = document.getElementById('btn-minimize');
    const btnMax = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (btnMin) {
      btnMin.addEventListener('click', () => {
        if (window.api && window.api.minimizeWindow) window.api.minimizeWindow();
      });
    }

    if (btnMax) {
      btnMax.addEventListener('click', () => {
        if (window.api && window.api.maximizeWindow) window.api.maximizeWindow();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (window.api && window.api.closeWindow) window.api.closeWindow();
      });
    }
  }

  initHelp() {
    const btnHelp = document.getElementById('btn-help');
    const modal = document.getElementById('help-modal');
    const btnClose = document.getElementById('help-modal-close');
    const btnDone = document.getElementById('help-modal-done');

    const open = () => {
      if (!modal) return;
      modal.style.display = 'flex';
      if (window.lucide) window.lucide.createIcons({ root: modal });
    };
    const close = () => {
      if (modal) modal.style.display = 'none';
    };

    if (btnHelp) btnHelp.addEventListener('click', open);
    if (btnClose) btnClose.addEventListener('click', close);
    if (btnDone) btnDone.addEventListener('click', close);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!modal || modal.style.display !== 'flex') return;
      if (e.key === 'Escape') close();
    });
  }
}

window.router = new AppRouter();

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar iconos Lucide generales
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Cargar categorías guardadas en disco
  if (window.categoryManager) {
    await window.categoryManager.loadCategories();
  }

  // Cargar historial reciente
  if (window.homeView) {
    await window.homeView.loadRecentHistory();
  }
});
