import { Point } from '../../core/geom/Point.js';
import { ToolType } from '../../tools/ToolType.js';
import { IToolHandler, ToolContext } from '../../tools/IToolHandler.js';
import { SelectToolHandler } from '../../tools/SelectToolHandler.js';
import { ShapeToolHandler } from '../../tools/ShapeToolHandler.js';
import { PolylineToolHandler } from '../../tools/PolylineToolHandler.js';
import { PenToolHandler } from '../../tools/PenToolHandler.js';
import { NodeToolHandler } from '../../tools/NodeToolHandler.js';
import { SmartFillToolHandler } from '../../tools/SmartFillToolHandler.js';
import { DocumentState } from '../../core/model/DocumentState.js';

export interface ActiveInteraction {
  readonly label: string;
  readonly baseSnapshot: DocumentState;
  readonly startPoint: Point;
  lastPreviewPoint?: Point;
}

export interface SessionCallbacks {
  onRender: () => void;
  onRenderOverlay: () => void;
  onToolChanged?: (tool: ToolType) => void;
  onResetPropertyPanel?: () => void;
  setCursor?: (cursor: string) => void;
  getBaseSnapshot?: () => DocumentState;
  onRestoreSnapshot?: (state: DocumentState) => void;
  onCommitSnapshot?: (label: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Interaction Session & Tool Orchestrator (Session - L2/L3)
 *
 * 1. Interaction State Encapsulation:
 *    Centralizes transient session flags (`isDragging`, `dragStartPt`, `activeHandle`,
 *    ruler guide drags, origin displacement) away from `main.ts`.
 *
 * 2. Polymorphic Tool Lifecycle & Event Routing:
 *    Manages active tool switching, cleanup hooks (`activate()`, `deactivate()`),
 *    and dispatches pointer/keyboard events to the active `IToolHandler` cleanly.
 *
 * 3. Unified Cancellation (Escape / ContextMenu):
 *    Executes hierarchical cancellation across active tools, guide interactions,
 *    and transformation gizmos with deterministic visual rollback.
 */
export class Session {
  public activeTool: ToolType = 'select';
  public isDragging: boolean = false;
  public dragStartPt: Point = { x: 0, y: 0 };
  public activeHandle: 'origin-drag' | 'guide-create' | 'shape' | null = null;

  // Ruler drag state
  public dragGuideOrientation: 'horizontal' | 'vertical' = 'horizontal';
  public dragGuideCurrentPt: Point = { x: 0, y: 0 };
  public dragOriginPt: Point | null = null;

  // Formal Interaction Cycle (VectorCraft Begin -> Preview -> Commit/Cancel)
  public activeInteraction: ActiveInteraction | null = null;

  // Handlers
  public readonly selectHandler: SelectToolHandler;
  public readonly shapeHandler: ShapeToolHandler;
  public readonly polylineHandler: PolylineToolHandler;
  public readonly penHandler: PenToolHandler;
  public readonly nodeHandler: NodeToolHandler;
  public readonly smartFillHandler?: SmartFillToolHandler;
  private readonly handlers: IToolHandler[];

  private callbacks: SessionCallbacks;

  constructor(
    handlers: {
      select: SelectToolHandler;
      shape: ShapeToolHandler;
      polyline: PolylineToolHandler;
      pen: PenToolHandler;
      node: NodeToolHandler;
      smartFill?: SmartFillToolHandler;
    },
    callbacks: SessionCallbacks
  ) {
    this.selectHandler = handlers.select;
    this.shapeHandler = handlers.shape;
    this.polylineHandler = handlers.polyline;
    this.penHandler = handlers.pen;
    this.nodeHandler = handlers.node;
    this.smartFillHandler = handlers.smartFill;
    this.handlers = [
      this.selectHandler,
      this.shapeHandler,
      this.polylineHandler,
      this.penHandler,
      this.nodeHandler,
    ];
    if (this.smartFillHandler) {
      this.handlers.push(this.smartFillHandler);
    }
    this.callbacks = callbacks;
  }

  public getAllHandlers(): IToolHandler[] {
    return this.handlers;
  }

  public getActiveHandler(): IToolHandler | null {
    switch (this.activeTool) {
      case 'select':
      case 'stroke':
        return this.selectHandler;
      case 'node':
        return this.nodeHandler;
      case 'pen':
        return this.penHandler;
      case 'polyline':
        return this.polylineHandler;
      case 'rect':
      case 'circle':
      case 'ellipse':
      case 'line':
      case 'polygon':
      case 'star':
        return this.shapeHandler;
      case 'smartFill':
        return this.smartFillHandler || null;
      default:
        return null;
    }
  }

  public setTool(tool: ToolType): void {
    if (this.activeTool === tool) return;

    this.callbacks.onResetPropertyPanel?.();

    if (tool !== 'polyline') {
      this.polylineHandler.deactivate();
    }
    if (!['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'].includes(tool)) {
      this.shapeHandler.cancel();
    }
    if (tool !== 'pen') {
      this.penHandler.deactivate();
    }
    if (tool !== 'node') {
      this.nodeHandler.deactivate();
    }
    if (tool !== 'smartFill') {
      this.smartFillHandler?.deactivate();
    }

    this.activeTool = tool;
    const activeHandler = this.getActiveHandler();
    activeHandler?.activate?.();

    this.callbacks.onToolChanged?.(tool);
    this.callbacks.onRender();
  }

  public beginInteraction(label: string, startPt: Point): void {
    const baseSnapshot = this.callbacks.getBaseSnapshot?.();
    if (baseSnapshot) {
      this.activeInteraction = {
        label,
        baseSnapshot,
        startPoint: { ...startPt },
      };
    }
  }

  public previewInteraction(currentPt: Point): void {
    if (this.activeInteraction) {
      this.activeInteraction.lastPreviewPoint = { ...currentPt };
    }
  }

  public commitInteraction(): void {
    if (this.activeInteraction) {
      this.callbacks.onCommitSnapshot?.(this.activeInteraction.label);
      this.activeInteraction = null;
    }
  }

  public cancelInteraction(): boolean {
    if (this.activeInteraction) {
      this.callbacks.onRestoreSnapshot?.(this.activeInteraction.baseSnapshot);
      this.activeInteraction = null;
      return true;
    }
    return false;
  }

  public cancelCurrentAction(): boolean {
    let handled = false;

    // 0. Formal interaction rollback
    try {
      if (this.cancelInteraction()) {
        handled = true;
      }
    } catch (e) {
      console.error('[Session] Error during cancelInteraction:', e);
    }

    // 1. Tool cancellation (defensive per-tool isolation)
    try {
      if (this.selectHandler.cancel()) handled = true;
    } catch (e) {
      console.error('[Session] Error during selectHandler.cancel():', e);
    }

    try {
      if (this.nodeHandler.cancel()) handled = true;
    } catch (e) {
      console.error('[Session] Error during nodeHandler.cancel():', e);
    }

    try {
      if (this.shapeHandler.cancel()) {
        this.activeHandle = null;
        this.isDragging = false;
        handled = true;
      }
    } catch (e) {
      console.error('[Session] Error during shapeHandler.cancel():', e);
    }

    try {
      if (this.activeTool === 'pen' && this.penHandler.cancel()) {
        this.activeHandle = null;
        this.isDragging = false;
        handled = true;
      }
    } catch (e) {
      console.error('[Session] Error during penHandler.cancel():', e);
    }

    try {
      if (this.activeTool === 'polyline' && this.polylineHandler.cancel()) {
        this.activeHandle = null;
        this.isDragging = false;
        handled = true;
      }
    } catch (e) {
      console.error('[Session] Error during polylineHandler.cancel():', e);
    }

    try {
      if (this.activeTool === 'smartFill' && this.smartFillHandler?.cancel()) {
        this.activeHandle = null;
        this.isDragging = false;
        handled = true;
      }
    } catch (e) {
      console.error('[Session] Error during smartFillHandler.cancel():', e);
    }

    // 2. Guide creation drag
    if (this.activeHandle === 'guide-create') {
      this.dragGuideCurrentPt = { x: 0, y: 0 };
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
    }

    // 3. Origin displacement drag
    if (this.activeHandle === 'origin-drag') {
      this.dragOriginPt = null;
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
    }

    this.isDragging = false;
    this.activeHandle = null;

    try {
      this.callbacks.setCursor?.('');
    } catch (_e) {}

    try {
      if (handled) {
        this.callbacks.onRender();
      } else {
        this.callbacks.onRenderOverlay();
      }
    } catch (_e) {}

    return handled;
  }

  public dispatchPointerDown(e: PointerEvent, pt: Point): boolean {
    const handler = this.getActiveHandler();
    if (handler) {
      const absorbed = handler.onPointerDown(e, pt);
      if (absorbed) return true;
    }
    return false;
  }

  public dispatchPointerMove(e: PointerEvent, pt: Point): boolean {
    const handler = this.getActiveHandler();
    if (handler) {
      const absorbed = handler.onPointerMove(e, pt);
      if (absorbed) return true;
    }
    return false;
  }

  public dispatchPointerUp(e: PointerEvent, pt: Point): boolean {
    const handler = this.getActiveHandler();
    if (handler) {
      const absorbed = handler.onPointerUp(e, pt);
      if (absorbed) return true;
    }
    return false;
  }

  public dispatchDoubleClick(e: MouseEvent, pt: Point): boolean {
    const handler = this.getActiveHandler();
    if (handler?.onDoubleClick) {
      const absorbed = handler.onDoubleClick(e, pt);
      if (absorbed) return true;
    }
    return false;
  }

  public dispatchKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      return this.cancelCurrentAction();
    }
    const handler = this.getActiveHandler();
    if (handler?.onKeyDown) {
      const absorbed = handler.onKeyDown(e);
      if (absorbed) return true;
    }
    return false;
  }

  public dispatchKeyUp(e: KeyboardEvent): boolean {
    const handler = this.getActiveHandler();
    if (handler?.onKeyUp) {
      const absorbed = handler.onKeyUp(e);
      if (absorbed) return true;
    }
    return false;
  }
}
