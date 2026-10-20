import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point } from '../engine/VectorModel.js';
import { SmartFillEngine, SmartFillOptions, EnclosedRegion } from '../engine/boolean/SmartFillEngine.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';

export interface SmartFillHandlerCallbacks {
  setCursor?: (cursor: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Smart Fill Tool Handler (SmartFillToolHandler)
 *
 * 1. Interaction Lifecycle:
 *    Handles click-to-fill gestures on the canvas. On `pointerdown`, captures the coordinate.
 *    On `pointerup` (if displacement < 5px), queries `SmartFillEngine` for the closed region
 *    underneath the pointer and materializes a new independent `<path>` element into the document.
 *
 * 2. Non-Destructive Synthesis:
 *    Original intersecting lines and shapes are preserved completely unmutated. The synthesized
 *    filled shape is committed to history (`pushUndo()`), selected, and synced with the host.
 *
 * 3. Ephemeral Region Hover Preview & Dynamic Caching:
 *    Provides real-time interactive preview over valid enclosed regions via `renderOverlay`.
 *    Employs lazy caching of planar graph face regions during pointer movement to maintain
 *    60-120 FPS cursor responsiveness with zero layout thrashing.
 */
export class SmartFillToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['smartFill'];
  private ctx: ToolContext;
  private callbacks?: SmartFillHandlerCallbacks;

  public lastDownPt: Point | null = null;
  public hoverRegionD: string | null = null;
  private cachedRegions: EnclosedRegion[] | null = null;
  private cachedElementCount: number = -1;

  public options: SmartFillOptions = {
    fillColor: '#6366f1',
    strokeColor: '#1e293b',
    strokeWidth: 1,
  };

  constructor(ctx: ToolContext, callbacks?: SmartFillHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  public invalidateCache(): void {
    this.cachedRegions = null;
    this.cachedElementCount = -1;
  }

  public activate(): void {
    this.invalidateCache();
    this.callbacks?.setCursor?.('crosshair');
  }

  public deactivate(): void {
    this.lastDownPt = null;
    this.hoverRegionD = null;
    this.invalidateCache();
    this.callbacks?.setCursor?.('');
  }

  public cancel(): boolean {
    if (this.lastDownPt || this.hoverRegionD) {
      this.lastDownPt = null;
      this.hoverRegionD = null;
      this.invalidateCache();
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill' || e.button !== 0) {
      return false;
    }

    this.lastDownPt = { x: pt.x, y: pt.y };
    return true;
  }

  public onPointerMove(_e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill') return false;

    // Check if cache needs invalidation (e.g. elements count changed)
    const currentCount = this.ctx.model.elements.length;
    if (this.cachedElementCount !== currentCount || !this.cachedRegions) {
      const candidateElements =
        this.ctx.selectionTool.selectedElementIds.size > 0
          ? this.ctx.model.elements.filter((el) => this.ctx.selectionTool.selectedElementIds.has(el.id))
          : this.ctx.model.elements;

      let detected = SmartFillEngine.detectAllRegions(candidateElements, this.ctx.model);
      if (detected.length === 0 && candidateElements !== this.ctx.model.elements) {
        detected = SmartFillEngine.detectAllRegions(this.ctx.model.elements, this.ctx.model);
      }
      this.cachedRegions = detected;
      this.cachedElementCount = currentCount;
    }

    const targetRegion = SmartFillEngine.findRegionAtPoint(pt, this.cachedRegions);
    const newD = targetRegion ? SmartFillEngine.compileRegionD(targetRegion, this.ctx.model) : null;

    if (this.hoverRegionD !== newD) {
      this.hoverRegionD = newD;
      this.ctx.renderOverlay();
    }

    return true;
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill' || !this.lastDownPt) {
      return false;
    }

    const dist = Math.hypot(pt.x - this.lastDownPt.x, pt.y - this.lastDownPt.y);
    this.lastDownPt = null;

    // Reject long drag gestures (such as viewport panning or accidental drag)
    if (dist > 6) {
      return false;
    }

    const clickPt = { x: pt.x, y: pt.y };

    // 1. Identify candidate elements: prefer selection if at least one element is selected,
    // otherwise evaluate all elements in the model
    const candidateElements =
      this.ctx.selectionTool.selectedElementIds.size > 0
        ? this.ctx.model.elements.filter((el) => this.ctx.selectionTool.selectedElementIds.has(el.id))
        : this.ctx.model.elements;

    let newElement = SmartFillEngine.fillRegionAtPoint(
      clickPt,
      candidateElements,
      this.ctx.model,
      this.options,
      this.cachedRegions || undefined
    );

    // If selection did not produce a region enclosing the click, fall back to global elements
    if (!newElement && candidateElements !== this.ctx.model.elements) {
      newElement = SmartFillEngine.fillRegionAtPoint(
        clickPt,
        this.ctx.model.elements,
        this.ctx.model,
        this.options
      );
    }

    if (newElement) {
      this.ctx.pushUndo();
      this.ctx.model.elements.push(newElement);
      this.ctx.selectionTool.select(newElement.id);
      this.hoverRegionD = null;
      this.invalidateCache();
      this.ctx.render();
      this.ctx.renderOverlay();
      this.ctx.syncToHost();
      return true;
    }

    return false;
  }

  public renderOverlay(_zoom: number): OverlayDescriptor[] {
    if (!this.hoverRegionD) return [];

    return [
      {
        type: 'path',
        id: 'smart-fill-preview',
        d: this.hoverRegionD,
        fill: 'rgba(99, 102, 241, 0.25)',
        stroke: '#6366f1',
        strokeWidth: 1.5,
        strokeDasharray: '4,4',
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'none',
      },
    ];
  }
}
