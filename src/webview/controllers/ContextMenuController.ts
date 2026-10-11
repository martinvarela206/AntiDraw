import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { VectorModel, Point } from '../engine/VectorModel.js';
import { Toolbar } from '../ui/Toolbar.js';
import { PropertyPanel } from '../ui/PropertyPanel.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { ExportModal } from '../ui/ExportModal.js';

export interface ContextMenuControllerContext {
  contextMenu: ContextMenu;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  model: VectorModel;
  toolbar: Toolbar;
  propertyPanel: PropertyPanel;
  clipboardService: ClipboardService;
  getCanvasPoint: (e: MouseEvent) => Point;
  handleConvertToCurves: () => Promise<void>;
  handleConvertToPrimitives: () => void;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  handleZOrder: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  pushUndo: () => void;
  render: () => void;
  syncToHost: () => void;
  cancelCurrentAction: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Context Menu Controller (SOLID / SRP)
 * Decouples right-click context menu event listening, element hit-testing,
 * contextual item construction, and command dispatching from AntiDrawApp.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle (SRP):
 *    AntiDrawApp is relieved from context menu construction, state checks,
 *    and menu item routing.
 * 2. Unified Contextual Menu Items:
 *    Centralizes item enablement logic (parametric curves vs primitive simplification,
 *    clipboard availability) in a single cohesive controller.
 */
export class ContextMenuController {
  private ctx: ContextMenuControllerContext;

  constructor(ctx: ContextMenuControllerContext, targets: HTMLElement[]) {
    this.ctx = ctx;
    this.bindTargets(targets);
  }

  private bindTargets(targets: HTMLElement[]): void {
    const handler = (e: MouseEvent) => this.handleContextMenu(e);
    targets.forEach((el) => {
      if (el) el.addEventListener('contextmenu', handler);
    });
  }

  public handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const pt = this.ctx.getCanvasPoint(e);
    const z = this.ctx.canvasMgr.zoom || 1;
    const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, z);

    if (hit) {
      if (!this.ctx.selectionTool.isSelected(hit.element.id)) {
        this.ctx.selectionTool.select(hit.element.id);
        this.ctx.propertyPanel.update(null, this.ctx.toolbar.activeTool);
        this.ctx.render();
      }
    } else {
      // Right-clicked on empty canvas space: dismiss active context menu and clear selection
      this.ctx.contextMenu.hide();
      this.ctx.selectionTool.deselectAll();
      this.ctx.propertyPanel.resetPanelMode();
      this.ctx.render();
      return;
    }

