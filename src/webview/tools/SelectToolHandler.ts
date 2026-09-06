import { IToolHandler, ToolContext } from './IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../engine/VectorModel.js';
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
  private activeHandle: HandleType | 'move' | 'marquee' | 'guide-move' | 'guide-pivot' | 'guide-rotate' | null = null;

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

        // Check click anywhere on the active transforming guide line away from the pivot
        const hitActive = this.ctx.canvasMgr.hitTestGuide(pt, this.ctx.model.canvas.width, this.ctx.model.canvas.height, 8);
        if (hitActive && hitActive.id === activeG.id) {
          this.activeHandle = 'guide-rotate';
          this.activeRotateArrowIdx = 1;
          this.guideInitialState = { ...activeG };
          this.ctx.render();
          return true;
        }
      }
    }

    // 2. Check if clicking on any Guide Line to select it and activate rotation controls immediately
    // ARCHITECTURAL RATIONALE: Instant Guide Transformation on Single Click
    // In earlier versions, guide rotation controls (pivot and curved arrows) required an explicit
    // double-click gesture. This caused friction and broke expected workflow where clicking, holding,
    // and dragging a guide line directly performs angular rotation, while dragging the central pivot
    // translates its center of rotation. Activating `activeGuideTransformId` and assigning
    // `activeHandle = 'guide-rotate'` on first click ensures instant feedback and interactive rotation.
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
      } else {
        this.activeHandle = 'guide-rotate';
        if (Math.hypot(pt.x - geom.arrow2.x, pt.y - geom.arrow2.y) <= 16) {
          this.activeRotateArrowIdx = 2;
        } else {
          this.activeRotateArrowIdx = 1;
        }
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

    // 4a. Check hit directly on a selected element's vertex to use that vertex as precise snap anchor
    let hitVertex: Point | null = null;
    if (selectedEls.length > 0) {
      const z = this.ctx.canvasMgr.zoom || 1;
      for (const selEl of selectedEls) {
        if (selEl.vertices) {
          for (const v of selEl.vertices) {
            if (Math.hypot(pt.x - v.x, pt.y - v.y) <= 8 / z) {
              hitVertex = { x: v.x, y: v.y };
              break;
            }
          }
          if (hitVertex) break;
        }
      }
    }

    if (hitVertex) {
      this.activeHandle = 'move';
      this.dragAnchorPt = hitVertex;
      this.initialElementsMap.clear();
      this.ghostDragOffset = null;
      selectedEls.forEach((el) => {
        if (el.vertices) {
          this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
        }
      });
      // ARCHITECTURAL RATIONALE: Synchronize initialBox with the moved selection bounds.
      // If initialBox is left stale from a previous transform, the ghost overlay draws an obsolete
      // bounding box at a static position. Computing the exact group bounding box here guarantees
      // that the ghost dashed rectangle moves coherently with the dragged elements.
      const z = this.ctx.canvasMgr.zoom || 1;
      this.initialBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      this.callbacks.onClearPanelMode?.();
      this.ctx.render();
      return true;
    }

    // 4b. Check hit on composite bounding box handles if vector elements are selected
    if (selectedEls.length > 0) {
      const z = this.ctx.canvasMgr.zoom || 1;
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox) {
        const handle = this.ctx.selectionTool.hitTestHandle(groupBox, pt, 12 / z, 18 / z);
        if (handle) {
          this.activeHandle = handle;
          this.initialElementsMap.clear();
          this.ghostTransformMap.clear();
          selectedEls.forEach((el) => {
            if (el.vertices) {
              this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
            }
          });
          this.initialBox = groupBox;
          this.ctx.render();
          return true;
        }
      }
    }

    // 4c. Hit test vector elements under cursor (fill or stroke/border)
    const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, this.ctx.canvasMgr.zoom);
    if (hit) {
      if (!this.ctx.selectionTool.isSelected(hit.element.id)) {
        this.ctx.selectionTool.select(hit.element.id);
        this.callbacks.onSelectionChanged?.();
      }

      const nowSelected = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));
      if (nowSelected.length > 0) {
        this.activeHandle = 'move';
        this.dragAnchorPt = { x: pt.x, y: pt.y };
        this.initialElementsMap.clear();
        this.ghostDragOffset = null;
        nowSelected.forEach((el) => {
          if (el.vertices) {
            this.initialElementsMap.set(el.id, JSON.parse(JSON.stringify(el.vertices)));
          }
        });
        // ARCHITECTURAL RATIONALE: Recalculate initialBox for the newly clicked vector selection.
        const z = this.ctx.canvasMgr.zoom || 1;
        this.initialBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(nowSelected, 6 / z);
      }
      this.callbacks.onClearPanelMode?.();
      this.ctx.render();
      return true;
    } else {
      // 4d. Clicked on empty canvas space: start Marquee selection
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
            this.callbacks.setCursor?.('grab');
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
          const h = this.ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z);
          if (h) {
            if (h === 'nw' || h === 'se') cursor = 'nwse-resize';
            else if (h === 'ne' || h === 'sw') cursor = 'nesw-resize';
            else if (h === 'n' || h === 's') cursor = 'ns-resize';
            else if (h === 'w' || h === 'e') cursor = 'ew-resize';
            else if (h === 'rotate') cursor = 'grab';
          }
        }
      }

      if (cursor === 'default') {
        const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt);
        this.ctx.selectionTool.hoveredElementId = hit ? hit.element.id : null;
        if (hit) cursor = 'move';
      }

      this.callbacks.setCursor?.(cursor);
      this.ctx.renderOverlay();
      return true;
    }

    const dx = pt.x - this.dragStartPt.x;
    const dy = pt.y - this.dragStartPt.y;

    if (this.activeHandle === 'guide-move' && this.ctx.canvasMgr.selectedGuideId && this.guideInitialState) {
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        if (g.orientation === 'horizontal') {
          g.position = Math.round(this.guideInitialState.position + dy);
          g.pivotY = g.position;
        } else if (g.orientation === 'vertical') {
          g.position = Math.round(this.guideInitialState.position + dx);
          g.pivotX = g.position;
        } else {
          g.pivotX = Math.round((this.guideInitialState.pivotX || 0) + dx);
          g.pivotY = Math.round((this.guideInitialState.pivotY || 0) + dy);
        }
      }
      this.ctx.render();
      return true;
    }

    if (this.activeHandle === 'guide-pivot' && this.ctx.canvasMgr.selectedGuideId) {
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        g.pivotX = Math.round(pt.x);
        g.pivotY = Math.round(pt.y);
        if (g.orientation === 'horizontal') g.position = g.pivotY;
        if (g.orientation === 'vertical') g.position = g.pivotX;
      }
      this.ctx.render();
      return true;
    }

    if (this.activeHandle === 'guide-rotate' && this.ctx.canvasMgr.selectedGuideId) {
      this.callbacks.setCursor?.('grabbing');
      const g = this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId);
      if (g) {
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : this.ctx.model.canvas.width / 2);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : this.ctx.model.canvas.height / 2);
        const angleRad = Math.atan2(pt.y - py, pt.x - px);
        let deg = Math.round((angleRad * 180) / Math.PI);
        if (deg < 0) deg += 360;

        // Snap angle to 0, 45, 90, 135, 180, 225, 270, 315 if within 3 degrees
        const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
        for (const sa of snapAngles) {
          if (Math.abs(deg - sa) <= 3) {
            deg = sa % 360;
            break;
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
        let shouldDelete = false;
        if (g.orientation === 'horizontal' && (pt.y < 0 || pt.y > this.ctx.model.canvas.height)) {
          shouldDelete = true;
        } else if (g.orientation === 'vertical' && (pt.x < 0 || pt.x > this.ctx.model.canvas.width)) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          this.ctx.canvasMgr.removeGuide(g.id);
          this.callbacks.onClearPanelMode?.();
        }
        this.callbacks.syncMetadataToHost?.();
      }
      this.activeHandle = null;
      this.guideInitialState = null;
      this.ctx.render();
      return true;
    }

    // 2. Finishing Guide Transform (Pivot / Rotate)
    if (this.activeHandle === 'guide-pivot' || this.activeHandle === 'guide-rotate') {
      this.activeHandle = null;
      this.guideInitialState = null;
      this.callbacks.syncMetadataToHost?.();
      this.ctx.render();
      return true;
    }

    let hasChangesToCommit = false;

    // Commit Move Ghost
    if (this.activeHandle === 'move' && this.ghostDragOffset) {
      if (this.ghostDragOffset.x !== 0 || this.ghostDragOffset.y !== 0) {
        this.ctx.pushUndo();
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
        hasChangesToCommit = true;
      }
      this.ghostDragOffset = null;
    }

    // Commit Transform Ghost (Scale, Rotate)
    if (this.activeHandle && this.activeHandle !== 'move' && this.ghostTransformMap.size > 0) {
      this.ctx.pushUndo();
      this.ghostTransformMap.forEach((transformedVerts, id) => {
        const el = this.ctx.model.elements.find((e) => e.id === id);
        if (el) {
          el.vertices = transformedVerts;
          const isClosed = this.ctx.model.isElementClosed(el);
          el.attributes.d = this.ctx.model.compilePathD(el.vertices, isClosed);
        }
      });
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
    this.initialElementsMap.clear();
    this.initialBox = null;
    this.ctx.applyCanvasSize?.();
    this.ctx.render();
    if (hasChangesToCommit) {
      this.ctx.syncToHost();
    }
    return true;
  }

  public onDoubleClick(e: MouseEvent, pt: Point): boolean {
    // Double-click on guide line -> enter angle / pivot transform mode
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
      handled = true;
    }

    if (this.ghostDragOffset || this.ghostTransformMap.size > 0 || this.initialBox) {
      this.ghostDragOffset = null;
      this.ghostTransformMap.clear();
      this.initialBox = null;
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

    // 3. Bounding Box & 8 Resize Handles + Rotation Handle for Selected Elements
    const selectedEls = this.ctx.model.elements.filter((e) => this.ctx.selectionTool.isSelected(e.id));
    if (selectedEls.length > 0) {
      const groupBox = this.ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox) {
        html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

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

        // Rotation Handle
        const rotOffset = 18 / z;
        const rotR = 3.5 / z;
        html += `<line x1="${groupBox.cx}" y1="${groupBox.y}" x2="${groupBox.cx}" y2="${groupBox.y - rotOffset}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${groupBox.cx}" cy="${groupBox.y - rotOffset}" r="${rotR}" fill="#38bdf8" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
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
              const rx = (grad.r ?? 0.5) * box.width;
              const ry = (grad.r ?? 0.5) * box.height;
              const hSize = 6 / z;
              html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ec4899" stroke-width="1.2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${cx}" cy="${cy}" r="${hSize / 2}" fill="#ec4899" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${cx + rx}" cy="${cy}" r="${hSize / 2}" fill="#3b82f6" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
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

    return html;
  }
}
