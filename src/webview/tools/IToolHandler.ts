import { ToolType } from './ToolType.js';
import { Point, VectorModel } from '../engine/VectorModel.js';
import { SelectionTool } from '../engine/SelectionTool.js';
import { CanvasManager } from '../engine/CanvasManager.js';
import { ToolStateMachine, ToolSessionState } from './ToolStateMachine.js';
import { CameraViewportTransform } from './CoordinateSpaceTransformer.js';
import { ToolTransactionManager } from './ToolTransactionManager.js';

export interface ConfirmOptions {
  title: string;
  message: string;
  details?: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: 'accent' | 'danger';
}

export interface ToolContext {
  model: VectorModel;
  selectionTool: SelectionTool;
  canvasMgr: CanvasManager;
  pushUndo(): void;
  syncToHost(): void;
  render(): void;
  renderOverlay(): void;
  snapPoint(pt: Point, otherVertices?: Point[], excludeGuideId?: string, strokeWidth?: number, halfPixel?: boolean): Point;
  getOtherVertices(excludeIds?: string[]): Point[];
  setTool(tool: ToolType): void;
  getActiveTool(): ToolType;
  confirm(options: ConfirmOptions): Promise<boolean>;
  applyCanvasSize?(): void;
  isPointerOverRuler?(clientX: number, clientY: number, orientation?: 'horizontal' | 'vertical' | 'angled'): boolean;
  getCameraTransform?(): CameraViewportTransform;
  getStateMachine?(): ToolStateMachine;
  getTransactionManager?(): ToolTransactionManager;
}

/**
 * ARCHITECTURAL RATIONALE: Unified Tool Handler Contract (ITool / IToolHandler)
 *
 * 1. Deterministic State Machine Integration:
 *    Tools can integrate with `ToolStateMachine` or operate as specialized reducers
 *    handling pointer down, move, up, double click, key down, key up, and explicit cancellation.
 *
 * 2. High-Frequency Sampling & Pointer Coalescence:
 *    `onPointerMove` can accept coalesced pointer points for high-refresh-rate stylus and digitizer
 *    devices (`getCoalescedEvents`), preventing jitter in freehand pen and eraser tools.
 *
 * 3. 3-Tier Canonical Coordinate Projections:
 *    Screen Space (Client px) -> Document Space (viewBox) -> Local Space (Object Matrix).
 */
export interface IToolHandler {
  readonly toolTypes: ToolType[];
  onPointerDown(e: PointerEvent, pt: Point): boolean | void;
  onPointerMove(e: PointerEvent, pt: Point, coalescedPts?: Point[]): boolean | void;
  onPointerUp(e: PointerEvent, pt: Point): boolean | void;
  onDoubleClick?(e: MouseEvent, pt: Point): boolean | void;
  cancel?(): boolean;
  renderOverlay?(zoom: number): string | import('../engine/canvas/OverlayDescriptor.js').OverlayDescriptor[];
  activate?(): void;
  deactivate?(): void;
  onKeyDown?(e: KeyboardEvent): boolean | void;
  onKeyUp?(e: KeyboardEvent): boolean | void;
  getState?(): ToolSessionState;
}
