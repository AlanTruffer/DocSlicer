/**
 * Gestor y Administrador de Categorías y Plantillas de Nombres
 */
class CategoryManager {
  constructor() {
    this.categories = [];
    this.categoryGroups = [];
    this.activeGroupId = null;
    this.currentEditingId = null;
    this.onChangeCallback = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.modalList = document.getElementById('category-modal');
    this.modalEdit = document.getElementById('category-edit-modal');
    this.categoryListContainer = document.getElementById('category-list');
    this.categoryGroupSelect = document.getElementById('category-group-select');
    this.editorCategoryGroupName = document.getElementById('editor-category-group-name');
    this.btnPreviousCategoryGroup = document.getElementById('btn-category-group-prev');
    this.btnNextCategoryGroup = document.getElementById('btn-category-group-next');
    this.btnAddCategoryGroup = document.getElementById('btn-add-category-group');
    this.btnRenameCategoryGroup = document.getElementById('btn-rename-category-group');
    this.btnDeleteCategoryGroup = document.getElementById('btn-delete-category-group');
    
    // Edit Form Elements
    this.inputName = document.getElementById('cat-name');
    this.inputPrefix = document.getElementById('cat-prefix');
    this.variablesContainer = document.getElementById('cat-variables-list');
    this.templatePreview = document.getElementById('template-preview');
    this.modalEditTitle = document.getElementById('category-edit-title');

    // Buttons
    this.btnCloseList = document.getElementById('category-modal-close');
    this.btnAddCategory = document.getElementById('btn-add-category');
    this.btnCloseEdit = document.getElementById('category-edit-close');
    this.btnCancelEdit = document.getElementById('btn-cat-cancel');
    this.btnSaveEdit = document.getElementById('btn-cat-save');
    this.btnAddVariable = document.getElementById('btn-add-variable');
  }

  bindEvents() {
    if (this.btnCloseList) {
      this.btnCloseList.addEventListener('click', () => this.hideListModal());
    }
    if (this.btnAddCategory) {
      this.btnAddCategory.addEventListener('click', () => this.openEditModal());
    }
    if (this.categoryGroupSelect) {
      this.categoryGroupSelect.addEventListener('change', (event) => {
        this.setActiveGroup(event.target.value);
      });
    }
    if (this.btnPreviousCategoryGroup) {
      this.btnPreviousCategoryGroup.addEventListener('click', () => this.stepActiveGroup(-1));
    }
    if (this.btnNextCategoryGroup) {
      this.btnNextCategoryGroup.addEventListener('click', () => this.stepActiveGroup(1));
    }
    if (this.btnAddCategoryGroup) {
      this.btnAddCategoryGroup.addEventListener('click', () => this.createCategoryGroup());
    }
    if (this.btnRenameCategoryGroup) {
      this.btnRenameCategoryGroup.addEventListener('click', () => this.renameCategoryGroup());
    }
    if (this.btnDeleteCategoryGroup) {
      this.btnDeleteCategoryGroup.addEventListener('click', () => this.deleteCategoryGroup());
    }
    if (this.btnCloseEdit) {
      this.btnCloseEdit.addEventListener('click', () => this.hideEditModal());
    }
    if (this.btnCancelEdit) {
      this.btnCancelEdit.addEventListener('click', () => this.hideEditModal());
    }
    if (this.btnSaveEdit) {
      this.btnSaveEdit.addEventListener('click', () => this.saveCurrentCategory());
    }
    if (this.btnAddVariable) {
      this.btnAddVariable.addEventListener('click', () => this.addVariableRow());
    }

    if (this.inputName) {
      this.inputName.addEventListener('input', () => this.updateTemplatePreview());
    }
    if (this.inputPrefix) {
      this.inputPrefix.addEventListener('input', () => this.updateTemplatePreview());
    }
  }

  setOnChangeCallback(cb) {
    this.onChangeCallback = cb;
  }

  async loadCategories() {
    try {
      if (window.api && window.api.getCategories) {
        this.applyCategoryData(await window.api.getCategories());
      } else {
        this.applyCategoryData(this.getDefaultFallback());
      }
    } catch (err) {
      console.error('Error al cargar categorías:', err);
      this.applyCategoryData(this.getDefaultFallback());
    }
    this.renderCategoryGroups();
    this.notifyChange();
    return this.categories;
  }

