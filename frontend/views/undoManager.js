/**
 * Gestor de Historial de Acciones (Undo / Redo) para DocSlicer
 */
class UndoManager {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
    this.onChangeCallback = null;
  }

  setChangeCallback(cb) {
    this.onChangeCallback = cb;
  }

  /**
   * Registra una acción que puede revertirse
   * @param {Object} action - { type: string, undo: Function, redo: Function, description: string }
   */
  pushAction(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Se limpia redo al hacer una acción nueva
    this._notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    const action = this.undoStack.pop();
    if (typeof action.undo === 'function') {
      action.undo();
    }
    this.redoStack.push(action);
    this._notify();
    if (window.toast && action.description) {
      window.toast.show(`Deshecho: ${action.description}`, 'warning', 2000);
    }
  }

  redo() {
    if (!this.canRedo()) return;
    const action = this.redoStack.pop();
    if (typeof action.redo === 'function') {
      action.redo();
    }
    this.undoStack.push(action);
    this._notify();
    if (window.toast && action.description) {
      window.toast.show(`Rehecho: ${action.description}`, 'success', 2000);
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }

  _notify() {
    if (typeof this.onChangeCallback === 'function') {
      this.onChangeCallback({
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });
    }
  }
}

window.undoManager = new UndoManager();
