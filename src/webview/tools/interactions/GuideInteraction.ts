import { ToolContext } from '../IToolHandler.js';
import { Point } from '../../engine/VectorModel.js';
import { GuideLine } from '../../engine/CanvasManager.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

export type GuideHandleType = 'guide-move' | 'guide-pivot' | 'guide-rotate';

/**
 * GuideInteraction
 *
 * Encapsulates all interactive behaviors with canvas guide lines:
 * 1. Differentiated Guide Transformation & Translation:
 *    - Clicking on the central pivot node translates the pivot ('guide-pivot').
 *    - Clicking on the outer curved arrows activates rotational angle steering ('guide-rotate').
 *    - Clicking anywhere on the remaining body of the guide line executes parallel translation ('guide-move').
 * 2. Multi-Target Magnetic Snapping:
 *    - Orthogonal guidelines snap against grid lines, ViewBox boundaries, and other vector vertices.
 *    - Oblique guidelines project perpendicular translation snapping via `snapAngledGuideTranslation`.
 *    - Guide rotation snaps to magnetic reference targets, 15° increments (with Shift), or soft 3° primary angles.
 * 3. Physical DOM Ruler Area Hit-Testing for Guide Deletion:
 *    - Deletes a guideline ONLY when dragged and dropped back onto physical ruler bars.
 * 4. Double-click to enter angle/pivot transform mode.
 */
export class GuideInteraction {
  public guideInitialState: GuideLine | null = null;
  public activeRotateArrowIdx: 1 | 2 = 1;
  public currentRotationSnappedPt: Point | null = null;

  /**
   * Hover cursor evaluation for active guide transformation controls and guide lines.
   */
  public getHoverCursor(ctx: ToolContext, pt: Point): string | null {
    if (ctx.canvasMgr.activeGuideTransformId) {
      const activeG = ctx.canvasMgr.getGuide(ctx.canvasMgr.activeGuideTransformId);
      if (activeG) {
        const geom = ctx.canvasMgr.getGuideGeometry(activeG, ctx.model.canvas.width, ctx.model.canvas.height);
        if (
          Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 14 ||
          Math.hypot(pt.x - geom.visualCenter.x, pt.y - geom.visualCenter.y) <= 14
        ) {
          return 'move';
        }
        if (
          Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 ||
          Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16
        ) {
          return 'grab';
        }
        const hitActive = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 6);
        if (hitActive && hitActive.id === activeG.id) {
          return activeG.orientation === 'vertical' ? 'ew-resize' : activeG.orientation === 'horizontal' ? 'ns-resize' : 'crosshair';
        }
      }
    }