  applyCategoryData(data) {
    const groups = Array.isArray(data)
      ? [{ id: 'category_group_general', name: 'General', categories: data }]
      : (data && Array.isArray(data.groups) ? data.groups : []);

    this.categoryGroups = groups
      .filter(group => group && typeof group.id === 'string')
      .map(group => ({
        id: group.id,
        name: String(group.name || 'Sin nombre'),
        categories: Array.isArray(group.categories) ? group.categories : []
      }));

    if (this.categoryGroups.length === 0) {
      this.categoryGroups = [{
        id: 'category_group_general',
        name: 'General',
        categories: this.getDefaultFallback()
      }];
    }

    this.activeGroupId = this.categoryGroups.some(group => group.id === data?.activeGroupId)
      ? data.activeGroupId
      : this.categoryGroups[0].id;
    this.refreshActiveCategories();
  }

  refreshActiveCategories() {
    const activeGroup = this.getActiveGroup();
    this.categories = activeGroup ? activeGroup.categories : [];
  }

  getActiveGroup() {
    return this.categoryGroups.find(group => group.id === this.activeGroupId) || this.categoryGroups[0] || null;
  }

  getAllCategories() {
    return this.categoryGroups.flatMap(group => group.categories);
  }

  getCategoryById(id) {
    return this.getAllCategories().find(category => category.id === id) || null;
  }

  getCategoriesForGroup(categoryId = null) {
    const categories = [...this.categories];
    const assigned = categoryId ? this.getCategoryById(categoryId) : null;
    if (assigned && !categories.some(category => category.id === assigned.id)) categories.push(assigned);
    return CategoryManager.sortByName(categories);
  }

  getPersistedData() {
    return {
      activeGroupId: this.activeGroupId,
      groups: this.categoryGroups.map(group => ({
        id: group.id,
        name: group.name,
        categories: group.categories
      }))
    };
  }