    const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
    if (selectedEls.length > 0) {
      const cmdRegistry = CommandRegistry.getInstance();
      const hasParametric = cmdRegistry.has('object.convertToCurves')
        ? cmdRegistry.isEnabled('object.convertToCurves')
        : selectedEls.some((el) => this.ctx.model.isParametricElement(el));
      const canSimplifyToPrimitive = cmdRegistry.has('object.convertToPrimitives')
        ? cmdRegistry.isEnabled('object.convertToPrimitives')
        : selectedEls.some(
            (el) => !this.ctx.model.isParametricElement(el) && el.tagName === 'path' && this.ctx.model.detectPrimitiveFromPath(el) !== null
          );

      const menuItems: ContextMenuItem[] = [
        {
          id: 'convert-to-path',
          label: 'Convertir a Curvas',
          shortcut: 'Ctrl+Q',
          disabled: !hasParametric,
          action: () => {
            if (cmdRegistry.has('object.convertToCurves')) {
              cmdRegistry.execute('object.convertToCurves');
            } else {
              this.ctx.handleConvertToCurves();
            }
          },
        },
        {
          id: 'convert-to-primitive',
          label: 'Simplificar a Primitivas SVG',
          disabled: !canSimplifyToPrimitive,
          action: () => {
            if (cmdRegistry.has('object.convertToPrimitives')) {
              cmdRegistry.execute('object.convertToPrimitives');
            } else {
              this.ctx.handleConvertToPrimitives();
            }
          },
        },
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'cut',
          label: 'Cortar',
          shortcut: 'Ctrl+X',
          disabled: cmdRegistry.has('edit.cut') ? !cmdRegistry.isEnabled('edit.cut') : false,
          action: () => {
            if (cmdRegistry.has('edit.cut')) {
              cmdRegistry.execute('edit.cut');
            } else {
              this.ctx.cutSelection();
            }
          },
        },
        {
          id: 'copy',
          label: 'Copiar',
          shortcut: 'Ctrl+C',
          disabled: cmdRegistry.has('edit.copy') ? !cmdRegistry.isEnabled('edit.copy') : false,
          action: () => {
            if (cmdRegistry.has('edit.copy')) {
              cmdRegistry.execute('edit.copy');
            } else {
              this.ctx.copySelection();
            }
          },
        },
        {
          id: 'paste',
          label: 'Pegar',
          shortcut: 'Ctrl+V',
          disabled: cmdRegistry.has('edit.paste')
            ? !cmdRegistry.isEnabled('edit.paste')
            : !this.ctx.clipboardService.hasContent,
          action: () => {
            if (cmdRegistry.has('edit.paste')) {
              cmdRegistry.execute('edit.paste');
            } else {
              this.ctx.pasteClipboard();
            }
          },
        },
        {
          id: 'duplicate',
          label: 'Duplicar',
          shortcut: 'Ctrl+D',
          disabled: cmdRegistry.has('edit.duplicate') ? !cmdRegistry.isEnabled('edit.duplicate') : false,
          action: () => {
            if (cmdRegistry.has('edit.duplicate')) {
              cmdRegistry.execute('edit.duplicate');
            } else {
              this.ctx.duplicateSelection();
            }
          },
        },
        {
          id: 'export-asset',
          label: 'Exportar Recurso (1x, 2x, 3x)...',
          shortcut: 'Ctrl+Shift+E',
          action: () => {
            ExportModal.show(this.ctx.model, this.ctx.selectionTool);
          },
        },
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'bring-to-front',
          label: 'Traer al Frente',
          action: () => {
            if (cmdRegistry.has('object.reorderZ')) {
              cmdRegistry.execute('object.reorderZ', { action: 'front' });
            } else {
              this.ctx.handleZOrder('front');
            }
          },
        },
        {
          id: 'send-to-back',
          label: 'Enviar al Fondo',
          action: () => {
            if (cmdRegistry.has('object.reorderZ')) {
              cmdRegistry.execute('object.reorderZ', { action: 'back' });
            } else {
              this.ctx.handleZOrder('back');
            }
          },
        },
        ...(this.ctx.selectionTool.selectedElementIds.size >= 2
          ? [
              { id: 'separator-bool', label: '', action: () => {} },
              {
                id: 'bool-union',
                label: 'Unir (Soldar Formas)',
                action: () => cmdRegistry.execute('boolean.union'),
              },
              {
                id: 'bool-subtract',
                label: 'Menos Frente (Sustraer)',
                action: () => cmdRegistry.execute('boolean.subtract'),
              },
              {
                id: 'bool-intersect',
                label: 'Formar Intersección',
                action: () => cmdRegistry.execute('boolean.intersect'),
              },
              {
                id: 'bool-exclude',
                label: 'Excluir (XOR)',
                action: () => cmdRegistry.execute('boolean.exclude'),
              },
            ]
          : []),
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'delete',
          label: 'Eliminar',
          shortcut: 'Supr',
          action: () => {
            if (cmdRegistry.has('edit.deleteSelected')) {
              cmdRegistry.execute('edit.deleteSelected');
            } else {
              this.ctx.pushUndo();
              this.ctx.model.elements = this.ctx.model.elements.filter(
                (el) => !this.ctx.selectionTool.isSelected(el.id)
              );
              this.ctx.selectionTool.deselectAll();
              this.ctx.propertyPanel.resetPanelMode();
              this.ctx.render();
              this.ctx.syncToHost();
            }
          },
        },
      ];

      this.ctx.contextMenu.show(e.clientX, e.clientY, menuItems);
    } else {
      this.ctx.contextMenu.hide();
      this.ctx.cancelCurrentAction();
    }
  }
}
