import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, VectorElement, PathVertex } from '../engine/VectorModel.js';
import { formatNum } from '../engine/geometry/PathGeometryCompiler.js';
import { ActionIntent, ActionIntentFactory } from './contracts/ActionIntent.js';
import { CommandRegistry } from '../engine/commands/CommandRegistry.js';

/**
 * ARCHITECTURAL RATIONALE: Geometric Shape Tool Isolation & Canonical SVG Primitive Compilation (FEAT-11)
 *
 * 1. Direct SVG Primitive Toolset:
 *    AntiDraw provides direct presence and creation workflows for all canonical SVG primitives:
 *    - <rect>: Parametric rectangle with uniform or independent corner curvature.
 *    - <circle>: Dedicated 1:1 circular geometry producing native <circle cx cy r>.
 *    - <ellipse>: Parametric ellipse producing native <ellipse cx cy rx ry>.
 *    - <line>: Straight 2-point vector producing native <line x1 y1 x2 y2>.
 *    - <polygon>: Multi-sided regular polygon producing native <polygon points="...">.
 *    - <star>: Multi-pointed star shape compiled to closed Bézier path.
 *
 * 2. Hybrid Model Representation:
 *    Each primitive maintains its native SVG attributes and tag in memory and export, while
 *    synchronizing canonical vertices in the background. This ensures unified bounding boxes,
 *    transforms, snapping, and seamless conversion to curves (Ctrl+Q).
 *
 * 3. Non-Destructive Ghost Shape Life Cycle:
 *    During pointer drag, tentative shapes exist strictly in memory as `ghostShapeElement` and
 *    render onto the ephemeral overlay layer (`renderOverlay`). The core SVG model and undo history
 *    remain unmutated until pointer release (`onPointerUp`).
 *
 * 4. Geometric Constraints & Modifiers:
 *    - `shiftKey`: On rectangular/elliptical/polygon shapes, expands outward symmetrically from the
 *      initial click point. On lines, constrains orientation to 45° angular increments.
 *    - `ctrlKey`: Enforces 1:1 square/circular aspect ratio.
 *    - `altKey`: Constrains geometry to user-defined aspect ratios from `CanvasManager.shapeConfig`.
 */
