/**
 * Sistema de notificaciones Toast para DocSlicer
 */
class ToastNotification {
  constructor() {
    this.container = document.getElementById('toast-container');
  }

  show(message, type = 'success', duration = 3500) {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span class="toast-message">${message}</span>
    `;

    this.container.appendChild(toast);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({
        root: toast
      });
    }

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease forwards';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  success(msg, duration) {
    this.show(msg, 'success', duration);
  }

  error(msg, duration) {
    this.show(msg, 'error', duration);
  }

  warning(msg, duration) {
    this.show(msg, 'warning', duration);
  }
}

window.toast = new ToastNotification();
