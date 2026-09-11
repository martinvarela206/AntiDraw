import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { Point, PathVertex, NodeType, VectorElement, RectCorners } from '../engine/VectorModel.js';
import { NodeEditorTool } from '../engine/NodeEditorTool.js';

export interface NodeToolCallbacks {
  onNodeSelected?: (vertex: PathVertex, element: VectorElement) => void;
  onDeselectNode?: () => void;
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
 *
 * 3. Explicit Endpoint Auto-Fusion with Ctrl (FIX-03):
 *    Endpoints of open paths only fuse and close when the user explicitly holds the `Ctrl` key
 *    while dragging/releasing near another free endpoint (`isCtrlPressed`). Without Ctrl, nodes
 *    remain strictly independent and can be positioned or crossed freely without accidental welding.
 *
 * 4. Ephemeral Ghost Manipulation:
 *    All active vertex and handle drags operate entirely on `ghostNodeVertices` and render to the
 *    overlay layer (`renderOverlay`). Mutations are only committed to the real document model upon
 *    `onPointerUp`, guaranteeing clean undo/redo history stacks.
 */
export class NodeToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['node'];
  private ctx: ToolContext;
  public nodeEditorTool: NodeEditorTool;
  private callbacks: NodeToolCallbacks;

  public ghostNodeVertices: PathVertex[] | null = null;
  public activeHandle:
    | 'vertex'
    | 'handleIn'
    | 'handleOut'
    | 'segment'
    | 'quadrant'
    | 'corner-tl'
    | 'corner-tr'
    | 'corner-br'
    | 'corner-bl'
    | null = null;
  public dragStartPt: Point = { x: 0, y: 0 };
  public initialVertices: PathVertex[] = [];
  public isDragging: boolean = false;

  // FEAT-02: Parametric Ellipse Quadrant Control Handle State
  public quadrantGhostMode: 'ellipse' | 'pie' | 'arc' = 'ellipse';
  public quadrantGhostStartAngle: number = 0;
  public quadrantGhostEndAngle: number = 360;
  public quadrantCenter: Point = { x: 0, y: 0 };
  public quadrantRadii: { rx: number; ry: number } = { rx: 1, ry: 1 };
  public quadrantGhostD: string = '';

