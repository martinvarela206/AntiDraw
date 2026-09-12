import { IToolHandler, ToolContext } from './IToolHandler.js';
import { Point, GradientConfig } from '../engine/VectorModel.js';
import { HandleType } from '../engine/SelectionTool.js';
import { GuideLine } from '../engine/CanvasManager.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { ToolType } from '../ui/Toolbar.js';
import { GuideInteraction, GuideHandleType } from './interactions/GuideInteraction.js';
import { BoxSelectInteraction } from './interactions/BoxSelectInteraction.js';
import { TranslateInteraction } from './interactions/TranslateInteraction.js';
import { TransformInteraction } from './interactions/TransformInteraction.js';

export interface SelectToolCallbacks {
  onSelectionChanged?: () => void;
  onGuideSelected?: (guide: GuideLine) => void;
  onClearPanelMode?: () => void;
  setCursor?: (cursor: string) => void;
  syncMetadataToHost?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: SelectToolHandler Modular Interaction Strategy
 *
 * 1. Interaction Strategy Segregation (SRP & Clean Architecture):
 *    Interaction modes have been completely decoupled into 4 dedicated strategy modules:
 *    - `GuideInteraction`: Guideline hit testing, angular transformation, pivot displacement, and deletion.
 *    - `BoxSelectInteraction`: Marquee selection initiation, box intersection testing, and overlay styling.
 *    - `TranslateInteraction`: Proximity anchor detection, solidary movement, and magnetic snapping.
 *    - `TransformInteraction`: Bounding box scaling, affine rotation around arbitrary pivots, and radial gradient handles.
 *
 * 2. Ghost Rendering Segregation:
 *    During move and transform operations, vector geometry modifications are maintained as ghost
 *    transformations until pointer release, avoiding document corruption and maintaining 60fps GPU rendering.
 *
 * 3. Unified Hit Testing & Precedence:
 *    Double-click and pointer interactions adhere to strict precedence:
 *    - Guide line controls (pivot and rotate arrows) take highest precedence.
 *    - Guide lines take precedence over underlying artboard vectors.
 *    - Existing selected vertices act as snap anchors before whole-element dragging.
 *    - Bounding box resize/rotation handles take precedence over element drag.
 */
export class SelectToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['select'];

  private isDragging: boolean = false;
  private dragStartPt: Point = { x: 0, y: 0 };
  private activeHandle:
    | HandleType
    | 'move'
    | 'marquee'
    | GuideHandleType
    | 'selection-pivot'
    | 'grad-radial-center'
    | 'grad-radial-radius'
    | 'grad-radial-radius-y'
    | 'grad-radial-focus'
    | null = null;

  public guideInteraction = new GuideInteraction();
  public boxSelectInteraction = new BoxSelectInteraction();
  public translateInteraction = new TranslateInteraction();
  public transformInteraction = new TransformInteraction();

  private lastClickTime: number = 0;
  private lastClickPt: Point = { x: 0, y: 0 };

  constructor(
    private ctx: ToolContext,
    private nodeEditorTool: NodeEditorTool,
    private callbacks: SelectToolCallbacks = {}
  ) {}

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    this.dragStartPt = pt;
    this.isDragging = true;

    // 1. Check Guide Line interactions (controls, rotation arrows, pivot, line body)
    const guideRes = this.guideInteraction.onPointerDown(this.ctx, pt, this.callbacks);
    if (guideRes.handled) {
      this.activeHandle = guideRes.activeHandle || null;
      return true;
    }

    const selectedEls = this.ctx.model.elements.filter((el) =>
      this.ctx.selectionTool.isSelected(el.id)
    );

