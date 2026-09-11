import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { Point, VectorElement, PathVertex } from '../engine/VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Geometric Shape Tool Isolation & Unified Path Compilation
 *
 * 1. Path-Uniform Representation:
 *    AntiDraw compiles geometric primitives (`rect`, `ellipse`, `line`, `star`) into standardized
 *    cubic Bézier path vertices (`VectorModel.convertShapeToVertices`) rather than native SVG tags
 *    (`<rect>`, `<circle>`, `<polygon>`). This architectural design guarantees that all vector elements
 *    share the identical data structure, enabling immediate transition into node editing (`NodeToolHandler`)
 *    and seamless Boolean operations (`BooleanOperations`) without complex shape-to-path casting.
 *
 * 2. Non-Destructive Ghost Shape Life Cycle:
 *    During mouse drag, tentative shapes exist strictly in memory as `ghostShapeElement` and render
 *    onto the ephemeral overlay layer (`renderOverlay`). The core SVG model and undo history remain
 *    completely unmutated until pointer release (`onPointerUp`). This eliminates garbage entries in
 *    the undo stack (`pushUndo`) when users cancel or drag inadvertently.
 *
 * 3. Proportional & Center Expansion Mathematics:
 *    - `shiftKey`: Expands geometry outward symmetrically from the initial click point (`start.x`, `start.y`),
 *      doubling dimensions and computing center `(cx, cy)` rather than corner-to-corner.
 *    - `ctrlKey`: Enforces an exact 1:1 square or circular aspect ratio (`targetW = targetH = max(rawW, rawH)`).
 *    - `altKey`: Constrains geometry to predefined user aspect ratios from `CanvasManager.shapeConfig`.
 *
 * ARCHITECTURAL NOTE ON LINE TOOL DEPRECATION:
 * The legacy standalone 'line' tool has been deprecated and removed. Line creation is consolidated
 * into PolylineToolHandler ('polyline'), which natively provides 2+ vertex straight-line construction,
 * rubberband ghost previews, snapping to grids/guides/viewbox, and marker terminations without redundant code.
 */
