/**
 * Panel Lateral: Gestión de Grupos, Plantillas Dinámicas y Opciones de Exportación
 */
class SidePanel {
  constructor() {
    this.panelElement = document.getElementById('side-panel');
    this.btnToggle = document.getElementById('btn-toggle-panel');
    this.btnManageCategories = document.getElementById('btn-manage-categories');
    this.groupListContainer = document.getElementById('group-list');
    this.noGroupsMsg = document.getElementById('no-groups-msg');
    this.btnExport = document.getElementById('btn-export');
    this.radioExportModes = document.querySelectorAll('input[name="export-mode"]');

    this.isCollapsed = false;

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => this.toggleCollapse());
    }

    if (this.btnManageCategories) {
      this.btnManageCategories.addEventListener('click', () => {
        if (window.categoryManager) {
          window.categoryManager.showListModal();
        }
      });
    }

    if (this.btnExport) {
      this.btnExport.addEventListener('click', () => this.handleExportClick());
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    if (this.panelElement) {
      this.panelElement.classList.toggle('collapsed', this.isCollapsed);
    }
    if (this.btnToggle) {
      const icon = this.btnToggle.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', this.isCollapsed ? 'panel-right-open' : 'panel-right-close');
        if (window.lucide) window.lucide.createIcons({ root: this.btnToggle });
      }
    }
  }

  renderGroups(groups, categories) {
    if (!this.groupListContainer) return;
    this.groupListContainer.innerHTML = '';

    if (!groups || groups.length === 0) {
      if (this.noGroupsMsg) {
        this.groupListContainer.appendChild(this.noGroupsMsg);
        this.noGroupsMsg.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons({ root: this.noGroupsMsg });
      }
      if (this.btnExport) this.btnExport.disabled = true;
      return;
    }

    if (this.noGroupsMsg) this.noGroupsMsg.style.display = 'none';
    if (this.btnExport) this.btnExport.disabled = false;

groups.forEach((group, groupIdx) => {
      const groupItem = document.createElement('div');
      groupItem.className = 'group-item';
      groupItem.setAttribute('data-group-id', group.id);
      groupItem.style.borderLeftColor = group.color || '#3b82f6';

// Category options (orden alfabético)
      const sortedCategories = (window.CategoryManager && CategoryManager.sortByName)
        ? CategoryManager.sortByName(categories)
        : [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      let catOptions = '';
      sortedCategories.forEach(cat => {
        const selected = cat.id === group.categoryId ? 'selected' : '';
        catOptions += `<option value="${cat.id}" ${selected}>${cat.name}</option>`;
      });

      const currentCategory = categories.find(c => c.id === group.categoryId) || categories[0];

      // Dynamic variables fields
      let varsHtml = '';
      if (currentCategory && currentCategory.variables) {
        currentCategory.variables.forEach(v => {
          const val = (group.variableValues && group.variableValues[v.name] !== undefined)
            ? group.variableValues[v.name]
            : (v.placeholder || '');
          varsHtml += `
            <div class="group-var-row">
              <label>${v.name}:</label>
              <input type="text" class="input-var" data-var="${v.name}" value="${val}" placeholder="${v.placeholder || v.name}">
            </div>
          `;
        });
      }

      const generatedFileName = this.calculateFileName(group, currentCategory);

      // Pages summary list
      const pageNumbers = group.pageIndices.map(p => p + 1).join(', ');

      groupItem.innerHTML = `
        <div class="group-header">
          <span class="group-badge" style="background-color: ${group.color || '#3b82f6'}">Grupo ${groupIdx + 1}</span>
          <span class="group-pages-count">Págs: ${pageNumbers}</span>
          <button class="btn-icon btn-ungroup" title="Desagrupar"><i data-lucide="trash-2"></i></button>
        </div>

        <div class="group-category-select">
          <label>Categoría:</label>
          <select class="select-category">
            ${catOptions}
          </select>
        </div>

        <div class="group-variables">
          ${varsHtml}
        </div>

        <div class="group-filename-preview">
          <small>Nombre de salida:</small>
          <div class="filename-text">${generatedFileName}</div>
        </div>
      `;

      // Event listeners
      const selectCat = groupItem.querySelector('.select-category');
      selectCat.addEventListener('change', (e) => {
        if (window.editorView) {
          window.editorView.updateGroupCategory(group.id, e.target.value);
        }
      });

      const varInputs = groupItem.querySelectorAll('.input-var');
      varInputs.forEach(inp => {
        inp.addEventListener('input', (e) => {
          const varName = e.target.getAttribute('data-var');
          const varVal = e.target.value;
          if (window.editorView) {
            window.editorView.updateGroupVariable(group.id, varName, varVal);
          }
        });
      });

      const btnUngroup = groupItem.querySelector('.btn-ungroup');
      btnUngroup.addEventListener('click', () => {
        if (window.editorView) {
          window.editorView.ungroup(group.id);
        }
      });

      this.groupListContainer.appendChild(groupItem);
    });

if (window.lucide) window.lucide.createIcons({ root: this.groupListContainer });
  }

  updateFilenamePreview(groupId) {
    if (!this.groupListContainer) return;
    const item = this.groupListContainer.querySelector(`.group-item[data-group-id="${groupId}"]`);
    if (!item) return;
    const group = (window.editorView && window.editorView.groups)
      ? window.editorView.groups.find(g => g.id === groupId)
      : null;
    if (!group) return;
    const categories = window.categoryManager ? window.categoryManager.categories : [];
    const category = categories.find(c => c.id === group.categoryId) || categories[0];
    const text = item.querySelector('.filename-text');
    if (text) text.textContent = this.calculateFileName(group, category);
  }

  calculateFileName(group, category) {
    if (!category) return 'documento.pdf';

    // Obtener prefijo de legajo definido por el usuario o extraído del nombre de archivo
    const legajoPrefix = (window.editorView && typeof window.editorView.getLegajoPrefix === 'function')
      ? window.editorView.getLegajoPrefix().trim()
      : '';

    const catPrefix = (category.prefix !== undefined && category.prefix !== '') 
      ? category.prefix.replace(/[-_]+$/, '') 
      : category.name.toUpperCase();

    let categoryPart = catPrefix;

    if (category.variables && category.variables.length > 0) {
      const parts = category.variables.map(v => {
        const val = (group.variableValues && group.variableValues[v.name]) 
          ? group.variableValues[v.name].trim() 
          : (v.placeholder || v.name).trim();
        return val;
      });
      categoryPart = catPrefix ? `${catPrefix}-${parts.join('-')}` : `${parts.join('-')}`;
    }

    // Formato final: [LEGAJO]-[CATEGORIA-VARIABLES].pdf (ej: L16034-DOM.pdf o L16034-RESOL-2025-309.pdf)
    let finalName = '';
    if (legajoPrefix && categoryPart) {
      finalName = `${legajoPrefix.replace(/-+$/, '')}-${categoryPart.replace(/^-+/, '')}.pdf`;
    } else if (legajoPrefix) {
      finalName = `${legajoPrefix}.pdf`;
    } else if (categoryPart) {
      finalName = `${categoryPart}.pdf`;
    } else {
      finalName = 'documento.pdf';
    }

    return finalName.replace(/[\/\\?%*:|"<>]/g, '_');
  }

  getExportMode() {
    let mode = 'flat';
    this.radioExportModes.forEach(r => {
      if (r.checked) mode = r.value;
    });
    return mode;
  }

  async handleExportClick() {
    if (!window.editorView) return;
    const plan = window.editorView.getExportPlan();
    if (!plan || plan.groups.length === 0) {
      if (window.toast) window.toast.warning('No hay grupos definidos para exportar.');
      return;
    }

    try {
      if (!window.api || !window.api.selectFolder) {
        if (window.toast) window.toast.error('La API de Electron no se encuentra disponible.');
        return;
      }

      const outputDir = await window.api.selectFolder();
      if (!outputDir) return; // Cancelado

      const useSubfolders = (this.getExportMode() === 'subfolders');

      this.btnExport.disabled = true;
      this.btnExport.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Exportando...`;
      if (window.lucide) window.lucide.createIcons({ root: this.btnExport });

      // Pasar plan.filePath como fuente principal para lectura directa desde disco en el backend
      const result = await window.api.processPdf(
        plan.filePath,
        plan.groups,
        outputDir,
        useSubfolders,
        plan.pdfBufferCopy
      );

      if (result && result.success) {
        if (window.toast) {
          const count = result.filesCreated.length;
          window.toast.success(`Se export${count === 1 ? 'ó 1 archivo' : `aron ${count} archivos`} con éxito.`);
        }
        // Limpiar el borrador guardado ya que fue exportado con éxito
        if (plan.filePath && window.api && window.api.clearDraft) {
          await window.api.clearDraft(plan.filePath);
        }
      } else {
        const errorMsg = result && result.errors ? result.errors.join(', ') : 'Ocurrió un error en la exportación';
        if (window.toast) window.toast.error(`Ocurrió un error al exportar: ${errorMsg}.`);
      }
    } catch (err) {
      console.error('Error durante exportación:', err);
      if (window.toast) window.toast.error(`Ocurrió un fallo inesperado: ${err.message}.`);
    } finally {
      this.btnExport.disabled = false;
      this.btnExport.innerHTML = `<i data-lucide="download"></i> Exportar PDFs`;
      if (window.lucide) window.lucide.createIcons({ root: this.btnExport });
    }
  }
}

window.sidePanel = new SidePanel();
