import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { VectorModel, Point } from '../engine/VectorModel.js';
import { Toolbar } from '../ui/Toolbar.js';
import { PropertyPanel } from '../ui/PropertyPanel.js';
import { ClipboardService } from '../services/ClipboardService.js';

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
      const hasParametric = selectedEls.some((el) => this.ctx.model.isParametricElement(el));
      const canSimplifyToPrimitive = selectedEls.some(
        (el) => !this.ctx.model.isParametricElement(el) && el.tagName === 'path' && this.ctx.model.detectPrimitiveFromPath(el) !== null
      );

      const menuItems: ContextMenuItem[] = [
        {
          id: 'convert-to-path',
          label: 'Convertir a Curvas',
          shortcut: 'Ctrl+Q',
          disabled: !hasParametric,
          action: () => this.ctx.handleConvertToCurves(),
        },
        {
          id: 'convert-to-primitive',
          label: 'Simplificar a Primitivas SVG',
          disabled: !canSimplifyToPrimitive,
          action: () => this.ctx.handleConvertToPrimitives(),
        },
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'cut',
          label: 'Cortar',
          shortcut: 'Ctrl+X',
          action: () => this.ctx.cutSelection(),
        },
        {
          id: 'copy',
          label: 'Copiar',
          shortcut: 'Ctrl+C',
          action: () => this.ctx.copySelection(),
        },
        {
          id: 'paste',
          label: 'Pegar',
          shortcut: 'Ctrl+V',
          disabled: !this.ctx.clipboardService.hasContent,
          action: () => this.ctx.pasteClipboard(),
        },
        {
          id: 'duplicate',
          label: 'Duplicar',
          shortcut: 'Ctrl+D',
          action: () => this.ctx.duplicateSelection(),
        },
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'bring-to-front',
          label: 'Traer al Frente',
          action: () => this.ctx.handleZOrder('front'),
        },
        {
          id: 'send-to-back',
          label: 'Enviar al Fondo',
          action: () => this.ctx.handleZOrder('back'),
        },
        { id: 'separator', label: '', action: () => {} },
        {
          id: 'delete',
          label: 'Eliminar',
          shortcut: 'Supr',
          action: () => {
            this.ctx.pushUndo();
            this.ctx.model.elements = this.ctx.model.elements.filter(
              (el) => !this.ctx.selectionTool.isSelected(el.id)
            );
            this.ctx.selectionTool.deselectAll();
            this.ctx.propertyPanel.resetPanelMode();
            this.ctx.render();
            this.ctx.syncToHost();
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
