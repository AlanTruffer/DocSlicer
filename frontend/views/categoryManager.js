/**
 * Gestor y Administrador de Categorías y Plantillas de Nombres
 */
class CategoryManager {
  constructor() {
    this.categories = [];
    this.currentEditingId = null;
    this.onChangeCallback = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.modalList = document.getElementById('category-modal');
    this.modalEdit = document.getElementById('category-edit-modal');
    this.categoryListContainer = document.getElementById('category-list');
    
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
        this.categories = await window.api.getCategories();
      } else {
        this.categories = this.getDefaultFallback();
      }
    } catch (err) {
      console.error('Error al cargar categorías:', err);
      this.categories = this.getDefaultFallback();
    }
    this.notifyChange();
    return this.categories;
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
        await window.api.saveCategories(this.categories);
      }
      this.notifyChange();
    } catch (err) {
      console.error('Error al persistir categorías:', err);
      if (window.toast) window.toast.error('Error al guardar categorías');
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

    this.categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.innerHTML = `
        <div class="category-info">
          <div class="category-name">${cat.name}</div>
          <div class="category-template">${cat.template || (cat.prefix + '.pdf')}</div>
        </div>
        <div class="category-actions">
          <button class="btn-icon btn-edit" title="Editar"><i data-lucide="edit-3"></i></button>
          <button class="btn-icon btn-delete" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      `;

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
      <input type="text" class="var-name" placeholder="VARIABLE" value="${name}">
      <input type="text" class="var-placeholder" placeholder="Ejemplo/Valor" value="${placeholder}">
      <button class="btn-icon btn-remove-var" title="Quitar campo"><i data-lucide="x"></i></button>
    `;

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
      const name = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
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
      if (window.toast) window.toast.warning('Ingresá un nombre para la categoría');
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
        id: 'cat_' + Date.now(),
        name,
        prefix,
        variables,
        template
      };
      this.categories.push(newCat);
    }

    await this.persistCategories();
    if (window.toast) window.toast.success('Categoría guardada correctamente');
    this.hideEditModal();
    this.renderCategoryList();
  }

  async deleteCategory(catId) {
    if (this.categories.length <= 1) {
      if (window.toast) window.toast.warning('No podés eliminar la única categoría');
      return;
    }
    this.categories = this.categories.filter(c => c.id !== catId);
    await this.persistCategories();
    this.renderCategoryList();
    if (window.toast) window.toast.success('Categoría eliminada');
  }

  getCategoryById(id) {
    return this.categories.find(c => c.id === id) || this.categories[0];
  }
}

window.categoryManager = new CategoryManager();
