import { Toolbar } from '../ui/Toolbar.js';
import { ToolType } from '../tools/ToolType.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { VectorModel } from '../engine/VectorModel.js';
import { PropertyPanel } from '../ui/PropertyPanel.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { NodeToolHandler } from '../tools/NodeToolHandler.js';
import { ShapeToolHandler } from '../tools/ShapeToolHandler.js';
import { PenToolHandler } from '../tools/PenToolHandler.js';
import { PolylineToolHandler } from '../tools/PolylineToolHandler.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';
import { GroupHierarchyService } from '../engine/selection/GroupHierarchyService.js';

export interface KeyboardControllerContext {
  toolbar: Toolbar;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  nodeEditorTool: NodeEditorTool;
  model: VectorModel;
  propertyPanel: PropertyPanel;
  clipboardService: ClipboardService;
  nodeToolHandler: NodeToolHandler;
  shapeToolHandler: ShapeToolHandler;
  penToolHandler: PenToolHandler;
  polylineToolHandler: PolylineToolHandler;
  isDragging: () => boolean;
  activeHandle: () => 'origin-drag' | 'guide-create' | 'shape' | null;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  handleConvertToCurves: () => void;
  undo: () => void;
  redo: () => void;
  cancelCurrentAction: () => void;
  pushUndo: () => void;
  render: () => void;
  renderOverlay: () => void;
  syncToHost: () => void;
  syncMetadataToHost: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Keyboard Shortcut Controller (SOLID / SRP)
 * Decouples keyboard event listeners, modifier key tracking (Shift, Ctrl, Alt),
 * single-key tool switches, clipboard shortcuts, nudging, and undo/redo routing
 * away from the monolithic AntiDrawApp orchestrator.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle (SRP):
 *    AntiDrawApp is relieved of ~300 lines of disparate key event switch-cases.
 * 2. Focus & Input Protection:
 *    Safely ignores keyboard inputs when typing into input or select elements in properties panel.
 * 3. Multiplier Step Calculation:
 *    Calculates exact sub-pixel or accelerated nudge increments (1, 5, 10, 25, 50, 75, 100)
 *    based on active modifiers.
 */
export class KeyboardShortcutController {
  private ctx: KeyboardControllerContext;
  public isShiftPressed: boolean = false;

