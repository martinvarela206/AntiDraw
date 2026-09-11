import { ToolContext } from '../IToolHandler.js';
import { Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * BoxSelectInteraction
 *
 * Encapsulates rectangular marquee / box selection on canvas:
 * 1. Marquee Drag Initiation:
 *    - Standard drag on empty canvas: selects all elements intersecting the marquee box.
 *    - Ctrl/Cmd + Drag: adds intersecting elements to existing selection.
 *    - Shift + Drag: deselects intersecting elements from existing selection.
 * 2. Real-time Bounding Box Computation during mouse movement.
 * 3. Element Intersection Testing via `selectionTool.hitTestMarquee`.
 * 4. Overlay Rendering of the dashed selection rectangle.
 */
export class BoxSelectInteraction {
  public marqueeStartPt: Point | null = null;

  public start(pt: Point, ctx: ToolContext, isDeselect: boolean): void {
    this.marqueeStartPt = pt;
    ctx.selectionTool.isDeselectMarquee = isDeselect;
    ctx.render();
  }

  public onPointerMove(ctx: ToolContext, pt: Point): boolean {
    if (!this.marqueeStartPt) return false;
    const minX = Math.min(this.marqueeStartPt.x, pt.x);
    const minY = Math.min(this.marqueeStartPt.y, pt.y);
    const w = Math.abs(pt.x - this.marqueeStartPt.x);
    const h = Math.abs(pt.y - this.marqueeStartPt.y);
    ctx.selectionTool.marqueeRect = { x: minX, y: minY, width: w, height: h };
    ctx.renderOverlay();
    return true;
  }

  public onPointerUp(
    ctx: ToolContext,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (!ctx.selectionTool.marqueeRect) return false;

    const hitIds = ctx.selectionTool.hitTestMarquee(
      ctx.model.elements,
      ctx.selectionTool.marqueeRect
    );

    if (ctx.selectionTool.isDeselectMarquee) {
      hitIds.forEach((id) => ctx.selectionTool.deselect(id));
    } else if (e.ctrlKey || e.metaKey) {
      hitIds.forEach((id) => ctx.selectionTool.selectedElementIds.add(id));
    } else {
      ctx.selectionTool.selectedElementIds = new Set(hitIds);
    }

    ctx.selectionTool.marqueeRect = null;
    ctx.selectionTool.isDeselectMarquee = false;
    this.marqueeStartPt = null;
    callbacks.onSelectionChanged?.();
    ctx.render();
    return true;
  }

  public cancel(ctx: ToolContext): boolean {
    if (ctx.selectionTool.marqueeRect || this.marqueeStartPt) {
      ctx.selectionTool.marqueeRect = null;
      ctx.selectionTool.isDeselectMarquee = false;
      this.marqueeStartPt = null;
      return true;
    }
    return false;
  }

  public renderOverlay(ctx: ToolContext): string {
    if (!ctx.selectionTool.marqueeRect) return '';
    const m = ctx.selectionTool.marqueeRect;
    const isDesel = ctx.selectionTool.isDeselectMarquee;
    return `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${isDesel ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'}" stroke="${isDesel ? '#ef4444' : '#3b82f6'}" stroke-width="1" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
  }
}