export class ShapeToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['rect', 'ellipse', 'star'];
  private ctx: ToolContext;

  public shapeStartPt: Point | null = null;
  public ghostShapeElement: VectorElement | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const activeTool = this.ctx.getActiveTool();
    if (!this.toolTypes.includes(activeTool)) return false;
    if (e.button !== 0) return false;

    const otherVertices = this.ctx.getOtherVertices();
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);
    this.shapeStartPt = snappedPt;
    this.ghostShapeElement = null;
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    if (!this.shapeStartPt) return false;
    const activeTool = this.ctx.getActiveTool();
    if (!this.toolTypes.includes(activeTool)) return false;

    const otherVertices = this.ctx.getOtherVertices();
    const currentPt = this.ctx.snapPoint(pt, otherVertices);

    this.ghostShapeElement = this.createShapeElement(
      activeTool,
      this.shapeStartPt,
      currentPt,
      'ghost_shape_preview',
      e.shiftKey,
      e.ctrlKey,
      e.altKey
    );

    this.ctx.renderOverlay();
    return true;
  }

  public onPointerUp(_e: PointerEvent, _pt: Point): boolean {
    if (!this.shapeStartPt) return false;

    if (this.ghostShapeElement) {
      this.ctx.pushUndo();
      const id = `el_${Date.now().toString(36)}`;
      const committedEl: VectorElement = {
        ...this.ghostShapeElement,
        id,
        attributes: {
          ...this.ghostShapeElement.attributes,
          id,
        },
      };

      this.ctx.model.elements.push(committedEl);
      this.ctx.selectionTool.select(id);

      this.shapeStartPt = null;
      this.ghostShapeElement = null;
      this.ctx.render();
      this.ctx.syncToHost();
    } else {
      this.shapeStartPt = null;
      this.ghostShapeElement = null;
      this.ctx.renderOverlay();
    }

    return true;
  }

  public cancel(): boolean {
    if (this.shapeStartPt || this.ghostShapeElement) {
      this.shapeStartPt = null;
      this.ghostShapeElement = null;
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public renderOverlay(zoom: number): string {
    if (!this.ghostShapeElement) return '';

    const d = this.ghostShapeElement.attributes.d;
    const isClosed = this.ghostShapeElement.isClosed;
    const z = zoom || 1;

    let html = `<path d="${d}" fill="${isClosed ? 'rgba(99, 102, 241, 0.25)' : 'none'}" stroke="#818cf8" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;

    if (this.ghostShapeElement.vertices) {
      this.ghostShapeElement.vertices.forEach((gv) => {
        html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#ffffff" stroke="#6366f1" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
      });
    }

    return html;
  }

  public calculateShapeBounds(
    start: Point,
    current: Point,
    shiftKey: boolean,
    ctrlKey: boolean,
    altKey: boolean
  ): { x: number; y: number; w: number; h: number; cx: number; cy: number; rx: number; ry: number } {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    const rawW = Math.abs(dx);
    const rawH = Math.abs(dy);

    let targetW = Math.max(rawW, 2);
    let targetH = Math.max(rawH, 2);

    // Priority: ctrlKey (1:1 ratio) takes precedence over altKey
    if (ctrlKey) {
      const size = Math.max(rawW, rawH, 2);
      targetW = size;
      targetH = size;
    } else if (altKey) {
      const ratioW = this.ctx.canvasMgr.shapeConfig?.aspectRatioW || 4;
      const ratioH = this.ctx.canvasMgr.shapeConfig?.aspectRatioH || 3;
      const ratio = ratioW / (ratioH || 1);

      if (rawW / ratio > rawH) {
        targetW = Math.max(rawW, 2);
        targetH = Math.max(targetW / ratio, 2);
      } else {
        targetH = Math.max(rawH, 2);
        targetW = Math.max(targetH * ratio, 2);
      }
    }

    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let rx = 0;
    let ry = 0;

    if (shiftKey) {
      // Shift: Expand from center
      cx = start.x;
      cy = start.y;
      rx = targetW;
      ry = targetH;
      w = targetW * 2;
      h = targetH * 2;
      x = cx - targetW;
      y = cy - targetH;
    } else {
      // Corner-to-corner expansion
      x = sx > 0 ? start.x : start.x - targetW;
      y = sy > 0 ? start.y : start.y - targetH;
      w = targetW;
      h = targetH;
      cx = x + w / 2;
      cy = y + h / 2;
      rx = w / 2;
      ry = h / 2;
    }

    return { x, y, w, h, cx, cy, rx, ry };
  }

  public createShapeElement(
    tool: string,
    start: Point,
    current: Point,
    id: string,
    shiftKey: boolean = false,
    ctrlKey: boolean = false,
    altKey: boolean = false
  ): VectorElement {
    // All primitives managed by ShapeToolHandler ('rect', 'ellipse', 'star') are closed geometric paths.
    // Open straight paths are handled exclusively by PolylineToolHandler, eliminating branching and redundant code.
    const isClosed = true;
    let vertices: PathVertex[] = [];

    const bounds = this.calculateShapeBounds(start, current, shiftKey, ctrlKey, altKey);

    if (tool === 'rect') {
      vertices = this.ctx.model.convertShapeToVertices('rect', {
        x: bounds.x.toString(),
        y: bounds.y.toString(),
        width: bounds.w.toString(),
        height: bounds.h.toString(),
        rx: (this.ctx.canvasMgr.shapeConfig?.rectCornerRadius || 0).toString(),
      });
    } else if (tool === 'ellipse') {
      vertices = this.ctx.model.convertShapeToVertices('ellipse', {
        cx: bounds.cx.toString(),
        cy: bounds.cy.toString(),
        rx: bounds.rx.toString(),
        ry: bounds.ry.toString(),
      });
    } else if (tool === 'star') {
      vertices = this.ctx.model.convertShapeToVertices('star', {
        cx: bounds.cx.toString(),
        cy: bounds.cy.toString(),
        rx: bounds.rx.toString(),
        ry: bounds.ry.toString(),
        points: (this.ctx.canvasMgr.shapeConfig?.starPoints || 5).toString(),
        innerRatio: (this.ctx.canvasMgr.shapeConfig?.starInnerRatio || 0.4).toString(),
      });
    }

    const d = this.ctx.model.compilePathD(vertices, isClosed);
    const attributes: Record<string, string> = {
      id,
      d,
      fill: isClosed ? '#6366f1' : 'none',
      stroke: '#ffffff',
      'stroke-width': '2',
      'data-node-types': vertices.map((v) => v.nodeType).join(','),
      'data-shape': tool,
    };

    const isParametric = tool === 'rect' || tool === 'ellipse';

    /**
     * ARCHITECTURAL RATIONALE: Native Parametric Shape Creation (FEAT-01)
     * When drawing standard rectangles or ellipses, AntiDraw marks them as native parametric primitives
     * (`tagName: 'rect'` or `tagName: 'ellipse'`, `isParametric: true`).
     * They store standard SVG attributes (x, y, width, height for rect; cx, cy, rx, ry for ellipse)
     * and only convert to curves upon explicit command (Ctrl+Q / context menu / inspector button).
     */
    if (tool === 'ellipse') {
      attributes['cx'] = bounds.cx.toString();
      attributes['cy'] = bounds.cy.toString();
      attributes['rx'] = bounds.rx.toString();
      attributes['ry'] = bounds.ry.toString();
      attributes['data-ellipse-type'] = 'ellipse';
      attributes['data-start-angle'] = '0';
      attributes['data-end-angle'] = '360';
    } else if (tool === 'rect') {
      attributes['x'] = bounds.x.toString();
      attributes['y'] = bounds.y.toString();
      attributes['width'] = bounds.w.toString();
      attributes['height'] = bounds.h.toString();
      attributes['rx'] = (this.ctx.canvasMgr.shapeConfig?.rectCornerRadius || 0).toString();
    }
    attributes['data-parametric'] = isParametric ? 'true' : 'false';

    return {
      id,
      tagName: isParametric ? (tool as any) : 'path',
      attributes,
      vertices,
      isClosed,
      isParametric,
      shapeType: isParametric ? (tool as any) : 'path',
    };
  }
}