  createId(prefix) {
    const unique = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${unique}`;
  }

  renderCategoryGroups() {
    if (this.categoryGroupSelect) {
      this.categoryGroupSelect.innerHTML = '';
      this.categoryGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        option.selected = group.id === this.activeGroupId;
        this.categoryGroupSelect.appendChild(option);
      });
    }

    const activeGroup = this.getActiveGroup();
    if (this.editorCategoryGroupName) {
      this.editorCategoryGroupName.textContent = activeGroup ? activeGroup.name : 'Sin grupos';
      this.editorCategoryGroupName.title = activeGroup ? activeGroup.name : 'No hay grupos de categorías';
    }

    const hasGroups = this.categoryGroups.length > 0;
    if (this.btnRenameCategoryGroup) this.btnRenameCategoryGroup.disabled = !hasGroups;
    if (this.btnDeleteCategoryGroup) this.btnDeleteCategoryGroup.disabled = this.categoryGroups.length <= 1;
    if (this.btnPreviousCategoryGroup) this.btnPreviousCategoryGroup.disabled = this.categoryGroups.length <= 1;
    if (this.btnNextCategoryGroup) this.btnNextCategoryGroup.disabled = this.categoryGroups.length <= 1;
  }

  stepActiveGroup(direction) {
    if (this.categoryGroups.length <= 1) return;
    const currentIndex = this.categoryGroups.findIndex(group => group.id === this.activeGroupId);
    const normalizedIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (normalizedIndex + direction + this.categoryGroups.length) % this.categoryGroups.length;
    this.setActiveGroup(this.categoryGroups[nextIndex].id);
  }

  async setActiveGroup(groupId) {
    if (!this.categoryGroups.some(group => group.id === groupId) || groupId === this.activeGroupId) return;
    this.activeGroupId = groupId;
    this.refreshActiveCategories();
    this.resetEditorCategoryAssignments();
    await this.persistCategories();
    this.renderCategoryGroups();
    this.renderCategoryList();
    this.refreshCategoryContext();
  }

  resetEditorCategoryAssignments() {
    if (!window.editorView || !Array.isArray(window.editorView.groups)) return;
    window.editorView.groups.forEach(group => { group.categoryId = ''; });
    window.editorView.scheduleAutoSave();
  }

  async promptForGroupName({ title, confirmText, initialValue = '' }) {
    if (!window.Swal) return null;
    const result = await window.Swal.fire({
      title,
      input: 'text',
      inputValue: initialValue,
      inputLabel: 'Nombre del grupo',
      inputPlaceholder: 'Nombre del grupo',
      inputValidator: value => value && value.trim() ? undefined : 'Ingresá un nombre.',
      heightAuto: false,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup: 'ds-confirm',
        confirmButton: 'ds-btn ds-btn-primary',
        cancelButton: 'ds-btn ds-btn-ghost'
      }
    });
    return result.isConfirmed && typeof result.value === 'string' ? result.value.trim() : null;
  }

  async createCategoryGroup() {
    const name = await this.promptForGroupName({ title: 'Nuevo grupo de categorías', confirmText: 'Crear grupo' });
    if (!name) return;
    if (this.categoryGroups.some(group => group.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0)) {
      if (window.toast) window.toast.warning('Ya existe un grupo con ese nombre.');
      return;
    }
    const group = { id: this.createId('category_group'), name, categories: [] };
    this.categoryGroups.push(group);
    await this.setActiveGroup(group.id);
  }

  async renameCategoryGroup() {
    const group = this.getActiveGroup();
    if (!group) return;
    const name = await this.promptForGroupName({
      title: 'Renombrar grupo',
      confirmText: 'Guardar nombre',
      initialValue: group.name
    });
    if (!name) return;
    if (this.categoryGroups.some(other => other.id !== group.id && other.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0)) {
      if (window.toast) window.toast.warning('Ya existe un grupo con ese nombre.');
      return;
    }
    group.name = name;
    await this.persistCategories();
    this.renderCategoryGroups();
  }

  async deleteCategoryGroup() {
    const group = this.getActiveGroup();
    if (!group || this.categoryGroups.length <= 1) return;
    if (!window.Swal) return;
    const confirmationText = 'CONFIRMAR BORRADO';
    const categoryCount = group.categories.length;
    const result = await window.Swal.fire({
      title: 'Eliminar grupo y categorías',
      text: categoryCount > 0
        ? `Se eliminará “${group.name}” junto con sus ${categoryCount} ${categoryCount === 1 ? 'categoría' : 'categorías'}. Los lotes que las usaban quedarán sin categoría.`
        : `Se eliminará el grupo vacío “${group.name}”.`,
      icon: 'warning',
      iconHtml: '<svg class="ds-confirm-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
      iconColor: 'var(--error)',
      input: 'text',
      inputLabel: `Escribí ${confirmationText} para continuar`,
      inputPlaceholder: confirmationText,
      inputAttributes: { autocomplete: 'off', spellcheck: 'false' },
      inputValidator: value => value === confirmationText ? undefined : `Escribí exactamente ${confirmationText}.`,
      didOpen: () => {
        const input = window.Swal.getInput();
        const confirmButton = window.Swal.getConfirmButton();
        const updateConfirmState = () => {
          confirmButton.disabled = input.value !== confirmationText;
        };
        input.addEventListener('input', updateConfirmState);
        updateConfirmState();
      },
      preConfirm: value => {
        if (value !== confirmationText) {
          window.Swal.showValidationMessage(`Escribí exactamente ${confirmationText}.`);
          return false;
        }
        return true;
      },
      heightAuto: false,
      showCancelButton: true,
      confirmButtonText: 'Aceptar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      buttonsStyling: false,
      customClass: {
        popup: 'ds-confirm ds-confirm--danger',
        confirmButton: 'ds-btn ds-btn-danger',
        cancelButton: 'ds-btn ds-btn-ghost'
      }
    });
    if (!result.isConfirmed) return;

    this.categoryGroups = this.categoryGroups.filter(other => other.id !== group.id);
    this.activeGroupId = this.categoryGroups[0].id;
    this.refreshActiveCategories();
    this.resetEditorCategoryAssignments();
    await this.persistCategories();
    this.renderCategoryGroups();
    this.renderCategoryList();
    this.refreshCategoryContext();
  }

  refreshCategoryContext() {
    if (typeof this.onChangeCallback === 'function') this.onChangeCallback(this.categories);
    if (window.editorView) {
      let categoryAssignmentsChanged = false;
      window.editorView.groups.forEach(group => {
        if (group.categoryId && !this.getCategoryById(group.categoryId)) {
          group.categoryId = '';
          categoryAssignmentsChanged = true;
        }
      });
      window.editorView.renderTimeline();
      window.editorView.updateSidePanel();
      if (categoryAssignmentsChanged) window.editorView.scheduleAutoSave();
    }
  }

  static sortByName(categories) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  getDefaultFallback() {
    return [
      {
        id: 'resolucion',
        name: 'Resolución',
        prefix: 'RESOL_',
        variables: [{ name: 'AÑO', placeholder: '2024' }, { name: 'NUMERO', placeholder: '001' }],
        template: 'RESOL_[AÑO]_[NUMERO].pdf'
      },
      {
        id: 'nota',
        name: 'Nota',
        prefix: 'NOTA_',
        variables: [{ name: 'AÑO', placeholder: '2024' }, { name: 'NUMERO', placeholder: '001' }],
        template: 'NOTA_[AÑO]_[NUMERO].pdf'
      },
      {
        id: 'factura',
        name: 'Factura',
        prefix: 'FAC_',
        variables: [{ name: 'PROVEEDOR', placeholder: 'Empresa' }, { name: 'FECHA', placeholder: '2024-01-01' }],
        template: 'FAC_[PROVEEDOR]_[FECHA].pdf'
      },
      {
        id: 'otro',
        name: 'Otro',
        prefix: '',
        variables: [{ name: 'NOMBRE', placeholder: 'documento' }],
        template: '[NOMBRE].pdf'
      }
    ];
  }

  notifyChange() {
    if (typeof this.onChangeCallback === 'function') {
      this.onChangeCallback(this.categories);
    }
  }

  async persistCategories() {
    try {
      if (window.api && window.api.saveCategories) {
        await window.api.saveCategories(this.getPersistedData());
      }
      this.notifyChange();
    } catch (err) {
      console.error('Error al persistir categorías:', err);
      if (window.toast) window.toast.error('Ocurrió un error al guardar las categorías.');
    }
  }

  showListModal() {
    this.renderCategoryList();
    if (this.modalList) this.modalList.style.display = 'flex';
  }

  hideListModal() {
    if (this.modalList) this.modalList.style.display = 'none';
  }

  renderCategoryList() {
    if (!this.categoryListContainer) return;
    this.categoryListContainer.innerHTML = '';

    if (this.categories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'category-list-empty';
      empty.textContent = 'Este grupo todavía no tiene categorías. Agregá una para usarla en el editor.';
      this.categoryListContainer.appendChild(empty);
      return;
    }

    CategoryManager.sortByName(this.categories).forEach(cat => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.innerHTML = `
        <div class="category-info">
          <div class="category-name"></div>
          <div class="category-template"></div>
        </div>
        <div class="category-actions">
          <button class="btn-icon btn-edit" title="Editar"><i data-lucide="edit-3"></i></button>
          <button class="btn-icon btn-delete" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      `;
      item.querySelector('.category-name').textContent = cat.name;
      item.querySelector('.category-template').textContent = cat.template || `${cat.prefix || ''}.pdf`;

      item.querySelector('.btn-edit').addEventListener('click', () => {
        this.openEditModal(cat);
      });

      const btnDel = item.querySelector('.btn-delete');
      if (this.categories.length <= 1) {
        btnDel.disabled = true;
      } else {
        btnDel.addEventListener('click', () => {
          this.deleteCategory(cat.id);
        });
      }

      this.categoryListContainer.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons({ root: this.categoryListContainer });
  }

  openEditModal(category = null) {
    this.currentEditingId = category ? category.id : null;
    if (this.modalEditTitle) {
      this.modalEditTitle.textContent = category ? 'Editar Categoría' : 'Nueva Categoría';
    }

    this.inputName.value = category ? category.name : '';
    this.inputPrefix.value = category ? category.prefix : '';

    this.variablesContainer.innerHTML = '';
    const vars = category && category.variables ? category.variables : [];
    if (vars.length === 0 && !category) {
      this.addVariableRow('NUMERO', '001');
    } else {
      vars.forEach(v => this.addVariableRow(v.name, v.placeholder));
    }

    this.updateTemplatePreview();
    if (this.modalEdit) this.modalEdit.style.display = 'flex';
  }

  hideEditModal() {
    if (this.modalEdit) this.modalEdit.style.display = 'none';
    this.currentEditingId = null;
  }

  addVariableRow(name = '', placeholder = '') {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.innerHTML = `
      <input type="text" class="var-name" placeholder="VARIABLE">
      <input type="text" class="var-placeholder" placeholder="Ejemplo/Valor">
      <button class="btn-icon btn-remove-var" title="Quitar campo"><i data-lucide="x"></i></button>
    `;
    row.querySelector('.var-name').value = name;
    row.querySelector('.var-placeholder').value = placeholder;

    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => this.updateTemplatePreview());
    });

    row.querySelector('.btn-remove-var').addEventListener('click', () => {
      row.remove();
      this.updateTemplatePreview();
    });

    this.variablesContainer.appendChild(row);
    if (window.lucide) window.lucide.createIcons({ root: row });
    this.updateTemplatePreview();
  }

  getVariablesFromForm() {
    const rows = this.variablesContainer.querySelectorAll('.variable-row');
    const variables = [];
    rows.forEach(r => {
      const nameInput = r.querySelector('.var-name');
      const valInput = r.querySelector('.var-placeholder');
      const name = nameInput.value.normalize('NFC').trim().toLocaleUpperCase('es')
        .replace(/[^A-ZÁÉÍÓÚÜÑ0-9_]/g, '');
      const placeholder = valInput.value.trim();
      if (name) {
        variables.push({ name, placeholder: placeholder || name });
      }
    });
    return variables;
  }

  updateTemplatePreview() {
    const prefix = this.inputPrefix.value.trim();
    const variables = this.getVariablesFromForm();
    let template = prefix;

    if (variables.length > 0) {
      const varsJoined = variables.map(v => `[${v.name}]`).join('_');
      template = prefix ? `${prefix}${varsJoined}.pdf` : `${varsJoined}.pdf`;
    } else {
      template = prefix ? `${prefix}.pdf` : 'documento.pdf';
    }

    if (this.templatePreview) {
      this.templatePreview.textContent = template;
    }
    return template;
  }

  async saveCurrentCategory() {
    const name = this.inputName.value.trim();
    if (!name) {
      if (window.toast) window.toast.warning('Ingresá un nombre para la categoría.');
      return;
    }

    const prefix = this.inputPrefix.value.trim();
    const variables = this.getVariablesFromForm();
    const template = this.updateTemplatePreview();

    if (this.currentEditingId) {
      const idx = this.categories.findIndex(c => c.id === this.currentEditingId);
      if (idx !== -1) {
        this.categories[idx] = {
          ...this.categories[idx],
          name,
          prefix,
          variables,
          template
        };
      }
    } else {
      const newCat = {
        id: this.createId('cat'),
        name,
        prefix,
        variables,
        template
      };
      this.categories.push(newCat);
    }

    await this.persistCategories();
    if (window.toast) window.toast.success('La categoría se guardó correctamente.');
    this.hideEditModal();
    this.renderCategoryList();
    this.refreshCategoryContext();
  }

  async deleteCategory(catId) {
    if (this.categories.length <= 1) {
      if (window.toast) window.toast.warning('No podés eliminar la única categoría.');
      return;
    }
    this.categories = this.categories.filter(c => c.id !== catId);
    const activeGroup = this.getActiveGroup();
    if (activeGroup) activeGroup.categories = this.categories;
    await this.persistCategories();
    this.renderCategoryList();
    this.refreshCategoryContext();
    if (window.toast) window.toast.success('La categoría se eliminó correctamente.');
  }
}

window.categoryManager = new CategoryManager();
