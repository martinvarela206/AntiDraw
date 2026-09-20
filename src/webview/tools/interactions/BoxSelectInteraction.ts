import { ToolContext } from '../IToolHandler.js';
import { Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * ARCHITECTURAL RATIONALE: CorelDraw Benchmark Box Selection Interaction
 *
 * 1. Industrial Parity:
 *    - Standard Marquee (Drag without Alt): Enclosed mode (*inclusión total*).
 *      Only vector elements whose bounding boxes are 100% contained within the selection box
 *      are selected. Prevents accidental selection of large background geometry in complex files.
 *    - Modifier Marquee (Drag with Alt): Touching mode (*cruce*).
 *      Any vector element whose bounding box intersects, grazes, or touches the selection box
 *      is immediately captured.
 *    - Modifier Commutative Toggle (Drag with Shift): Toggles the selection state of hit elements.
 *
 * 2. Real-time Reactive Visual Feedback:
 *    - Enclosed Mode (default): Crisp sky-blue dashed boundary (`#3b82f6`).
 *    - Touching Mode (Alt): Distinct vibrant amber/gold dashed boundary (`#f59e0b`) with informational badge.
 *    - Commutative Mode (Shift): Emerald dashed boundary (`#10b981`).
 *
 * 3. Dynamic Modifier Switching:
 *    Users can press or release `Alt` at any moment mid-drag; the interaction dynamically recalculates
 *    and switches visual styles and selection criteria seamlessly.
 */
export class BoxSelectInteraction {
  public marqueeStartPt: Point | null = null;

  public start(pt: Point, ctx: ToolContext, isToggle: boolean, isTouching: boolean = false): void {
    this.marqueeStartPt = pt;
    ctx.selectionTool.isToggleMarquee = isToggle;
    ctx.selectionTool.isTouchingMarquee = isTouching;
    ctx.render();
  }

  public onPointerMove(ctx: ToolContext, pt: Point, isTouching: boolean = false): boolean {
    if (!this.marqueeStartPt) return false;
    const minX = Math.min(this.marqueeStartPt.x, pt.x);
    const minY = Math.min(this.marqueeStartPt.y, pt.y);
    const w = Math.abs(pt.x - this.marqueeStartPt.x);
    const h = Math.abs(pt.y - this.marqueeStartPt.y);
    ctx.selectionTool.marqueeRect = { x: minX, y: minY, width: w, height: h };
    ctx.selectionTool.isTouchingMarquee = isTouching;
    ctx.renderOverlay();
    return true;
  }

  public onPointerUp(
    ctx: ToolContext,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (!ctx.selectionTool.marqueeRect) return false;

    const isTouching = ctx.selectionTool.isTouchingMarquee || e.altKey;
    const hitIds = ctx.selectionTool.hitTestMarquee(
      ctx.model.elements,
      ctx.selectionTool.marqueeRect,
      isTouching
    );

    const isToggle = ctx.selectionTool.isToggleMarquee || e.shiftKey;
    if (isToggle) {
      /**
       * ARCHITECTURAL RATIONALE: Commutative (Additive/Subtractive) Selection with Shift
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
    ctx.selectionTool.isTouchingMarquee = false;
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
      ctx.selectionTool.isTouchingMarquee = false;
      this.marqueeStartPt = null;
      return true;
    }
    return false;
  }

  public renderOverlay(ctx: ToolContext): string {
    if (!ctx.selectionTool.marqueeRect) return '';
    const m = ctx.selectionTool.marqueeRect;
    const isToggle = ctx.selectionTool.isToggleMarquee;
    const isTouching = ctx.selectionTool.isTouchingMarquee;

    let fill: string;
    let stroke: string;
    let dashArray: string;

    if (isTouching) {
      // Touching / Cruce mode (Alt) -> Amber theme with dense dash
      fill = isToggle ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.12)';
      stroke = '#f59e0b';
      dashArray = '3 3';
    } else if (isToggle) {
      // Commutative toggle mode (Shift) -> Emerald theme
      fill = 'rgba(16, 185, 129, 0.12)';
      stroke = '#10b981';
      dashArray = '4 2';
    } else {
      // Default Enclosed mode -> Sky Blue theme
      fill = 'rgba(59, 130, 246, 0.08)';
      stroke = '#3b82f6';
      dashArray = '4 2';
    }

    const rectSvg = `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-dasharray="${dashArray}" vector-effect="non-scaling-stroke" />`;

    // High-fidelity mode badge when Touching (Alt) is active and box has sufficient size
    let badgeSvg = '';
    if (isTouching && m.width > 60 && m.height > 24) {
      const zoom = ctx.canvasMgr.zoom || 1;
      const badgeW = 74 / zoom;
      const badgeH = 18 / zoom;
      const badgeX = m.x + m.width - badgeW - (4 / zoom);
      const badgeY = m.y + (4 / zoom);
      const fontSize = 10 / zoom;
      badgeSvg = `
        <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${3 / zoom}" fill="#1e293b" fill-opacity="0.9" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
        <text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH * 0.72}" fill="#fbbf24" font-family="sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" pointer-events="none">Cruce (Alt)</text>
      `;
    }

    return rectSvg + badgeSvg;
  }
}
