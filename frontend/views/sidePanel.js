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
      groupItem.style.borderLeftColor = group.color || '#3b82f6';

      // Category options
      let catOptions = '';
      categories.forEach(cat => {
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

  calculateFileName(group, category) {
    if (!category) return 'documento.pdf';

    const prefix = category.prefix || '';
    let name = prefix;

    if (category.variables && category.variables.length > 0) {
      const parts = category.variables.map(v => {
        const val = (group.variableValues && group.variableValues[v.name]) 
          ? group.variableValues[v.name] 
          : (v.placeholder || v.name);
        return val;
      });
      name = prefix ? `${prefix}${parts.join('_')}.pdf` : `${parts.join('_')}.pdf`;
    } else {
      name = prefix ? `${prefix}.pdf` : 'documento.pdf';
    }

    return name.replace(/[\/\\?%*:|"<>]/g, '_'); // Sanitizar nombre de archivo
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
        if (window.toast) window.toast.error('API de Electron no disponible');
        return;
      }

      const outputDir = await window.api.selectFolder();
      if (!outputDir) return; // Cancelado

      const useSubfolders = (this.getExportMode() === 'subfolders');

      this.btnExport.disabled = true;
      this.btnExport.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Exportando...`;
      if (window.lucide) window.lucide.createIcons({ root: this.btnExport });

      const result = await window.api.processPdf(
        plan.pdfBuffer,
        plan.groups,
        outputDir,
        useSubfolders
      );

      if (result && result.success) {
        if (window.toast) {
          window.toast.success(`¡Se exportaron ${result.filesCreated.length} archivos con éxito!`);
        }
      } else {
        const errorMsg = result && result.errors ? result.errors.join(', ') : 'Ocurrió un error en la exportación';
        if (window.toast) window.toast.error(`Error al exportar: ${errorMsg}`);
      }
    } catch (err) {
      console.error('Error durante exportación:', err);
      if (window.toast) window.toast.error(`Fallo inesperado: ${err.message}`);
    } finally {
      this.btnExport.disabled = false;
      this.btnExport.innerHTML = `<i data-lucide="download"></i> Exportar PDFs`;
      if (window.lucide) window.lucide.createIcons({ root: this.btnExport });
    }
  }
}

window.sidePanel = new SidePanel();