  // FEAT-03: Parametric Rect Corner Radius Drag State
  public rectGhostD: string = '';
  public rectGhostCorners: RectCorners = { tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' };
  public rectGhostBounds: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  public rectGhostActiveRadius: number = 0;
  public rectGhostActiveCorner: 'tl' | 'tr' | 'br' | 'bl' = 'tl';

  private lastClickTime: number = 0;
  private lastClickPt: Point = { x: 0, y: 0 };
  private lastDoubleClickHandledTime: number = 0;

  constructor(ctx: ToolContext, nodeEditorTool: NodeEditorTool, callbacks: NodeToolCallbacks = {}) {
    this.ctx = ctx;
    this.nodeEditorTool = nodeEditorTool;
    this.callbacks = callbacks;
  }

  private isElementClosed(el: VectorElement): boolean {
    return this.ctx.model.isElementClosed(el);
  }

  /**
   * ARCHITECTURAL RATIONALE: Interactive Ellipse Quadrant Control Point (FEAT-02)
   *
   * Computes the canvas coordinate of the quadrant control handle on an ellipse's perimeter.
   * By default, it resides at the terminal endAngle (or 0° / 360° for full ellipse).
   */
  public getQuadrantHandlePoint(el: VectorElement): Point | null {
    if (!this.ctx.model.isParametricElement(el) || !this.ctx.model.isEllipse(el)) return null;
    const cx = parseFloat(el.attributes.cx || '0');
    const cy = parseFloat(el.attributes.cy || '0');
    const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
    const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
    const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');
    const rad = (endAngle * Math.PI) / 180;
    return {
      x: cx + rx * Math.cos(rad),
      y: cy + ry * Math.sin(rad),
    };
  }

  /**
   * ARCHITECTURAL RATIONALE: Interactive Rect Corner Radii Control Handles (FEAT-03)
   *
   * Computes the 4 canvas coordinates of the corner radius control handles for a parametric rectangle.
   * Positioned along each corner's inward diagonal at distance = max(14 / z, effectiveRadius).
   * Even when corner radius is 0 (sharp corner), the handle remains visible at an inset of 14 / z,
   * allowing the user to immediately drag and round the corner with direct visual feedback.
   */
  public getRectCornerHandles(
    el: VectorElement,
    z: number = 1
  ): { tl: Point; tr: Point; br: Point; bl: Point } | null {
    if (!this.ctx.model.isParametricElement(el) || !this.ctx.model.isRect(el)) return null;
    const x = parseFloat(el.attributes.x || '0');
    const y = parseFloat(el.attributes.y || '0');
    const w = parseFloat(el.attributes.width || '100');
    const h = parseFloat(el.attributes.height || '100');

    const corners = this.ctx.model.getRectCorners(el, w, h);
    const eff = this.ctx.model.calculateEffectiveCorners(w, h, corners);

    const minInset = Math.min(14 / z, w / 3, h / 3);
    const dTL = Math.max(minInset, eff.tl);
    const dTR = Math.max(minInset, eff.tr);
    const dBR = Math.max(minInset, eff.br);
    const dBL = Math.max(minInset, eff.bl);

    return {
      tl: { x: x + dTL, y: y + dTL },
      tr: { x: x + w - dTR, y: y + dTR },
      br: { x: x + w - dBR, y: y + h - dBR },
      bl: { x: x + dBL, y: y + h - dBL },
    };
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

    // ARCHITECTURAL RATIONALE: Parametric Element Free Node Edit Lock (FEAT-01)
    // Parametric primitives (<rect>, <circle>, <ellipse>, etc.) strictly prohibit free node insertion
    // or free vertex deletion. The user must explicitly convert to curves (Ctrl+Q) before subdividing.
    if (this.ctx.model.isParametricElement(selectedEl)) {
      return true;
    }

    // 1. Double-click on existing vertex -> Delete vertex
    const hitNode = this.nodeEditorTool.hitTestVertices(
      selectedEl.vertices,
      pt,
      14 / z,
      this.nodeEditorTool.selectedVertexId
    );

    if (hitNode && hitNode.type === 'vertex') {
      if (selectedEl.vertices.length > 2) {
        this.ctx.pushUndo();
        selectedEl.vertices = this.nodeEditorTool.deleteVertex(selectedEl.vertices, hitNode.vertex.id);
        selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
        selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
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
      this.nodeEditorTool.selectedVertexId = res.newVertexId;
      this.nodeEditorTool.selectedHandleType = 'vertex';
      this.nodeEditorTool.selectedSegmentIdx = null;
      this.isDragging = false;
      this.activeHandle = null;
      this.ghostNodeVertices = null;
      const newV = selectedEl.vertices.find((v) => v.id === res.newVertexId);
      if (newV && this.callbacks.onNodeSelected) {
        this.callbacks.onNodeSelected(newV, selectedEl);
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
        return true;
      }
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
      // 0. Check if clicking on parametric ellipse quadrant control handle (FEAT-02)
      if (this.ctx.model.isParametricElement(selectedEl) && this.ctx.model.isEllipse(selectedEl)) {
        const qPt = this.getQuadrantHandlePoint(selectedEl);
        if (qPt && Math.hypot(pt.x - qPt.x, pt.y - qPt.y) <= 12 / z) {
          this.activeHandle = 'quadrant';
          this.dragStartPt = { x: pt.x, y: pt.y };
          this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
          const cx = parseFloat(selectedEl.attributes.cx || '0');
          const cy = parseFloat(selectedEl.attributes.cy || '0');
          const rx = parseFloat(selectedEl.attributes.rx || selectedEl.attributes.r || '1');
          const ry = parseFloat(selectedEl.attributes.ry || selectedEl.attributes.r || '1');
          this.quadrantCenter = { x: cx, y: cy };
          this.quadrantRadii = { rx, ry };
          this.quadrantGhostMode = (selectedEl.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
          this.quadrantGhostStartAngle = parseFloat(selectedEl.attributes['data-start-angle'] || '0');
          this.quadrantGhostEndAngle = parseFloat(selectedEl.attributes['data-end-angle'] || '360');
          this.quadrantGhostD = selectedEl.attributes.d || '';
          this.isDragging = true;
          this.ctx.renderOverlay();
          return true;
        }
      }

      // 0b. Check if clicking on parametric rect corner radius control handles (FEAT-03)
      if (this.ctx.model.isParametricElement(selectedEl) && this.ctx.model.isRect(selectedEl)) {
        const cornerHandles = this.getRectCornerHandles(selectedEl, z);
        if (cornerHandles) {
          const cornersList: ('tl' | 'tr' | 'br' | 'bl')[] = ['tl', 'tr', 'br', 'bl'];
          for (const cornerKey of cornersList) {
            const hPt = cornerHandles[cornerKey];
            if (Math.hypot(pt.x - hPt.x, pt.y - hPt.y) <= 12 / z) {
              this.activeHandle = `corner-${cornerKey}` as any;
              this.dragStartPt = { x: pt.x, y: pt.y };
              this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));

              const x = parseFloat(selectedEl.attributes.x || '0');
              const y = parseFloat(selectedEl.attributes.y || '0');
              const w = parseFloat(selectedEl.attributes.width || '100');
              const h = parseFloat(selectedEl.attributes.height || '100');
              this.rectGhostBounds = { x, y, w, h };
              this.rectGhostCorners = this.ctx.model.getRectCorners(selectedEl, w, h);
              this.rectGhostActiveCorner = cornerKey;
              this.rectGhostActiveRadius = this.rectGhostCorners[cornerKey];
              this.rectGhostD = selectedEl.attributes.d || '';
              this.isDragging = true;
              this.ctx.renderOverlay();
              return true;
            }
          }
        }
      }

      const isClosed = this.isElementClosed(selectedEl);

      // 1. Check if clicking on an existing vertex or Bézier handle
      const hitNode = this.nodeEditorTool.hitTestVertices(
        selectedEl.vertices,
        pt,
        12 / z,
        this.nodeEditorTool.selectedVertexId
      );

      if (hitNode) {
        this.nodeEditorTool.selectedVertexId = hitNode.vertex.id;
        this.nodeEditorTool.selectedHandleType = hitNode.type;
        this.nodeEditorTool.selectedSegmentIdx = null;
        this.activeHandle = hitNode.type;
        this.dragStartPt = { x: pt.x, y: pt.y };
        this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
        this.ghostNodeVertices = null;
        this.isDragging = true;

        if (this.callbacks.onNodeSelected) {
          this.callbacks.onNodeSelected(hitNode.vertex, selectedEl);
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
        10 / z,
        isClosed
      );

      if (hitSegment !== null) {
        this.nodeEditorTool.selectedSegmentIdx = hitSegment;
        const nextIdx = (hitSegment + 1) % selectedEl.vertices.length;
        this.nodeEditorTool.selectedVertexId = selectedEl.vertices[nextIdx].id;
        this.nodeEditorTool.selectedHandleType = null;
        this.activeHandle = 'segment';
        this.dragStartPt = { x: pt.x, y: pt.y };
        this.initialVertices = JSON.parse(JSON.stringify(selectedEl.vertices));
        this.ghostNodeVertices = null;
        this.isDragging = true;

        if (this.callbacks.onNodeSelected) {
          this.callbacks.onNodeSelected(selectedEl.vertices[nextIdx], selectedEl);
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
        if (this.callbacks.onDeselectNode) {
          this.callbacks.onDeselectNode();
        }
        this.ctx.render();
        return true;
      }

      // 3. Clicked empty area: deselect active vertex/segment
      this.nodeEditorTool.selectedVertexId = null;
      this.nodeEditorTool.selectedHandleType = null;
      this.nodeEditorTool.selectedSegmentIdx = null;
      if (this.callbacks.onDeselectNode) {
        this.callbacks.onDeselectNode();
      }
      this.ctx.render();
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
      }

      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
      if (!selectedEl || !this.initialVertices || this.initialVertices.length === 0) return false;

      const isClosed = this.isElementClosed(selectedEl);
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (this.activeHandle === 'quadrant' && selectedEl) {
        const cx = this.quadrantCenter.x;
        const cy = this.quadrantCenter.y;
        const rx = Math.max(1, this.quadrantRadii.rx);
        const ry = Math.max(1, this.quadrantRadii.ry);

        const dx = pt.x - cx;
        const dy = pt.y - cy;
        // Normalized radial distance from center
        const D = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);

        // Polar angle in degrees (0 to 360)
        const rad = Math.atan2(dy / ry, dx / rx);
        let deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;

        if (isShift || isCtrl) {
          deg = Math.round(deg / 15) * 15;
        } else {
          // Snap within 3 degrees of cardinal angles (0, 90, 180, 270, 360)
          for (const cardinal of [0, 90, 180, 270, 360]) {
            if (Math.abs(deg - (cardinal % 360)) <= 3) {
              deg = cardinal % 360;
              break;
            }
          }
        }
        deg = Math.round(deg * 10) / 10;

        let startAngle = this.quadrantGhostStartAngle;
        let endAngle = deg;

        let mode: 'ellipse' | 'pie' | 'arc' = 'pie';
        const delta = Math.abs(endAngle - startAngle);
        if (delta < 2 || Math.abs(delta - 360) < 2) {
          mode = 'ellipse';
          startAngle = 0;
          endAngle = 360;
        } else {
          // D > 1.0 -> outside perimeter -> Open Arc
          // D <= 1.0 -> on or inside perimeter -> Closed Pie Wedge
          mode = D > 1.0 ? 'arc' : 'pie';
        }

        this.quadrantGhostMode = mode;
        this.quadrantGhostStartAngle = startAngle;
        this.quadrantGhostEndAngle = endAngle;

        this.ghostNodeVertices = this.ctx.model.convertEllipseToVertices(
          cx,
          cy,
          rx,
          ry,
          mode,
          startAngle,
          endAngle
        );
        this.quadrantGhostD = this.ctx.model.compileEllipseD(
          cx,
          cy,
          rx,
          ry,
          mode,
          startAngle,
          endAngle
        );

        this.ctx.renderOverlay();
        return true;
      }

      // FEAT-03: Interactive Corner Radii Dragging for Parametric Rect
      if (this.activeHandle && this.activeHandle.startsWith('corner-') && selectedEl) {
        const cornerKey = this.activeHandle.replace('corner-', '') as 'tl' | 'tr' | 'br' | 'bl';
        const { x, y, w, h } = this.rectGhostBounds;
        const maxRadius = Math.min(w, h) / 2;

        let rawRadiusPx = 0;
        if (cornerKey === 'tl') {
          const dx = Math.max(0, pt.x - x);
          const dy = Math.max(0, pt.y - y);
          rawRadiusPx = (dx + dy) / 2;
        } else if (cornerKey === 'tr') {
          const dx = Math.max(0, x + w - pt.x);
          const dy = Math.max(0, pt.y - y);
          rawRadiusPx = (dx + dy) / 2;
        } else if (cornerKey === 'br') {
          const dx = Math.max(0, x + w - pt.x);
          const dy = Math.max(0, y + h - pt.y);
          rawRadiusPx = (dx + dy) / 2;
        } else if (cornerKey === 'bl') {
          const dx = Math.max(0, pt.x - x);
          const dy = Math.max(0, y + h - pt.y);
          rawRadiusPx = (dx + dy) / 2;
        }

        rawRadiusPx = Math.max(0, Math.min(maxRadius, rawRadiusPx));
        if (isShift || isCtrl) {
          rawRadiusPx = Math.round(rawRadiusPx / 5) * 5;
        } else {
          rawRadiusPx = Math.round(rawRadiusPx * 10) / 10;
        }

        const isAlt = e.altKey;
        const isIndependent = isAlt || this.rectGhostCorners.mode === 'independent';

        let targetValue = rawRadiusPx;
        if (this.rectGhostCorners.unit === '%') {
          targetValue = Math.round(((rawRadiusPx / maxRadius) * 50) * 10) / 10;
        }

        const updatedCorners: RectCorners = {
          ...this.rectGhostCorners,
          mode: isIndependent ? 'independent' : 'uniform',
        };

        if (isIndependent) {
          updatedCorners[cornerKey] = targetValue;
        } else {
          updatedCorners.tl = targetValue;
          updatedCorners.tr = targetValue;
          updatedCorners.br = targetValue;
          updatedCorners.bl = targetValue;
        }

        this.rectGhostActiveRadius = rawRadiusPx;
        this.rectGhostActiveCorner = cornerKey;
        this.rectGhostCorners = updatedCorners;

        const eff = this.ctx.model.calculateEffectiveCorners(w, h, updatedCorners);
        this.ghostNodeVertices = this.ctx.model.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
        this.rectGhostD = this.ctx.model.compileRectD(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);

        this.ctx.renderOverlay();
        return true;
      }

      if (this.activeHandle === 'vertex' && this.nodeEditorTool.selectedVertexId) {
        const otherVertices: Point[] = [];
        this.ctx.model.elements.forEach((el) => {
          if (el.vertices) {
            el.vertices.forEach((v) => {
              if (v.id !== this.nodeEditorTool.selectedVertexId) {
                otherVertices.push({ x: v.x, y: v.y });
              }
            });
          }
        });
        const snappedPt = this.ctx.snapPoint(pt, otherVertices);

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
          }
        }

        const result = this.nodeEditorTool.moveVertex(
          this.initialVertices,
          this.nodeEditorTool.selectedVertexId,
          snappedPt,
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
        const snappedPt = this.ctx.snapPoint(pt, otherVertices);

        this.ghostNodeVertices = this.nodeEditorTool.moveHandle(
          this.initialVertices,
          this.nodeEditorTool.selectedVertexId,
          this.activeHandle,
          snappedPt
        );
        this.ctx.renderOverlay();
        return true;
      }

      if (
        this.activeHandle === 'segment' &&
        this.nodeEditorTool.selectedSegmentIdx !== null
      ) {
        const otherVertices: Point[] = [];
        this.ctx.model.elements.forEach((el) => {
          if (!this.ctx.selectionTool.isSelected(el.id) && el.vertices) {
            el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
          }
        });
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

    return false;
  }

  public onPointerUp(e: PointerEvent, _pt: Point): boolean {
    if (this.isDragging) {
      this.isDragging = false;
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));

      if (this.activeHandle === 'quadrant' && selectedEl) {
        this.ctx.pushUndo();
        selectedEl.attributes['data-ellipse-type'] = this.quadrantGhostMode;
        selectedEl.attributes['data-start-angle'] = this.quadrantGhostStartAngle.toString();
        selectedEl.attributes['data-end-angle'] = this.quadrantGhostEndAngle.toString();
        selectedEl.isClosed = this.quadrantGhostMode !== 'arc';

        if (this.quadrantGhostMode === 'arc') {
          selectedEl.attributes.fill = 'none';
          delete selectedEl.attributes['data-gradient'];
        } else if (this.quadrantGhostMode === 'pie' || this.quadrantGhostMode === 'ellipse') {
          if (!selectedEl.attributes.fill || selectedEl.attributes.fill === 'none') {
            selectedEl.attributes.fill = '#6366f1';
          }
        }

        selectedEl.vertices = this.ghostNodeVertices || this.initialVertices;
        selectedEl.attributes.d = this.quadrantGhostD || this.ctx.model.compileEllipseD(
          this.quadrantCenter.x,
          this.quadrantCenter.y,
          this.quadrantRadii.rx,
          this.quadrantRadii.ry,
          this.quadrantGhostMode,
          this.quadrantGhostStartAngle,
          this.quadrantGhostEndAngle
        );
        selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

        this.activeHandle = null;
        this.ghostNodeVertices = null;
        this.quadrantGhostD = '';
        this.initialVertices = [];
        if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
        this.ctx.render();
        this.ctx.syncToHost();
        return true;
      }

      // FEAT-03: Commit Interactive Corner Radii for Parametric Rect
      if (this.activeHandle && this.activeHandle.startsWith('corner-') && selectedEl) {
        this.ctx.pushUndo();
        const c = this.rectGhostCorners;
        selectedEl.attributes['data-corner-mode'] = c.mode;
        selectedEl.attributes['data-corner-unit'] = c.unit;
        selectedEl.attributes['data-corner-tl'] = c.tl.toString();
        selectedEl.attributes['data-corner-tr'] = c.tr.toString();
        selectedEl.attributes['data-corner-br'] = c.br.toString();
        selectedEl.attributes['data-corner-bl'] = c.bl.toString();
        selectedEl.attributes['data-corner-radius'] = `${c.tl},${c.tr},${c.br},${c.bl}`;

        if (c.mode === 'uniform') {
          selectedEl.attributes['rx'] = c.unit === '%' ? `${c.tl}%` : c.tl.toString();
          selectedEl.attributes['ry'] = selectedEl.attributes['rx'];
        } else {
          delete selectedEl.attributes['rx'];
          delete selectedEl.attributes['ry'];
        }

        selectedEl.vertices = this.ghostNodeVertices || this.initialVertices;
        selectedEl.attributes.d = this.rectGhostD || this.ctx.model.compilePathD(selectedEl.vertices, true);
        selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

        this.activeHandle = null;
        this.ghostNodeVertices = null;
        this.rectGhostD = '';
        this.initialVertices = [];
        if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
        this.ctx.render();
        this.ctx.syncToHost();
        return true;
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

        if (this.nodeEditorTool.selectedVertexId && this.callbacks.onNodeSelected) {
          const activeV = selectedEl.vertices.find((v) => v.id === this.nodeEditorTool.selectedVertexId);
          if (activeV) {
            this.callbacks.onNodeSelected(activeV, selectedEl);
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
      return true;
    }

    return false;
  }

  public cancel(): boolean {
    if (this.ghostNodeVertices || this.isDragging) {
      this.ghostNodeVertices = null;
      this.initialVertices = [];
      this.activeHandle = null;
      this.isDragging = false;
      this.nodeEditorTool.selectedSegmentIdx = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public deactivate(): void {
    this.ghostNodeVertices = null;
    this.initialVertices = [];
    this.activeHandle = null;
    this.isDragging = false;
    this.nodeEditorTool.selectedVertexId = null;
    this.nodeEditorTool.selectedHandleType = null;
    this.nodeEditorTool.selectedSegmentIdx = null;
  }

  public deleteSelectedVertex(): boolean {
    if (!this.nodeEditorTool.selectedVertexId) return false;
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || this.ctx.model.isParametricElement(selectedEl)) return false;
    if (selectedEl.vertices && selectedEl.vertices.length > 2) {
      this.ctx.pushUndo();
      selectedEl.vertices = this.nodeEditorTool.deleteVertex(selectedEl.vertices, this.nodeEditorTool.selectedVertexId);
      const isClosed = this.isElementClosed(selectedEl);
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
      this.nodeEditorTool.selectedVertexId = null;
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }
    return false;
  }

  public handleConvertSegmentToLine(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return;

    let segIdx = this.nodeEditorTool.selectedSegmentIdx;
    if (segIdx === null && this.nodeEditorTool.selectedVertexId) {
      const vIdx = selectedEl.vertices.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);
      if (vIdx > 0) {
        segIdx = vIdx - 1;
      } else if (vIdx === 0 && selectedEl.vertices.length > 2) {
        segIdx = selectedEl.vertices.length - 1;
      }
    }
    if (segIdx === null) return;

    this.ctx.pushUndo();
    const isClosed = this.isElementClosed(selectedEl);
    selectedEl.vertices = this.nodeEditorTool.convertSegmentToLine(selectedEl.vertices, segIdx, isClosed);
    selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
    this.ctx.render();
    this.ctx.syncToHost();
  }

  public handleConvertSegmentToCurve(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || !selectedEl.vertices || selectedEl.vertices.length < 2) return;

    let segIdx = this.nodeEditorTool.selectedSegmentIdx;
    if (segIdx === null && this.nodeEditorTool.selectedVertexId) {
      const vIdx = selectedEl.vertices.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);
      if (vIdx > 0) {
        segIdx = vIdx - 1;
      } else if (vIdx === 0 && selectedEl.vertices.length > 2) {
        segIdx = selectedEl.vertices.length - 1;
      }
    }
    if (segIdx === null) return;

    this.ctx.pushUndo();
    const isClosed = this.isElementClosed(selectedEl);
    selectedEl.vertices = this.nodeEditorTool.convertSegmentToCurve(selectedEl.vertices, segIdx, isClosed);
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

  public handleNodeTypeChange(type: NodeType): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || this.ctx.model.isParametricElement(selectedEl)) return;
    if (selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      this.ctx.pushUndo();
      const isClosed = this.isElementClosed(selectedEl);
      /**
       * HISTORICAL ARCHITECTURE (FIX-14):
       * Closed Path Tangential Wrapping.
       * Passing `isClosed` allows `setNodeType` to cyclically resolve P_prev and P_next across
       * index 0 and index N-1, ensuring exact secant tangency for closed loops (rectangles, polygons, closed Béziers).
       */
      selectedEl.vertices = this.nodeEditorTool.setNodeType(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId,
        type,
        isClosed
      );
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, isClosed);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      const savedVertexId = this.nodeEditorTool.selectedVertexId;
      this.ctx.render();
      this.nodeEditorTool.selectedVertexId = savedVertexId;
      this.ctx.syncToHost();
    }
  }

  public handleSplitNode(): void {
    const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
    if (!selectedEl || this.ctx.model.isParametricElement(selectedEl)) return;
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
        this.callbacks.onNodeSelected(newSelectedV, selectedEl);
      }
      this.ctx.render();
      this.ctx.syncToHost();
    }
  }

  public renderOverlay(zoom: number): string {
    const z = zoom || 1;
    let html = '';

    const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));

    // 1. Node Edit Mode Bézier Handles for Selected Element (rendered when not actively dragging ghost and not parametric)
    if (!this.ghostNodeVertices && selectedEls.length === 1 && selectedEls[0].vertices && this.ctx.getActiveTool() === 'node' && !this.ctx.model.isParametricElement(selectedEls[0])) {
      const selectedEl = selectedEls[0];
      const verts = selectedEl.vertices!;
      const selectedIdx = verts.findIndex((v) => v.id === this.nodeEditorTool.selectedVertexId);
      const isClosed = this.isElementClosed(selectedEl);

      const showHandlesFor = new Set<number>();
      if (selectedIdx >= 0) {
        showHandlesFor.add(selectedIdx);
        const prevIdx = selectedIdx > 0 ? selectedIdx - 1 : isClosed ? verts.length - 1 : -1;
        if (prevIdx >= 0) showHandlesFor.add(prevIdx);
        const nextIdx = selectedIdx < verts.length - 1 ? selectedIdx + 1 : isClosed ? 0 : -1;
        if (nextIdx >= 0) showHandlesFor.add(nextIdx);
      }

      const bHandleR = 3.5 / z;
      verts.forEach((v, idx) => {
        if (showHandlesFor.has(idx)) {
          if (v.handleIn) {
            html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleIn.x}" y2="${v.handleIn.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
            html += `<circle cx="${v.handleIn.x}" cy="${v.handleIn.y}" r="${bHandleR}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
          }
          if (v.handleOut) {
            html += `<line x1="${v.x}" y1="${v.y}" x2="${v.handleOut.x}" y2="${v.handleOut.y}" stroke="#a855f7" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
            html += `<circle cx="${v.handleOut.x}" cy="${v.handleOut.y}" r="${bHandleR}" fill="#a855f7" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
          }
        }
      });

      // 2. Highlight Selected Path Segment in Node Mode
      if (this.nodeEditorTool.selectedSegmentIdx !== null) {
        const segIdx = this.nodeEditorTool.selectedSegmentIdx;
        if (segIdx >= 0 && segIdx < verts.length) {
          const nextIdx = (segIdx + 1) % verts.length;
          const v1 = verts[segIdx];
          const v2 = verts[nextIdx];
          const isCurve = !!(v1.handleOut || v2.handleIn);
          let segD = '';
          if (isCurve) {
            const h1 = v1.handleOut || { x: v1.x, y: v1.y };
            const h2 = v2.handleIn || { x: v2.x, y: v2.y };
            segD = `M ${v1.x} ${v1.y} C ${h1.x} ${h1.y} ${h2.x} ${h2.y} ${v2.x} ${v2.y}`;
          } else {
            segD = `M ${v1.x} ${v1.y} L ${v2.x} ${v2.y}`;
          }
          html += `<path d="${segD}" fill="none" stroke="#38bdf8" stroke-width="${3 / z}" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />`;
        }
      }
    }

    // 3. Render Quadrant Ghost during active quadrant dragging (FEAT-02)
    if (this.activeHandle === 'quadrant') {
      const isArc = this.quadrantGhostMode === 'arc';
      const fill = isArc ? 'none' : 'rgba(245, 158, 11, 0.2)';
      const d = this.quadrantGhostD;
      html += `<path d="${d}" fill="${fill}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = this.quadrantRadii.rx;
      const ry = this.quadrantRadii.ry;
      const endRad = (this.quadrantGhostEndAngle * Math.PI) / 180;
      const qx = cx + rx * Math.cos(endRad);
      const qy = cy + ry * Math.sin(endRad);

      // Ray from center to quadrant handle
      html += `<line x1="${cx}" y1="${cy}" x2="${qx}" y2="${qy}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="#f59e0b" />`;
      // Quadrant handle circle
      html += `<circle cx="${qx}" cy="${qy}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;
      // Angle and mode badge
      const badgeW = 92;
      const badgeH = 18;
      html += `
        <g opacity="0.95">
          <rect x="${qx + 10}" y="${qy - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <text x="${qx + 14}" y="${qy - 9}" font-size="10" fill="#fde68a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">${Math.round(this.quadrantGhostEndAngle)}° [${this.quadrantGhostMode.toUpperCase()}]</text>
        </g>
      `;
    } else if (this.activeHandle && this.activeHandle.startsWith('corner-')) {
      // 3b. Render Rect Corner Ghost during active corner dragging (FEAT-03)
      const d = this.rectGhostD;
      html += `<path d="${d}" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

      const cornerHandles = this.getRectCornerHandles(
        { attributes: { ...this.rectGhostCorners as any, ...this.rectGhostBounds as any }, isParametric: true, shapeType: 'rect', tagName: 'rect', id: '' },
        z
      );
      if (cornerHandles) {
        const activeKey = this.rectGhostActiveCorner;
        const hPt = cornerHandles[activeKey];
        const { x, y, w, h } = this.rectGhostBounds;
        const cornerX = (activeKey === 'tl' || activeKey === 'bl') ? x : x + w;
        const cornerY = (activeKey === 'tl' || activeKey === 'tr') ? y : y + h;
        html += `<line x1="${cornerX}" y1="${cornerY}" x2="${hPt.x}" y2="${hPt.y}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        html += `<circle cx="${hPt.x}" cy="${hPt.y}" r="${6 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;

        const badgeW = 110;
        const badgeH = 18;
        const badgeText = `R: ${Math.round(this.rectGhostActiveRadius)}px [${this.rectGhostCorners.mode.toUpperCase()}]`;
        html += `
          <g opacity="0.95">
            <rect x="${hPt.x + 10}" y="${hPt.y - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1" vector-effect="non-scaling-stroke" />
            <text x="${hPt.x + 14}" y="${hPt.y - 9}" font-size="10" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">${badgeText}</text>
          </g>
        `;
      }
    } else if (this.ghostNodeVertices) {
      // 4. Render Ghost Node Tool Path & Handles during active dragging
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));
      if (selectedEl) {
        const isClosed = this.isElementClosed(selectedEl);
        const d = this.ctx.model.compilePathD(this.ghostNodeVertices, isClosed);
        html += `<path d="${d}" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
        this.ghostNodeVertices.forEach((gv) => {
          const isSelected = gv.id === this.nodeEditorTool.selectedVertexId;
          if (isSelected) {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${6 / z}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${4 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
            if (gv.handleIn) {
              html += `<line x1="${gv.x}" y1="${gv.y}" x2="${gv.handleIn.x}" y2="${gv.handleIn.y}" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${gv.handleIn.x}" cy="${gv.handleIn.y}" r="${4 / z}" fill="#c084fc" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
            }
            if (gv.handleOut) {
              html += `<line x1="${gv.x}" y1="${gv.y}" x2="${gv.handleOut.x}" y2="${gv.handleOut.y}" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${gv.handleOut.x}" cy="${gv.handleOut.y}" r="${4 / z}" fill="#c084fc" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
            }
          } else {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          }
        });
      }
    }

    // 5. Quadrant handle on parametric ellipse when idle in Node Mode (FEAT-02)
    if (!this.ghostNodeVertices && !this.activeHandle && selectedEls.length === 1 && this.ctx.model.isParametricElement(selectedEls[0]) && this.ctx.model.isEllipse(selectedEls[0])) {
      const qPt = this.getQuadrantHandlePoint(selectedEls[0]);
      if (qPt) {
        html += `
          <g style="cursor: crosshair;">
            <circle cx="${qPt.x}" cy="${qPt.y}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <circle cx="${qPt.x}" cy="${qPt.y}" r="${2.5 / z}" fill="#ffffff" />
          </g>
        `;
      }
    }

    // 6. Corner radius handles on parametric rect when idle in Node Mode (FEAT-03)
    if (!this.ghostNodeVertices && !this.activeHandle && selectedEls.length === 1 && this.ctx.model.isParametricElement(selectedEls[0]) && this.ctx.model.isRect(selectedEls[0])) {
      const cornerHandles = this.getRectCornerHandles(selectedEls[0], z);
      if (cornerHandles) {
        const cornersList: ('tl' | 'tr' | 'br' | 'bl')[] = ['tl', 'tr', 'br', 'bl'];
        cornersList.forEach((key) => {
          const pt = cornerHandles[key];
          html += `
            <g style="cursor: crosshair;">
              <circle cx="${pt.x}" cy="${pt.y}" r="${5.5 / z}" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="${pt.x}" cy="${pt.y}" r="${2 / z}" fill="#ffffff" />
            </g>
          `;
        });
      }
    }

    return html;
  }
}
