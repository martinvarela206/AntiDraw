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

  public start(pt: Point, ctx: ToolContext, isToggle: boolean): void {
    this.marqueeStartPt = pt;
    ctx.selectionTool.isToggleMarquee = isToggle;
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

    const isToggle = ctx.selectionTool.isToggleMarquee || e.shiftKey;
    if (isToggle) {
      /**
       * ARCHITECTURAL RATIONALE: Conmutative (Additive/Subtractive) Selection with Shift
       * Toggles the selection state for all elements within the marquee:
       * - If an element is already selected, it is deselected.
       * - If an element is not selected, it is added to the selection.
       */
      hitIds.forEach((id) => {
        if (ctx.selectionTool.selectedElementIds.has(id)) {
          ctx.selectionTool.deselect(id);
        } else {
          ctx.selectionTool.selectedElementIds.add(id);
        }
      });
    } else {
      ctx.selectionTool.selectedElementIds = new Set(hitIds);
    }

    ctx.selectionTool.marqueeRect = null;
    ctx.selectionTool.isToggleMarquee = false;
    ctx.selectionTool.isDeselectMarquee = false;
    this.marqueeStartPt = null;
    callbacks.onSelectionChanged?.();
    ctx.render();
    return true;
  }

  public cancel(ctx: ToolContext): boolean {
    if (ctx.selectionTool.marqueeRect || this.marqueeStartPt) {
      ctx.selectionTool.marqueeRect = null;
      ctx.selectionTool.isToggleMarquee = false;
      ctx.selectionTool.isDeselectMarquee = false;
      this.marqueeStartPt = null;
      return true;
    }
    return false;
  }

  public renderOverlay(ctx: ToolContext): string {
    if (!ctx.selectionTool.marqueeRect) return '';
    const m = ctx.selectionTool.marqueeRect;
    const isToggle = ctx.selectionTool.isToggleMarquee;
    const fill = isToggle ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)';
    const stroke = isToggle ? '#10b981' : '#3b82f6';
    return `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
  }
}
