import { IToolHandler, ToolContext } from './IToolHandler.js';
import { VectorElement, PathVertex, Point, GradientConfig } from '../engine/VectorModel.js';
import { HandleType } from '../engine/SelectionTool.js';
import { GuideLine } from '../engine/CanvasManager.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { ToolType } from '../ui/Toolbar.js';

export interface SelectToolCallbacks {
  onSelectionChanged?: () => void;
  onGuideSelected?: (guide: GuideLine) => void;
  onClearPanelMode?: () => void;
  setCursor?: (cursor: string) => void;
  syncMetadataToHost?: () => void;
}

/**
 * ARCHITECTURAL RATIONALE: SelectToolHandler Decoupling
 *
 * 1. State Isolation:
 *    The selection tool manages complex ephemeral interactions: affine transformations (scale, rotate),
 *    solidary translation with vertex snap anchors, multi-selection marquee rectangles, and guide line
 *    manipulation (move, pivot, rotation). Encapsulating these ephemeral states in `SelectToolHandler`
 *    prevents state leakage into `main.ts` and simplifies undo/redo boundaries.
 *
 * 2. Ghost Rendering Segregation:
 *    During move and transform operations, vector geometry modifications are maintained as ghost
 *    transformations (`ghostDragOffset`, `ghostTransformMap`) until pointer release. This avoids
 *    destabilizing the real document model and ensures snappy 60fps GPU rendering in the overlay SVG.
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
  private dragAnchorPt: Point = { x: 0, y: 0 };
  private activeHandle:
    | HandleType
    | 'move'
    | 'marquee'
    | 'guide-move'
    | 'guide-pivot'
    | 'guide-rotate'
    | 'selection-pivot'
    | 'grad-radial-center'
    | 'grad-radial-radius'
    | 'grad-radial-radius-y'
    | 'grad-radial-focus'
    | null = null;

  /**
   * ARCHITECTURAL RATIONALE: State management for interactive radial gradient manipulation
   * - `activeGradientElementId`: Identifies the exact element owning the radial gradient being transformed.
   * - `initialGradientJson`: Stores the JSON serialization of `data-gradient` prior to dragging.
   *   This enables atomic undo history (recording the pre-drag snapshot only upon pointer release)
   *   as well as clean cancellation upon Escape.
   * - Real-time DOM attribute synchronization:
   *   During pointer drag, coordinates (cx, cy, r, fx, fy) are updated directly on the existing SVG
   *   `<radialGradient>` element in the DOM defs alongside `renderOverlay()`. This prevents destructive
   *   re-parsing of the entire SVG canvas and maintains 60fps responsiveness without losing input focus.
   */
  private activeGradientElementId: string | null = null;
  private initialGradientJson: string | null = null;

  /**
   * ARCHITECTURAL RATIONALE: State management for arbitrary pivot rotation
   * `rotationPivot` captures the exact anchor coordinate `(pivot.x, pivot.y)` at the instant rotation begins.
   * `initialRotationAngle` captures `atan2(dragStartPt - pivot)` so that dragging produces a continuous delta angle.
   * Isolating these variables ensures numerical stability during rapid pointer movements and prevents angle drift.
   */
  private rotationPivot: Point | null = null;
  private initialRotationAngle: number = 0;
  private initialPivot: Point | null = null;
  private lastDeltaAngle: number = 0;
  private currentRotationSnappedPt: Point | null = null;

  private initialElementsMap: Map<string, PathVertex[]> = new Map();
  private initialBox: any = null;
  private ghostDragOffset: Point | null = null;
  private ghostTransformMap: Map<string, PathVertex[]> = new Map();
  private marqueeStartPt: Point | null = null;

  private guideInitialState: GuideLine | null = null;
  private activeRotateArrowIdx: 1 | 2 = 1;

  constructor(
    private ctx: ToolContext,
    private nodeEditorTool: NodeEditorTool,
    private callbacks: SelectToolCallbacks = {}
  ) {}

  /**
   * ARCHITECTURAL RATIONALE: Proximity Anchor Detection (FIX-05)
   * Evaluates all vertices of the selected elements and the group bounding box pivot/center.
   * If any vertex or the center is within `20 / zoom` pixels of `pt`, the closest one is returned
   * as the definitive magnetic anchor coordinate for translation (`dragAnchorPt`).
   * This guarantees zero-tolerance magnetic snapping to grid, guidelines, and other vertices
   * without requiring pixel-perfect clicking directly on sub-pixel vertex handles.
   */
  private findClosestMoveAnchor(
    selectedEls: VectorElement[],
    pt: Point,
    groupBox: any,
    zoom: number
  ): Point {
    const threshold = 20 / (zoom || 1);
    let bestPt: Point = { x: pt.x, y: pt.y };
    let bestDist = threshold;

    if (groupBox) {
      const pivot = this.ctx.selectionTool.getPivot(groupBox);
      const dPivot = Math.hypot(pt.x - pivot.x, pt.y - pivot.y);
      if (dPivot < bestDist) {
        bestDist = dPivot;
        bestPt = { x: pivot.x, y: pivot.y };
      }
    }

    for (const el of selectedEls) {
      if (el.vertices) {
        for (const v of el.vertices) {
          const d = Math.hypot(pt.x - v.x, pt.y - v.y);
          if (d < bestDist) {
            bestDist = d;
            bestPt = { x: v.x, y: v.y };
          }
        }
      }
    }

    return bestPt;
  }

  private isNearSelectionAnchor(
    selectedEls: VectorElement[],
    pt: Point,
    groupBox: any,
    zoom: number
  ): boolean {
    const threshold = 20 / (zoom || 1);
    if (groupBox) {
      const pivot = this.ctx.selectionTool.getPivot(groupBox);
      if (Math.hypot(pt.x - pivot.x, pt.y - pivot.y) <= threshold) {
        return true;
      }
    }
    for (const el of selectedEls) {
      if (el.vertices) {
        for (const v of el.vertices) {
          if (Math.hypot(pt.x - v.x, pt.y - v.y) <= threshold) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    this.dragStartPt = pt;
    this.isDragging = true;

    // 1. Check if clicking on active Guide Transform controls (pivot or curved arrows)
    if (this.ctx.canvasMgr.activeGuideTransformId) {
      const activeG = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.activeGuideTransformId);
      if (activeG) {
        const geom = this.ctx.canvasMgr.getGuideGeometry(activeG, this.ctx.model.canvas.width, this.ctx.model.canvas.height);

        // Check pivot click
        if (Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 14) {
          this.activeHandle = 'guide-pivot';
          this.guideInitialState = { ...activeG };
          this.ctx.render();
          return true;
        }

        // Check arrow 1 click
        if (Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16) {
          this.activeHandle = 'guide-rotate';
          this.activeRotateArrowIdx = 1;
          this.guideInitialState = { ...activeG };
          this.ctx.render();
          return true;
        }

        // Check arrow 2 click
        if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16) {
          this.activeHandle = 'guide-rotate';
          this.activeRotateArrowIdx = 2;
          this.guideInitialState = { ...activeG };
          this.ctx.render();
          return true;
        }

        // Check click anywhere on the active transforming guide line away from the pivot & arrows: drag to move
        const hitActive = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 8);
        if (hitActive && hitActive.id === activeG.id) {
          this.activeHandle = 'guide-move';
          this.guideInitialState = { ...activeG };
          this.ctx.render();
          return true;
        }
      }
    }

    // 2. Check if clicking on any Guide Line to select it and activate rotation controls immediately
    // ARCHITECTURAL RATIONALE: Differentiated Guide Transformation & Translation
    // Clicking on the central pivot node translates the pivot ('guide-pivot').
    // Clicking on the outer curved arrows activates rotational angle steering ('guide-rotate').
    // Clicking anywhere on the remaining body of the guide line executes parallel translation ('guide-move').
    // This resolves the ambiguity where attempting to translate a guideline inadvertently spun it off-axis.
    const hitGuide = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 8);
    if (hitGuide) {
      this.ctx.selectionTool.deselectAll();
      this.ctx.canvasMgr.selectedGuideId = hitGuide.id;
      this.ctx.canvasMgr.activeGuideTransformId = hitGuide.id;
      this.guideInitialState = { ...hitGuide };
      this.callbacks.onGuideSelected?.(hitGuide);

      const geom = this.ctx.canvasMgr.getGuideGeometry(hitGuide, this.ctx.model.canvas.width, this.ctx.model.canvas.height);
      if (Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 14) {
        this.activeHandle = 'guide-pivot';
      } else if (
        Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 ||
        Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16
      ) {
        this.activeHandle = 'guide-rotate';
        if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16) {
          this.activeRotateArrowIdx = 2;
        } else {
          this.activeRotateArrowIdx = 1;
        }
      } else {
        this.activeHandle = 'guide-move';
      }

      this.ctx.render();
      return true;
    }

    // 3. Clicked somewhere else: clear active guide transform
    if (this.ctx.canvasMgr.activeGuideTransformId) {
      this.ctx.canvasMgr.activeGuideTransformId = null;
    }

    const selectedEls = this.ctx.model.elements.filter((el) =>
      this.ctx.selectionTool.isSelected(el.id)
    );

    // 4. Modifier-based selection (Ctrl: Toggle select/deselect; Shift: Deselect)
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
        this.marqueeStartPt = pt;
        this.activeHandle = 'marquee';
        this.ctx.selectionTool.isDeselectMarquee = false;
        this.ctx.render();
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
        this.marqueeStartPt = pt;
        this.activeHandle = 'marquee';
        this.ctx.selectionTool.isDeselectMarquee = true;
        this.ctx.render();
        return true;
      }
    }

    // 4a. Check hit directly on the Arbitrary Rotation Pivot marker (ONLY in 'rotate' mode)
    // ARCHITECTURAL RATIONALE: Bimodal Pivot Interactivity (FIX-05)
    // In 'transform' mode, the pivot is a fixed visual reference and not reubicable.
    // In 'rotate' mode, the pivot becomes fully interactive and magnetically relocatable.
    if (selectedEls.length > 0 && this.ctx.selectionTool.selectionMode === 'rotate') {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox && this.ctx.selectionTool.hitTestPivot(groupBox, pt, 8 / z)) {
        this.activeHandle = 'selection-pivot';
        this.isDragging = true;
        this.dragStartPt = pt;
        this.initialPivot = this.ctx.selectionTool.customPivot ? { ...this.ctx.selectionTool.customPivot } : null;
        this.callbacks.setCursor?.('move');
        this.ctx.renderOverlay();
        return true;
      }
    }

    // 4a2. Check hit on interactive radial gradient handles (radius perimeter, distinct focus, center/alt-focus)
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

            // Priority 1: Radius X handle (primary axis, blue circle at hx1, hy1)
            if (Math.hypot(pt.x - hx1, pt.y - hy1) <= hSize) {
              this.activeHandle = 'grad-radial-radius';
              this.isDragging = true;
              this.dragStartPt = pt;
              this.activeGradientElementId = el.id;
              this.initialGradientJson = el.attributes['data-gradient'];
              this.callbacks.setCursor?.('ew-resize');
              this.ctx.renderOverlay();
              return true;
            }

            // Priority 1b: Radius Y handle (secondary axis, emerald circle at hx2, hy2)
            if (Math.hypot(pt.x - hx2, pt.y - hy2) <= hSize) {
              this.activeHandle = 'grad-radial-radius-y';
              this.isDragging = true;
              this.dragStartPt = pt;
              this.activeGradientElementId = el.id;
              this.initialGradientJson = el.attributes['data-gradient'];
              this.callbacks.setCursor?.('ns-resize');
              this.ctx.renderOverlay();
              return true;
            }

            // Priority 2: Distinct focus point handle (amber circle at fx, fy)
            if (!isCoincident && Math.hypot(pt.x - fx, pt.y - fy) <= hSize) {
              this.activeHandle = 'grad-radial-focus';
              this.isDragging = true;
              this.dragStartPt = pt;
              this.activeGradientElementId = el.id;
              this.initialGradientJson = el.attributes['data-gradient'];
              this.callbacks.setCursor?.('crosshair');
              this.ctx.renderOverlay();
              return true;
            }

            // Priority 3: Center handle (pink circle at cx, cy, or drag focus out if Alt is pressed)
            if (Math.hypot(pt.x - cx, pt.y - cy) <= hSize) {
              this.activeHandle = e.altKey ? 'grad-radial-focus' : 'grad-radial-center';
              this.isDragging = true;
              this.dragStartPt = pt;
              this.activeGradientElementId = el.id;
              this.initialGradientJson = el.attributes['data-gradient'];
              this.callbacks.setCursor?.(e.altKey ? 'crosshair' : 'move');
              this.ctx.renderOverlay();
              return true;
            }
          }
        }
      } catch {}
    }

    // 4b. Check hit on composite bounding box handles depending on selectionMode
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
          this.isDragging = true;
          this.dragStartPt = pt;
          this.initialElementsMap.clear();
          this.ghostTransformMap.clear();
          selectedEls.forEach((el) => {
            if (el.vertices) {
              this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
            }
          });
          this.initialBox = groupBox;

          if (handle === 'rotate') {
            this.rotationPivot = this.ctx.selectionTool.getPivot(groupBox);
            this.initialRotationAngle = Math.atan2(pt.y - this.rotationPivot.y, pt.x - this.rotationPivot.x);
            this.lastDeltaAngle = 0;
            this.callbacks.setCursor?.('grabbing');
          }

          this.ctx.render();
          return true;
        }
      }
    }

    // 4c. Hit test vector elements under cursor (fill or stroke/border)
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
        this.dragAnchorPt = this.findClosestMoveAnchor(nowSelected, pt, groupBox, z);
        this.initialElementsMap.clear();
        this.ghostDragOffset = null;
        nowSelected.forEach((el) => {
          if (el.vertices) {
            this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
          }
        });
        this.initialBox = groupBox;
      }
      this.callbacks.onClearPanelMode?.();
      this.ctx.render();
      return true;
    }

    // Case 2: In 'rotate' mode, if clicking on an already selected element or inside its bounding box,
    // general translation is strictly blocked.
    if (selectedEls.length > 0 && this.ctx.selectionTool.selectionMode === 'rotate') {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      const isInsideBox =
        groupBox &&
        pt.x >= groupBox.x &&
        pt.x <= groupBox.x + groupBox.width &&
        pt.y >= groupBox.y &&
        pt.y <= groupBox.y + groupBox.height;

      if ((hit && this.ctx.selectionTool.isSelected(hit.element.id)) || isInsideBox) {
        this.isDragging = false;
        this.activeHandle = null;
        return true;
      }
    }

    // Case 3: In 'transform' mode, click on an already selected element OR within proximity threshold (20 / zoom)
    // of any of its vertices or center
    if (selectedEls.length > 0 && this.ctx.selectionTool.selectionMode === 'transform') {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      const isHitSelected = hit && this.ctx.selectionTool.isSelected(hit.element.id);
      const isNearAnchor = this.isNearSelectionAnchor(selectedEls, pt, groupBox, z);

      if (isHitSelected || isNearAnchor) {
        this.activeHandle = 'move';
        this.dragAnchorPt = this.findClosestMoveAnchor(selectedEls, pt, groupBox, z);
        this.initialElementsMap.clear();
        this.ghostDragOffset = null;
        selectedEls.forEach((el) => {
          if (el.vertices) {
            this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
          }
        });
        this.initialBox = groupBox;
        this.callbacks.onClearPanelMode?.();
        this.ctx.render();
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
    this.marqueeStartPt = pt;
    this.activeHandle = 'marquee';
    this.initialBox = null;
    this.ctx.selectionTool.isDeselectMarquee = false;
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
      // Hover testing for cursors
      if (this.ctx.canvasMgr.activeGuideTransformId) {
        const activeG = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.activeGuideTransformId);
        if (activeG) {
          const geom = this.ctx.canvasMgr.getGuideGeometry(activeG, this.ctx.model.canvas.width, this.ctx.model.canvas.height);
          if (Math.hypot(pt.x - geom.pivot.x, pt.y - geom.pivot.y) <= 12) {
            this.callbacks.setCursor?.('move');
            return true;
          }
          if (
            Math.hypot(pt.x - geom.arrow1.x, pt.y - geom.arrow1.y) <= 16 ||
            Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16
          ) {
            this.callbacks.setCursor?.('grab');
            return true;
          }
          const hitActive = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 6);
          if (hitActive && hitActive.id === activeG.id) {
            const cur = activeG.orientation === 'vertical' ? 'ew-resize' : activeG.orientation === 'horizontal' ? 'ns-resize' : 'crosshair';
            this.callbacks.setCursor?.(cur);
            return true;
          }
        }
      }

      // Check guide line hover
      const hitG = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 6);
      if (hitG) {
        const cur = hitG.orientation === 'vertical' ? 'ew-resize' : hitG.orientation === 'horizontal' ? 'ns-resize' : 'crosshair';
        this.callbacks.setCursor?.(cur);
        return true;
      }

      const selectedEls = this.ctx.model.elements.filter(
        (el) => this.ctx.selectionTool.isSelected(el.id)
      );
      let cursor = 'default';

      if (selectedEls.length > 0) {
        const z = this.ctx.canvasMgr.zoom || 1;
        const box = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
        if (box) {
          if (this.ctx.selectionTool.selectionMode === 'rotate') {
            if (this.ctx.selectionTool.hitTestPivot(box, pt, 8 / z)) {
              cursor = 'move';
            } else {
              const h = this.ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'rotate');
              if (h === 'rotate') cursor = 'grab';
            }
          } else {
            const h = this.ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'transform');
            if (h) {
              if (h === 'nw' || h === 'se') cursor = 'nwse-resize';
              else if (h === 'ne' || h === 'sw') cursor = 'nesw-resize';
              else if (h === 'n' || h === 's') cursor = 'ns-resize';
              else if (h === 'w' || h === 'e') cursor = 'ew-resize';
            }
          }
        }

        // Hover test on radial gradient interactive handles
        if (cursor === 'default' && selectedEls.length === 1 && selectedEls[0].attributes['data-gradient']) {
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

                if (Math.hypot(pt.x - hx1, pt.y - hy1) <= hSize) {
                  cursor = 'ew-resize';
                } else if (Math.hypot(pt.x - hx2, pt.y - hy2) <= hSize) {
                  cursor = 'ns-resize';
                } else if (!isCoincident && Math.hypot(pt.x - fx, pt.y - fy) <= hSize) {
                  cursor = 'crosshair';
                } else if (Math.hypot(pt.x - cx, pt.y - cy) <= hSize) {
                  cursor = 'move';
                }
              }
            }
          } catch {}
        }
      }

      if (cursor === 'default') {
        const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt);
        this.ctx.selectionTool.hoveredElementId = hit ? hit.element.id : null;
        if (hit) {
          if (this.ctx.selectionTool.selectionMode === 'rotate' && this.ctx.selectionTool.isSelected(hit.element.id)) {
            cursor = 'default';
          } else {
            cursor = 'move';
          }
        }
      }

      this.callbacks.setCursor?.(cursor);
      this.ctx.renderOverlay();
      return true;
    }

    const dx = pt.x - this.dragStartPt.x;
    const dy = pt.y - this.dragStartPt.y;

    if (this.activeHandle === 'selection-pivot') {
      this.callbacks.setCursor?.('move');
      const otherVertices: Point[] = [];
      this.ctx.model.elements.forEach((el) => {
        if (el.vertices) {
          el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
        }
      });
      const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      if (selectedEls.length > 0) {
        const z = this.ctx.canvasMgr.zoom || 1;
        const box = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
        if (box) {
          otherVertices.push({ x: box.x, y: box.y });
          otherVertices.push({ x: box.x + box.width, y: box.y });
          otherVertices.push({ x: box.x, y: box.y + box.height });
          otherVertices.push({ x: box.x + box.width, y: box.y + box.height });
          otherVertices.push({ x: box.cx, y: box.cy });
        }
      }
      const snapped = this.ctx.snapPoint(pt, otherVertices);
      this.ctx.selectionTool.customPivot = snapped;
      if (selectedEls.length === 1) {
        this.ctx.selectionTool.setCustomPivotForElement(selectedEls[0], snapped);
      }
      this.ctx.renderOverlay();
      return true;
    }

    if (
      this.activeHandle === 'grad-radial-center' ||
      this.activeHandle === 'grad-radial-radius' ||
      this.activeHandle === 'grad-radial-radius-y' ||
      this.activeHandle === 'grad-radial-focus'
    ) {
      const el = this.ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el && el.attributes['data-gradient']) {
        try {
          const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
          const box = this.ctx.selectionTool.getBoundingBox(el);
          if (box && box.width > 0 && box.height > 0) {
            if (this.activeHandle === 'grad-radial-center') {
              this.callbacks.setCursor?.('move');
              const newCx = (pt.x - box.x) / box.width;
              const newCy = (pt.y - box.y) / box.height;
              const oldCx = grad.cx ?? 0.5;
              const oldCy = grad.cy ?? 0.5;
              const dFx = (grad.fx ?? oldCx) - oldCx;
              const dFy = (grad.fy ?? oldCy) - oldCy;

              grad.cx = Math.round(newCx * 1000) / 1000;
              grad.cy = Math.round(newCy * 1000) / 1000;
              grad.fx = Math.round((newCx + dFx) * 1000) / 1000;
              grad.fy = Math.round((newCy + dFy) * 1000) / 1000;
            } else if (this.activeHandle === 'grad-radial-radius') {
              this.callbacks.setCursor?.('ew-resize');
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              // Project onto primary axis
              const projX = dx * Math.cos(rotRad) + dy * Math.sin(rotRad);
              const newRx = Math.max(0.01, Math.abs(projX) / box.width);
              grad.rx = Math.round(newRx * 1000) / 1000;
              grad.r = grad.rx;

              // If dragging with Shift held, steer rotation angle
              if (e.shiftKey) {
                const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
                grad.rotation = ((angleDeg % 360) + 360) % 360;
              }
            } else if (this.activeHandle === 'grad-radial-radius-y') {
              this.callbacks.setCursor?.('ns-resize');
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              // Project onto secondary axis
              const projY = -dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              const newRy = Math.max(0.01, Math.abs(projY) / box.height);
              grad.ry = Math.round(newRy * 1000) / 1000;
            } else if (this.activeHandle === 'grad-radial-focus') {
              this.callbacks.setCursor?.('crosshair');
              const newFx = (pt.x - box.x) / box.width;
              const newFy = (pt.y - box.y) / box.height;
              grad.fx = Math.round(newFx * 1000) / 1000;
              grad.fy = Math.round(newFy * 1000) / 1000;
            }

            el.attributes['data-gradient'] = JSON.stringify(grad);

            /**
             * ARCHITECTURAL RATIONALE: Direct DOM SVG Defs Attribute Mutation
             * Mutating cx, cy, r, fx, fy and gradientTransform directly on the live SVG
             * `<radialGradient>` element allows GPU repainting at 60fps while dragging.
             */
            const gradDom = document.getElementById(`ad-grad-${el.id}`);
            if (gradDom) {
              const cx = grad.cx ?? 0.5;
              const cy = grad.cy ?? 0.5;
              const rx = grad.rx ?? grad.r ?? 0.5;
              const ry = grad.ry ?? grad.r ?? 0.5;
              const rotation = grad.rotation ?? 0;
              const sy = rx > 0.0001 ? Math.round((ry / rx) * 1000) / 1000 : 1;
              gradDom.setAttribute('cx', cx.toString());
              gradDom.setAttribute('cy', cy.toString());
              gradDom.setAttribute('r', rx.toString());
              gradDom.setAttribute('fx', (grad.fx ?? cx).toString());
              gradDom.setAttribute('fy', (grad.fy ?? cy).toString());
              if (Math.abs(sy - 1) > 0.001 || Math.abs(rotation) > 0.1) {
                gradDom.setAttribute('gradientTransform', `translate(${cx}, ${cy}) rotate(${rotation}) scale(1, ${sy}) translate(-${cx}, -${cy})`);
              } else {
                gradDom.removeAttribute('gradientTransform');
              }
            }

            this.ctx.renderOverlay();
            return true;
          }
        } catch {}
      }
    }

    if (this.activeHandle === 'rotate' && this.rotationPivot && this.initialElementsMap.size > 0) {
      this.callbacks.setCursor?.('grabbing');

      /**
       * ARCHITECTURAL RATIONALE: Magnetic Cursor Snapping during Vector Rotation (FIX-08)
       *
       * 1. Pre-Trigonometric Snapping Evaluation:
       *    Instead of computing the rotation angle from raw pointer screen coordinates, `pt` is first
       *    evaluated against the unified snapping engine `this.ctx.snapPoint()`. Snapping queries all
       *    active reference geometries: grid intersections, guide lines, vertices of other vectors
       *    (excluding the elements currently transforming to prevent self-referential locking), and
       *    artboard/ViewBox boundaries.
       *
       * 2. Precedence over 15-Degree Increments:
       *    When a magnetic target is acquired (`isMagneticallySnapped`), the rotation angle points
       *    strictly towards the snapped feature without being overridden by default 15° quantization,
       *    unless the user explicitly forces 15° steps by holding `Shift`.
       *
       * 3. Alternative Approaches Discarded:
       *    - Snapping the computed angle post-facto (e.g. searching for angles of nearby vertices):
       *      Discarded because computing angular distance across all canvas vertices is O(N) in polar
       *      space and ignores orthogonal grid lines, guidelines, and ViewBox edges. Leveraging `snapPoint`
       *      directly operates in unified Cartesian space with full multi-constraint resolution.
       */
      const otherVertices = this.ctx.getOtherVertices(Array.from(this.ctx.selectionTool.selectedElementIds));
      const snapped = this.ctx.snapPoint(pt, otherVertices);
      const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;

      this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

      const currentAngle = Math.atan2(snapped.y - this.rotationPivot.y, snapped.x - this.rotationPivot.x);
      let deltaAngle = currentAngle - this.initialRotationAngle;

      // Snapping to 15-degree increments when Shift is held OR (snapAngular is enabled AND not magnetically snapped)
      const shouldSnapAngular = e.shiftKey || (this.ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
      if (shouldSnapAngular) {
        const step = (15 * Math.PI) / 180;
        deltaAngle = Math.round(deltaAngle / step) * step;
      }
      this.lastDeltaAngle = deltaAngle;

      this.ghostTransformMap.clear();
      this.initialElementsMap.forEach((origVerts, id) => {
        const rotated = this.ctx.selectionTool.rotateVerticesAroundPivot(
          origVerts,
          this.rotationPivot!,
          deltaAngle
        );
        this.ghostTransformMap.set(id, rotated);
      });
      this.ctx.renderOverlay();
      return true;
    }

    /**
     * ARCHITECTURAL RATIONALE: Magnetic Guideline Translation Snapping
     *
     * Why guidelines must query the unified snapping engine (snapPoint) with exclusion:
     * 1. Multi-Target Snap: Horizontal & vertical guidelines respond seamlessly to grid lines,
     *    viewBox frame edges/corners/center, other guidelines & intersections, and vector vertices.
     * 2. Self-Snapping Prevention: Passing `g.id` as `excludeGuideId` prevents the guideline from
     *    snapping to its own pre-drag position or creating artificial self-intersections.
     * 3. Synchronized Pivot: When a guideline is translated, its pivot point translates solidarily
     *    with the line so subsequent rotations stay anchored to the user's intended relative position.
     */
    if (this.activeHandle === 'guide-move' && this.ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        const otherVertices = this.ctx.getOtherVertices();
        if (g.orientation === 'horizontal') {
          const rawTarget: Point = { x: pt.x, y: this.guideInitialState.position + dy };
          const snapped = this.ctx.snapPoint(rawTarget, otherVertices, g.id);
          g.position = Math.round(snapped.y);
          g.pivotY = g.position;
          this.currentRotationSnappedPt = Math.abs(snapped.y - rawTarget.y) > 0.001 ? snapped : null;
        } else if (g.orientation === 'vertical') {
          const rawTarget: Point = { x: this.guideInitialState.position + dx, y: pt.y };
          const snapped = this.ctx.snapPoint(rawTarget, otherVertices, g.id);
          g.position = Math.round(snapped.x);
          g.pivotX = g.position;
          this.currentRotationSnappedPt = Math.abs(snapped.x - rawTarget.x) > 0.001 ? snapped : null;
        } else {
          /**
           * ARCHITECTURAL RATIONALE: Magnetic Parallel Translation Snapping for Oblique Guidelines (FIX-09)
           * The translation is projected strictly perpendicular to the guide angle n = (-sin θ, cos θ).
           * Both local cursor proximity and full-line keypoint sweeping are evaluated via
           * CanvasManager.snapAngledGuideTranslation, updating pivotX and pivotY coordinately.
           */
          const vb = this.ctx.model.getViewBoxBounds();
          const origin = {
            x: vb.minX + (this.ctx.canvasMgr.rulerConfig.originX || 0),
            y: vb.minY + (this.ctx.canvasMgr.rulerConfig.originY || 0),
          };
          const res = this.ctx.canvasMgr.snapAngledGuideTranslation(
            g,
            this.guideInitialState,
            this.dragStartPt,
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
      this.ctx.render();
      return true;
    }

    /**
     * ARCHITECTURAL RATIONALE: Magnetic Guide Pivot Snapping
     *
     * Dragging the pivot node of a guideline allows positioning the center of rotation at precise
     * geometric coordinates (such as vector vertices, grid intersections, or artboard boundaries).
     * Passing `g.id` prevents self-intersection locking.
     */
    if (this.activeHandle === 'guide-pivot' && this.ctx.canvasMgr.selectedGuideId) {
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        const otherVertices = this.ctx.getOtherVertices();
        const snapped = this.ctx.snapPoint(pt, otherVertices, g.id);
        g.pivotX = Math.round(snapped.x);
        g.pivotY = Math.round(snapped.y);
        if (g.orientation === 'horizontal') g.position = g.pivotY;
        if (g.orientation === 'vertical') g.position = g.pivotX;
      }
      this.ctx.render();
      return true;
    }

    /**
     * ARCHITECTURAL RATIONALE: Magnetic Cursor Snapping during Guideline Rotation (FIX-08)
     *
     * 1. Unified Reference Target Snapping:
     *    When spinning a guideline via its polar curved arrows, the pointer position `pt` is snapped
     *    against the grid, other guidelines (excluding `g.id` to avoid self-snapping), vector vertices,
     *    and ViewBox edges. The polar angle `Math.atan2(snapped.y - py, snapped.x - px)` directs the
     *    guideline directly through the magnetically snapped reference coordinate.
     *
     * 2. Soft-Snap Suppression during Magnetic Lock:
     *    Soft 3° snapping towards 0°, 45°, 90°, etc. is bypassed when `isMagneticallySnapped` is true,
     *    guaranteeing that guidelines targeting arbitrary vertices (e.g. at 33.7°) do not get deflected
     *    erroneously to 45°.
     */
    if (this.activeHandle === 'guide-rotate' && this.ctx.canvasMgr.selectedGuideId) {
      this.callbacks.setCursor?.('grabbing');
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : this.ctx.model.canvas.width / 2);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : this.ctx.model.canvas.height / 2);

        const otherVertices = this.ctx.getOtherVertices();
        const snapped = this.ctx.snapPoint(pt, otherVertices, g.id);
        const isMagneticallySnapped = Math.hypot(snapped.x - pt.x, snapped.y - pt.y) > 0.001;

        this.currentRotationSnappedPt = isMagneticallySnapped ? snapped : null;

        const angleRad = Math.atan2(snapped.y - py, snapped.x - px);
        let deg = Math.round((angleRad * 180) / Math.PI);
        if (deg < 0) deg += 360;

        const shouldSnapAngular = e.shiftKey || (this.ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
        if (shouldSnapAngular) {
          // Strict 15-degree magnetic snapping
          deg = Math.round(deg / 15) * 15;
          deg = deg % 360;
        } else if (!isMagneticallySnapped) {
          // Soft snapping within 3 degrees for primary orthogonal / diagonal angles only when not magnetically snapped
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
      this.ctx.render();
      return true;
    }

    if (this.activeHandle === 'marquee' && this.marqueeStartPt) {
      const minX = Math.min(this.marqueeStartPt.x, pt.x);
      const minY = Math.min(this.marqueeStartPt.y, pt.y);
      const w = Math.abs(pt.x - this.marqueeStartPt.x);
      const h = Math.abs(pt.y - this.marqueeStartPt.y);
      this.ctx.selectionTool.marqueeRect = { x: minX, y: minY, width: w, height: h };
      this.ctx.renderOverlay();
      return true;
    } else if (this.activeHandle === 'move' && this.initialElementsMap.size > 0) {
      // Collect other unselected vertices for snapToVertices
      const otherVertices: Point[] = [];
      this.ctx.model.elements.forEach((el) => {
        if (!this.ctx.selectionTool.isSelected(el.id) && el.vertices) {
          el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
        }
      });

      // Compute target position of the anchor and snap it
      const rawTarget: Point = { x: this.dragAnchorPt.x + dx, y: this.dragAnchorPt.y + dy };
      const snappedTarget = this.ctx.snapPoint(rawTarget, otherVertices);
      const effectiveDx = snappedTarget.x - this.dragAnchorPt.x;
      const effectiveDy = snappedTarget.y - this.dragAnchorPt.y;

      this.ghostDragOffset = { x: effectiveDx, y: effectiveDy };
      this.ctx.renderOverlay();
      return true;
    } else if (this.initialBox && this.activeHandle !== 'move' && this.initialElementsMap.size > 0) {
      this.ghostTransformMap.clear();
      this.initialElementsMap.forEach((origVerts, id) => {
        const transformed = this.ctx.selectionTool.transformVertices(
          origVerts,
          this.initialBox,
          this.activeHandle as HandleType,
          dx,
          dy
        );
        this.ghostTransformMap.set(id, transformed);
      });
      this.ctx.renderOverlay();
      return true;
    }

    return false;
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (!this.isDragging) return false;
    this.isDragging = false;

    // 1. Finishing Guide Move (Check if dragged back to ruler to delete)
    if (this.activeHandle === 'guide-move' && this.ctx.canvasMgr.selectedGuideId) {
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        /**
         * ARCHITECTURAL RATIONALE: Physical Ruler Hit-Testing for Guide Deletion (FIX-04)
         *
         * 1. Elimination of Rigid ViewBox Boundary Checks:
         *    Previously, dragging a guide beyond the viewBox (pt.y < 0 || pt.y > canvas.height,
         *    or pt.x < 0 || pt.x > canvas.width) erroneously deleted the guide immediately.
         *    In vector graphics editors (CorelDraw, Illustrator, Figma), guides are infinite construction
         *    lines that can exist and be positioned freely in the pasteboard / outer workspace area.
         *
         * 2. Physical DOM Ruler Area Hit-Testing:
         *    A guide is deleted ONLY when the user drags and drops it directly back onto the physical
         *    ruler bar from which it originated (or corner button).
         *    We evaluate screen client coordinates (e.clientX, e.clientY) against the DOM bounding
         *    rects via ctx.isPointerOverRuler (with fallback to direct DOM element inspection).
         */
        let shouldDelete = false;
        if (this.ctx.isPointerOverRuler) {
          shouldDelete = this.ctx.isPointerOverRuler(e.clientX, e.clientY, g.orientation);
        } else if (this.ctx.canvasMgr.showRulers) {
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
          this.ctx.canvasMgr.removeGuide(g.id);
          this.callbacks.onClearPanelMode?.();
        }
        this.callbacks.syncMetadataToHost?.();
      }
      this.activeHandle = null;
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      this.ctx.render();
      return true;
    }

    // 2. Finishing Guide Transform (Pivot / Rotate)
    if (this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate') {
      this.activeHandle = null;
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      this.callbacks.syncMetadataToHost?.();
      this.ctx.render();
      return true;
    }

    // 3. Finishing Selection Pivot Move
    if (this.activeHandle === 'selection-pivot') {
      const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      if (selectedEls.length === 1 && this.ctx.selectionTool.customPivot) {
        this.ctx.selectionTool.setCustomPivotForElement(selectedEls[0], this.ctx.selectionTool.customPivot);
        this.ctx.syncToHost();
      }
      this.activeHandle = null;
      this.initialPivot = null;
      this.callbacks.onSelectionChanged?.();
      this.ctx.renderOverlay();
      return true;
    }

    // 3b. Finishing Radial Gradient Handle Drag (Center, Radius, Focus)
    if (
      this.activeHandle === 'grad-radial-center' ||
      this.activeHandle === 'grad-radial-radius' ||
      this.activeHandle === 'grad-radial-focus'
    ) {
      let gradChanged = false;
      const el = this.ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el && this.initialGradientJson && el.attributes['data-gradient'] !== this.initialGradientJson) {
        const finalGradJson = el.attributes['data-gradient'];
        // Revert temporarily to pre-drag state to record snapshot in Undo stack
        el.attributes['data-gradient'] = this.initialGradientJson;
        this.ctx.pushUndo();
        el.attributes['data-gradient'] = finalGradJson;
        gradChanged = true;
      }
      this.activeHandle = null;
      this.activeGradientElementId = null;
      this.initialGradientJson = null;
      this.ctx.render();
      if (gradChanged) {
        this.callbacks.onSelectionChanged?.();
        this.ctx.syncToHost();
      }
      return true;
    }

    let hasChangesToCommit = false;

    // Commit Move Ghost
    if (this.activeHandle === 'move' && this.ghostDragOffset) {
      if (this.ghostDragOffset.x !== 0 || this.ghostDragOffset.y !== 0) {
        this.ctx.pushUndo();
        const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
        this.initialElementsMap.forEach((origVerts, id) => {
          const el = this.ctx.model.elements.find((e) => e.id === id);
          if (el) {
            el.vertices = origVerts.map((v) => ({
              ...v,
              x: v.x + this.ghostDragOffset!.x,
              y: v.y + this.ghostDragOffset!.y,
              handleIn: v.handleIn
                ? { x: v.handleIn.x + this.ghostDragOffset!.x, y: v.handleIn.y + this.ghostDragOffset!.y }
                : undefined,
              handleOut: v.handleOut
                ? { x: v.handleOut.x + this.ghostDragOffset!.x, y: v.handleOut.y + this.ghostDragOffset!.y }
                : undefined,
            }));
            const isClosed = this.ctx.model.isElementClosed(el);
            el.attributes.d = this.ctx.model.compilePathD(el.vertices, isClosed);
          }
        });
        // Translate custom pivot solidarily with moved vectors
        this.ctx.selectionTool.updatePivotOnTranslate(this.ghostDragOffset.x, this.ghostDragOffset.y, selectedEls);
        hasChangesToCommit = true;
      }
      this.ghostDragOffset = null;
    }

    // Commit Transform Ghost (Scale, Rotate)
    if (this.activeHandle && this.activeHandle !== 'move' && this.ghostTransformMap.size > 0) {
      this.ctx.pushUndo();
      const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      this.ghostTransformMap.forEach((transformedVerts, id) => {
        const el = this.ctx.model.elements.find((e) => e.id === id);
        if (el) {
          el.vertices = transformedVerts;
          const isClosed = this.ctx.model.isElementClosed(el);
          el.attributes.d = this.ctx.model.compilePathD(el.vertices, isClosed);
        }
      });
      // Synchronize custom pivot solidarily with rotation or scaling
      if (this.activeHandle === 'rotate' && this.rotationPivot) {
        this.ctx.selectionTool.updatePivotOnRotate(this.rotationPivot, this.lastDeltaAngle, selectedEls);

        // ARCHITECTURAL RATIONALE: Solidary Gradient Rotation (FIX-06)
        // Rotates linear angles and transforms radial gradient center, focus, radii (rx, ry)
        // and rotation angle solidarily around the rotation pivot.
        selectedEls.forEach((el) => {
          if (el.attributes['data-gradient']) {
            const initialVerts = this.initialElementsMap.get(el.id);
            const oldElBox = initialVerts
              ? this.ctx.selectionTool.getBoundingBox({ ...el, vertices: initialVerts })
              : this.initialBox;
            const newElBox = this.ctx.selectionTool.getBoundingBox(el);
            if (oldElBox && newElBox) {
              this.ctx.selectionTool.rotateElementGradient(
                el,
                this.rotationPivot!,
                this.lastDeltaAngle,
                oldElBox,
                newElBox
              );
            }
          }
        });
      } else if (this.initialBox) {
        const z = this.ctx.canvasMgr.zoom || 1;
        const newBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
        if (newBox) {
          this.ctx.selectionTool.updatePivotOnScale(this.initialBox, newBox, selectedEls);
        }
      }
      this.ghostTransformMap.clear();
      hasChangesToCommit = true;
    }

    if (this.activeHandle === 'marquee' && this.ctx.selectionTool.marqueeRect) {
      const hitIds = this.ctx.selectionTool.hitTestMarquee(
        this.ctx.model.elements,
        this.ctx.selectionTool.marqueeRect
      );

      if (this.ctx.selectionTool.isDeselectMarquee) {
        hitIds.forEach((id) => this.ctx.selectionTool.deselect(id));
      } else if (e.ctrlKey || e.metaKey) {
        hitIds.forEach((id) => this.ctx.selectionTool.selectedElementIds.add(id));
      } else {
        this.ctx.selectionTool.selectedElementIds = new Set(hitIds);
      }

      this.ctx.selectionTool.marqueeRect = null;
      this.ctx.selectionTool.isDeselectMarquee = false;
      this.marqueeStartPt = null;
      this.callbacks.onSelectionChanged?.();
      this.ctx.render();
    }

    this.activeHandle = null;
    this.rotationPivot = null;
    this.currentRotationSnappedPt = null;
    this.initialElementsMap.clear();
    this.initialBox = null;
    this.ctx.applyCanvasSize?.();
    this.ctx.render();
    if (hasChangesToCommit) {
      this.callbacks.onSelectionChanged?.();
      this.ctx.syncToHost();
    }
    return true;
  }

  public onDoubleClick(e: MouseEvent, pt: Point): boolean {
    const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
    const z = this.ctx.canvasMgr.zoom || 1;

    // 1. Double-click on selection pivot -> reset pivot to bounding box center
    if (selectedEls.length > 0) {
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox && this.ctx.selectionTool.hitTestPivot(groupBox, pt, 10 / z)) {
        this.ctx.selectionTool.resetPivot(selectedEls.length === 1 ? selectedEls[0] : undefined);
        this.callbacks.onSelectionChanged?.();
        this.ctx.syncToHost();
        this.ctx.renderOverlay();
        return true;
      }

      /**
       * ARCHITECTURAL RATIONALE: Bimodal Selection Toggle via Double-Click (FIX-05)
       * Double-clicking directly on the body of a selected vector or anywhere inside its
       * bounding box toggles between 'transform' (scale/move) and 'rotate' (rotation handles/pivot) modes.
       * 
       * Why double-click toggles mode:
       * In professional vector illustration workflows (CorelDraw, Inkscape), double-clicking
       * an active selection seamlessly switches between transformation and rotation without
       * forcing the user to navigate away to the inspector or toolbar.
       */
      const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, this.ctx.canvasMgr.zoom);
      const isInsideBox =
        groupBox &&
        pt.x >= groupBox.x &&
        pt.x <= groupBox.x + groupBox.width &&
        pt.y >= groupBox.y &&
        pt.y <= groupBox.y + groupBox.height;

      if ((hit && this.ctx.selectionTool.isSelected(hit.element.id)) || isInsideBox) {
        this.ctx.selectionTool.selectionMode =
          this.ctx.selectionTool.selectionMode === 'transform' ? 'rotate' : 'transform';
        this.callbacks.onSelectionChanged?.();
        this.ctx.renderOverlay();
        return true;
      }
    }

    // 2. Double-click on guide line -> enter angle / pivot transform mode
    const hitGuide = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 8);
    if (hitGuide) {
      this.ctx.selectionTool.deselectAll();
      this.ctx.canvasMgr.selectedGuideId = hitGuide.id;
      this.ctx.canvasMgr.activeGuideTransformId = hitGuide.id;
      this.callbacks.onGuideSelected?.(hitGuide);
      this.ctx.render();
      return true;
    }

    return false;
  }

  public cancel(): boolean {
    let handled = false;

    if (this.activeHandle === 'marquee' || this.ctx.selectionTool.marqueeRect || this.marqueeStartPt) {
      this.ctx.selectionTool.marqueeRect = null;
      this.ctx.selectionTool.isDeselectMarquee = false;
      this.marqueeStartPt = null;
      handled = true;
    }

    if (
      this.activeHandle === 'guide-move' ||
      this.activeHandle === 'guide-pivot' ||
      this.activeHandle === 'guide-rotate'
    ) {
      if (this.guideInitialState && this.ctx.canvasMgr.selectedGuideId) {
        const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
        if (g) {
          Object.assign(g, this.guideInitialState);
        }
      }
      this.guideInitialState = null;
      this.currentRotationSnappedPt = null;
      handled = true;
    }

    if (this.ghostDragOffset || this.ghostTransformMap.size > 0 || this.initialBox) {
      this.ghostDragOffset = null;
      this.ghostTransformMap.clear();
      this.initialBox = null;
      this.currentRotationSnappedPt = null;
      handled = true;
    }

    if (this.activeHandle === 'selection-pivot') {
      this.ctx.selectionTool.customPivot = this.initialPivot;
      this.initialPivot = null;
      this.activeHandle = null;
      handled = true;
    }

    if (
      this.activeHandle === 'grad-radial-center' ||
      this.activeHandle === 'grad-radial-radius' ||
      this.activeHandle === 'grad-radial-radius-y' ||
      this.activeHandle === 'grad-radial-focus'
    ) {
      if (this.activeGradientElementId && this.initialGradientJson) {
        const el = this.ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
        if (el) {
          el.attributes['data-gradient'] = this.initialGradientJson;
        }
      }
      this.activeGradientElementId = null;
      this.initialGradientJson = null;
      this.ctx.render();
      handled = true;
    }

    if (this.activeHandle !== null || this.isDragging) {
      this.activeHandle = null;
      this.isDragging = false;
      handled = true;
    }

    if (handled) {
      this.ctx.renderOverlay();
    }
    return handled;
  }

  public renderOverlay(zoom: number): string {
    let html = '';
    const z = zoom || 1;

    // 1. Marquee Selection Rectangle Overlay
    if (this.ctx.selectionTool.marqueeRect) {
      const m = this.ctx.selectionTool.marqueeRect;
      const isDesel = this.ctx.selectionTool.isDeselectMarquee;
      html += `<rect x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" fill="${isDesel ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'}" stroke="${isDesel ? '#ef4444' : '#3b82f6'}" stroke-width="1" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
    }

    // 2. Hover Highlight Border
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

    // 3. Bounding Box & Handles for Selected Elements (Bimodal: Transform vs Rotate)
    const selectedEls = this.ctx.model.elements.filter((e) => this.ctx.selectionTool.isSelected(e.id));
    if (selectedEls.length > 0) {
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox) {
        const mode = this.ctx.selectionTool.selectionMode;

        // Bounding Box Rectangle: sky blue in 'transform', amber in 'rotate'
        const boxStroke = mode === 'rotate' ? '#f59e0b' : '#38bdf8';
        html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="${boxStroke}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

        const rotOffset = 18 / z;

        if (mode === 'transform') {
          // 8 Scale / Resize Handles
          const handles = [
            { x: groupBox.x, y: groupBox.y },
            { x: groupBox.cx, y: groupBox.y },
            { x: groupBox.x + groupBox.width, y: groupBox.y },
            { x: groupBox.x, y: groupBox.cy },
            { x: groupBox.x + groupBox.width, y: groupBox.cy },
            { x: groupBox.x, y: groupBox.y + groupBox.height },
            { x: groupBox.cx, y: groupBox.y + groupBox.height },
            { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          ];

          const hSize = 7 / z;
          const hHalf = hSize / 2;
          const hRx = 1 / z;
          handles.forEach((hPos) => {
            html += `<rect x="${hPos.x - hHalf}" y="${hPos.y - hHalf}" width="${hSize}" height="${hSize}" fill="#ffffff" stroke="#0284c7" stroke-width="1" rx="${hRx}" vector-effect="non-scaling-stroke" />`;
          });
        } else {
          // Rotate Mode: Top rotation stem handle + 4 corner rotation handles
          const rotR = 4 / z;
          // Top stem
          html += `<line x1="${groupBox.cx}" y1="${groupBox.y}" x2="${groupBox.cx}" y2="${groupBox.y - rotOffset}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${groupBox.cx}" cy="${groupBox.y - rotOffset}" r="${rotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke" style="cursor: grab;" />`;

          // 4 Corner Rotation Handles
          const rotCorners = [
            { x: groupBox.x, y: groupBox.y },
            { x: groupBox.x + groupBox.width, y: groupBox.y },
            { x: groupBox.x, y: groupBox.y + groupBox.height },
            { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          ];
          rotCorners.forEach((c) => {
            html += `<circle cx="${c.x}" cy="${c.y}" r="${rotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke" style="cursor: grab;" />`;
          });
        }

        // 3.0. Rotation Pivot Marker
        if (selectedEls.length === 1 && !this.ctx.selectionTool.customPivot && selectedEls[0].attributes['data-pivot']) {
          this.ctx.selectionTool.restorePivotForElement(selectedEls[0]);
        }
        let pivot = this.ctx.selectionTool.getPivot(groupBox);
        if (this.activeHandle === 'move' && this.ghostDragOffset) {
          pivot = { x: pivot.x + this.ghostDragOffset.x, y: pivot.y + this.ghostDragOffset.y };
        }
        const isCustomPivot = this.ctx.selectionTool.customPivot !== null;

        // If displaced from bounding box center, draw a dashed lever line connecting center to custom pivot
        if (isCustomPivot) {
          const leverColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
          html += `<line x1="${groupBox.cx}" y1="${groupBox.cy}" x2="${pivot.x}" y2="${pivot.y}" stroke="${leverColor}" stroke-width="1" stroke-dasharray="2 2" opacity="0.75" vector-effect="non-scaling-stroke" />`;
        }

        // Bullseye crosshair pivot marker
        // ARCHITECTURAL RATIONALE: Visual & Interactive Differentiation of Pivot by Mode
        // In 'transform' mode: Rendered as a muted, fixed reference marker with pointer-events: none (not draggable).
        // In 'rotate' mode: Rendered as a vibrant, interactive anchor with cursor: move and pointer-events: auto.
        const pR = 5.5 / z;
        const tick = 8.5 / z;
        const pColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
        const pCursor = mode === 'rotate' ? 'move' : 'default';
        const pPointerEvents = mode === 'rotate' ? 'auto' : 'none';
        const pOpacity = mode === 'rotate' ? '1.0' : '0.65';

        html += `
          <g class="selection-pivot-marker" style="cursor: ${pCursor}; pointer-events: ${pPointerEvents};" opacity="${pOpacity}">
            <circle cx="${pivot.x}" cy="${pivot.y}" r="${pR}" fill="#ffffff" stroke="${pColor}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <line x1="${pivot.x - tick}" y1="${pivot.y}" x2="${pivot.x + tick}" y2="${pivot.y}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <line x1="${pivot.x}" y1="${pivot.y - tick}" x2="${pivot.x}" y2="${pivot.y + tick}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <circle cx="${pivot.x}" cy="${pivot.y}" r="${1.6 / z}" fill="${pColor}" />
          </g>
        `;

        // If currently rotating, draw a visual guide ray from the pivot to the rotation handle and snapped point
        if (this.activeHandle === 'rotate' && this.rotationPivot) {
          html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${groupBox.cx}" y2="${groupBox.y - rotOffset}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3 2" opacity="0.8" vector-effect="non-scaling-stroke" />`;
          if (this.currentRotationSnappedPt) {
            html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${this.currentRotationSnappedPt.x}" y2="${this.currentRotationSnappedPt.y}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
          }
        }
      }

      // 3.1. On-Canvas Interactive Gradient Vector Overlay
      if (selectedEls.length === 1 && selectedEls[0].attributes['data-gradient']) {
        const el = selectedEls[0];
        try {
          const grad = JSON.parse(el.attributes['data-gradient']);
          const box = this.ctx.selectionTool.getBoundingBox(el);
          if (box && grad) {
            if (grad.type === 'linear') {
              let x1 = grad.x1 ?? 0;
              let y1 = grad.y1 ?? 0;
              let x2 = grad.x2 ?? 1;
              let y2 = grad.y2 ?? 0;
              if (grad.angle !== undefined) {
                const rad = (grad.angle * Math.PI) / 180;
                x1 = 0.5 - 0.5 * Math.cos(rad);
                y1 = 0.5 - 0.5 * Math.sin(rad);
                x2 = 0.5 + 0.5 * Math.cos(rad);
                y2 = 0.5 + 0.5 * Math.sin(rad);
              }
              const p1x = box.x + x1 * box.width;
              const p1y = box.y + y1 * box.height;
              const p2x = box.x + x2 * box.width;
              const p2y = box.y + y2 * box.height;
              const hSize = 6 / z;
              html += `<line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" stroke="#ec4899" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />`;
              html += `<rect x="${p1x - hSize / 2}" y="${p1y - hSize / 2}" width="${hSize}" height="${hSize}" fill="#ec4899" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${p2x}" cy="${p2y}" r="${hSize / 2}" fill="#3b82f6" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
            } else if (grad.type === 'radial') {
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rx = (grad.rx ?? grad.r ?? 0.5) * box.width;
              const ry = (grad.ry ?? grad.r ?? 0.5) * box.height;
              const rot = grad.rotation ?? 0;
              const rotRad = (rot * Math.PI) / 180;
              const fx = box.x + (grad.fx ?? grad.cx ?? 0.5) * box.width;
              const fy = box.y + (grad.fy ?? grad.cy ?? 0.5) * box.height;
              const hSize = 7 / z;
              const isCoincident = Math.hypot(fx - cx, fy - cy) < 4 / z;

              const hx1 = cx + rx * Math.cos(rotRad);
              const hy1 = cy + rx * Math.sin(rotRad);
              const hx2 = cx - ry * Math.sin(rotRad);
              const hy2 = cy + ry * Math.cos(rotRad);

              // 1. Dispersion perimeter boundary ellipse (rotated)
              html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot}, ${cx}, ${cy})" fill="none" stroke="#ec4899" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.85" vector-effect="non-scaling-stroke" />`;

              // 2. Primary axis ray & handle (Radius X - blue)
              html += `<line x1="${cx}" y1="${cy}" x2="${hx1}" y2="${hy1}" stroke="#3b82f6" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${hx1}" cy="${hy1}" r="${hSize / 2}" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: ew-resize;" />`;

              // 3. Secondary axis ray & handle (Radius Y - emerald)
              html += `<line x1="${cx}" y1="${cy}" x2="${hx2}" y2="${hy2}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${hx2}" cy="${hy2}" r="${hSize / 2}" fill="#10b981" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: ns-resize;" />`;

              // 4. Focus point ray and handle (if distinct from center)
              if (!isCoincident) {
                html += `<line x1="${cx}" y1="${cy}" x2="${fx}" y2="${fy}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
                html += `<circle cx="${fx}" cy="${fy}" r="${hSize / 2}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: crosshair;" />`;
              }

              // 5. Center handle (move cursor)
              html += `<circle cx="${cx}" cy="${cy}" r="${hSize / 1.8}" fill="#ec4899" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: move;" />`;
              if (isCoincident) {
                html += `<circle cx="${cx}" cy="${cy}" r="${hSize / 3.8}" fill="#f59e0b" style="pointer-events: none;" />`;
              }
            }
          }
        } catch {}
      }

      if (selectedEls.length > 1) {
        selectedEls.forEach((el) => {
          const elBox = this.ctx.selectionTool.getSelectionBoundingBox(el, 6 / z);
          if (elBox) {
            html += `<rect x="${elBox.x}" y="${elBox.y}" width="${elBox.width}" height="${elBox.height}" fill="none" stroke="#60a5fa" stroke-width="0.75" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke" />`;
          }
        });
      }
    }

    // 4. Ghost Move Vector and Bounding Box
    if (this.activeHandle === 'move' && this.ghostDragOffset && (this.ghostDragOffset.x !== 0 || this.ghostDragOffset.y !== 0)) {
      this.initialElementsMap.forEach((origVerts, id) => {
        const el = this.ctx.model.elements.find((e) => e.id === id);
        if (el) {
          const gVerts = origVerts.map((v) => ({
            ...v,
            x: v.x + this.ghostDragOffset!.x,
            y: v.y + this.ghostDragOffset!.y,
            handleIn: v.handleIn ? { x: v.handleIn.x + this.ghostDragOffset!.x, y: v.handleIn.y + this.ghostDragOffset!.y } : undefined,
            handleOut: v.handleOut ? { x: v.handleOut.x + this.ghostDragOffset!.x, y: v.handleOut.y + this.ghostDragOffset!.y } : undefined,
          }));
          const isClosed = this.ctx.model.isElementClosed(el);
          const d = this.ctx.model.compilePathD(gVerts, isClosed);
          html += `<path d="${d}" fill="rgba(99, 102, 241, 0.25)" stroke="#818cf8" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
          gVerts.forEach((gv) => {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#a5b4fc" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });
      if (this.initialBox) {
        const bx = this.initialBox.x + this.ghostDragOffset.x;
        const by = this.initialBox.y + this.ghostDragOffset.y;
        html += `<rect x="${bx}" y="${by}" width="${this.initialBox.width}" height="${this.initialBox.height}" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 5. Ghost Transform Vector
    if (this.ghostTransformMap.size > 0) {
      this.ghostTransformMap.forEach((gVerts, id) => {
        const el = this.ctx.model.elements.find((e) => e.id === id);
        if (el) {
          const isClosed = this.ctx.model.isElementClosed(el);
          const d = this.ctx.model.compilePathD(gVerts, isClosed);
          html += `<path d="${d}" fill="rgba(99, 102, 241, 0.25)" stroke="#818cf8" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
          gVerts.forEach((gv) => {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#a5b4fc" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });
    }

    // 6. Magnetic Snap Target Indicator during Vector or Guideline Rotation (FIX-08)
    if (this.currentRotationSnappedPt) {
      const sp = this.currentRotationSnappedPt;
      const sR = 6 / z;
      const sCross = 9 / z;
      html += `
        <g class="rotation-snap-indicator" pointer-events="none">
          <circle cx="${sp.x}" cy="${sp.y}" r="${sR}" fill="none" stroke="#f59e0b" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x - sCross}" y1="${sp.y}" x2="${sp.x + sCross}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x}" y1="${sp.y - sCross}" x2="${sp.x}" y2="${sp.y + sCross}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <circle cx="${sp.x}" cy="${sp.y}" r="${1.8 / z}" fill="#f59e0b" />
        </g>
      `;

      // If rotating a guideline, also draw ray from guideline pivot to snapped point
      if (this.activeHandle === 'guide-rotate' && this.ctx.canvasMgr.selectedGuideId) {
        const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
        if (g) {
          const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : this.ctx.model.canvas.width / 2);
          const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : this.ctx.model.canvas.height / 2);
          html += `<line x1="${px}" y1="${py}" x2="${sp.x}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
        }
      }
    }

    return html;
  }
}
