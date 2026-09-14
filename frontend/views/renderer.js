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