  constructor(ctx: KeyboardControllerContext) {
    this.ctx = ctx;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift') this.isShiftPressed = false;
    if (e.key === 'Alt' && this.ctx.selectionTool.marqueeRect) {
      this.ctx.selectionTool.isTouchingMarquee = false;
      this.ctx.renderOverlay();
    }
    if (this.ctx.shapeToolHandler.shapeStartPt !== null) {
      if (this.ctx.shapeToolHandler.onKeyUp(e)) {
        return;
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Shift') this.isShiftPressed = true;
    if (e.key === 'Alt' && this.ctx.selectionTool.marqueeRect) {
      this.ctx.selectionTool.isTouchingMarquee = true;
      this.ctx.renderOverlay();
    }
    if (this.ctx.shapeToolHandler.shapeStartPt !== null) {
      if (this.ctx.shapeToolHandler.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
    }

    if (this.ctx.toolbar.activeTool === 'node' && this.ctx.nodeToolHandler.onKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

    // Single-key Tool Switches & Selection Mode Shortcuts (when not holding Ctrl/Meta)
    if (!e.ctrlKey && !e.metaKey) {
      const isSelectActive = this.ctx.toolbar.activeTool === 'select' || this.ctx.selectionTool.selectedElementIds.size > 0;

      // 3 Selection Modes Direct Hotkeys (W: Move, R: Scale, E: Rotate)
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (this.ctx.toolbar.activeTool !== 'select') {
          this.ctx.toolbar.setTool('select');
        }
        this.ctx.selectionTool.selectionMode = 'move';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }

      if (isSelectActive && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = 'scale';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }

      if (isSelectActive && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = 'rotate';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }

      // Dedicated Free Transform / Homography Shortcut (D) outside selection cycle
      if (isSelectActive && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = this.ctx.selectionTool.selectionMode === 'distort' ? 'scale' : 'distort';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }

      if (e.key === 'v' || e.key === 'V') this.ctx.toolbar.setTool('select');
      if (e.key === 't' || e.key === 'T') this.ctx.toolbar.setTool('stroke');
      if (e.key === 'n' || e.key === 'N') this.ctx.toolbar.setTool('node');
      if (e.key === 'y' || e.key === 'Y') this.ctx.toolbar.setTool('polyline');
      if (e.key === 'p' || e.key === 'P') this.ctx.toolbar.setTool('pen');
      if (e.key === 'r' || e.key === 'R') this.ctx.toolbar.setTool('rect');
      if (e.key === 'o' || e.key === 'O') this.ctx.toolbar.setTool('circle');
      if (e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        this.ctx.toolbar.setTool('eraser');
      } else if (e.key === 'e' || e.key === 'E') {
        this.ctx.toolbar.setTool('ellipse');
      }
      if (e.key === 'l' || e.key === 'L') this.ctx.toolbar.setTool('line');
      if (e.key === 'g' || e.key === 'G') this.ctx.toolbar.setTool('polygon');
      if (e.key === 's' || e.key === 'S') this.ctx.toolbar.setTool('star');
      if (e.key === 'c' || e.key === 'C') this.ctx.toolbar.setTool('scissors');
      if (e.key === 'z' || e.key === 'Z') this.ctx.toolbar.setTool('zoom');
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const cmdRegistry = CommandRegistry.getInstance();

    if (isCtrl && (e.key === 'c' || e.key === 'C')) {
      if (cmdRegistry.has('edit.copy') && cmdRegistry.isEnabled('edit.copy')) {
        e.preventDefault();
        cmdRegistry.execute('edit.copy');
        return;
      } else if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
        e.preventDefault();
        this.ctx.copySelection();
        return;
      }
    }

    if (isCtrl && (e.key === 'j' || e.key === 'J')) {
      if (cmdRegistry.has('node.join') && cmdRegistry.isEnabled('node.join')) {
        e.preventDefault();
        cmdRegistry.execute('node.join');
        return;
      } else if (this.ctx.toolbar.activeTool === 'node') {
        e.preventDefault();
        this.ctx.nodeToolHandler.handleJoinSelectedNodes();
        return;
      }
    }

    if (isCtrl && (e.key === 'q' || e.key === 'Q')) {
      if (cmdRegistry.has('object.convertToCurves') && cmdRegistry.isEnabled('object.convertToCurves')) {
        e.preventDefault();
        cmdRegistry.execute('object.convertToCurves');
        return;
      } else if (this.ctx.selectionTool.selectedElementIds.size > 0) {
        e.preventDefault();
        this.ctx.handleConvertToCurves();
        return;
      }
    }

    if (isCtrl && (e.key === 'x' || e.key === 'X')) {
      if (cmdRegistry.has('edit.cut') && cmdRegistry.isEnabled('edit.cut')) {
        e.preventDefault();
        cmdRegistry.execute('edit.cut');
        return;
      } else if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
        e.preventDefault();
        this.ctx.cutSelection();
        return;
      }
    }

    if (isCtrl && (e.key === 'v' || e.key === 'V')) {
      if (cmdRegistry.has('edit.paste') && cmdRegistry.isEnabled('edit.paste')) {
        e.preventDefault();
        cmdRegistry.execute('edit.paste');
        return;
      } else if (this.ctx.clipboardService.hasContent) {
        e.preventDefault();
        this.ctx.pasteClipboard();
        return;
      }
    }

    if (isCtrl && (e.key === 'd' || e.key === 'D')) {
      if (cmdRegistry.has('edit.duplicate') && cmdRegistry.isEnabled('edit.duplicate')) {
        e.preventDefault();
        cmdRegistry.execute('edit.duplicate');
        return;
      } else if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
        e.preventDefault();
        this.ctx.duplicateSelection();
        return;
      }
    }

    if (isCtrl && (e.key === 'g' || e.key === 'G')) {
      const groupCmd = e.shiftKey ? 'object.ungroup' : 'object.group';
      if (cmdRegistry.has(groupCmd) && cmdRegistry.isEnabled(groupCmd)) {
        e.preventDefault();
        cmdRegistry.execute(groupCmd);
        return;
      }
    }

    if (isCtrl && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
      if (cmdRegistry.has('file.exportAsset') && cmdRegistry.isEnabled('file.exportAsset')) {
        e.preventDefault();
        cmdRegistry.execute('file.exportAsset');
        return;
      }
    }

    if (isCtrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      const undoCmd = e.shiftKey ? 'edit.redo' : 'edit.undo';
      if (cmdRegistry.has(undoCmd)) {
        cmdRegistry.execute(undoCmd);
      } else if (e.shiftKey) {
        this.ctx.redo();
      } else {
        this.ctx.undo();
      }
      return;
    }

    if (isCtrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      if (cmdRegistry.has('edit.redo')) {
        cmdRegistry.execute('edit.redo');
      } else {
        this.ctx.redo();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      const hasActiveDrag = !!(
        this.ctx.isDragging() ||
        this.ctx.nodeToolHandler.isDragging ||
        this.ctx.shapeToolHandler.shapeStartPt ||
        this.ctx.activeHandle() === 'shape' ||
        (this.ctx.toolbar.activeTool === 'pen' && (this.ctx.penToolHandler.isDragging || this.ctx.penToolHandler.vertexCount > 0)) ||
        (this.ctx.toolbar.activeTool === 'polyline' && this.ctx.polylineToolHandler.vertexCount > 0) ||
        this.ctx.selectionTool.marqueeRect ||
        this.ctx.activeHandle() === 'guide-create' ||
        this.ctx.activeHandle() === 'origin-drag'
      );

      if (hasActiveDrag) {
        this.ctx.cancelCurrentAction();
      } else {
        const currentSelectedId = this.ctx.selectionTool.selectedElementId;
        if (currentSelectedId) {
          const ascendResult = GroupHierarchyService.ascend(this.ctx.model.elements, currentSelectedId);
          if (ascendResult.handled && ascendResult.nextSelectedId) {
            this.ctx.selectionTool.activeGroupContextId = ascendResult.nextContextId;
            const parentEl = this.ctx.model.getElementById(ascendResult.nextSelectedId);
            this.ctx.selectionTool.select(ascendResult.nextSelectedId, parentEl);
            this.ctx.selectionTool.selectionMode = 'scale';
            this.ctx.propertyPanel.resetPanelMode();
            this.ctx.render();
            return;
          }
        }
        this.ctx.selectionTool.deselectAll();
        this.ctx.canvasMgr.selectedGuideId = null;
        this.ctx.canvasMgr.activeGuideTransformId = null;
        this.ctx.nodeEditorTool.selectedVertexId = null;
        this.ctx.nodeEditorTool.selectedHandleType = null;
        if (this.ctx.toolbar.activeTool === 'node') {
          this.ctx.toolbar.setTool('select');
        }
        this.ctx.propertyPanel.resetPanelMode();
        this.ctx.propertyPanel.update();
        this.ctx.render();
      }
      return;
    }

    if (this.ctx.toolbar.activeTool === 'polyline') {
      if (e.key === 'Enter') {
        this.ctx.polylineToolHandler.finishPolylinePath(false);
        return;
      }
    }

    if (this.ctx.toolbar.activeTool === 'pen') {
      if (e.key === 'Enter') {
        this.ctx.penToolHandler.finishPenPath(false);
        return;
      }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (cmdRegistry.has('edit.deleteSelected') && cmdRegistry.isEnabled('edit.deleteSelected')) {
        e.preventDefault();
        cmdRegistry.execute('edit.deleteSelected');
        return;
      }

      // Fallback si CommandRegistry no estuviera inicializado
      // 1. Delete selected guide line
      if (this.ctx.canvasMgr.selectedGuideId) {
        this.ctx.canvasMgr.removeGuide(this.ctx.canvasMgr.selectedGuideId);
        this.ctx.propertyPanel.resetPanelMode();
        this.ctx.render();
        this.ctx.syncMetadataToHost();
        return;
      }

      // 1b. Delete selected vertex in node editor
      if (this.ctx.toolbar.activeTool === 'node' && this.ctx.nodeEditorTool.selectedVertexId) {
        if (this.ctx.nodeToolHandler.deleteSelectedVertex()) {
          this.ctx.propertyPanel.update(null, 'node');
          return;
        }
      }

      // 2. Delete selected vector elements
      if (this.ctx.selectionTool.selectedElementIds.size > 0) {
        this.ctx.pushUndo();
        this.ctx.model.elements = this.ctx.model.elements.filter(
          (el) => !this.ctx.selectionTool.isSelected(el.id)
        );
        this.ctx.selectionTool.deselectAll();
        this.ctx.propertyPanel.resetPanelMode();
        this.ctx.render();
        this.ctx.syncToHost();
      }
    }

    // Arrow Key Nudge for selected vectors with modifier multiplier steps
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (this.ctx.selectionTool.selectedElementIds.size > 0) {
        e.preventDefault();

        let step = 1;
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const alt = e.altKey;

        if (shift && alt) {
          step = 100;
        } else if (ctrl && alt) {
          step = 75;
        } else if (ctrl && shift) {
          step = 50;
        } else if (alt) {
          step = 25;
        } else if (shift) {
          step = 10;
        } else if (ctrl) {
          step = 5;
        } else {
          step = 1;
        }

        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;

        // If in Node Tool and a specific vertex is selected, move only that vertex
        const activeEl = this.ctx.model.elements.find(
          (el) => el.id === this.ctx.selectionTool.selectedElementId
        );
        if (
          this.ctx.toolbar.activeTool === 'node' &&
          activeEl &&
          activeEl.vertices &&
          this.ctx.nodeEditorTool.selectedVertexId
        ) {
          const v = activeEl.vertices.find(
            (n) => n.id === this.ctx.nodeEditorTool.selectedVertexId
          );
          if (v) {
            v.x += dx;
            v.y += dy;
            if (v.handleIn) {
              v.handleIn.x += dx;
              v.handleIn.y += dy;
            }
            if (v.handleOut) {
              v.handleOut.x += dx;
              v.handleOut.y += dy;
            }
            activeEl.attributes.d = this.ctx.model.compilePathD(
              activeEl.vertices,
              activeEl.isClosed
            );
            this.ctx.render();
            this.ctx.syncToHost();
            return;
          }
        }

        // Otherwise translate all selected vector elements
        this.ctx.model.elements.forEach((el) => {
          if (this.ctx.selectionTool.isSelected(el.id) && el.vertices) {
            el.vertices.forEach((v) => {
              v.x += dx;
              v.y += dy;
              if (v.handleIn) {
                v.handleIn.x += dx;
                v.handleIn.y += dy;
              }
              if (v.handleOut) {
                v.handleOut.x += dx;
                v.handleOut.y += dy;
              }
            });
            el.attributes.d = this.ctx.model.compilePathD(el.vertices, el.isClosed);
          }
        });

        this.ctx.render();
        this.ctx.syncToHost();
      }
    }
  }
}