export class ShapeToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['rect', 'circle', 'ellipse', 'line', 'polygon', 'star'];
  private ctx: ToolContext;

  public shapeStartPt: Point | null = null;
  public ghostShapeElement: VectorElement | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /**
   * Ciclo Declarativo (Capa L2): Evalúa pointerdown y emite BeginIntent
   */
  public evalPointerDown(e: PointerEvent, pt: Point): ActionIntent {
    const activeTool = this.ctx.getActiveTool();
    if (!this.toolTypes.includes(activeTool) || e.button !== 0) {
      return ActionIntentFactory.none();
    }
    const otherVertices = this.ctx.getOtherVertices();
    const snappedPt = this.ctx.snapPoint(pt, otherVertices);
    this.shapeStartPt = snappedPt;
    this.ghostShapeElement = null;
    return ActionIntentFactory.begin('shape.create', { startPoint: snappedPt, tool: activeTool });
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerDown(e, pt);
    if (intent.kind === 'none') return false;
    this.ctx.renderOverlay();
    return true;
  }

  /**
   * Ciclo Declarativo (Capa L2): Evalúa pointermove y emite PreviewIntent
   */
  public evalPointerMove(e: PointerEvent, pt: Point): ActionIntent {
    if (!this.shapeStartPt) return ActionIntentFactory.none();
    const activeTool = this.ctx.getActiveTool();
    if (!this.toolTypes.includes(activeTool)) return ActionIntentFactory.none();

    const otherVertices = this.ctx.getOtherVertices();
    let currentPt = this.ctx.snapPoint(pt, otherVertices);

    // Line 45-degree angle constraint on Shift
    if (activeTool === 'line' && e.shiftKey) {
      const dx = currentPt.x - this.shapeStartPt.x;
      const dy = currentPt.y - this.shapeStartPt.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      currentPt = {
        x: this.shapeStartPt.x + dist * Math.cos(snapAngle),
        y: this.shapeStartPt.y + dist * Math.sin(snapAngle),
      };
    }

    this.ghostShapeElement = this.createShapeElement(
      activeTool,
      this.shapeStartPt,
      currentPt,
      'ghost_shape_preview',
      e.shiftKey,
      e.ctrlKey,
      e.altKey
    );

    return ActionIntentFactory.preview('shape.preview', { ghost: this.ghostShapeElement });
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const intent = this.evalPointerMove(e, pt);
    if (intent.kind === 'none') return false;
    this.ctx.renderOverlay();
    return true;
  }

  /**
   * Ciclo Declarativo (Capa L2): Evalúa pointerup y emite CommitIntent o CancelIntent
   */
  public evalPointerUp(_e: PointerEvent, _pt: Point): ActionIntent {
    if (!this.shapeStartPt) return ActionIntentFactory.none();

    if (this.ghostShapeElement) {
      // Reject micro-drags (< 2px) to prevent accidental zero-dimension primitives
      if (this.ghostShapeElement.tagName === 'line') {
        const x1 = parseFloat(this.ghostShapeElement.attributes.x1 || '0');
        const y1 = parseFloat(this.ghostShapeElement.attributes.y1 || '0');
        const x2 = parseFloat(this.ghostShapeElement.attributes.x2 || '0');
        const y2 = parseFloat(this.ghostShapeElement.attributes.y2 || '0');
        if (Math.hypot(x2 - x1, y2 - y1) < 2) {
          return ActionIntentFactory.cancel('micro_drag_rejected');
        }
      }

      const id = `el_${Date.now().toString(36)}`;
      const committedEl: VectorElement = {
        ...this.ghostShapeElement,
        id,
        attributes: {
          ...this.ghostShapeElement.attributes,
          id,
        },
      };

      return ActionIntentFactory.commit('shape.create', { element: committedEl });
    }

    return ActionIntentFactory.cancel('no_ghost_shape');
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (!this.shapeStartPt) return false;

    const intent = this.evalPointerUp(e, pt);
    const cmdRegistry = CommandRegistry.getInstance();

    if (intent.kind === 'commit') {
      if (cmdRegistry.has('shape.create')) {
        cmdRegistry.execute('shape.create', intent.params);
      } else {
        // Fallback directo
        this.ctx.pushUndo();
        this.ctx.model.elements.push(intent.params.element);
        this.ctx.selectionTool.select(intent.params.element.id);
        this.ctx.render();
        this.ctx.syncToHost();
      }
    }

    this.shapeStartPt = null;
    this.ghostShapeElement = null;
    this.ctx.renderOverlay();
    return true;
  }

  public onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && (this.shapeStartPt || this.ghostShapeElement)) {
      return this.cancel();
    }
    return false;
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

    const z = zoom || 1;

    // Dedicated overlay rendering for straight line primitives
    if (this.ghostShapeElement.tagName === 'line') {
      const attrs = this.ghostShapeElement.attributes;
      let html = `<line x1="${attrs.x1}" y1="${attrs.y1}" x2="${attrs.x2}" y2="${attrs.y2}" stroke="#818cf8" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${attrs.x1}" cy="${attrs.y1}" r="${3.5 / z}" fill="#ffffff" stroke="#6366f1" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${attrs.x2}" cy="${attrs.y2}" r="${3.5 / z}" fill="#ffffff" stroke="#6366f1" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
      return html;
    }

    const d = this.ghostShapeElement.attributes.d;
    const isClosed = this.ghostShapeElement.isClosed;

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
    // 1. Direct SVG Native Line Creation
    if (tool === 'line') {
      const x1 = formatNum(start.x);
      const y1 = formatNum(start.y);
      const x2 = formatNum(current.x);
      const y2 = formatNum(current.y);
      const vertices: PathVertex[] = [
        { id: 'v_0', x: parseFloat(x1), y: parseFloat(y1), nodeType: 'asymmetric', command: 'M' },
        { id: 'v_1', x: parseFloat(x2), y: parseFloat(y2), nodeType: 'asymmetric', command: 'L' },
      ];
      const d = this.ctx.model.compilePathD(vertices, false);
      const attributes: Record<string, string> = {
        id,
        d,
        x1,
        y1,
        x2,
        y2,
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': '2',
        'data-node-types': 'asymmetric,asymmetric',
        'data-shape': 'line',
        'data-parametric': 'true',
      };
      return {
        id,
        tagName: 'line',
        shapeType: 'line',
        attributes,
        vertices,
        isClosed: false,
        isParametric: true,
      };
    }

    const isClosed = true;
    let vertices: PathVertex[] = [];

    // Circle tool intrinsically enforces 1:1 aspect ratio constraint
    const effectiveCtrl = tool === 'circle' ? true : ctrlKey;
    const bounds = this.calculateShapeBounds(start, current, shiftKey, effectiveCtrl, altKey);

    if (tool === 'rect') {
      vertices = this.ctx.model.convertShapeToVertices('rect', {
        x: bounds.x.toString(),
        y: bounds.y.toString(),
        width: bounds.w.toString(),
        height: bounds.h.toString(),
        rx: (this.ctx.canvasMgr.shapeConfig?.rectCornerRadius || 0).toString(),
      });
    } else if (tool === 'circle') {
      vertices = this.ctx.model.convertShapeToVertices('circle', {
        cx: bounds.cx.toString(),
        cy: bounds.cy.toString(),
        r: bounds.rx.toString(),
      });
    } else if (tool === 'ellipse') {
      vertices = this.ctx.model.convertShapeToVertices('ellipse', {
        cx: bounds.cx.toString(),
        cy: bounds.cy.toString(),
        rx: bounds.rx.toString(),
        ry: bounds.ry.toString(),
      });
    } else if (tool === 'polygon') {
      const sides = Math.max(3, this.ctx.canvasMgr.shapeConfig?.polygonSides || 5);
      const regularRatio = Math.cos(Math.PI / sides);
      vertices = this.ctx.model.convertShapeToVertices('star', {
        cx: bounds.cx.toString(),
        cy: bounds.cy.toString(),
        rx: bounds.rx.toString(),
        ry: bounds.ry.toString(),
        points: sides.toString(),
        innerRatio: regularRatio.toString(),
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

    const isParametric = tool === 'rect' || tool === 'circle' || tool === 'ellipse' || tool === 'polygon' || tool === 'star';

    if (tool === 'circle') {
      attributes['cx'] = formatNum(bounds.cx);
      attributes['cy'] = formatNum(bounds.cy);
      attributes['r'] = formatNum(bounds.rx);
      attributes['data-ellipse-type'] = 'ellipse';
      attributes['data-start-angle'] = '0';
      attributes['data-end-angle'] = '360';
    } else if (tool === 'ellipse') {
      attributes['cx'] = bounds.cx.toString();
      attributes['cy'] = bounds.cy.toString();
      attributes['rx'] = bounds.rx.toString();
      attributes['ry'] = bounds.ry.toString();
      attributes['data-ellipse-type'] = 'ellipse';
      attributes['data-start-angle'] = '0';
      attributes['data-end-angle'] = '360';
    } else if (tool === 'star') {
      const starPts = (this.ctx.canvasMgr.shapeConfig?.starPoints || 5).toString();
      const starRatio = (this.ctx.canvasMgr.shapeConfig?.starInnerRatio || 0.4).toString();
      attributes['cx'] = formatNum(bounds.cx);
      attributes['cy'] = formatNum(bounds.cy);
      attributes['rx'] = formatNum(bounds.rx);
      attributes['ry'] = formatNum(bounds.ry);
      attributes['data-star-points'] = starPts;
      attributes['data-star-inner-ratio'] = starRatio;
      attributes['points'] = starPts;
      attributes['innerRatio'] = starRatio;
    } else if (tool === 'polygon') {
      const sides = Math.max(3, this.ctx.canvasMgr.shapeConfig?.polygonSides || 5);
      const regularRatio = Math.cos(Math.PI / sides);
      attributes['cx'] = formatNum(bounds.cx);
      attributes['cy'] = formatNum(bounds.cy);
      attributes['rx'] = formatNum(bounds.rx);
      attributes['ry'] = formatNum(bounds.ry);
      attributes['data-star-points'] = sides.toString();
      attributes['data-star-inner-ratio'] = regularRatio.toString();
      attributes['data-polygon-sides'] = sides.toString();
      attributes['points'] = sides.toString();
      attributes['innerRatio'] = regularRatio.toString();
      attributes['data-shape'] = 'polygon';
    } else if (tool === 'rect') {
      const cr = (this.ctx.canvasMgr.shapeConfig?.rectCornerRadius || 0).toString();
      attributes['x'] = bounds.x.toString();
      attributes['y'] = bounds.y.toString();
      attributes['width'] = bounds.w.toString();
      attributes['height'] = bounds.h.toString();
      attributes['rx'] = cr;
      attributes['ry'] = cr;
      attributes['data-corner-mode'] = 'uniform';
      attributes['data-corner-unit'] = 'px';
      attributes['data-corner-radius'] = `${cr},${cr},${cr},${cr}`;
      attributes['data-corner-tl'] = cr;
      attributes['data-corner-tr'] = cr;
      attributes['data-corner-br'] = cr;
      attributes['data-corner-bl'] = cr;
    }
    attributes['data-parametric'] = isParametric ? 'true' : 'false';

    return {
      id,
      tagName: isParametric ? (tool === 'star' || tool === 'polygon' ? 'path' : (tool as any)) : 'path',
      attributes,
      vertices,
      isClosed,
      isParametric,
      shapeType: isParametric ? (tool as any) : 'path',
    };
  }
}
