/**
 * Sistema de notificaciones Toast para DocSlicer.
 *
 * Wrapper sobre SweetAlert2 que conserva la API pública histórica de la app
 * (show / success / error / warning) para no tocar los ~24 call sites
 * existentes en el resto de los módulos.
 *
 * El theme no vive en JS: se define con variables CSS en app.css
 * (sección "7. NOTIFICACIONES") sobre las clases de SweetAlert2.
 */
class ToastNotification {
  constructor() {
    if (window.Swal) this._applyBaseTheme();
  }

  /**
   * Aplica los valores por defecto compartidos por toasts y diálogos.
   * Los colores concretos llegan por CSS custom properties, no desde acá.
   */
  _applyBaseTheme() {
    window.Swal.mixin({
      background: '#1e293b',
      color: '#f1f5f9',
      buttonsStyling: false,
    });
  }

  /**
   * Asegura que el texto sea una oración completa:
   * empieza con mayúscula y termina con un punto.
   */
  _formatSentence(message) {
    if (!message || typeof message !== 'string') return message || '';
    let text = message.trim();
    if (!text) return '';

    // Quitar signos de apertura como ¡ o ¿ al inicio
    while (text.startsWith('¡') || text.startsWith('¿')) {
      text = text.slice(1).trim();
    }

    // Capitalizar primera letra
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // Quitar signos de exclamación o interrogación de cierre si los tuviera
    if (text.endsWith('!') || text.endsWith('?')) {
      text = text.slice(0, -1).trim();
    }

    // Asegurar que termine en punto
    if (!text.endsWith('.')) {
      text += '.';
    }

    return text;
  }

  _getIconSvg(type) {
    switch (type) {
      case 'success':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>';
      case 'warning':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      case 'error':
      default:
        return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
  }

  /**
   * Muestra una notificación temporal.
   *
   * @param {string} message - Texto a mostrar
   * @param {string} type - 'success' (default) | 'error' | 'warning'
   * @param {number} duration - Milisegundos en pantalla
   */
  show(message, type = 'success', duration = 3500) {
    if (!window.Swal) return;
    try {
      const formatted = this._formatSentence(message);
      const iconSvg = this._getIconSvg(type);
      window.Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: false,
        html: `<div class="ds-toast-content"><span class="ds-toast-icon ds-toast-icon--${type}">${iconSvg}</span><span class="ds-toast-message">${formatted}</span></div>`,
        timer: duration,
        timerProgressBar: false,
        showConfirmButton: false,
        customClass: { popup: `ds-toast ds-toast--${type}` },
      });
    } catch (err) {
      console.error('Error mostrando toast:', err);
    }
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

  /**
   * Diálogo de confirmación bloqueante.
   * Se usa donde la acción destruye trabajo (borrar una entrada del historial).
   *
   * @param {Object} opts
   * @param {string} opts.title - La decisión, en imperativo ("Borrar…")
   * @param {string} opts.message - La consecuencia concreta
   * @param {string} [opts.confirmText] - Etiqueta del botón de acción
   * @param {string} [opts.cancelText] - Etiqueta del botón de escape
   * @param {boolean} [opts.danger] - Acción destructiva: ícono de alerta y botón rojo
   * @returns {Promise<boolean>}
   */
  confirm(opts) {
    return new Promise((resolve) => {
      if (!window.Swal) { resolve(false); return; }

      const isDanger = !!opts.danger;

      window.Swal.fire({
        title: opts.title,
        text: opts.message,
        heightAuto: false,
        // Ícono solo si la acción destruye algo. Un "?" de interrogación es
        // el elemento más genérico que hay: no dice nada que el título no diga.
        icon: isDanger ? 'warning' : false,
        iconHtml: isDanger
          ? '<svg class="ds-confirm-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>'
          : undefined,
        iconColor: isDanger ? 'var(--error)' : undefined,
        showCancelButton: true,
        confirmButtonText: opts.confirmText || 'Confirmar',
        cancelButtonText: opts.cancelText || 'Cancelar',
        reverseButtons: true,
        buttonsStyling: false,
        customClass: {
          popup: isDanger ? 'ds-confirm ds-confirm--danger' : 'ds-confirm',
          confirmButton: isDanger ? 'ds-btn ds-btn-danger' : 'ds-btn ds-btn-primary',
          cancelButton: 'ds-btn ds-btn-ghost',
        },
      })
        .then((result) => resolve(result.isConfirmed === true))
        .catch(() => resolve(false));
    });
  }
}

window.toast = new ToastNotification();
