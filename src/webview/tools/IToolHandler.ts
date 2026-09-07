import { ToolType } from '../ui/Toolbar.js';
import { Point, VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';

export interface ToolContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  pushUndo(): void;
  syncToHost(): void;
  render(): void;
  renderOverlay(): void;
  snapPoint(pt: Point, otherVertices?: Point[], excludeGuideId?: string): Point;
  getOtherVertices(): Point[];
  setTool(tool: ToolType): void;
  getActiveTool(): ToolType;
  applyCanvasSize?(): void;
}

/**
 * ARCHITECTURAL RATIONALE: Unified Tool Handler Contract (IToolHandler)
 *
 * 1. Monolithic State Machine Dissolution:
 *    In the legacy architecture, `main.ts` acted as an unchecked global state machine, mixing
 *    transient pointer coordinates (`shapeStartPt`, `polylineHoverPoint`, `currentPolylineVertices`),
 *    ephemeral rendering logic, and model commitments in a single 3,500-line class.
 *    `IToolHandler` enforces encapsulation by delegating tool-specific pointer events, cancellation,
 *    and overlay rendering to specialized handler classes.
 *
 * 2. Polymorphic Event Dispatch:
 *    `main.ts` dispatches pointer events (`pointerdown`, `pointermove`, `pointerup`, `dblclick`)
 *    and cancellation (`Escape` / contextmenu) polymorphically through the active tool handler.
 *    Handlers return a boolean indicating whether the event was absorbed, allowing fallback to
 *    canvas-wide interactions (e.g. deselection or panning) when appropriate.
 *
 * 3. Ephemeral Overlay Segregation:
 *    Tools frequently draw transient previews (*ghost shapes*, rubber bands, snap circles) that
 *    must never pollute the real SVG document model. `renderOverlay` provides an isolated channel
 *    for handlers to generate non-destructive SVG markup directly into the overlay layer.
 */
export interface IToolHandler {
  readonly toolTypes: ToolType[];
  onPointerDown(e: PointerEvent, pt: Point): boolean | void;
  onPointerMove(e: PointerEvent, pt: Point): boolean | void;
  onPointerUp(e: PointerEvent, pt: Point): boolean | void;
  onDoubleClick?(e: MouseEvent, pt: Point): boolean | void;
  cancel?(): boolean;
  renderOverlay?(zoom: number): string;
  activate?(): void;
  deactivate?(): void;
}
