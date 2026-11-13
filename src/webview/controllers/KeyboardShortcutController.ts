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
import { KeymapRegistry } from '../commands/KeymapRegistry.js';

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
  eraserToolHandler?: import('../tools/EraserToolHandler.js').EraserToolHandler;
  scissorKnifeToolHandler?: import('../tools/ScissorKnifeToolHandler.js').ScissorKnifeToolHandler;
  smartFillToolHandler?: import('../tools/SmartFillToolHandler.js').SmartFillToolHandler;
  shapeBuilderToolHandler?: import('../tools/ShapeBuilderToolHandler.js').ShapeBuilderToolHandler;
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
  syncToHostDebounced?: (delayMs?: number) => void;
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

    // Delegación canónica de onKeyUp según la herramienta activa
    const activeTool = this.ctx.toolbar.activeTool;
    if (this.ctx.shapeToolHandler.shapeStartPt !== null) {
      if (this.ctx.shapeToolHandler.onKeyUp(e)) {
        return;
      }
    }

    switch (activeTool) {
      case 'eraser':
        this.ctx.eraserToolHandler?.onKeyUp?.(e);
        break;
      case 'scissors':
        this.ctx.scissorKnifeToolHandler?.onKeyUp?.(e);
        break;
      case 'pen':
        this.ctx.penToolHandler?.onKeyUp?.(e);
        break;
      case 'polyline':
        this.ctx.polylineToolHandler?.onKeyUp?.(e);
        break;
      case 'node':
        this.ctx.nodeToolHandler?.onKeyUp?.(e);
        break;
      case 'smartFill':
        this.ctx.smartFillToolHandler?.onKeyUp?.(e);
        break;
      case 'shapeBuilder':
        this.ctx.shapeBuilderToolHandler?.onKeyUp?.(e);
        break;
      default:
        break;
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

    if (this.ctx.toolbar.activeTool === 'eraser' && this.ctx.eraserToolHandler?.onKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (this.ctx.toolbar.activeTool === 'scissors' && this.ctx.scissorKnifeToolHandler?.onKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (this.ctx.toolbar.activeTool === 'polyline' && this.ctx.polylineToolHandler.onKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (this.ctx.toolbar.activeTool === 'pen' && this.ctx.penToolHandler.onKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

    const isSelectActive = this.ctx.toolbar.activeTool === 'select' || this.ctx.selectionTool.selectedElementIds.size > 0;
    const hasSelection = this.ctx.selectionTool.selectedElementIds.size > 0;
    const isPlainKey = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

    // Contextual Selection Transform Modes (W = Move, E = Scale, R = Rotate, D = Distort)
    // Only intercepts when elements are selected in select context, freeing M/L/E/R for tools when no selection
    if (isSelectActive && hasSelection && isPlainKey) {
      if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = 'move';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }
      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = 'scale';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }
      if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = 'rotate';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }
      if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.ctx.selectionTool.selectionMode = this.ctx.selectionTool.selectionMode === 'distort' ? 'scale' : 'distort';
        this.ctx.propertyPanel.update();
        this.ctx.renderOverlay();
        return;
      }
    }

    const cmdRegistry = CommandRegistry.getInstance();
    const keymap = KeymapRegistry.getInstance();
    const matched = keymap.findMatchingBinding(e);

    if (matched) {
      if (matched.toolId) {
        e.preventDefault();
        this.ctx.toolbar.setTool(matched.toolId as ToolType);
        return;
      }

      if (matched.commandId) {
        e.preventDefault();
        if (cmdRegistry.has(matched.commandId) && cmdRegistry.isEnabled(matched.commandId)) {
          cmdRegistry.execute(matched.commandId);
          return;
        }

        // Resilient Fallback executions if command is unhandled by CommandRegistry
        switch (matched.commandId) {
          case 'edit.copy':
            if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
              this.ctx.copySelection();
            }
            return;
          case 'edit.cut':
            if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
              this.ctx.cutSelection();
            }
            return;
          case 'edit.paste':
            if (this.ctx.clipboardService.hasContent) {
              this.ctx.pasteClipboard();
            }
            return;
          case 'edit.duplicate':
            if (this.ctx.selectionTool.selectedElementIds.size > 0 || this.ctx.canvasMgr.selectedGuideId) {
              this.ctx.duplicateSelection();
            }
            return;
          case 'edit.undo':
            this.ctx.undo();
            return;
          case 'edit.redo':
            this.ctx.redo();
            return;
          case 'node.join':
            if (this.ctx.toolbar.activeTool === 'node') {
              this.ctx.nodeToolHandler.handleJoinSelectedNodes();
            }
            return;
          case 'object.convertToCurves':
            if (this.ctx.selectionTool.selectedElementIds.size > 0) {
              this.ctx.handleConvertToCurves();
            }
            return;
          case 'edit.deleteSelected':
            this.handleDeleteSelected();
            return;
        }
      }
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
      this.handleDeleteSelected();
      return;
    }

    // Arrow Key Nudge for selected vectors with modifier multiplier steps
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (this.ctx.selectionTool.selectedElementIds.size > 0) {
        e.preventDefault();

        let step = 1;
        const isAltGr = KeymapRegistry.isAltGraph(e);
        const ctrl = KeymapRegistry.isCtrlOrMeta(e) && !isAltGr;
        const shift = e.shiftKey;
        const alt = e.altKey && !isAltGr;

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
            if (this.ctx.syncToHostDebounced) {
              this.ctx.syncToHostDebounced(150);
            } else {
              this.ctx.syncToHost();
            }
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
        if (this.ctx.syncToHostDebounced) {
          this.ctx.syncToHostDebounced(150);
        } else {
          this.ctx.syncToHost();
        }
      }
    }
  }

  private handleDeleteSelected(): void {
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
}
