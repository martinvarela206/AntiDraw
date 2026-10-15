import { VectorModel, VectorElement } from '../engine/VectorModel.js';
import { CanvasManager, GuideLine } from '../engine/CanvasManager.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { ToolIcons } from '../icons/ToolIcons.js';
import { DropPosition } from '../engine/layout/LayerReorderService.js';

export interface VectorExplorerCallbacks {
  onSelectElement: (id: string, multiSelect?: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onReorderElement?: (sourceId: string, targetId: string, position: DropPosition) => void;
  onSelectGuide?: (guide: GuideLine) => void;
  onToggleGuideVisibility?: (guide: GuideLine) => void;
  onToggleGridVisibility?: (gridId: string) => void;
  onRecenterViewBox?: () => void;
  onClose?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Vector Explorer & Scene Tree Panel (VectorExplorerPanel - UI L3)
 *
 * 1. Two-Branch Scene Graph Visualizer:
 *    - Branch 1 (Context Elements): Ephemeral scaffolding (Grids, Rule Guides, ViewBox/Artboard).
 *    - Branch 2 (Document Objects): Concrete SVG hierarchy (shapes, paths, groups <g>).
 *
 * 2. Non-Destructive Layer State Manipulation:
 *    Allows toggling visibility (display none vs inline) and locked status directly from
 *    the explorer items without deselecting other active nodes.
 *
 * 3. Bidirectional Selection Synchronization:
 *    Highlights active items corresponding to SelectionTool state and dispatches multi-select (Shift+Click).
 */
export class VectorExplorerPanel {
  private container: HTMLElement;
  private model: VectorModel;
  private canvasMgr: CanvasManager;
  private selectionTool: SelectionTool;
  private callbacks: VectorExplorerCallbacks;

  public isContextBranchOpen: boolean = true;
  public isDocumentBranchOpen: boolean = true;
  public collapsedGroups: Set<string> = new Set();

  constructor(
    container: HTMLElement,
    model: VectorModel,
    canvasMgr: CanvasManager,
    selectionTool: SelectionTool,
    callbacks: VectorExplorerCallbacks
  ) {
    this.container = container;
    this.model = model;
    this.canvasMgr = canvasMgr;
    this.selectionTool = selectionTool;
    this.callbacks = callbacks;
    this.render();
  }

  public update(): void {
    this.render();
  }

  public setVisible(visible: boolean): void {
    if (visible) {
      this.container.classList.remove('hidden');
      this.container.style.display = 'flex';
      this.render();
    } else {
      this.container.classList.add('hidden');
      this.container.style.display = 'none';
    }
  }

  private render(): void {
    const isVisible = this.canvasMgr.showVectorExplorer;
    this.container.style.display = isVisible ? 'flex' : 'none';
    if (!isVisible) return;

    const elements = this.model.elements || [];
    const guides = this.canvasMgr.guides || [];
    const grids = this.canvasMgr.grids || [];
    const viewBox = this.model.canvas?.viewBox || '0 0 800 600';

    this.container.innerHTML = `
      <div class="explorer-header">
        <div class="explorer-title-group">
          <span class="explorer-icon">${ToolIcons.layers}</span>
          <span class="explorer-title">Explorador de Vectores</span>
          <span class="explorer-badge">${elements.length}</span>
        </div>
        <button class="btn-icon-subtle" id="btn-close-explorer" title="Cerrar panel">✕</button>
      </div>

      <div class="explorer-body">
        <!-- RAMA 1: ELEMENTOS DE CONTEXTO -->
        <div class="explorer-branch" id="branch-context">
          <div class="branch-header" id="header-context">
            <span class="branch-arrow ${this.isContextBranchOpen ? 'expanded' : ''}">▸</span>
            <span class="branch-title">Rama 1: Contexto</span>
            <span class="branch-count">(${grids.length + guides.length + 1})</span>
          </div>

          <div class="branch-content ${this.isContextBranchOpen ? 'open' : 'closed'}" id="content-context">
            <!-- Grillas -->
            <div class="tree-subgroup">
              <div class="tree-subgroup-title">Grillas (${grids.length})</div>
              ${grids.map((grid) => `
                <div class="tree-item context-item" data-grid-id="${grid.id}">
                  <span class="tree-item-icon">⊞</span>
                  <span class="tree-item-label">${grid.type} (${grid.spacing}px)</span>
                  <button class="tree-action-btn btn-toggle-grid-vis" data-grid-id="${grid.id}" title="Alternar visibilidad de grilla">
                    ${grid.visible ? '👁' : '🚫'}
                  </button>
                </div>
              `).join('')}
            </div>

            <!-- Guías -->
            <div class="tree-subgroup">
              <div class="tree-subgroup-title">Guías de Regla (${guides.length})</div>
              ${guides.length === 0 ? '<div class="tree-empty-hint">Sin guías activas</div>' : ''}
              ${guides.map((guide) => `
                <div class="tree-item context-item" data-guide-id="${guide.id}">
                  <span class="tree-item-icon">📏</span>
                  <span class="tree-item-label">
                    ${guide.orientation === 'horizontal' ? `H: ${Math.round(guide.position)}px` : guide.orientation === 'vertical' ? `V: ${Math.round(guide.position)}px` : `∠ ${Math.round(guide.angle || 0)}°`}
                  </span>
                  <button class="tree-action-btn btn-toggle-guide-vis" data-guide-id="${guide.id}" title="Alternar visibilidad">
                    ${guide.visible !== false ? '👁' : '🚫'}
                  </button>
                </div>
              `).join('')}
            </div>

            <!-- Artboard / ViewBox -->
            <div class="tree-subgroup">
              <div class="tree-subgroup-title">Artboard / ViewBox</div>
              <div class="tree-item context-item" id="item-viewbox">
                <span class="tree-item-icon">⊡</span>
                <span class="tree-item-label">${viewBox}</span>
                <button class="tree-action-btn" id="btn-recenter-vb" title="Recentrar ViewBox">🎯</button>
              </div>
            </div>
          </div>
        </div>

        <!-- RAMA 2: OBJETOS DEL DOCUMENTO -->
        <div class="explorer-branch" id="branch-document">
          <div class="branch-header" id="header-document">
            <span class="branch-arrow ${this.isDocumentBranchOpen ? 'expanded' : ''}">▸</span>
            <span class="branch-title">Rama 2: Objetos SVG</span>
            <span class="branch-count">(${elements.length})</span>
          </div>

          <div class="branch-content ${this.isDocumentBranchOpen ? 'open' : 'closed'}" id="content-document">
            ${elements.length === 0 ? '<div class="tree-empty-hint">Lienzo vacío</div>' : ''}
            <div class="tree-element-list" id="tree-element-list">
              ${this.renderElementTree(elements)}
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderElementTree(elements: VectorElement[], depth: number = 0): string {
    // Render from top in Z-stack (last in array) down to bottom
    const reversed = [...elements].reverse();

    return reversed
      .map((el) => {
        const isSelected = this.selectionTool.selectedElementIds.has(el.id);
        const isHidden = el.attributes.display === 'none';
        const isLocked = el.attributes['data-locked'] === 'true';
        const isGroup = el.tagName === 'g' || (el.children && el.children.length > 0);
        const isCollapsed = this.collapsedGroups.has(el.id);
        const name = el.attributes['data-name'] || `${el.shapeType || el.tagName} (${el.id.slice(0, 8)})`;
        const icon = this.getShapeIcon(el);
        const paddingLeft = 14 + depth * 14;

        let childrenHtml = '';
        if (isGroup && el.children && el.children.length > 0 && !isCollapsed) {
          childrenHtml = `<div class="tree-group-children" data-group-container="${el.id}">${this.renderElementTree(el.children, depth + 1)}</div>`;
        }

        const groupToggle = isGroup
          ? `<span class="group-collapse-btn ${isCollapsed ? '' : 'expanded'}" data-group-id="${el.id}">▸</span>`
          : `<span class="group-spacer"></span>`;

        return `
          <div class="tree-item element-item ${isSelected ? 'selected' : ''}" 
               data-element-id="${el.id}" 
               data-is-group="${isGroup ? 'true' : 'false'}"
               draggable="true"
               style="padding-left: ${paddingLeft}px;">
            ${groupToggle}
            <span class="tree-item-icon">${icon}</span>
            <span class="tree-item-label" title="${el.id}">${name}</span>
            <div class="tree-item-actions">
              <button class="tree-action-btn btn-elem-vis" data-element-id="${el.id}" title="${isHidden ? 'Mostrar elemento' : 'Ocultar elemento'}">
                ${isHidden ? '🚫' : '👁'}
              </button>
              <button class="tree-action-btn btn-elem-lock" data-element-id="${el.id}" title="${isLocked ? 'Desbloquear elemento' : 'Bloquear elemento'}">
                ${isLocked ? '🔒' : '🔓'}
              </button>
            </div>
          </div>
          ${childrenHtml}
        `;
      })
      .join('');
  }

  private getShapeIcon(el: VectorElement): string {
    switch (el.shapeType || el.tagName) {
      case 'rect':
        return '▭';
      case 'circle':
        return '○';
      case 'ellipse':
        return '⬭';
      case 'star':
        return '★';
      case 'polygon':
        return '⬡';
      case 'line':
        return '╱';
      case 'polyline':
        return '⎶';
      case 'path':
        return '🖋';
      case 'g':
        return '📁';
      default:
        return '◆';
    }
  }

  private bindEvents(): void {
    // Close button
    this.container.querySelector('#btn-close-explorer')?.addEventListener('click', () => {
      this.callbacks.onClose?.();
    });

    // Toggle Branch 1 (Context)
    this.container.querySelector('#header-context')?.addEventListener('click', () => {
      this.isContextBranchOpen = !this.isContextBranchOpen;
      this.render();
    });

    // Toggle Branch 2 (Document)
    this.container.querySelector('#header-document')?.addEventListener('click', () => {
      this.isDocumentBranchOpen = !this.isDocumentBranchOpen;
      this.render();
    });

    // Recenter Viewbox
    this.container.querySelector('#btn-recenter-vb')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onRecenterViewBox?.();
    });

    // Grid visibility
    this.container.querySelectorAll('.btn-toggle-grid-vis').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gridId = (e.currentTarget as HTMLElement).getAttribute('data-grid-id');
        if (gridId) this.callbacks.onToggleGridVisibility?.(gridId);
      });
    });

    // Guide visibility & click
    this.container.querySelectorAll('.btn-toggle-guide-vis').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const guideId = (e.currentTarget as HTMLElement).getAttribute('data-guide-id');
        const guide = this.canvasMgr.guides.find((g) => g.id === guideId);
        if (guide) this.callbacks.onToggleGuideVisibility?.(guide);
      });
    });

    this.container.querySelectorAll('.context-item[data-guide-id]').forEach((item) => {
      item.addEventListener('click', (e) => {
        const guideId = (e.currentTarget as HTMLElement).getAttribute('data-guide-id');
        const guide = this.canvasMgr.guides.find((g) => g.id === guideId);
        if (guide) this.callbacks.onSelectGuide?.(guide);
      });
    });

    // Element items click (selection)
    this.container.querySelectorAll('.element-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const mouseEvent = e as MouseEvent;
        const elemId = (e.currentTarget as HTMLElement).getAttribute('data-element-id');
        if (elemId) {
          this.callbacks.onSelectElement(elemId, mouseEvent.shiftKey);
        }
      });
    });

    // Element visibility toggle
    this.container.querySelectorAll('.btn-elem-vis').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const elemId = (e.currentTarget as HTMLElement).getAttribute('data-element-id');
        if (elemId) this.callbacks.onToggleVisibility(elemId);
      });
    });

    // Element lock toggle
    this.container.querySelectorAll('.btn-elem-lock').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const elemId = (e.currentTarget as HTMLElement).getAttribute('data-element-id');
        if (elemId) this.callbacks.onToggleLock(elemId);
      });
    });

    // Group collapse / expand toggle
    this.container.querySelectorAll('.group-collapse-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = (e.currentTarget as HTMLElement).getAttribute('data-group-id');
        if (groupId) {
          if (this.collapsedGroups.has(groupId)) {
            this.collapsedGroups.delete(groupId);
          } else {
            this.collapsedGroups.add(groupId);
          }
          this.render();
        }
      });
    });

    // Drag & Drop reordering and group nesting
    let draggedElementId: string | null = null;

    const clearDropIndicators = () => {
      this.container.querySelectorAll('.drop-above, .drop-below, .drop-inside, .dragging').forEach((el) => {
        el.classList.remove('drop-above', 'drop-below', 'drop-inside', 'dragging');
      });
    };

    this.container.querySelectorAll('.element-item').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        const mouseEvt = e as DragEvent;
        const elemId = (e.currentTarget as HTMLElement).getAttribute('data-element-id');
        if (elemId) {
          draggedElementId = elemId;
          (e.currentTarget as HTMLElement).classList.add('dragging');
          mouseEvt.dataTransfer?.setData('text/plain', elemId);
          if (mouseEvt.dataTransfer) mouseEvt.dataTransfer.effectAllowed = 'move';
        }
      });

      item.addEventListener('dragover', (e) => {
        const mouseEvt = e as DragEvent;
        mouseEvt.preventDefault();
        const targetEl = e.currentTarget as HTMLElement;
        const targetId = targetEl.getAttribute('data-element-id');
        if (!draggedElementId || draggedElementId === targetId) return;

        const rect = targetEl.getBoundingClientRect();
        const relY = rect.height > 0 ? (mouseEvt.clientY - rect.top) / rect.height : 0.5;
        const isGroup = targetEl.getAttribute('data-is-group') === 'true';

        targetEl.classList.remove('drop-above', 'drop-below', 'drop-inside');

        if (isGroup && relY > 0.25 && relY < 0.75) {
          targetEl.classList.add('drop-inside');
        } else if (relY < 0.5) {
          // Top half in Tree UI corresponds to higher Z-order (above)
          targetEl.classList.add('drop-above');
        } else {
          // Bottom half in Tree UI corresponds to lower Z-order (below)
          targetEl.classList.add('drop-below');
        }
      });

      item.addEventListener('dragleave', (e) => {
        (e.currentTarget as HTMLElement).classList.remove('drop-above', 'drop-below', 'drop-inside');
      });

      item.addEventListener('drop', (e) => {
        const mouseEvt = e as DragEvent;
        mouseEvt.preventDefault();
        const targetEl = e.currentTarget as HTMLElement;
        const targetId = targetEl.getAttribute('data-element-id');
        const sourceId = mouseEvt.dataTransfer?.getData('text/plain') || draggedElementId;

        if (sourceId && targetId && sourceId !== targetId) {
          let pos: DropPosition = 'below';
          if (targetEl.classList.contains('drop-inside')) {
            pos = 'inside';
          } else if (targetEl.classList.contains('drop-above')) {
            pos = 'above';
          } else {
            pos = 'below';
          }
          this.callbacks.onReorderElement?.(sourceId, targetId, pos);
        }

        clearDropIndicators();
        draggedElementId = null;
      });

      item.addEventListener('dragend', () => {
        clearDropIndicators();
        draggedElementId = null;
      });
    });
  }
}