    // 2. Modifier-based selection (Ctrl: Toggle select/deselect; Shift: Deselect)
    if (e.ctrlKey || e.metaKey) {
      const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, this.ctx.canvasMgr.zoom);
      if (hit) {
        this.ctx.selectionTool.toggleSelect(hit.element.id);
        this.callbacks.onClearPanelMode?.();
        this.callbacks.onSelectionChanged?.();
        this.ctx.render();
        return true;
      } else {
        // Ctrl + Drag on canvas: Marquee selection that adds to selection
        this.activeHandle = 'marquee';
        this.boxSelectInteraction.start(pt, this.ctx, false);
        return true;
      }
    }

    if (e.shiftKey) {
      const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, this.ctx.canvasMgr.zoom);
      if (hit) {
        this.ctx.selectionTool.deselect(hit.element.id);
        this.callbacks.onClearPanelMode?.();
        this.callbacks.onSelectionChanged?.();
        this.ctx.render();
        return true;
      } else {
        // Shift + Drag on canvas: Deselect marquee
        this.activeHandle = 'marquee';
        this.boxSelectInteraction.start(pt, this.ctx, true);
        return true;
      }
    }

    // 3. Check hit on Arbitrary Rotation Pivot marker (ONLY in 'rotate' mode)
    if (selectedEls.length > 0 && this.ctx.selectionTool.selectionMode === 'rotate') {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox && this.ctx.selectionTool.hitTestPivot(groupBox, pt, 8 / z)) {
        this.activeHandle = 'selection-pivot';
        this.transformInteraction.initialPivot = this.ctx.selectionTool.customPivot ? { ...this.ctx.selectionTool.customPivot } : null;
        this.callbacks.setCursor?.('move');
        this.ctx.renderOverlay();
        return true;
      }
    }

    // 4. Check hit on interactive radial gradient handles
    if (selectedEls.length === 1 && selectedEls[0].attributes['data-gradient']) {
      const el = selectedEls[0];
      try {
        const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
        if (grad.type === 'radial') {
          const box = this.ctx.selectionTool.getBoundingBox(el);
          if (box && box.width > 0 && box.height > 0) {
            const z = this.ctx.canvasMgr.zoom || 1;
            const hSize = 8 / z;
            const cx = box.x + (grad.cx ?? 0.5) * box.width;
            const cy = box.y + (grad.cy ?? 0.5) * box.height;
            const rx = (grad.rx ?? grad.r ?? 0.5) * box.width;
            const ry = (grad.ry ?? grad.r ?? 0.5) * box.height;
            const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
            const hx1 = cx + rx * Math.cos(rotRad);
            const hy1 = cy + rx * Math.sin(rotRad);
            const hx2 = cx - ry * Math.sin(rotRad);
            const hy2 = cy + ry * Math.cos(rotRad);
            const fx = box.x + (grad.fx ?? grad.cx ?? 0.5) * box.width;
            const fy = box.y + (grad.fy ?? grad.cy ?? 0.5) * box.height;
            const isCoincident = Math.hypot(fx - cx, fy - cy) < 4 / z;

            let handleType: any = null;
            let cursor = 'default';

            if (Math.hypot(pt.x - hx1, pt.y - hy1) <= hSize) {
              handleType = 'grad-radial-radius';
              cursor = 'ew-resize';
            } else if (Math.hypot(pt.x - hx2, pt.y - hy2) <= hSize) {
              handleType = 'grad-radial-radius-y';
              cursor = 'ns-resize';
            } else if (!isCoincident && Math.hypot(pt.x - fx, pt.y - fy) <= hSize) {
              handleType = 'grad-radial-focus';
              cursor = 'crosshair';
            } else if (Math.hypot(pt.x - cx, pt.y - cy) <= hSize) {
              handleType = e.altKey ? 'grad-radial-focus' : 'grad-radial-center';
              cursor = e.altKey ? 'crosshair' : 'move';
            }

            if (handleType) {
              this.activeHandle = handleType;
              this.transformInteraction.activeGradientElementId = el.id;
              this.transformInteraction.initialGradientJson = el.attributes['data-gradient'];
              this.callbacks.setCursor?.(cursor);
              this.ctx.renderOverlay();
              return true;
            }
          }
        }
      } catch {}
    }

    // 5. Check hit on bounding box handles (scale vs rotate)
    if (selectedEls.length > 0) {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox) {
        const handle = this.ctx.selectionTool.hitTestHandle(
          groupBox,
          pt,
          12 / z,
          18 / z,
          this.ctx.selectionTool.selectionMode
        );
        if (handle) {
          this.activeHandle = handle;
          if (handle === 'rotate') {
            const pivot = this.ctx.selectionTool.getPivot(groupBox);
            this.transformInteraction.startRotate(pivot, pt, selectedEls);
            this.callbacks.setCursor?.('grabbing');
          } else {
            this.transformInteraction.startScale(handle, groupBox, selectedEls);
          }
          this.ctx.render();
          return true;
        }
      }
    }

    // 6. Hit test vector elements under cursor
    const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, this.ctx.canvasMgr.zoom);

    // Case 1: Clicked on a different, unselected vector element -> switch selection
    if (hit && !this.ctx.selectionTool.isSelected(hit.element.id)) {
      this.ctx.selectionTool.select(hit.element.id, hit.element);
      this.callbacks.onSelectionChanged?.();

      const nowSelected = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      if (nowSelected.length > 0) {
        this.activeHandle = 'move';
        const z = this.ctx.canvasMgr.zoom || 1;
        const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(nowSelected, 6 / z);
        this.translateInteraction.start(this.ctx, pt, nowSelected, groupBox);
      }
      this.callbacks.onClearPanelMode?.();
      this.ctx.render();
      return true;
    }

    // Case 2: In both 'transform' and 'rotate' modes, clicking on a selected vector element
    // or within proximity threshold allows translation (FIX-23)
    if (selectedEls.length > 0) {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      const isHitSelected = hit && this.ctx.selectionTool.isSelected(hit.element.id);
      const isNearAnchor = this.translateInteraction.isNearSelectionAnchor(this.ctx, selectedEls, pt, groupBox, z);
      const isInsideBox =
        groupBox &&
        selectedEls.some((el) => el.attributes['fill'] && el.attributes['fill'] !== 'none') &&
        pt.x >= groupBox.x &&
        pt.x <= groupBox.x + groupBox.width &&
        pt.y >= groupBox.y &&
        pt.y <= groupBox.y + groupBox.height;

      /**
       * ARCHITECTURAL RATIONALE: Unified Vector Body Translation Across Selection Modes (FIX-23)
       *
       * 1. Single Responsibility & Symmetry:
       *    Selection modes ('transform' vs 'rotate') define the behavior of bounding box PERIMETER handles:
       *    - 'transform': perimeter handles scale the vector (nw, ne, se, sw, n, s, e, w).
       *    - 'rotate': perimeter handles rotate the vector around the pivot.
       *    The interior BODY of the vector represents the object itself. In professional graphics suites
       *    (CorelDraw, Illustrator, Figma), dragging the body of a selected vector must ALWAYS translate
       *    the object regardless of whether scale handles or rotation handles are active on the perimeter.
       *
       * 2. Eliminating Artificial Modal Barriers:
       *    Previously, clicking the selected vector in 'rotate' mode explicitly blocked translation
       *    (`this.isDragging = false; this.activeHandle = null; return true;`), forcing users to switch modes
       *    just to move an object. Unifying the move trigger here eliminates this barrier while preserving
       *    synthetic double-click alternation when clicking without dragging (handled in onPointerUp).
       */
      if (isHitSelected || isNearAnchor || isInsideBox) {
        this.activeHandle = 'move';
        this.translateInteraction.start(this.ctx, pt, selectedEls, groupBox);
        this.callbacks.onClearPanelMode?.();
        this.ctx.renderOverlay();
        return true;
      }
    }

    // Case 4: Clicked on empty canvas space: start Marquee selection
    const hadSelection =
      this.ctx.selectionTool.selectedElementIds.size > 0 ||
      this.ctx.canvasMgr.selectedGuideId !== null ||
      this.nodeEditorTool.selectedVertexId !== null;

    this.ctx.selectionTool.deselectAll();
    this.ctx.canvasMgr.selectedGuideId = null;
    this.ctx.canvasMgr.activeGuideTransformId = null;
    this.nodeEditorTool.selectedVertexId = null;
    this.activeHandle = 'marquee';
    this.boxSelectInteraction.start(pt, this.ctx, false);
    this.callbacks.onClearPanelMode?.();
    this.callbacks.onSelectionChanged?.();
    this.ctx.canvasMgr.isCanvasSelected = true;

    if (hadSelection) {
      this.ctx.render();
    }
    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    if (!this.isDragging || !this.activeHandle) {
      // 1. Guide hover cursor
      const guideCursor = this.guideInteraction.getHoverCursor(this.ctx, pt);
      if (guideCursor) {
        this.callbacks.setCursor?.(guideCursor);
        return true;
      }

      const selectedEls = this.ctx.model.elements.filter((el) =>
        this.ctx.selectionTool.isSelected(el.id)
      );

      // 2. Transform handles hover cursor
      let cursor = this.transformInteraction.getHoverCursor(this.ctx, pt, selectedEls) || 'default';

      // 3. Vector element hover cursor
      if (cursor === 'default') {
        const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt);
        this.ctx.selectionTool.hoveredElementId = hit ? hit.element.id : null;
        if (hit) {
          cursor = 'move';
        }
      }

      this.callbacks.setCursor?.(cursor);
      this.ctx.renderOverlay();
      return true;
    }

    // Active dragging delegations
    if (this.activeHandle === 'guide-move' || this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate') {
      return this.guideInteraction.onPointerMove(this.ctx, pt, this.dragStartPt, this.activeHandle, e, this.callbacks);
    }

    if (this.activeHandle === 'marquee') {
      return this.boxSelectInteraction.onPointerMove(this.ctx, pt);
    }

    if (this.activeHandle === 'move') {
      return this.translateInteraction.onPointerMove(this.ctx, pt, this.dragStartPt);
    }

    // Otherwise, handle scale, rotate, pivot, gradient transformations
    return this.transformInteraction.onPointerMove(
      this.ctx,
      pt,
      this.dragStartPt,
      this.activeHandle,
      e,
      this.callbacks
    );
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (!this.isDragging) return false;
    this.isDragging = false;
    const currentHandle = this.activeHandle;
    this.activeHandle = null;

    if (
      currentHandle === 'guide-move' ||
      currentHandle === 'guide-pivot' ||
      currentHandle === 'guide-rotate'
    ) {
      return this.guideInteraction.onPointerUp(this.ctx, e, currentHandle, this.callbacks);
    }

    if (currentHandle === 'marquee') {
      return this.boxSelectInteraction.onPointerUp(this.ctx, e, this.callbacks);
    }

    if (currentHandle === 'move') {
      const moved = this.translateInteraction.onPointerUp(this.ctx, this.callbacks);
      if (!moved) {
        /**
         * ARCHITECTURAL RATIONALE: Synthetic Double-Click Detection (FIX-22)
         * In complex SVG webview editors, native DOM `dblclick` events are frequently dropped by browsers
         * if the event target node is re-rendered or unmounted during mousedown/mouseup cycles,
         * or if pointer capture is acquired.
         * Tracking click timestamps and coordinates here guarantees 100% reliable double-click detection
         * to alternate between 'transform' and 'rotate' modes without event loss.
         */
        const now = Date.now();
        const z = this.ctx.canvasMgr.zoom || 1;
        const dist = Math.hypot(pt.x - this.lastClickPt.x, pt.y - this.lastClickPt.y);
        if (now - this.lastClickTime < 350 && dist < 8 / z) {
          this.transformInteraction.toggleSelectionMode(this.ctx, this.callbacks);
          this.lastClickTime = 0;
        } else {
          this.lastClickTime = now;
          this.lastClickPt = { x: pt.x, y: pt.y };
        }
      } else {
        this.lastClickTime = 0;
      }
      return true;
    }

    if (currentHandle) {
      return this.transformInteraction.onPointerUp(this.ctx, currentHandle, this.callbacks);
    }

    return true;
  }

  public onDoubleClick(e: MouseEvent, pt: Point): boolean {
    if (this.transformInteraction.onDoubleClick(this.ctx, pt, this.callbacks)) {
      return true;
    }
    if (this.guideInteraction.onDoubleClick(this.ctx, pt, this.callbacks)) {
      return true;
    }
    return false;
  }

  public cancel(): boolean {
    let handled = false;
    if (this.boxSelectInteraction.cancel(this.ctx)) handled = true;
    if (this.guideInteraction.cancel(this.ctx)) handled = true;
    if (this.translateInteraction.cancel()) handled = true;
    if (this.transformInteraction.cancel(this.ctx)) handled = true;

    this.activeHandle = null;
    this.isDragging = false;
    this.ctx.renderOverlay();
    return handled;
  }

  public renderOverlay(zoom: number): string {
    let html = '';

    // 1. Marquee selection rectangle
    html += this.boxSelectInteraction.renderOverlay(this.ctx);

    // 2. Hover highlight border
    if (
      this.ctx.selectionTool.hoveredElementId &&
      !this.ctx.selectionTool.isSelected(this.ctx.selectionTool.hoveredElementId)
    ) {
      const hEl = this.ctx.model.elements.find((e) => e.id === this.ctx.selectionTool.hoveredElementId);
      if (hEl && hEl.vertices) {
        const isClosed = this.ctx.model.isElementClosed(hEl);
        const d = this.ctx.model.compilePathD(hEl.vertices, isClosed);
        html += `<path d="${d}" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4 2" opacity="0.8" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 3. Transform & Rotate handles, Pivot marker, Gradient vector overlay
    html += this.transformInteraction.renderOverlay(
      this.ctx,
      zoom,
      this.activeHandle,
      this.translateInteraction.ghostDragOffset
    );

    // 4. Ghost Move Vector and Bounding Box
    html += this.translateInteraction.renderGhostOverlay(this.ctx);

    // 5. Guide line rotation ray overlay
    html += this.guideInteraction.renderOverlay(this.ctx);

    return html;
  }
}
