import { ToolContext } from '../IToolHandler.js';
import { Point } from '../../engine/VectorModel.js';
import { GuideLine } from '../../engine/CanvasManager.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';
import { GuideHelper } from '../../engine/canvas/helpers/index.js';

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
  public ghostGuideState: GuideLine | null = null;
  public activeRotateArrowIdx: 1 | 2 = 1;
  public currentRotationSnappedPt: Point | null = null;

  private lastGuideClickTime: number = 0;
  private lastGuideClickPt: Point = { x: 0, y: 0 };
  private guideDragStartPt: Point = { x: 0, y: 0 };
  private guideHasMoved: boolean = false;
  private lastToggleTime: number = 0;

  /**
   * Hover cursor evaluation for active guide transformation controls and guide lines.
   */
  public getHoverCursor(ctx: ToolContext, pt: Point): string | null {
    if (ctx.canvasMgr.selectedGuideId) {
      const activeG = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (activeG) {
        const geom = ctx.canvasMgr.getGuideGeometry(activeG, ctx.model.canvas.width, ctx.model.canvas.height);
        const isRotateMode = activeG.mode === 'rotate';
        const centerPt = geom.pivot;

        const z = ctx.canvasMgr.zoom || 1;

        if (Math.hypot(pt.x - centerPt.x, pt.y - centerPt.y) <= 14 / z) {
          return 'move';
        }
        if (isRotateMode) {
          if (
            Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 / z ||
            Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16 / z
          ) {
            return 'grab';
          }
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
    callbacks: SelectToolCallbacks,
    isAdditive: boolean = false
  ): { handled: boolean; activeHandle?: GuideHandleType } {
    this.guideDragStartPt = { ...pt };
    this.guideHasMoved = false;

    // 1. Check controls on already selected Guide Line
    if (ctx.canvasMgr.selectedGuideId) {
      const activeG = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (activeG) {
        const geom = ctx.canvasMgr.getGuideGeometry(activeG, ctx.model.canvas.width, ctx.model.canvas.height);
        const isRotateMode = activeG.mode === 'rotate';
        const centerPt = geom.pivot;
        const z = ctx.canvasMgr.zoom || 1;

        // ARCHITECTURAL RATIONALE: Magnetic Cursor Snap to Guide Center Handle
        // In Move mode, if the cursor is in close proximity to the center handle,
        // snap the cursor directly to the center coordinate for flawless single-click acquisition.
        const centerDist = Math.hypot(pt.x - centerPt.x, pt.y - centerPt.y);
        const centerSnapRadius = 18 / z;
        if (centerDist <= centerSnapRadius) {
          pt = { ...centerPt };
          this.guideInitialState = { ...activeG };
          ctx.render();
          return { handled: true, activeHandle: 'guide-pivot' };
        }

        // In rotate mode, check arrows click
        if (isRotateMode) {
          if (Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 / z) {
            this.activeRotateArrowIdx = 1;
            this.guideInitialState = { ...activeG };
            ctx.render();
            return { handled: true, activeHandle: 'guide-rotate' };
          }
          if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16 / z) {
            this.activeRotateArrowIdx = 2;
            this.guideInitialState = { ...activeG };
            ctx.render();
            return { handled: true, activeHandle: 'guide-rotate' };
          }
        }

        // Check click on the active guide line body
        const hitActive = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
        if (hitActive && ctx.canvasMgr.isGuideSelected(hitActive.id)) {
          this.guideInitialState = { ...hitActive };
          ctx.render();
          return { handled: true, activeHandle: 'guide-move' };
        }
      }
    }

    // 2. Check clicking on any other Guide Line to select it (starts in move mode)
    const hitGuide = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
    if (hitGuide) {
      if (isAdditive) {
        ctx.canvasMgr.toggleSelectGuide(hitGuide.id);
      } else {
        ctx.selectionTool.deselectAll();
        ctx.canvasMgr.selectGuide(hitGuide.id, false);
      }
      if (!hitGuide.mode) {
        hitGuide.mode = 'move';
      }
      ctx.canvasMgr.activeGuideTransformId = hitGuide.mode === 'rotate' ? hitGuide.id : null;
      this.guideInitialState = { ...hitGuide };
      const allSelected = ctx.canvasMgr.getSelectedGuides();
      callbacks.onGuideSelected?.(allSelected.length > 0 ? (allSelected.length === 1 ? allSelected[0] : allSelected) : hitGuide);

      const geom = ctx.canvasMgr.getGuideGeometry(hitGuide, ctx.model.canvas.width, ctx.model.canvas.height);
      const centerPt = geom.pivot;
      let activeHandle: GuideHandleType = 'guide-move';
      const centerDist = Math.hypot(pt.x - centerPt.x, pt.y - centerPt.y);
      const centerSnapRadius = 18 / (ctx.canvasMgr.zoom || 1);
      if (centerDist <= centerSnapRadius) {
        pt = { ...centerPt };
        activeHandle = 'guide-pivot';
      }

      ctx.render();
      return { handled: true, activeHandle };
    }

    // 3. Clicked somewhere else: clear active guide selection
    if (ctx.canvasMgr.selectedGuideId) {
      ctx.canvasMgr.clearSelectedGuides();
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
    const moveDist = Math.hypot(pt.x - this.guideDragStartPt.x, pt.y - this.guideDragStartPt.y);
    if (moveDist > 3 / (ctx.canvasMgr.zoom || 1)) {
      this.guideHasMoved = true;
    }

    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    if (activeHandle === 'guide-move' && ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const otherVertices = ctx.getOtherVertices();
        const ghost: GuideLine = { ...this.guideInitialState };
        if (g.orientation === 'horizontal') {
          const rawTarget: Point = {
            x: (this.guideInitialState.pivotX ?? pt.x) + dx,
            y: this.guideInitialState.position + dy,
          };
          const snapped = ctx.snapPoint(rawTarget, otherVertices, g.id);
          ghost.position = Math.round(snapped.y);
          ghost.pivotY = ghost.position;
          ghost.pivotX = Math.round((this.guideInitialState.pivotX ?? pt.x) + dx);
          this.currentRotationSnappedPt = Math.abs(snapped.y - rawTarget.y) > 0.001 ? snapped : null;
        } else if (g.orientation === 'vertical') {
          const rawTarget: Point = {
            x: this.guideInitialState.position + dx,
            y: (this.guideInitialState.pivotY ?? pt.y) + dy,
          };
          const snapped = ctx.snapPoint(rawTarget, otherVertices, g.id);
          ghost.position = Math.round(snapped.x);
          ghost.pivotX = ghost.position;
          ghost.pivotY = Math.round((this.guideInitialState.pivotY ?? pt.y) + dy);
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
          ghost.pivotX = res.pivotX;
          ghost.pivotY = res.pivotY;
          this.currentRotationSnappedPt = res.snappedPt;
        }
        this.ghostGuideState = ghost;
      }
      ctx.render();
      return true;
    }

    if (activeHandle === 'guide-pivot' && ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const ghost: GuideLine = { ...this.guideInitialState };
        if (!g.mode || g.mode === 'move') {
          // ARCHITECTURAL RATIONALE: Move Mode Center Snapping
          // Translating the guideline by its visual center snaps the guideline directly
          // to any target element (grids, other vertices, viewBox bounds, guides) in both axes.
          const otherVertices = ctx.getOtherVertices();
          const snapped = ctx.snapPoint(pt, otherVertices, g.id);
          const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;
          this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

          ghost.pivotX = Math.round(snapped.x);
          ghost.pivotY = Math.round(snapped.y);
          if (ghost.orientation === 'horizontal') ghost.position = ghost.pivotY;
          if (ghost.orientation === 'vertical') ghost.position = ghost.pivotX;
        } else {
          // ARCHITECTURAL RATIONALE: Rotate Mode Constrained Pivot Axis Dragging
          // In Rotate mode, the center pivot handle defines the rotation pivot and has
          // an enforced snap-to strictly along the guide line axis. It cannot shift or translate
          // the guide line off-axis. Any cursor position is projected onto the infinite line P0 + t * u.
          const rad = ((g.angle || 0) * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const px0 = g.orientation === 'vertical' ? g.position : (this.guideInitialState.pivotX ?? ctx.model.canvas.width / 2);
          const py0 = g.orientation === 'horizontal' ? g.position : (this.guideInitialState.pivotY ?? ctx.model.canvas.height / 2);

          const otherVertices = ctx.getOtherVertices();
          const snapped = ctx.snapPoint(pt, otherVertices, g.id);
          const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;
          this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

          const targetPt = isMagneticallySnapped ? snapped : pt;
          const t = (targetPt.x - px0) * cos + (targetPt.y - py0) * sin;

          ghost.pivotX = Math.round(px0 + t * cos);
          ghost.pivotY = Math.round(py0 + t * sin);
        }
        this.ghostGuideState = ghost;
      }
      ctx.render();
      return true;
    }

    if (activeHandle === 'guide-rotate' && ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      callbacks.setCursor?.('grabbing');
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const ghost: GuideLine = { ...this.guideInitialState };
        const px = this.guideInitialState.pivotX ?? (this.guideInitialState.orientation === 'vertical' ? this.guideInitialState.position : ctx.model.canvas.width / 2);
        const py = this.guideInitialState.pivotY ?? (this.guideInitialState.orientation === 'horizontal' ? this.guideInitialState.position : ctx.model.canvas.height / 2);

        const otherVertices = ctx.getOtherVertices();
        const snapped = ctx.snapPoint(pt, otherVertices, g.id);
        const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;

        this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

        const angleRad = Math.atan2(snapped.y - py, snapped.x - px);
        let deg = Math.round((angleRad * 180) / Math.PI);
        if (deg < 0) deg += 360;

        if (this.activeRotateArrowIdx === 1) {
          deg = (deg + 180) % 360;
        }

        // ARCHITECTURAL RATIONALE: 15° Quantization with Ctrl modifier
        // Supports continuous free rotation by default, or 15° discrete stepping when
        // holding Ctrl (or Meta / Shift / angular snap active).
        const shouldSnapAngular = e.ctrlKey || e.metaKey || e.shiftKey || (ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
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

        ghost.angle = deg;
        if (ghost.angle === 0 || ghost.angle === 180) {
          ghost.orientation = 'horizontal';
          ghost.position = ghost.pivotY ?? py;
        } else if (ghost.angle === 90 || ghost.angle === 270) {
          ghost.orientation = 'vertical';
          ghost.position = ghost.pivotX ?? px;
        } else {
          ghost.orientation = 'angled';
        }
        this.ghostGuideState = ghost;
      }
      ctx.render();
      return true;
    }

    return false;
  }

  /**
   * Finalizes guide dragging or checks for deletion upon dropping onto physical rulers.
   * Also implements synthetic double-click detection for guideline bimodal toggle (move vs rotate).
   */
  public onPointerUp(
    ctx: ToolContext,
    e: PointerEvent,
    pt: Point,
    activeHandle: GuideHandleType,
    callbacks: SelectToolCallbacks
  ): boolean {
    const moved = this.guideHasMoved;
    this.guideHasMoved = false;

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
          ctx.pushUndo();
          ctx.canvasMgr.removeGuide(g.id);
          callbacks.onClearPanelMode?.();
          ctx.render();
          callbacks.syncMetadataToHost?.();
          this.guideInitialState = null;
          this.ghostGuideState = null;
          this.currentRotationSnappedPt = null;
          this.lastGuideClickTime = 0;
          return true;
        }
      }
    }

    if (this.ghostGuideState && ctx.canvasMgr.selectedGuideId) {
      const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        if (this.guideInitialState) {
          const init = this.guideInitialState;
          const cur = this.ghostGuideState;
          const changed =
            init.position !== cur.position ||
            init.angle !== cur.angle ||
            init.pivotX !== cur.pivotX ||
            init.pivotY !== cur.pivotY ||
            init.orientation !== cur.orientation;

          /**
           * ARCHITECTURAL RATIONALE: Undo/Redo Integration for Guideline Transformations (ITEM-05)
           * When moving, rotating, or displacing the pivot of a guideline, temporarily reverts to
           * the pre-drag geometry snapshot to record a clean undo step before committing the new state.
           */
          if (changed) {
            Object.assign(g, init);
            ctx.pushUndo();
            Object.assign(g, cur);
          } else {
            Object.assign(g, cur);
          }
        } else {
          Object.assign(g, this.ghostGuideState);
        }
        callbacks.onGuideSelected?.(g);
      }
    }

    this.guideInitialState = null;
    this.ghostGuideState = null;
    this.currentRotationSnappedPt = null;

    if (!moved) {
      /**
       * ARCHITECTURAL RATIONALE: Synthetic Double-Click Detection on Guidelines
       * Browsers drop native DOM `dblclick` events when `overlaySvg.innerHTML` is re-rendered
       * during pointerdown/pointerup cycles, as the clicked SVG nodes are unmounted.
       * Tracking click timestamps and coordinates here guarantees 100% reliable double-click
       * detection to alternate guidelines between 'move' and 'rotate' modes.
       */
      const now = Date.now();
      const z = ctx.canvasMgr.zoom || 1;
      const clickDist = Math.hypot(pt.x - this.lastGuideClickPt.x, pt.y - this.lastGuideClickPt.y);
      if (now - this.lastGuideClickTime < 350 && clickDist < 10 / z) {
        this.lastGuideClickTime = 0;
        if (ctx.canvasMgr.selectedGuideId) {
          const g = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
          if (g) {
            return this.toggleGuideMode(ctx, g, callbacks);
          }
        }
      } else {
        this.lastGuideClickTime = now;
        this.lastGuideClickPt = { x: pt.x, y: pt.y };
      }
    } else {
      this.lastGuideClickTime = 0;
    }

    ctx.render();
    callbacks.syncMetadataToHost?.();
    return true;
  }

  /**
   * ARCHITECTURAL RATIONALE: Bimodal Guide Mode Alternation
   * Alternates between 'move' mode (single center reticle handle with universal 2D translation and snapping)
   * and 'rotate' mode (pivot positioning + rotation arrow indicators at 1/4 and 3/4 visible span).
   * Incorporates a debouncing guard to prevent dual invocation if native DOM `dblclick` fires
   * in tandem with synthetic double-click detection.
   */
  public toggleGuideMode(ctx: ToolContext, guide: GuideLine, callbacks: SelectToolCallbacks): boolean {
    const now = Date.now();
    if (now - this.lastToggleTime < 150) {
      return true;
    }
    this.lastToggleTime = now;
    this.lastGuideClickTime = 0;

    guide.mode = guide.mode === 'rotate' ? 'move' : 'rotate';
    ctx.canvasMgr.activeGuideTransformId = guide.mode === 'rotate' ? guide.id : null;
    callbacks.onGuideSelected?.(guide);
    ctx.render();
    callbacks.syncMetadataToHost?.();
    return true;
  }

  /**
   * ARCHITECTURAL RATIONALE: Bimodal Double-Click Toggle (Move vs Rotate Mode)
   * Double-clicking directly on a guide line or its center handle alternates between:
   * 1. 'move' mode: Only the center handle is displayed for translation and snapping.
   * 2. 'rotate' mode: Center handle acts as the pivot and rotation arrow indicators appear at 1/4 & 3/4.
   * This matches the bimodal paradigm of vector selection (transform vs rotate).
   */
  public onDoubleClick(ctx: ToolContext, pt: Point, callbacks: SelectToolCallbacks): boolean {
    const z = ctx.canvasMgr.zoom || 1;
    if (ctx.canvasMgr.selectedGuideId) {
      const activeG = ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (activeG) {
        const geom = ctx.canvasMgr.getGuideGeometry(activeG, ctx.model.canvas.width, ctx.model.canvas.height);
        const onCenter = Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 18 / z;
        const onArrow = activeG.mode === 'rotate' && (
          Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 18 / z ||
          Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 18 / z
        );
        const hitActive = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
        const onLine = hitActive && hitActive.id === activeG.id;
        if (onCenter || onArrow || onLine) {
          return this.toggleGuideMode(ctx, activeG, callbacks);
        }
      }
    }

    const hitGuide = ctx.canvasMgr.hitTestGuide(pt, ctx.model.canvas.width, ctx.model.canvas.height, 8);
    if (hitGuide) {
      ctx.selectionTool.deselectAll();
      ctx.canvasMgr.selectedGuideId = hitGuide.id;
      return this.toggleGuideMode(ctx, hitGuide, callbacks);
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
      this.ghostGuideState = null;
      this.currentRotationSnappedPt = null;
      return true;
    }
    this.ghostGuideState = null;
    this.currentRotationSnappedPt = null;
    return false;
  }

  /**
   * Renders ghost guideline, ghost transform handles, and ray from pivot to snapped point.
   */
  public renderOverlay(ctx: ToolContext): string {
    let html = '';

    if (this.ghostGuideState) {
      const z = ctx.canvasMgr.zoom || 1;
      const vb = ctx.model.getViewBoxBounds();
      const visibleBounds = ctx.canvasMgr.visibleBoundsProvider?.() || {
        minX: vb.minX - 500,
        minY: vb.minY - 500,
        maxX: vb.minX + vb.width + 500,
        maxY: vb.minY + vb.height + 500,
      };
      const geom = ctx.canvasMgr.getGuideGeometry(
        this.ghostGuideState,
        ctx.model.canvas.width,
        ctx.model.canvas.height,
        visibleBounds
      );
      const isRotate = this.ghostGuideState.mode === 'rotate';
      const ghostColor = '#00f0ff';

      if (geom.p1.x !== geom.p2.x || geom.p1.y !== geom.p2.y) {
        html += `<line x1="${geom.p1.x}" y1="${geom.p1.y}" x2="${geom.p2.x}" y2="${geom.p2.y}" stroke="${ghostColor}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;
      }

      html += GuideHelper.renderCenterHandle(geom.pivot.x, geom.pivot.y, ghostColor, z);

      if (isRotate) {
        const arrowRot = this.ghostGuideState.angle || 0;
        html += GuideHelper.renderRotationArrow(geom.arrow1.x, geom.arrow1.y, arrowRot, false, ghostColor, z);
        html += GuideHelper.renderRotationArrow(geom.arrow2.x, geom.arrow2.y, arrowRot, true, ghostColor, z);
      }
    }

    if (this.currentRotationSnappedPt && ctx.canvasMgr.selectedGuideId) {
      const g = this.ghostGuideState || ctx.canvasMgr.getGuide(ctx.canvasMgr.selectedGuideId);
      if (g) {
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : ctx.model.canvas.width / 2);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : ctx.model.canvas.height / 2);
        const sp = this.currentRotationSnappedPt;
        html += `<line x1="${px}" y1="${py}" x2="${sp.x}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
      }
    }

    return html;
  }
}

