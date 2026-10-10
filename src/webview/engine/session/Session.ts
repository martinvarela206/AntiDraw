import { Point } from '../../core/geom/Point.js';
import { ToolType } from '../../tools/ToolType.js';
import { IToolHandler, ToolContext } from '../../tools/IToolHandler.js';
import { SelectToolHandler } from '../../tools/SelectToolHandler.js';
import { ShapeToolHandler } from '../../tools/ShapeToolHandler.js';
import { PolylineToolHandler } from '../../tools/PolylineToolHandler.js';
import { PenToolHandler } from '../../tools/PenToolHandler.js';
import { NodeToolHandler } from '../../tools/NodeToolHandler.js';

export interface SessionCallbacks {
  onRender: () => void;
  onRenderOverlay: () => void;
  onToolChanged?: (tool: ToolType) => void;
  onResetPropertyPanel?: () => void;
  setCursor?: (cursor: string) => void;
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

  // Handlers
  public readonly selectHandler: SelectToolHandler;
  public readonly shapeHandler: ShapeToolHandler;
  public readonly polylineHandler: PolylineToolHandler;
  public readonly penHandler: PenToolHandler;
  public readonly nodeHandler: NodeToolHandler;
  private readonly handlers: IToolHandler[];

  private callbacks: SessionCallbacks;

  constructor(
    handlers: {
      select: SelectToolHandler;
      shape: ShapeToolHandler;
      polyline: PolylineToolHandler;
      pen: PenToolHandler;
      node: NodeToolHandler;
    },
    callbacks: SessionCallbacks
  ) {
    this.selectHandler = handlers.select;
    this.shapeHandler = handlers.shape;
    this.polylineHandler = handlers.polyline;
    this.penHandler = handlers.pen;
    this.nodeHandler = handlers.node;
    this.handlers = [
      this.selectHandler,
      this.shapeHandler,
      this.polylineHandler,
      this.penHandler,
      this.nodeHandler,
    ];
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

    this.activeTool = tool;
    const activeHandler = this.getActiveHandler();
    activeHandler?.activate?.();

    this.callbacks.onToolChanged?.(tool);
    this.callbacks.onRender();
  }

  public cancelCurrentAction(): boolean {
    let handled = false;

    // 1. Tool cancellation
    if (this.selectHandler.cancel()) handled = true;
    if (this.nodeHandler.cancel()) handled = true;
    if (this.shapeHandler.cancel()) {
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
    }
    if (this.activeTool === 'pen' && this.penHandler.cancel()) {
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
    }
    if (this.activeTool === 'polyline' && this.polylineHandler.cancel()) {
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
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
    this.callbacks.setCursor?.('');

    if (handled) {
      this.callbacks.onRender();
    } else {
      this.callbacks.onRenderOverlay();
    }

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
