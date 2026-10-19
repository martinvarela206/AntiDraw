import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, PointUtils, PathVertex, NodeType, VectorElement, RectCorners } from '../engine/VectorModel.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';
import { ParametricHandleController } from './node/ParametricHandleController.js';
import { NodeMarqueeSelector } from './node/NodeMarqueeSelector.js';
import { NodeOverlayBuilder } from './node/NodeOverlayBuilder.js';
import { NodeSubgroupTransformController } from './node/NodeSubgroupTransformController.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';

export interface NodeToolCallbacks {
  onNodeSelected?: (
    vertex: PathVertex,
    element: VectorElement,
    selectedCount?: number,
    selectedSegmentIdx?: number | null,
    selectedVertexIds?: string[]
  ) => void;
  onDeselectNode?: () => void;
  setCursor?: (cursor: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Advanced Vector Node Manipulation (NodeToolHandler)
 *
 * 1. Solidary Segment Translation:
 *    When dragging a path segment between two vertices, naive editors deform the surrounding
 *    handles or move only a single control point. `NodeToolHandler` invokes `moveSegment` to
 *    translate both bounding anchor vertices and their respective `handleIn` / `handleOut`
 *    tangents solidarily, preserving relative curvature and geometrical integrity without deformation.
 *
 * 2. De Casteljau Dynamic Subdivision on Double-Click:
 *    Double-clicking anywhere on a path segment divides the segment at the exact mathematical
 *    point via De Casteljau subdivision (`insertVertexOnPath`), inserting a new vertex while
 *    preserving the original contour curve with sub-pixel tolerance.
 * Why this solution is engineered this way:
 * 1. Single Responsibility Principle (SRP):
 *    All Bézier spline node movements, tangent/handle manipulation, segment dragging,
 *    and endpoint fusion logic are encapsulated cleanly here without polluting canvasMgr.
 * 2. Visual Ghost Feedback (Zero Intermediate Commits):
 *    Modifications are collected into `ghostNodeVertices` during pointer drag,
 *    updating only the overlay SVG. Final changes are committed to the model on
 *    `onPointerUp`, guaranteeing clean undo/redo history stacks.
 */
export class NodeToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['node'];
  private ctx: ToolContext;
  public nodeEditorTool: NodeEditorTool;
  private callbacks: NodeToolCallbacks;
  public readonly parametricController: ParametricHandleController;
  public readonly marqueeSelector: NodeMarqueeSelector;
  public readonly overlayBuilder: NodeOverlayBuilder;
  public readonly subgroupController: NodeSubgroupTransformController;

  public static readonly CURVE_CURSOR =
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'1.5\'%3E%3Cpath d=\'M3 3l7 14 3-5 6-1L3 3z\' fill=\'%23fff\'/%3E%3Cpath d=\'M12 17c2-3 5-3 8-1\' stroke=\'%236366f1\' stroke-width=\'2\' stroke-linecap=\'round\' fill=\'none\'/%3E%3C/svg%3E") 3 3, pointer';

  public ghostNodeVertices: PathVertex[] | null = null;
  public activeHandle:
    | 'vertex'
    | 'handleIn'
    | 'handleOut'
    | 'segment'
    | 'segment-curve'
    | 'quadrant'
    | 'ellipse-inner'
    | 'corner-tl'
    | 'corner-tr'
    | 'corner-br'
    | 'corner-bl'
    | 'marquee'
    | null = null;
  public dragStartPt: Point = { x: 0, y: 0 };
  public dragSegmentT: number = 0.5;
  public initialVertices: PathVertex[] = [];
  public isDragging: boolean = false;

  public get quadrantGhostMode(): 'ellipse' | 'pie' | 'arc' { return this.parametricController.quadrantGhostMode; }
  public set quadrantGhostMode(val: 'ellipse' | 'pie' | 'arc') { this.parametricController.quadrantGhostMode = val; }
  public get quadrantGhostStartAngle(): number { return this.parametricController.quadrantGhostStartAngle; }
  public set quadrantGhostStartAngle(val: number) { this.parametricController.quadrantGhostStartAngle = val; }
  public get quadrantGhostEndAngle(): number { return this.parametricController.quadrantGhostEndAngle; }
  public set quadrantGhostEndAngle(val: number) { this.parametricController.quadrantGhostEndAngle = val; }
  public get quadrantCenter(): Point { return this.parametricController.quadrantCenter; }
  public set quadrantCenter(val: Point) { this.parametricController.quadrantCenter = val; }
  public get quadrantRadii(): { rx: number; ry: number } { return this.parametricController.quadrantRadii; }
  public set quadrantRadii(val: { rx: number; ry: number }) { this.parametricController.quadrantRadii = val; }
  public get quadrantGhostD(): string { return this.parametricController.quadrantGhostD; }
  public set quadrantGhostD(val: string) { this.parametricController.quadrantGhostD = val; }

  public get ellipseInnerGhostRatio(): number { return this.parametricController.ellipseInnerGhostRatio; }
  public set ellipseInnerGhostRatio(val: number) { this.parametricController.ellipseInnerGhostRatio = val; }

  public get rectGhostD(): string { return this.parametricController.rectGhostD; }
  public set rectGhostD(val: string) { this.parametricController.rectGhostD = val; }
  public get rectGhostCorners(): RectCorners { return this.parametricController.rectGhostCorners; }
  public set rectGhostCorners(val: RectCorners) { this.parametricController.rectGhostCorners = val; }
  public get rectGhostBounds(): { x: number; y: number; w: number; h: number } { return this.parametricController.rectGhostBounds; }
  public set rectGhostBounds(val: { x: number; y: number; w: number; h: number }) { this.parametricController.rectGhostBounds = val; }
  public get rectGhostActiveRadius(): number { return this.parametricController.rectGhostActiveRadius; }
  public set rectGhostActiveRadius(val: number) { this.parametricController.rectGhostActiveRadius = val; }
  public get rectGhostActiveCorner(): 'tl' | 'tr' | 'br' | 'bl' { return this.parametricController.rectGhostActiveCorner; }
  public set rectGhostActiveCorner(val: 'tl' | 'tr' | 'br' | 'bl') { this.parametricController.rectGhostActiveCorner = val; }

  public pendingSingleVertexId: string | null = null;
  private lastClickTime: number = 0;
  private lastClickPt: Point = { x: 0, y: 0 };
  private lastDoubleClickHandledTime: number = 0;

  constructor(ctx: ToolContext, nodeEditorTool: NodeEditorTool, callbacks: NodeToolCallbacks = {}) {
    this.ctx = ctx;
    this.nodeEditorTool = nodeEditorTool;
    this.callbacks = callbacks;
    this.parametricController = new ParametricHandleController(ctx);
    this.marqueeSelector = new NodeMarqueeSelector();
    this.overlayBuilder = new NodeOverlayBuilder(ctx, nodeEditorTool);
    this.subgroupController = new NodeSubgroupTransformController();
    // Unify single source of truth for selected vertex IDs
    this.nodeEditorTool.selectedVertexIds = this.marqueeSelector.selectedVertexIds;
  }

  private isElementClosed(el: VectorElement): boolean {
    return this.ctx.model.isElementClosed(el);
  }

  private isParametricHandle(handle: string | null): handle is string {
    if (!handle) return false;
    return (
      handle === 'quadrant' ||
      handle === 'quadrant-start' ||
      handle === 'quadrant-end' ||
      handle === 'ellipse-inner' ||
      handle === 'star-edge' ||
      handle.startsWith('corner-')
    );
  }

  public getQuadrantHandlePoint(el: VectorElement): Point | null {
    return this.parametricController.getQuadrantHandlePoint(el);
  }

  public getEllipseInnerHandlePoint(el: VectorElement): Point | null {
    return this.parametricController.getEllipseInnerHandlePoint(el);
  }

  public getRectCornerHandles(
    el: VectorElement,
    z: number = 1
  ): { tl: Point; tr: Point; br: Point; bl: Point } | null {
    return this.parametricController.getRectCornerHandles(el, z);
  }

  /**
   * ARCHITECTURAL RATIONALE: Deterministic Software Double-Click Resolution
   *
   * Why software double-click resolution is essential in SVG webviews:
   * 1. DOM Re-render / Target Detachment Gotcha:
   *    Whenever `render()` or `renderOverlay()` rebuilds `svgCanvas.innerHTML` during pointerdown,
   *    the native DOM element underneath the pointer is destroyed and replaced by a newly created node.
   *    Standard browser engines (Blink/Chromium) compare event target identity between click 1 and click 2;
   *    if the target element reference was destroyed or differs, Blink resets its internal click count to 1
   *    and completely suppresses the native `dblclick` event.
   * 2. Temporal & Spatial Window:
   *    Tracking consecutive clicks within 400ms and <= 12 / z canvas units guarantees 100% reliable
   *    double-click detection regardless of browser event lifecycle quirks or lost pointer capture.
   * 3. Precedence Order:
   *    Check anchor vertex hit first -> deletes the vertex if element has > 2 vertices.
   *    If no vertex is hit, test proximity to contour segments -> inserts new vertex via De Casteljau subdivision.
   */
  public executeDoubleClick(pt: Point, z: number): boolean {
    this.lastDoubleClickHandledTime = Date.now();

    let selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl) {
      const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, z);
      if (hit) {
        this.ctx.selectionTool.select(hit.element.id);
        selectedEl = hit.element;
      }
    }
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length === 0) return false;

    const isClosed = this.isElementClosed(selectedEl);

    /**
     * ARCHITECTURAL RATIONALE: Parametric Element Double-Click Delegation (ITEM-03 CorelDraw Parity)
     * Parametric primitives (<rect>, <circle>, <ellipse>, <line>) have dedicated parametric handles
     * and do not permit free node insertion or vertex deletion without prior conversion to curves (Ctrl+Q).
     * By returning `false` here instead of launching an intrusive modal prompt, double-clicking on a
     * parametric primitive cleanly delegates to tool conmutation, switching back to the Selection Tool ('select')
     * without interrupting user workflow or breaking rapid symmetrical toggle sequences.
     */
    const isPoly = this.ctx.model.isPolyline(selectedEl) || this.ctx.model.isPolygon(selectedEl);
    if (this.ctx.model.isParametricElement(selectedEl) && !isPoly) {
      return false;
    }

    // 1. Double-click on existing vertex -> Delete vertex
    const hitNode = this.nodeEditorTool.hitTestVertices(
      selectedEl.vertices,
      pt,
      14 / z,
      this.nodeEditorTool.selectedVertexId
    );

    if (hitNode && hitNode.type === 'vertex') {
      const minVerts = selectedEl.tagName === 'polygon' ? 3 : 2;
      if (selectedEl.vertices.length > minVerts) {
        this.ctx.pushUndo();
        selectedEl.vertices = this.nodeEditorTool.deleteVertex(selectedEl.vertices, hitNode.vertex.id);
        selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
        selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
        if (this.ctx.model.isParametricElement(selectedEl)) {
          this.ctx.model.syncParametricAttributes(selectedEl);
        }
        this.nodeEditorTool.selectedVertexId = null;
        this.nodeEditorTool.selectedHandleType = null;
        this.nodeEditorTool.selectedSegmentIdx = null;
        this.isDragging = false;
        this.activeHandle = null;
        this.ghostNodeVertices = null;
        if (this.callbacks.onDeselectNode) {
          this.callbacks.onDeselectNode();
        }
        if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
        this.ctx.render();
        this.ctx.syncToHost();
        return true;
      }
    }

    // 2. Double-click on path segment -> Insert vertex via De Casteljau subdivision
    const tol = 14 / z;
    const res = this.nodeEditorTool.insertVertexOnPath(selectedEl.vertices, pt, tol, isClosed);
    if (res) {
      this.ctx.pushUndo();
      selectedEl.vertices = res.updatedVertices;
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
      if (this.ctx.model.isParametricElement(selectedEl)) {
        this.ctx.model.syncParametricAttributes(selectedEl);
      }
      this.nodeEditorTool.selectedVertexId = res.newVertexId;
      this.nodeEditorTool.selectedHandleType = 'vertex';
      this.nodeEditorTool.selectedSegmentIdx = null;
      this.isDragging = false;
      this.activeHandle = null;
      this.ghostNodeVertices = null;
      const newV = selectedEl.vertices.find((v) => v.id === res.newVertexId);
      if (newV && this.callbacks.onNodeSelected) {
        this.callbacks.onNodeSelected(
          newV,
          selectedEl,
          1,
          this.nodeEditorTool.selectedSegmentIdx,
          Array.from(this.marqueeSelector.selectedVertexIds)
        );
      }
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }

    return false;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'node') return false;
    if (e.button !== 0) return false;

    const z = this.ctx.canvasMgr.zoom || 1;
    const now = Date.now();
    const timeSinceLast = now - this.lastClickTime;
    const distSinceLast = Math.hypot(pt.x - this.lastClickPt.x, pt.y - this.lastClickPt.y);

    // Fast double-click detection: 2 clicks within 400ms and within 12 screen-pixels
    if (timeSinceLast < 400 && distSinceLast <= 12 / z) {
      this.lastClickTime = 0;
      this.lastClickPt = { x: 0, y: 0 };
      if (this.executeDoubleClick(pt, z)) {
        this.lastDoubleClickHandledTime = now;
        return true;
      }

      /**
       * ARCHITECTURAL RATIONALE: Symmetrical Tool Conmutation (Node Tool -> Select Tool - ITEM-03)
       * When executeDoubleClick does not handle vertex deletion or insertion, any double click
       * (whether on empty canvas space, element body, or parametric primitive) cleanly conmoves
       * back to the Selection Tool ('select'), completing bidirectional symmetry with SelectToolHandler.
       * Eliminates accidental conversion modal popups on parametric primitives during fast toggle clicks.
       */
      this.lastDoubleClickHandledTime = now;
      this.ctx.setTool('select');
      this.ctx.render();
      return true;
    }

    this.lastClickTime = now;
    this.lastClickPt = { x: pt.x, y: pt.y };

    let selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));

    // If no element is selected yet in node tool, try to hit-test any element under cursor
    if (!selectedEl) {
      const hit = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, z);
      if (hit) {
        this.ctx.selectionTool.select(hit.element.id);
        selectedEl = hit.element;
      }
    }

    if (selectedEl && selectedEl.vertices && selectedEl.vertices.length > 0) {
      // 0. Check if clicking on parametric handles (ellipse quadrant/inner or rect corner)
      const paramDown = this.parametricController.handlePointerDown(selectedEl, pt, z);
      if (paramDown) {
        this.activeHandle = paramDown.activeHandle as any;
        this.dragStartPt = { x: pt.x, y: pt.y };
        this.initialVertices = paramDown.initialVertices;
        this.isDragging = true;
        this.ctx.renderOverlay();
        return true;
      }

      const isClosed = this.isElementClosed(selectedEl);

      // 0.5 Check if clicking on Subgroup Transformation handles or Mini-HUD for N >= 2 selected nodes
      if (this.marqueeSelector.selectedVertexIds.size >= 2 && !this.ctx.model.isEllipse(selectedEl)) {
        const subHit = this.subgroupController.hitTest(
          selectedEl,
          this.marqueeSelector.selectedVertexIds,
          pt,
          z
        );
        if (subHit) {
          if (subHit.type === 'hud' && subHit.hudMode) {
            this.subgroupController.setMode(subHit.hudMode);
            this.callbacks.setCursor?.('default');
            this.ctx.renderOverlay();
            return true;
          }
          if (subHit.type === 'handle' && subHit.handle) {
            // Prioritize direct click on an anchor vertex if cursor is immediately over one
            const directVertexHit = this.nodeEditorTool.hitTestVertices(selectedEl.vertices, pt, 8 / z);
            if (!directVertexHit) {
              this.activeHandle = ('subgroup-' + subHit.handle) as any;
              this.dragStartPt = { x: pt.x, y: pt.y };
              this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
              this.subgroupController.startTransform(
                subHit.handle,
                pt,
                selectedEl.vertices,
                this.marqueeSelector.selectedVertexIds
              );
              this.ghostNodeVertices = null;
              this.isDragging = true;
              this.ctx.renderOverlay();
              return true;
            }
          }
        }
      }

      // 1. Check if clicking on an existing vertex or Bézier handle
      /**
       * ARCHITECTURAL RATIONALE: Parametric Ellipse & Donut Vertex Immutability (FIX-08)
       * Why: Parametric ellipses, circles, pies, arcs, and donuts derive their SVG paths and Bézier
       * approximations analytically via `convertEllipseToVertices` and `compileEllipseD`. Allowing free
       * manipulation of individual internal Bézier vertices corrupts the mathematical invariants of the
       * primitive, distorts the contour into an unrecoverable asymmetrical spline, and desynchronizes the
       * visual shape from inspector properties (such as startAngle, endAngle, innerRatio).
       * Discarded alternatives:
       * - Permitting vertex dragging and updating `rx`/`ry`: Fails as soon as the ellipse is a partial pie/arc/donut,
       *   because vertices no longer map to simple axis-aligned radii and dragging arbitrary vertices warps the contour.
       * - Free Bézier editing without converting to curves: Corrupts the ghost overlay and breaks parametric handles.
       * Solution: Primitives with `isEllipse` strictly block vertex hit testing and dragging. To edit free Béziers,
       * the user must convert the primitive to curves (Ctrl+Q).
       */
      const hitNode = !this.ctx.model.isEllipse(selectedEl)
        ? this.nodeEditorTool.hitTestVertices(
            selectedEl.vertices,
            pt,
            12 / z,
            this.nodeEditorTool.selectedVertexId,
            16 / z
          )
        : null;

      if (hitNode) {
        const isShift = e.shiftKey;
        const isCtrl = e.ctrlKey || e.metaKey;
        const isAdditive = isShift || isCtrl;
        const wasAlreadySelected = this.marqueeSelector.isVertexSelected(hitNode.vertex.id);

        if (hitNode.type === 'handleIn' || hitNode.type === 'handleOut') {
          // Dedicated Bézier handle manipulation: isolate active handle and vertex
          this.pendingSingleVertexId = null;
          this.marqueeSelector.clearSelection();
          this.marqueeSelector.selectVertex(hitNode.vertex.id, true);
          this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
          this.nodeEditorTool.selectedHandleType = hitNode.type;
          this.nodeEditorTool.selectedSegmentIdx = null;
          this.activeHandle = hitNode.type;
          this.dragStartPt = { x: pt.x, y: pt.y };
          this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
          this.ghostNodeVertices = null;
          this.isDragging = true;

          if (this.callbacks.onNodeSelected) {
            this.callbacks.onNodeSelected(
              hitNode.vertex,
              selectedEl,
              1,
              null,
              [hitNode.vertex.id]
            );
          }
          this.ctx.render();
          return true;
        }

        /**
         * ARCHITECTURAL RATIONALE: Multi-Vertex Selection Preservation & Shift Toggle
         * 1. Shift / Ctrl Toggle:
         *    If the clicked vertex is already selected, Shift+click removes it from the set (toggle-off).
         *    If unselected, Shift+click appends it without clearing other selections.
         * 2. Drag Preparation for Multi-Selection:
         *    When a user clicks on an already-selected vertex WITHOUT modifier keys, the multi-selection
         *    must NOT be destroyed on mousedown. The entire group must remain selected so that dragging
         *    moves all selected nodes solidarily.
         *    If the interaction ends as a simple click without dragging (pointerup with displacement <= 4px),
         *    selection is then narrowed to this single clicked vertex.
         */
        if (isAdditive) {
          this.marqueeSelector.selectVertex(hitNode.vertex.id, true, true);
          this.pendingSingleVertexId = null;
          if (this.marqueeSelector.isVertexSelected(hitNode.vertex.id)) {
            this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
          } else {
            const remaining = Array.from(this.marqueeSelector.selectedVertexIds);
            this.nodeEditorTool.selectedVertexId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
          }
        } else {
          if (wasAlreadySelected && this.marqueeSelector.selectedVertexIds.size > 1) {
            this.pendingSingleVertexId = hitNode.vertex.id;
            this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
          } else {
            this.pendingSingleVertexId = null;
            this.marqueeSelector.selectVertex(hitNode.vertex.id, false);
            this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
          }
        }

        this.nodeEditorTool.selectedHandleType = hitNode.type;
        this.nodeEditorTool.selectedSegmentIdx = null;
        this.activeHandle = hitNode.type;
        this.dragStartPt = { x: pt.x, y: pt.y };
        this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
        this.ghostNodeVertices = null;
        this.isDragging = true;

        if (this.callbacks.onNodeSelected && this.nodeEditorTool.selectedVertexId) {
          const activeV = selectedEl.vertices.find((v) => v.id === this.nodeEditorTool.selectedVertexId);
          if (activeV) {
            const selCount = Math.max(1, this.marqueeSelector.selectedVertexIds.size);
            this.callbacks.onNodeSelected(
              activeV,
              selectedEl,
              selCount,
              this.nodeEditorTool.selectedSegmentIdx,
              Array.from(this.marqueeSelector.selectedVertexIds)
            );
          }
        } else if (!this.nodeEditorTool.selectedVertexId && this.callbacks.onDeselectNode) {
          this.callbacks.onDeselectNode();
        }
        this.ctx.render();
        return true;
      }

      // 2. Check if clicking directly on a path segment
      // Parametric primitives block free segment dragging/distortion
      if (this.ctx.model.isParametricElement(selectedEl)) {
        return false;
      }

      const hitSegment = this.nodeEditorTool.hitTestSegment(
        selectedEl.vertices,
        pt,
        8 / z,
        isClosed
      );

      if (hitSegment !== null) {
        this.nodeEditorTool.selectedSegmentIdx = hitSegment;
        const nextIdx = (hitSegment + 1) % selectedEl.vertices.length;
        const v1 = selectedEl.vertices[hitSegment];
        const v2 = selectedEl.vertices[nextIdx];

        // Check if BOTH bounding vertices of this segment were already selected prior to this click
        const bothVerticesPreSelected =
          this.marqueeSelector.selectedVertexIds.has(v1.id) &&
          this.marqueeSelector.selectedVertexIds.has(v2.id);

        // Disambiguation rule:
        // - Default: if both nodes were pre-selected -> rigid translation ('segment')
        //            if not both pre-selected -> direct curve bending ('segment-curve')
        // - Alt key: inverts this decision
        const wantsRigidMove = e.altKey ? !bothVerticesPreSelected : bothVerticesPreSelected;

        // Select BOTH bounding vertices of the segment for inspector display
        this.marqueeSelector.clearSelection();
        this.marqueeSelector.selectVertex(v1.id, true);
        this.marqueeSelector.selectVertex(v2.id, true);

        this.nodeEditorTool.selectedVertexId = v2.id;
        this.nodeEditorTool.selectedHandleType = null;
        this.dragStartPt = { x: pt.x, y: pt.y };
        this.ghostNodeVertices = null;
        this.isDragging = true;

        if (wantsRigidMove) {
          this.activeHandle = 'segment';
          this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
        } else {
          this.activeHandle = 'segment-curve';
          // Auto-convert to Bézier curve on the fly if straight linear segment
          let baseVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
          if (!v1.handleOut && !v2.handleIn) {
            baseVertices = this.nodeEditorTool.convertSegmentToCurve(baseVertices, hitSegment, isClosed);
          }
          this.initialVertices = baseVertices;
          this.dragSegmentT = this.nodeEditorTool.calculateSegmentT(v1, v2, pt);
        }

        if (this.callbacks.onNodeSelected) {
          this.callbacks.onNodeSelected(
            selectedEl.vertices[nextIdx],
            selectedEl,
            2,
            hitSegment,
            Array.from(this.marqueeSelector.selectedVertexIds)
          );
        }
        this.ctx.render();
        return true;
      }

      // Check if clicking another element on canvas while in node mode
      const hitOther = this.ctx.selectionTool.hitTest(this.ctx.model.elements, pt, z);
      if (hitOther && hitOther.element.id !== selectedEl.id) {
        this.ctx.selectionTool.select(hitOther.element.id);
        this.nodeEditorTool.selectedVertexId = null;
        this.nodeEditorTool.selectedHandleType = null;
        this.nodeEditorTool.selectedSegmentIdx = null;
        this.marqueeSelector.clearSelection();
        if (this.callbacks.onDeselectNode) {
          this.callbacks.onDeselectNode();
        }
        this.ctx.render();
        return true;
      }

      // 3. Clicked empty area: start rubber-band marquee selection across vertices
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;
      const isAlt = e.altKey;
      this.activeHandle = 'marquee';
      this.dragStartPt = { x: pt.x, y: pt.y };
      this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
      this.ghostNodeVertices = null;
      this.isDragging = true;
      this.marqueeSelector.startMarquee(pt, isShift || isCtrl, isAlt);
      this.ctx.renderOverlay();
      return true;
    }

    // No element selected: switch to select tool
    this.ctx.selectionTool.deselectAll();
    this.ctx.setTool('select');
    if (this.callbacks.onDeselectNode) {
      this.callbacks.onDeselectNode();
    }
    this.ctx.render();
    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'node') return false;

    if (this.isDragging && this.activeHandle) {
      const z = this.ctx.canvasMgr.zoom || 1;
      if (Math.hypot(pt.x - this.dragStartPt.x, pt.y - this.dragStartPt.y) > 4 / z) {
        this.lastClickTime = 0;
        this.pendingSingleVertexId = null;
      }

      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
      if (!selectedEl || !this.initialVertices || this.initialVertices.length === 0) return false;

      const isClosed = this.isElementClosed(selectedEl);
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (this.activeHandle === 'marquee') {
        this.marqueeSelector.updateMarquee(pt);
        this.ctx.renderOverlay();
        return true;
      }

      if (this.isParametricHandle(this.activeHandle) && selectedEl) {
        const paramMove = this.parametricController.handlePointerMove(
          selectedEl,
          this.activeHandle,
          pt,
          isShift,
          isCtrl,
          e.altKey
        );
        if (paramMove && paramMove.handled) {
          if (paramMove.ghostNodeVertices) {
            this.ghostNodeVertices = paramMove.ghostNodeVertices;
          }
          this.ctx.renderOverlay();
          return true;
        }
      }

      if (this.activeHandle && (this.activeHandle as string).startsWith('subgroup-')) {
        const transformed = this.subgroupController.updateTransform(
          pt,
          isShift,
          isCtrl,
          e.altKey,
          this.marqueeSelector.selectedVertexIds
        );
        if (transformed) {
          this.ghostNodeVertices = transformed;
          this.ctx.renderOverlay();
          return true;
        }
      }

      if (this.activeHandle === 'vertex' && this.nodeEditorTool.selectedVertexId) {
        const otherVertices = this.ctx.getOtherVertices([selectedEl.id]);
        if (selectedEl.vertices) {
          selectedEl.vertices.forEach((v) => {
            if (!this.marqueeSelector.isVertexSelected(v.id)) {
              otherVertices.push({ x: v.x, y: v.y });
            }
          });
        }
        const snappedPt = this.ctx.snapPoint(pt, otherVertices);

        // Multi-vertex translation when multiple nodes are selected
        if (
          this.marqueeSelector.selectedVertexIds.size > 1 &&
          this.marqueeSelector.isVertexSelected(this.nodeEditorTool.selectedVertexId)
        ) {
          let dx = snappedPt.x - this.dragStartPt.x;
          let dy = snappedPt.y - this.dragStartPt.y;
          if (isShift) {
            const snappedAnglePt = PointUtils.snapAngle({ x: 0, y: 0 }, { x: dx, y: dy }, Math.PI / 12);
            dx = snappedAnglePt.x;
            dy = snappedAnglePt.y;
          }
          this.ghostNodeVertices = this.initialVertices.map((v) => {
            if (this.marqueeSelector.isVertexSelected(v.id)) {
              return {
                ...v,
                x: v.x + dx,
                y: v.y + dy,
                handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
                handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
              };
            }
            return v;
          });
          this.ctx.renderOverlay();
          return true;
        }

        // ARCHITECTURAL RATIONALE: Constrained Parametric Primitive Dragging (FEAT-01)
        // When moving vertices of a parametric primitive, maintain its geometric invariants
        // (orthogonal rectangle angles, 4-node smooth ellipse curvature, etc.) rather than
        // distorting it into an asymmetrical polygon.
        if (this.ctx.model.isParametricElement(selectedEl)) {
          const vIdx = this.initialVertices.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);
          const tag = selectedEl.shapeType || selectedEl.tagName;

          if (tag === 'rect' && this.initialVertices.length === 4) {
            // Rect vertex 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
            const oppIdx = (vIdx + 2) % 4;
            const opp = this.initialVertices[oppIdx];
            const minX = Math.min(opp.x, snappedPt.x);
            const maxX = Math.max(opp.x, snappedPt.x);
            const minY = Math.min(opp.y, snappedPt.y);
            const maxY = Math.max(opp.y, snappedPt.y);
            const w = Math.max(1, maxX - minX);
            const h = Math.max(1, maxY - minY);
            this.ghostNodeVertices = this.ctx.model.convertShapeToVertices('rect', {
              x: minX.toString(),
              y: minY.toString(),
              width: w.toString(),
              height: h.toString(),
            });
            this.ctx.renderOverlay();
            return true;
          } else if ((tag === 'ellipse' || tag === 'circle') && this.initialVertices.length === 4) {
            // Ellipse vertices 0=top 12h, 1=right 3h, 2=bottom 6h, 3=left 9h
            const cx = (this.initialVertices[1].x + this.initialVertices[3].x) / 2;
            const cy = (this.initialVertices[0].y + this.initialVertices[2].y) / 2;
            let rx = Math.abs(this.initialVertices[1].x - cx);
            let ry = Math.abs(this.initialVertices[0].y - cy);
            if (vIdx === 0 || vIdx === 2) {
              ry = Math.max(1, Math.abs(snappedPt.y - cy));
            } else {
              rx = Math.max(1, Math.abs(snappedPt.x - cx));
            }
            if (tag === 'circle') {
              const uniformR = Math.max(rx, ry);
              rx = uniformR;
              ry = uniformR;
            }
            this.ghostNodeVertices = this.ctx.model.convertShapeToVertices('ellipse', {
              cx: cx.toString(),
              cy: cy.toString(),
              rx: rx.toString(),
              ry: ry.toString(),
            });
            this.ctx.renderOverlay();
            return true;
          } else if (tag === 'line' && this.initialVertices.length === 2) {
            /**
             * ARCHITECTURAL RATIONALE: Restricted <line> Vertex Dragging (FEAT-04)
             * A native <line> only allows displacing either of its two endpoints (x1, y1) or (x2, y2).
             * Zero Bézier distortion is allowed; straight line geometry is strictly preserved.
             */
            const updatedVerts = this.initialVertices.map((v, i) =>
              i === vIdx
                ? { ...v, x: snappedPt.x, y: snappedPt.y, handleIn: undefined, handleOut: undefined }
                : { ...v, handleIn: undefined, handleOut: undefined }
            );
            this.ghostNodeVertices = updatedVerts;
            this.ctx.renderOverlay();
            return true;
          } else if (tag === 'polyline' || tag === 'polygon') {
            /**
             * ARCHITECTURAL RATIONALE: Restricted <polyline> and <polygon> Vertex Dragging (FEAT-04)
             * Vertices are moved purely as linear sharp/corner points without Bézier handles,
             * directly updating the native SVG `points` attribute without mutating to <path>.
             */
            const updatedVerts = this.initialVertices.map((v, i) =>
              i === vIdx
                ? { ...v, x: snappedPt.x, y: snappedPt.y, handleIn: undefined, handleOut: undefined }
                : { ...v, handleIn: undefined, handleOut: undefined }
            );
            this.ghostNodeVertices = updatedVerts;
            this.ctx.renderOverlay();
            return true;
          }
        }

        let effVertexPt = snappedPt;
        if (isShift) {
          const initV = this.initialVertices.find((v) => v.id === this.nodeEditorTool.selectedVertexId);
          if (initV) {
            effVertexPt = PointUtils.snapAngle({ x: initV.x, y: initV.y }, snappedPt, Math.PI / 12);
          }
        }

        const result = this.nodeEditorTool.moveVertex(
          this.initialVertices,
          this.nodeEditorTool.selectedVertexId,
          effVertexPt,
          isCtrl,
          this.ctx.model.elements
        );
        this.ghostNodeVertices = result.updatedVertices;
        this.ctx.renderOverlay();
        return true;
      }

      if (
        (this.activeHandle === 'handleIn' || this.activeHandle === 'handleOut') &&
        this.nodeEditorTool.selectedVertexId
      ) {
        const otherVertices: Point[] = [];
        this.initialVertices.forEach((v) => {
          otherVertices.push({ x: v.x, y: v.y });
          if (v.handleIn) otherVertices.push({ x: v.handleIn.x, y: v.handleIn.y });
          if (v.handleOut) otherVertices.push({ x: v.handleOut.x, y: v.handleOut.y });
        });
        let effHandlePt = this.ctx.snapPoint(pt, otherVertices);
        if (isShift) {
          const v = this.initialVertices.find((item) => item.id === this.nodeEditorTool.selectedVertexId);
          if (v) {
            effHandlePt = PointUtils.snapAngle({ x: v.x, y: v.y }, effHandlePt, Math.PI / 12);
          }
        }

        this.ghostNodeVertices = this.nodeEditorTool.moveHandle(
          this.initialVertices,
          this.nodeEditorTool.selectedVertexId,
          this.activeHandle,
          effHandlePt
        );
        this.ctx.renderOverlay();
        return true;
      }

      if (
        this.activeHandle === 'segment-curve' &&
        this.nodeEditorTool.selectedSegmentIdx !== null
      ) {
        const dx = pt.x - this.dragStartPt.x;
        const dy = pt.y - this.dragStartPt.y;

        this.ghostNodeVertices = this.nodeEditorTool.bendSegment(
          this.initialVertices,
          this.nodeEditorTool.selectedSegmentIdx,
          this.dragSegmentT,
          dx,
          dy,
          isClosed
        );
        this.ctx.renderOverlay();
        return true;
      }

      if (
        this.activeHandle === 'segment' &&
        this.nodeEditorTool.selectedSegmentIdx !== null
      ) {
        const otherVertices = this.ctx.getOtherVertices(Array.from(this.ctx.selectionTool.selectedElementIds));
        const snappedPt = this.ctx.snapPoint(pt, otherVertices);
        const dx = snappedPt.x - this.dragStartPt.x;
        const dy = snappedPt.y - this.dragStartPt.y;

        this.ghostNodeVertices = this.nodeEditorTool.moveSegment(
          this.initialVertices,
          this.nodeEditorTool.selectedSegmentIdx,
          dx,
          dy,
          isClosed
        );
        this.ctx.renderOverlay();
        return true;
      }
    }

    if (!this.isDragging) {
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
      if (selectedEl) {
        const z = this.ctx.canvasMgr.zoom || 1;
        if (this.marqueeSelector.selectedVertexIds.size >= 2) {
          const hoverCursor = this.subgroupController.getHoverCursor(
            selectedEl,
            this.marqueeSelector.selectedVertexIds,
            pt,
            z
          );
          if (hoverCursor) {
            this.callbacks.setCursor?.(hoverCursor);
            return true;
          }
        }

        // Check hover over segments for predictive curvature / move cursor
        if (selectedEl.vertices && selectedEl.vertices.length >= 2 && !this.ctx.model.isParametricElement(selectedEl)) {
          const isClosed = this.isElementClosed(selectedEl);
          const hitSegment = this.nodeEditorTool.hitTestSegment(selectedEl.vertices, pt, 8 / z, isClosed);
          if (hitSegment !== null) {
            const nextIdx = (hitSegment + 1) % selectedEl.vertices.length;
            const v1Id = selectedEl.vertices[hitSegment].id;
            const v2Id = selectedEl.vertices[nextIdx].id;
            const bothSelected =
              this.marqueeSelector.selectedVertexIds.has(v1Id) &&
              this.marqueeSelector.selectedVertexIds.has(v2Id);
            const isAlt = e.altKey;
            const willMove = isAlt ? !bothSelected : bothSelected;
            this.callbacks.setCursor?.(willMove ? 'move' : NodeToolHandler.CURVE_CURSOR);
            return true;
          }
        }

        this.callbacks.setCursor?.('default');
      }
    }

    return false;
  }

  public onPointerUp(e: PointerEvent, _pt: Point): boolean {
    if (this.isDragging) {
      this.isDragging = false;
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));

      if (this.activeHandle && (this.activeHandle as string).startsWith('subgroup-')) {
        this.subgroupController.finishTransform();
      }

      /**
       * ARCHITECTURAL RATIONALE: Multi-Selection Narrowing on Click
       * When the user clicks an already-selected node without dragging (displacement <= 4px),
       * the pending single vertex isolates and narrows the multi-selection down to that single vertex.
       */
      if (this.pendingSingleVertexId) {
        this.marqueeSelector.selectVertex(this.pendingSingleVertexId, false);
        this.nodeEditorTool.selectedVertexId = this.pendingSingleVertexId;
        this.pendingSingleVertexId = null;
        this.activeHandle = null;
        this.initialVertices = [];
        this.ghostNodeVertices = null;
        if (selectedEl && this.callbacks.onNodeSelected) {
          const v = selectedEl.vertices?.find((vert) => vert.id === this.nodeEditorTool.selectedVertexId);
          if (v) {
            this.callbacks.onNodeSelected(
              v,
              selectedEl,
              1,
              this.nodeEditorTool.selectedSegmentIdx,
              Array.from(this.marqueeSelector.selectedVertexIds)
            );
          }
        }
        this.ctx.render();
        return true;
      }

      if (this.activeHandle === 'marquee' && selectedEl) {
        const canSelectVertices = !this.ctx.model.isEllipse(selectedEl);
        const hitIds = canSelectVertices
          ? this.marqueeSelector.finishMarquee(selectedEl.vertices || [])
          : [];
        this.activeHandle = null;
        this.initialVertices = [];
        const selCount = this.marqueeSelector.selectedVertexIds.size;
        if (selCount > 0) {
          const firstSelectedId = Array.from(this.marqueeSelector.selectedVertexIds)[0];
          this.nodeEditorTool.selectedVertexId = firstSelectedId;
          this.nodeEditorTool.selectedHandleType = 'vertex';
          const v = selectedEl.vertices?.find((vert) => vert.id === firstSelectedId);
          if (v && this.callbacks.onNodeSelected) {
            this.callbacks.onNodeSelected(
              v,
              selectedEl,
              selCount,
              this.nodeEditorTool.selectedSegmentIdx,
              Array.from(this.marqueeSelector.selectedVertexIds)
            );
          }
        } else if (!this.marqueeSelector.isAdditive) {
          this.nodeEditorTool.selectedVertexId = null;
          this.nodeEditorTool.selectedHandleType = null;
          if (this.callbacks.onDeselectNode) {
            this.callbacks.onDeselectNode();
          }
        }
        this.ctx.render();
        return true;
      }

      if (this.isParametricHandle(this.activeHandle) && selectedEl) {
        const handled = this.parametricController.handlePointerUp(
          selectedEl,
          this.activeHandle,
          this.ghostNodeVertices,
          this.initialVertices
        );
        if (handled) {
          this.activeHandle = null;
          this.ghostNodeVertices = null;
          this.initialVertices = [];
          return true;
        }
      }

      if (selectedEl && this.ghostNodeVertices) {
        this.ctx.pushUndo();
        let isClosed = this.isElementClosed(selectedEl);
        const isCtrl = e.ctrlKey || e.metaKey;

        // ARCHITECTURAL RATIONALE: Endpoint Drag Auto-Closure & Coincident Fusion (FIX-03)
        // If an artist drags an open vector's free endpoint onto its opposite terminal endpoint,
        // auto-closure and node welding occurs ONLY when the user explicitly holds the Ctrl key.
        // If Ctrl is NOT pressed, nodes may freely cross or coincide without accidental path closure.
        if (isCtrl && !isClosed && this.ghostNodeVertices.length >= 2) {
          const firstV = this.ghostNodeVertices[0];
          const lastV = this.ghostNodeVertices[this.ghostNodeVertices.length - 1];
          if (Math.hypot(lastV.x - firstV.x, lastV.y - firstV.y) <= this.nodeEditorTool.fusionThreshold) {
            const closeRes = this.nodeEditorTool.closePath(this.ghostNodeVertices);
            this.ghostNodeVertices = closeRes.updatedVertices;
            selectedEl.isClosed = true;
            isClosed = true;
            if (!selectedEl.attributes.fill || selectedEl.attributes.fill === 'none') {
              selectedEl.attributes.fill = '#6366f1';
            }
          }
        }

        selectedEl.vertices = this.ghostNodeVertices;
        selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
        selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
        if (this.ctx.model.isParametricElement(selectedEl)) {
          this.ctx.model.syncParametricAttributes(selectedEl);
        }

        if (this.nodeEditorTool.selectedVertexId && this.callbacks.onNodeSelected) {
          const activeV = selectedEl.vertices.find((v) => v.id === this.nodeEditorTool.selectedVertexId);
          if (activeV) {
            const selCount = Math.max(1, this.marqueeSelector.selectedVertexIds.size);
            this.callbacks.onNodeSelected(
              activeV,
              selectedEl,
              selCount,
              this.nodeEditorTool.selectedSegmentIdx,
              Array.from(this.marqueeSelector.selectedVertexIds)
            );
          }
        }

        this.ghostNodeVertices = null;
        this.activeHandle = null;
        this.initialVertices = [];
        if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
        this.ctx.render();
        this.ctx.syncToHost();
        return true;
      }

      this.ghostNodeVertices = null;
      this.activeHandle = null;
      this.initialVertices = [];
      this.ctx.render();
      return true;
    }

    return false;
  }

  public onDoubleClick(_e: MouseEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (activeTool !== 'node') return false;

    const now = Date.now();
    if (now - this.lastDoubleClickHandledTime < 500) {
      return true;
    }

    const z = this.ctx.canvasMgr.zoom || 1;
    if (this.executeDoubleClick(pt, z)) {
      this.lastDoubleClickHandledTime = now;
      return true;
    }

    /**
     * ARCHITECTURAL RATIONALE: CorelDraw Benchmark Tool Conmutation (Node Tool -> Select Tool - ITEM-03)
     * When the user double-clicks on empty canvas area, on an element body, or on a parametric primitive,
     * the tool immediately returns to the Selection Tool ('select'), completing symmetrical conmutation
     * between Selection and Node tools without prompting unwanted conversion modals.
     */
    this.lastDoubleClickHandledTime = now;
    this.ctx.setTool('select');
    this.ctx.render();
    return true;
  }

  public cancel(): boolean {
    let handled = false;
    this.pendingSingleVertexId = null;

    if (this.parametricController.cancel()) {
      handled = true;
    }

    if (this.ghostNodeVertices || this.isDragging || this.activeHandle || this.marqueeSelector.isMarqueeActive()) {
      this.ghostNodeVertices = null;
      this.initialVertices = [];
      this.activeHandle = null;
      this.isDragging = false;
      this.nodeEditorTool.selectedSegmentIdx = null;
      this.marqueeSelector.cancelMarquee();
      handled = true;
    }

    if (handled) {
      this.ctx.renderOverlay();
      return true;
    }

    if (
      this.nodeEditorTool.selectedVertexId !== null ||
      this.marqueeSelector.selectedVertexIds.size > 0
    ) {
      this.nodeEditorTool.selectedVertexId = null;
      this.nodeEditorTool.selectedVertexIds?.clear();
      this.marqueeSelector.selectedVertexIds.clear();
      if (this.callbacks.onDeselectNode) {
        this.callbacks.onDeselectNode();
      }
      this.ctx.render();
      return true;
    }

    return false;
  }

  public onKeyDown(e: KeyboardEvent): boolean {
    if (this.marqueeSelector.selectedVertexIds.size >= 2) {
      if (e.key === 'w' || e.key === 'W') {
        this.subgroupController.setMode('move');
        this.ctx.renderOverlay();
        return true;
      }
      if (e.key === 'e' || e.key === 'E') {
        this.subgroupController.setMode('rotate');
        this.ctx.renderOverlay();
        return true;
      }
      if (e.key === 'r' || e.key === 'R') {
        this.subgroupController.setMode('scale');
        this.ctx.renderOverlay();
        return true;
      }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
      e.preventDefault();
      return this.handleJoinSelectedNodes();
    }
    if (e.key === 'Escape') {
      return this.cancel();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (
        this.nodeEditorTool.selectedVertexId !== null ||
        this.marqueeSelector.selectedVertexIds.size > 0
      ) {
        return this.deleteSelectedVertex();
      }
    }
    return false;
  }

  public deactivate(): void {
    this.subgroupController.miniHud.hide();
    this.cancel();
    this.pendingSingleVertexId = null;
    this.nodeEditorTool.selectedVertexId = null;
    this.nodeEditorTool.selectedHandleType = null;
    this.nodeEditorTool.selectedSegmentIdx = null;
    this.marqueeSelector.clearSelection();
  }

  public deleteSelectedVertex(): boolean {
    const selectedIds = new Set(this.marqueeSelector.selectedVertexIds);
    if (this.nodeEditorTool.selectedVertexId) {
      selectedIds.add(this.nodeEditorTool.selectedVertexId);
    }
    if (selectedIds.size === 0) return false;
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices) return false;
    const isPoly = this.ctx.model.isPolyline(selectedEl) || this.ctx.model.isPolygon(selectedEl);
    if (this.ctx.model.isParametricElement(selectedEl) && !isPoly) return false;
    const minVerts = selectedEl.tagName === 'polygon' ? 3 : 2;
    if (selectedEl.vertices.length - selectedIds.size >= minVerts) {
      this.ctx.pushUndo();
      selectedEl.vertices = this.nodeEditorTool.deleteVertices(selectedEl.vertices, selectedIds);
      const isClosed = this.isElementClosed(selectedEl);
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
      if (this.ctx.model.isParametricElement(selectedEl)) {
        this.ctx.model.syncParametricAttributes(selectedEl);
      }
      this.nodeEditorTool.selectedVertexId = null;
      this.marqueeSelector.clearSelection();
      if (this.callbacks.onDeselectNode) {
        this.callbacks.onDeselectNode();
      }
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }
    return false;
  }

  /**
   * Resolves the target segment indices for conversion operations.
   * Delegates directly to NodeEditorTool.getTargetSegmentIndices to maintain single-source-of-truth
   * parity between state evaluation and mutation.
   */
  private getTargetSegmentIndices(selectedEl: VectorElement): number[] {
    if (!selectedEl.vertices || selectedEl.vertices.length < 2) return [];
    const isClosed = this.isElementClosed(selectedEl);
    return NodeEditorTool.getTargetSegmentIndices(
      selectedEl.vertices,
      this.nodeEditorTool.selectedSegmentIdx,
      this.marqueeSelector.selectedVertexIds,
      isClosed
    );
  }

  private notifySelectionChange(selectedEl: VectorElement): void {
    if (!this.callbacks.onNodeSelected) return;
    const activeV =
      selectedEl.vertices?.find((v) => v.id === this.nodeEditorTool.selectedVertexId) ||
      selectedEl.vertices?.[0];
    if (activeV) {
      const count = Math.max(1, this.marqueeSelector.selectedVertexIds.size);
      const segIdx = this.nodeEditorTool.selectedSegmentIdx;
      const ids = Array.from(this.marqueeSelector.selectedVertexIds);
      this.callbacks.onNodeSelected(activeV, selectedEl, count, segIdx, ids);
    }
  }

  public handleConvertSegmentToLine(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return;

    const isClosed = this.isElementClosed(selectedEl);
    const segState = NodeEditorTool.getSegmentConversionState(
      selectedEl.vertices,
      this.nodeEditorTool.selectedSegmentIdx,
      this.marqueeSelector.selectedVertexIds,
      isClosed
    );
    if (segState === 'mixed' || segState === 'none') return;

    const segIndices = this.getTargetSegmentIndices(selectedEl);
    if (segIndices.length === 0) return;

    this.ctx.pushUndo();
    let updatedVerts = selectedEl.vertices;
    for (const idx of segIndices) {
      updatedVerts = this.nodeEditorTool.convertSegmentToLine(updatedVerts, idx, isClosed);
    }
    selectedEl.vertices = updatedVerts;
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
    this.ctx.render();
    this.notifySelectionChange(selectedEl);
    this.ctx.syncToHost();
  }

  public async handleConvertSegmentToCurve(): Promise<void> {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return;

    const isClosed = this.isElementClosed(selectedEl);
    const segState = NodeEditorTool.getSegmentConversionState(
      selectedEl.vertices,
      this.nodeEditorTool.selectedSegmentIdx,
      this.marqueeSelector.selectedVertexIds,
      isClosed
    );
    if (segState === 'mixed' || segState === 'none') return;

    if (this.ctx.model.isParametricElement(selectedEl)) {
      const confirmed = await this.ctx.confirm({
        title: 'Convertir Primitiva a Curvas',
        message: `Para curvar este segmento, es necesario convertir <${selectedEl.shapeType || selectedEl.tagName}> a curvas de Bézier <path>.`,
        details: 'Las figuras paramétricas como polilíneas solo admiten segmentos rectos nativos en SVG.',
        confirmText: 'Convertir y Curvar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
      this.ctx.pushUndo();
      this.ctx.model.convertToCurves(selectedEl);
    }

    const segIndices = this.getTargetSegmentIndices(selectedEl);
    if (segIndices.length === 0) return;

    this.ctx.pushUndo();
    let updatedVerts = selectedEl.vertices;
    for (const idx of segIndices) {
      updatedVerts = this.nodeEditorTool.convertSegmentToCurve(updatedVerts, idx, isClosed);
    }
    selectedEl.vertices = updatedVerts;
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
    this.ctx.render();
    this.notifySelectionChange(selectedEl);
    this.ctx.syncToHost();
  }

  public handleUpdateNodePosition(vertexId: string, pos: Point): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices) return;
    const v = selectedEl.vertices.find((item) => item.id === vertexId);
    if (!v) return;

    this.ctx.pushUndo();
    const dx = pos.x - v.x;
    const dy = pos.y - v.y;
    v.x = pos.x;
    v.y = pos.y;
    if (v.handleIn) {
      v.handleIn.x += dx;
      v.handleIn.y += dy;
    }
    if (v.handleOut) {
      v.handleOut.x += dx;
      v.handleOut.y += dy;
    }
    const isClosed = this.isElementClosed(selectedEl);
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
    this.ctx.render();
    this.ctx.syncToHost();
  }

  public handleUpdateNodeHandle(vertexId: string, handleType: 'handleIn' | 'handleOut', pos: Point): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices) return;

    this.ctx.pushUndo();
    selectedEl.vertices = this.nodeEditorTool.moveHandle(selectedEl.vertices, vertexId, handleType, pos);
    const isClosed = this.isElementClosed(selectedEl);
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
    this.ctx.render();
    this.ctx.syncToHost();
  }

  public handleCloseOpenPath(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return;

    this.ctx.pushUndo();
    const result = this.nodeEditorTool.closePath(selectedEl.vertices);
    selectedEl.vertices = result.updatedVertices;
    selectedEl.isClosed = true;
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, true);
    selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
    if (!selectedEl.attributes.fill || selectedEl.attributes.fill === 'none') {
      selectedEl.attributes.fill = '#6366f1';
    }
    this.ctx.render();
    this.ctx.syncToHost();
  }

  /**
   * ARCHITECTURAL RATIONALE: Coincident Node Join & Welding (Ctrl+J)
   *
   * 1. Multi-Node Welding:
   *    Fuses coincident selected vertices (Delta x, Delta y <= epsilon = 2px) into a single unified
   *    anchor node, welding their incoming (handleIn) and outgoing (handleOut) tangents and eliminating
   *    spurious zero-length segments.
   *
   * 2. Path Closure on Coincident Endpoints:
   *    If the first and last vertices of an open path are selected and coincident, welds them together
   *    at their midpoint and sets isClosed = true without creating an overlapping seam vertex.
   */
  public handleJoinSelectedNodes(): boolean {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return false;

    // Convert parametric primitives to curves before modifying topology
    if (this.ctx.model.isParametricElement(selectedEl)) {
      this.ctx.pushUndo();
      this.ctx.model.convertToCurves(selectedEl);
    }

    const selectedIds = new Set(this.marqueeSelector.selectedVertexIds);
    if (this.nodeEditorTool.selectedVertexId) {
      selectedIds.add(this.nodeEditorTool.selectedVertexId);
    }

    if (selectedIds.size < 2) {
      // If fewer than 2 vertices are selected, check if open path has coincident endpoints
      const isClosed = this.isElementClosed(selectedEl);
      if (!isClosed && selectedEl.vertices.length >= 2) {
        const first = selectedEl.vertices[0];
        const last = selectedEl.vertices[selectedEl.vertices.length - 1];
        if (Math.hypot(last.x - first.x, last.y - first.y) <= 8.0) {
          selectedIds.add(first.id);
          selectedIds.add(last.id);
        } else {
          return false;
        }
      } else {
        return false;
      }
    }

    const wasClosed = this.isElementClosed(selectedEl);
    const result = this.nodeEditorTool.fuseCoincidentVertices(
      selectedEl.vertices,
      selectedIds,
      3.0,
      wasClosed
    );

    if (result.fusedCount > 0) {
      this.ctx.pushUndo();
      selectedEl.vertices = result.updatedVertices;
      selectedEl.isClosed = result.isClosed;
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, selectedEl.isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
      if (selectedEl.isClosed && (!selectedEl.attributes.fill || selectedEl.attributes.fill === 'none')) {
        selectedEl.attributes.fill = '#6366f1';
      }

      // Prune any deleted vertex IDs from active selection
      const remainingIds = new Set(selectedEl.vertices.map((v) => v.id));
      for (const id of Array.from(this.marqueeSelector.selectedVertexIds)) {
        if (!remainingIds.has(id)) {
          this.marqueeSelector.deselectVertex(id);
        }
      }
      if (this.nodeEditorTool.selectedVertexId && !remainingIds.has(this.nodeEditorTool.selectedVertexId)) {
        const remainingArr = Array.from(this.marqueeSelector.selectedVertexIds);
        this.nodeEditorTool.selectedVertexId = remainingArr.length > 0 ? remainingArr[0] : null;
      }

      if (this.callbacks.onNodeSelected && this.nodeEditorTool.selectedVertexId) {
        const v = selectedEl.vertices.find((vert) => vert.id === this.nodeEditorTool.selectedVertexId);
        if (v) {
          this.callbacks.onNodeSelected(
            v,
            selectedEl,
            this.marqueeSelector.selectedVertexIds.size,
            this.nodeEditorTool.selectedSegmentIdx,
            Array.from(this.marqueeSelector.selectedVertexIds)
          );
        }
      } else if (this.callbacks.onDeselectNode) {
        this.callbacks.onDeselectNode();
      }

      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }

    return false;
  }

  public async handleNodeTypeChange(type: NodeType): Promise<void> {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl) return;

    if (this.ctx.model.isParametricElement(selectedEl)) {
      if (type === 'sharp') return;
      const typeLabel = type === 'smooth' ? 'suave' : type === 'symmetric' ? 'simétrico' : 'asimétrico';
      const confirmed = await this.ctx.confirm({
        title: 'Convertir Primitiva a Curvas',
        message: `Para cambiar el tipo de nodo a ${typeLabel}, es necesario convertir <${selectedEl.shapeType || selectedEl.tagName}> a curvas de Bézier <path>.`,
        details: 'Las figuras paramétricas como polilíneas no admiten curvatura Bézier ni tiradores tangenciales sin convertirse en trazados libres.',
        confirmText: 'Convertir y Aplicar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
      this.ctx.pushUndo();
      this.ctx.model.convertToCurves(selectedEl);
    }

    const idsToChange = new Set(this.marqueeSelector.selectedVertexIds);
    if (this.nodeEditorTool.selectedVertexId) {
      idsToChange.add(this.nodeEditorTool.selectedVertexId);
    }
    if (selectedEl.vertices && idsToChange.size > 0) {
      this.ctx.pushUndo();
      const isClosed = this.isElementClosed(selectedEl);
      /**
       * HISTORICAL ARCHITECTURE (FIX-14):
       * Closed Path Tangential Wrapping.
       * Passing `isClosed` allows `setNodeType` to cyclically resolve P_prev and P_next across
       * index 0 and index N-1, ensuring exact secant tangency for closed loops (rectangles, polygons, closed Béziers).
       */
      let currentVerts = selectedEl.vertices;
      for (const vertexId of idsToChange) {
        currentVerts = this.nodeEditorTool.setNodeType(
          currentVerts,
          vertexId,
          type,
          isClosed
        );
      }
      selectedEl.vertices = currentVerts;
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      const savedVertexId = this.nodeEditorTool.selectedVertexId;
      this.ctx.render();
      this.nodeEditorTool.selectedVertexId = savedVertexId;
      if (savedVertexId && this.callbacks.onNodeSelected) {
        const activeV = selectedEl.vertices.find((v) => v.id === savedVertexId);
        if (activeV) {
          this.callbacks.onNodeSelected(
            activeV,
            selectedEl,
            idsToChange.size,
            this.nodeEditorTool.selectedSegmentIdx,
            Array.from(this.marqueeSelector.selectedVertexIds)
          );
        }
      }
      this.ctx.syncToHost();
    }
  }

  public async handleSplitNode(): Promise<void> {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || !this.nodeEditorTool.selectedVertexId) return;

    if (this.ctx.model.isParametricElement(selectedEl)) {
      const confirmed = await this.ctx.confirm({
        title: 'Convertir Primitiva a Curvas',
        message: `Para separar este nodo, es necesario convertir <${selectedEl.shapeType || selectedEl.tagName}> a trazado libre <path>.`,
        details: 'La figura dejará de ser una primitiva nativa para convertirse en trazados independientes.',
        confirmText: 'Convertir y Separar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
      this.ctx.pushUndo();
      this.ctx.model.convertToCurves(selectedEl);
    }

    if (selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      this.ctx.pushUndo();
      const isClosed = this.isElementClosed(selectedEl);
      const splitResult = this.nodeEditorTool.splitNode(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId,
        isClosed
      );
      selectedEl.vertices = splitResult.vertices;
      if (splitResult.newVertexId) {
        this.nodeEditorTool.selectedVertexId = splitResult.newVertexId;
      }
      selectedEl.isClosed = false;

      /**
       * HISTORICAL ARCHITECTURE (FIX-13):
       * Fill Reset on Node Split.
       * When a path node is split, the contour unrolls or breaks into an open path.
       * In accordance with professional vector standards, open paths must have their fill
       * immediately reset to 'none' and gradient metadata purged so that no simulated
       * straight-line chord closure is rendered by SVG engines.
       */
      selectedEl.attributes.fill = 'none';
      delete selectedEl.attributes['data-gradient'];

      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, false);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      const newSelectedV = selectedEl.vertices.find((v) => v.id === this.nodeEditorTool.selectedVertexId);
      if (newSelectedV && this.callbacks.onNodeSelected) {
        this.callbacks.onNodeSelected(
          newSelectedV,
          selectedEl,
          1,
          this.nodeEditorTool.selectedSegmentIdx,
          Array.from(this.marqueeSelector.selectedVertexIds)
        );
      }
      this.ctx.render();
      this.ctx.syncToHost();
    }
  }

  public renderOverlay(zoom: number): OverlayDescriptor[] {
    const z = zoom || 1;
    const descriptors: OverlayDescriptor[] = [];

    const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));

    // 1. Idle Bézier Handles & Tangents for Selected Element
    if (
      !this.ghostNodeVertices &&
      selectedEls.length === 1 &&
      this.ctx.getActiveTool() === 'node'
    ) {
      const handlesHtml = this.overlayBuilder.renderIdleBezierHandles(selectedEls[0], z);
      const segmentHtml = this.overlayBuilder.renderSelectedSegment(selectedEls[0], z);
      if (handlesHtml || segmentHtml) {
        descriptors.push({ type: 'raw', html: handlesHtml + segmentHtml });
      }
    }

    /**
     * ARCHITECTURAL RATIONALE: Selective Handle Ghost Dispatch (FIX-NodePreview)
     * Differentiates parametric shape controls (quadrants, inner donuts, rounded corners, star tips)
     * from standard vector topology manipulation (vertex, handleIn, handleOut, segment).
     */
    if (this.isParametricHandle(this.activeHandle)) {
      const paramGhostHtml = this.parametricController.renderGhostOverlay(this.activeHandle, z);
      if (paramGhostHtml) {
        descriptors.push({ type: 'raw', html: paramGhostHtml });
      }
    } else if (this.ghostNodeVertices && selectedEls.length > 0) {
      // 3. Ghost Path & Node Handles during Drag (Polylines, Polygons, Freeform Paths, Lines, Primitives)
      const ghostPathHtml = this.overlayBuilder.renderGhostPath(
        selectedEls[0],
        this.ghostNodeVertices,
        this.marqueeSelector,
        z
      );
      if (ghostPathHtml) {
        descriptors.push({ type: 'raw', html: ghostPathHtml });
      }
    }

    // 4. Parametric Idle Handles (Quadrant, Donut, Rect Corners)
    if (!this.ghostNodeVertices && !this.activeHandle) {
      const idleParamHtml = this.parametricController.renderIdleHandles(selectedEls, z);
      if (idleParamHtml) {
        descriptors.push({ type: 'raw', html: idleParamHtml });
      }
    }

    // 5. Rubber-band Marquee Selection Box
    if (this.marqueeSelector.isMarqueeActive()) {
      descriptors.push(...this.marqueeSelector.renderOverlay(z));
    }

    // 6. Highlight Multi-Selected Vertices
    if (!this.ghostNodeVertices && selectedEls.length === 1 && this.ctx.getActiveTool() === 'node') {
      const multiSelectedHtml = this.overlayBuilder.renderMultiSelectedVertices(selectedEls[0], this.marqueeSelector, z);
      if (multiSelectedHtml) {
        descriptors.push({ type: 'raw', html: multiSelectedHtml });
      }
    }

      // 7. Micro-Bounding Box and Subgroup Transform Overlay for N >= 2 Selected Nodes
    if (
      selectedEls.length === 1 &&
      this.marqueeSelector.selectedVertexIds.size >= 2 &&
      this.ctx.getActiveTool() === 'node'
    ) {
      this.subgroupController.miniHud.show(this.subgroupController.mode, (newMode) => {
        this.subgroupController.setMode(newMode);
        this.ctx.renderOverlay();
      });

      const activeEl = this.ghostNodeVertices
        ? { ...selectedEls[0], vertices: this.ghostNodeVertices }
        : selectedEls[0];
      const subgroupHtml = this.subgroupController.renderOverlay(
        activeEl,
        this.marqueeSelector.selectedVertexIds,
        z,
        this.activeHandle
      );
      if (subgroupHtml) {
        descriptors.push({ type: 'raw', html: subgroupHtml });
      }
    } else {
      this.subgroupController.miniHud.hide();
    }

    return descriptors;
  }
}