    const hitG = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 6);
    if (hitG) {
      return hitG.orientation === 'vertical' ? 'ew-resize' : hitG.orientation === 'horizontal' ? 'ns-resize' : 'crosshair';
    }

    return null;
  }

  /**
   * Evaluates pointer down on guide transform controls or guide lines.
   */
  public onPointerDown(
    ctx: ToolContext,
    pt: Point,
    callbacks: SelectToolCallbacks
  ): { handled: boolean; activeHandle?: GuideHandleType } {
    // 1. Check active Guide Transform controls (pivot or curved arrows)
    if (ctx.canvasMgr.activeGuideTransformId) {
      const activeG = ctx.canvasMgr.getGuide(ctx.canvasMgr.activeGuideTransformId);
      if (activeG) {
        const geom = ctx.canvasMgr.getGuideGeometry(activeG, ctx.model.canvas.width, ctx.model.canvas.height);

        // Check pivot or visual center click
        if (
          Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 14 ||
          Math.hypot(pt.x - geom.visualCenter.x, pt.y - geom.visualCenter.y) <= 14
        ) {
          this.guideInitialState = { ...activeG };
          ctx.render();
          return { handled: true, activeHandle: 'guide-pivot' };
        }

        // Check arrow 1 click
        if (Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16) {
          this.activeRotateArrowIdx = 1;
          this.guideInitialState = { ...activeG };
          ctx.render();
          return { handled: true, activeHandle: 'guide-rotate' };
        }

        // Check arrow 2 click
        if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16) {
          this.activeRotateArrowIdx = 2;
          this.guideInitialState = { ...activeG };
          ctx.render();
          return { handled: true, activeHandle: 'guide-rotate' };
        }

        // Check click anywhere on the active transforming guide line body
        const hitActive = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
        if (hitActive && hitActive.id === activeG.id) {
          this.guideInitialState = { ...activeG };
          ctx.render();
          return { handled: true, activeHandle: 'guide-move' };
        }
      }
    }

    // 2. Check if clicking on any Guide Line to select it and activate rotation controls immediately
    const hitGuide = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
    if (hitGuide) {
      ctx.selectionTool.deselectAll();
      ctx.canvasMgr.selectedGuideId = hitGuide.id;
      ctx.canvasMgr.activeGuideTransformId = hitGuide.id;
      this.guideInitialState = { ...hitGuide };
      callbacks.onGuideSelected?.(hitGuide);

      const geom = ctx.canvasMgr.getGuideGeometry(hitGuide, ctx.model.canvas.width, ctx.model.canvas.height);
      let activeHandle: GuideHandleType = 'guide-move';
      if (
        Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 14 ||
        Math.hypot(pt.x - geom.visualCenter.x, pt.y - geom.visualCenter.y) <= 14
      ) {
        activeHandle = 'guide-pivot';
      } else if (
        Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 ||
        Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16
      ) {
        activeHandle = 'guide-rotate';
        this.activeRotateArrowIdx = Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16 ? 2 : 1;
      }

      ctx.render();
      return { handled: true, activeHandle };
    }

    // 3. Clicked somewhere else: clear active guide transform
    if (ctx.canvasMgr.activeGuideTransformId) {
      ctx.canvasMgr.activeGuideTransformId = null;
    }

    return { handled: false };
  }

  /**
   * Handles dragging movements for guide-move, guide-pivot, and guide-rotate.
   */
  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point,
    activeHandle: GuideHandleType,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    if (activeHandle === 'guide-move' && ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const otherVertices = ctx.getOtherVertices();
        if (g.orientation === 'horizontal') {
          const rawTarget: Point = { x: pt.x, y: this.guideInitialState.position + dy };
          const snapped = ctx.snapPoint(rawTarget, otherVertices, g.id);
          g.position = Math.round(snapped.y);
          g.pivotY = g.position;
          this.currentRotationSnappedPt = Math.abs(snapped.y - rawTarget.y) > 0.001 ? snapped : null;
        } else if (g.orientation === 'vertical') {
          const rawTarget: Point = { x: this.guideInitialState.position + dx, y: pt.y };
          const snapped = ctx.snapPoint(rawTarget, otherVertices, g.id);
          g.position = Math.round(snapped.x);
          g.pivotX = g.position;
          this.currentRotationSnappedPt = Math.abs(snapped.x - rawTarget.x) > 0.001 ? snapped : null;
        } else {
          const vb = ctx.model.getViewBoxBounds();
          const origin = {
            x: vb.minX + (ctx.canvasMgr.rulerConfig.originX || 0),
            y: vb.minY + (ctx.canvasMgr.rulerConfig.originY || 0),
          };
          const res = ctx.canvasMgr.snapAngledGuideTranslation(
            g,
            this.guideInitialState,
            dragStartPt,
            pt,
            otherVertices,
            origin,
            vb
          );
          g.pivotX = res.pivotX;
          g.pivotY = res.pivotY;
          this.currentRotationSnappedPt = res.snappedPt;
        }
      }
      ctx.render();
      return true;
    }

    if (activeHandle === 'guide-pivot' && ctx.canvasMgr.selectedGuideId) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const otherVertices = ctx.getOtherVertices();
        const snapped = ctx.snapPoint(pt, otherVertices, g.id);
        g.pivotX = Math.round(snapped.x);
        g.pivotY = Math.round(snapped.y);
        if (g.orientation === 'horizontal') g.position = g.pivotY;
        if (g.orientation === 'vertical') g.position = g.pivotX;
      }
      ctx.render();
      return true;
    }

    if (activeHandle === 'guide-rotate' && ctx.canvasMgr.selectedGuideId) {
      callbacks.setCursor?.('grabbing');
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : ctx.model.canvas.width / 2);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : ctx.model.canvas.height / 2);

        const otherVertices = ctx.getOtherVertices();
        const snapped = ctx.snapPoint(pt, otherVertices, g.id);
        const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;

        this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

        const angleRad = Math.atan2(snapped.y - py, snapped.x - px);
        let deg = Math.round((angleRad * 180) / Math.PI);
        if (deg < 0) deg += 360;

        const shouldSnapAngular = e.shiftKey || (ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
        if (shouldSnapAngular) {
          deg = Math.round(deg / 15) * 15;
          deg = deg % 360;
        } else if (!isMagneticallySnapped) {
          const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
          for (const sa of snapAngles) {
            if (Math.abs(deg - sa) <= 3) {
              deg = sa % 360;
              break;
            }
          }
        }

        g.angle = deg;
        if (g.angle === 0 || g.angle === 180) {
          g.orientation = 'horizontal';
          g.position = g.pivotY;
        } else if (g.angle === 90 || g.angle === 270) {
          g.orientation = 'vertical';
          g.position = g.pivotX;
        } else {
          g.orientation = 'angled';
        }
      }
      ctx.render();
      return true;
    }

    return false;
  }

  /**
   * Finalizes guide dragging or checks for deletion upon dropping onto physical rulers.
   */
  public onPointerUp(
    ctx: ToolContext,
    e: PointerEvent,
    activeHandle: GuideHandleType,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (activeHandle === 'guide-move' && ctx.canvasMgr.selectedGuideId) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        let shouldDelete = false;
        if (ctx.isPointerOverRuler) {
          shouldDelete = ctx.isPointerOverRuler(e.clientX, e.clientY, g.orientation);
        } else if (ctx.canvasMgr.showRulers) {
          const topEl = document.getElementById('ruler-top-container');
          const leftEl = document.getElementById('ruler-left-container');
          const cornerEl = document.getElementById('ruler-corner');
          const isInside = (el: HTMLElement | null) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          };
          if (g.orientation === 'horizontal') {
            shouldDelete = isInside(topEl) || isInside(cornerEl);
          } else if (g.orientation === 'vertical') {
            shouldDelete = isInside(leftEl) || isInside(cornerEl);
          } else {
            shouldDelete = isInside(topEl) || isInside(leftEl) || isInside(cornerEl);
          }
        }

        if (shouldDelete) {
          ctx.canvasMgr.removeGuide(g.id);
          callbacks.onClearPanelMode?.();
          ctx.render();
          callbacks.syncMetadataToHost?.();
          this.guideInitialState = null;
          this.currentRotationSnappedPt = null;
          return true;
        }
      }
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      ctx.render();
      callbacks.syncMetadataToHost?.();
      return true;
    }

    if (activeHandle === 'guide-pivot' || activeHandle === 'guide-rotate') {
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      ctx.render();
      callbacks.syncMetadataToHost?.();
      return true;
    }

    return false;
  }

  /**
   * Double-clicking directly on a guide line opens its angle/pivot transform controls.
   */
  public onDoubleClick(ctx: ToolContext, pt: Point, callbacks: SelectToolCallbacks): boolean {
    const hitGuide = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
    if (hitGuide) {
      ctx.selectionTool.deselectAll();
      ctx.canvasMgr.selectedGuideId = hitGuide.id;
      ctx.canvasMgr.activeGuideTransformId = hitGuide.id;
      callbacks.onGuideSelected?.(hitGuide);
      ctx.render();
      return true;
    }
    return false;
  }

  /**
   * Cancels active guide drag and restores initial state.
   */
  public cancel(ctx: ToolContext): boolean {
    if (this.guideInitialState && ctx.canvasMgr.selectedGuideId) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        Object.assign(g, this.guideInitialState);
      }
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      return true;
    }
    this.currentRotationSnappedPt = null;
    return false;
  }

  /**
   * Renders ray from guideline pivot to snapped point when rotating a guideline.
   */
  public renderOverlay(ctx: ToolContext): string {
    if (!this.currentRotationSnappedPt || !ctx.canvasMgr.selectedGuideId) return '';
    const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
    if (!g) return '';

    const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : ctx.model.canvas.width / 2);
    const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : ctx.model.canvas.height / 2);
    const sp = this.currentRotationSnappedPt;

    return `<line x1="${px}" y1="${py}" x2="${sp.x}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
  }
}
