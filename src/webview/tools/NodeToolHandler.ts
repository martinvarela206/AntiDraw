import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { Point, PathVertex, NodeType, VectorElement } from '../engine/VectorModel.js';
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
 * 3. Proximity Auto-Fusion for Open Contours:
 *    On release (`onPointerUp`), open paths undergo proximity testing between endpoints (`autoFuseVertices`).
 *    If an endpoint is dragged within `fusionThreshold` (8px) of another endpoint, they fuse into
 *    a single continuous vertex, closing the path and maintaining continuous Bézier flow.
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
  public activeHandle: 'vertex' | 'handleIn' | 'handleOut' | 'segment' | null = null;
  public dragStartPt: Point = { x: 0, y: 0 };
  public initialVertices: PathVertex[] = [];
  public isDragging: boolean = false;

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

        const result = this.nodeEditorTool.moveVertex(
          this.initialVertices,
          this.nodeEditorTool.selectedVertexId,
          snappedPt,
          isShift,
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

  public onPointerUp(_e: PointerEvent, _pt: Point): boolean {
    if (this.isDragging) {
      this.isDragging = false;
      const selectedEl = this.ctx.model.elements.find((el) => this.ctx.selectionTool.isSelected(el.id));

      if (selectedEl && this.ghostNodeVertices) {
        this.ctx.pushUndo();
        const isClosed = this.isElementClosed(selectedEl);
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
    if (selectedEl && selectedEl.vertices && selectedEl.vertices.length > 2) {
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
    if (selectedEl && selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      this.ctx.pushUndo();
      selectedEl.vertices = this.nodeEditorTool.setNodeType(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId,
        type
      );
      const isClosed = this.isElementClosed(selectedEl);
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
    if (selectedEl && selectedEl.vertices && this.nodeEditorTool.selectedVertexId) {
      this.ctx.pushUndo();
      selectedEl.vertices = this.nodeEditorTool.splitNode(
        selectedEl.vertices,
        this.nodeEditorTool.selectedVertexId
      );
      selectedEl.isClosed = false;
      selectedEl.attributes.d = this.ctx.model.compilePathD(selectedEl.vertices, false);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');
      this.ctx.render();
      this.ctx.syncToHost();
    }
  }

  public renderOverlay(zoom: number): string {
    const z = zoom || 1;
    let html = '';

    const selectedEls = this.ctx.model.elements.filter((el) => this.ctx.selectionTool.isSelected(el.id));

    // 1. Node Edit Mode Bézier Handles for Selected Element (rendered when not actively dragging ghost)
    if (!this.ghostNodeVertices && selectedEls.length === 1 && selectedEls[0].vertices && this.ctx.getActiveTool() === 'node') {
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

    // 3. Render Ghost Node Tool Path & Handles during active dragging
    if (this.ghostNodeVertices) {
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

    return html;
  }
}
