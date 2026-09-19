import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point, RectCorners } from '../../engine/VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Encapsulated Parametric Handle Controller (SOLID / SRP)
 * Segregates quadrant angle opening, donut/ring inner ratios, and rectangle corner radii
 * manipulation away from freeform Bézier node editing in NodeToolHandler.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle:
 *    Parametric primitives (<ellipse>, <circle>, <rect>) possess geometric invariants
 *    (radial symmetries, polar angles, concentric boundaries, corner radii) that contrast
 *    sharply with unconstrained Bézier spline nodes. Isolating them prevents cluttering
 *    general-purpose node editing logic with shape-specific math.
 * 2. Visual Drag Feedback & Dynamic Overlays:
 *    - Ellipse quadrant handles toggle smoothly between closed Pie wedges and open Arcs depending on radial distance.
 *    - Concentric inner ratio rings snap to solid circles near center or 5% increments with Shift.
 *    - Rect corner radius badges render real-time pixel and percentage feedback with Alt-toggled independence.
 * 3. Non-Destructive Model Synchronization:
 *    Synchronizes parametric attributes ('data-ellipse-type', 'data-start-angle', 'data-end-angle',
 *    'data-inner-ratio', 'data-corner-*') and synthesizes matching SVG path 'd' attributes without
 *    degrading parametric shapes into detached polylines.
 */
export class ParametricHandleController {
  private ctx: ToolContext;

  // FEAT-02: Parametric Ellipse Quadrant Control Handle State
  public quadrantGhostMode: 'ellipse' | 'pie' | 'arc' = 'ellipse';
  public quadrantGhostStartAngle: number = 0;
  public quadrantGhostEndAngle: number = 360;
  public quadrantCenter: Point = { x: 0, y: 0 };
  public quadrantRadii: { rx: number; ry: number } = { rx: 1, ry: 1 };
  public quadrantGhostD: string = '';

  // FEAT-10: Parametric Ellipse Inner Ratio (Donut/Ring) State
  public ellipseInnerGhostRatio: number = 0;

  // FEAT-03: Parametric Rect Corner Radius Drag State
  public rectGhostD: string = '';
  public rectGhostCorners: RectCorners = { tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' };
  public rectGhostBounds: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  public rectGhostActiveRadius: number = 0;
  public rectGhostActiveCorner: 'tl' | 'tr' | 'br' | 'bl' = 'tl';

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /**
   * ARCHITECTURAL RATIONALE: Dual Perimeter Handles for Ellipse Arc & Pie (FEAT-DualHandles)
   * Exposes startAngle and endAngle handles independently on the circumference:
   * - In closed full ellipses (360°), a single handle is shown at startAngle (or 0°).
   *   Manipulating it splits the circle and reveals the complementary handle.
   * - In open arcs or pie wedges, both 'start' and 'end' handles are visible and draggable,
   *   allowing bidirectional adjustment clockwise or counter-clockwise.
   */
  public getQuadrantStartHandlePoint(el: VectorElement): Point | null {
    if (!this.ctx.model.isParametricElement(el) || !this.ctx.model.isEllipse(el)) return null;
    const cx = parseFloat(el.attributes.cx || '0');
    const cy = parseFloat(el.attributes.cy || '0');
    const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
    const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
    const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
    const rad = (startAngle * Math.PI) / 180;
    return {
      x: cx + rx * Math.cos(rad),
      y: cy + ry * Math.sin(rad),
    };
  }

  public getQuadrantEndHandlePoint(el: VectorElement): Point | null {
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

  public getQuadrantHandlePoint(el: VectorElement): Point | null {
    return this.getQuadrantEndHandlePoint(el);
  }

  /**
   * Computes the canvas coordinate of the inner hole (donut/ring) control handle.
   */
  public getEllipseInnerHandlePoint(el: VectorElement): Point | null {
    if (!this.ctx.model.isParametricElement(el) || !this.ctx.model.isEllipse(el)) return null;
    const cx = parseFloat(el.attributes.cx || '0');
    const cy = parseFloat(el.attributes.cy || '0');
    const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
    const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
    const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
    const type = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
    const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
    const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');

    if (innerRatio <= 0) {
      return { x: cx, y: cy };
    }

    const isFull = type === 'ellipse' || Math.abs(endAngle - startAngle) >= 360;
    let midAngle: number;
    if (isFull) {
      midAngle = 0;
    } else {
      let sweep = endAngle - startAngle;
      while (sweep < 0) sweep += 360;
      while (sweep > 360) sweep -= 360;
      midAngle = startAngle + sweep / 2;
    }
    const rad = (midAngle * Math.PI) / 180;
    return {
      x: cx + rx * innerRatio * Math.cos(rad),
      y: cy + ry * innerRatio * Math.sin(rad),
    };
  }

  /**
   * Computes the 4 canvas coordinates of the corner radius control handles for a parametric rectangle.
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
   * Tests and initializes pointer down on parametric handles.
   */
  public handlePointerDown(
    selectedEl: VectorElement,
    pt: Point,
    z: number
  ): { activeHandle: string; initialVertices: PathVertex[]; handled: boolean } | null {
    // 1. Parametric ellipse handles (FEAT-02, FEAT-10 & FEAT-DualHandles)
    if (this.ctx.model.isParametricElement(selectedEl) && this.ctx.model.isEllipse(selectedEl)) {
      const innerPt = this.getEllipseInnerHandlePoint(selectedEl);
      const startPt = this.getQuadrantStartHandlePoint(selectedEl);
      const endPt = this.getQuadrantEndHandlePoint(selectedEl);
      const cx = parseFloat(selectedEl.attributes.cx || '0');
      const cy = parseFloat(selectedEl.attributes.cy || '0');
      const rx = parseFloat(selectedEl.attributes.rx || selectedEl.attributes.r || '1');
      const ry = parseFloat(selectedEl.attributes.ry || selectedEl.attributes.r || '1');
      const currentInnerRatio = parseFloat(selectedEl.attributes['data-inner-ratio'] || '0');
      const type = (selectedEl.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
      const sAngle = parseFloat(selectedEl.attributes['data-start-angle'] || '0');
      const eAngle = parseFloat(selectedEl.attributes['data-end-angle'] || '360');
      const isFull = type === 'ellipse' || Math.abs(eAngle - sAngle) >= 360;

      if (innerPt && Math.hypot(pt.x - innerPt.x, pt.y - innerPt.y) <= 12 / z) {
        this.quadrantCenter = { x: cx, y: cy };
        this.quadrantRadii = { rx, ry };
        this.quadrantGhostMode = type;
        this.quadrantGhostStartAngle = sAngle;
        this.quadrantGhostEndAngle = eAngle;
        this.ellipseInnerGhostRatio = currentInnerRatio;
        this.quadrantGhostD = selectedEl.attributes.d || '';
        return {
          activeHandle: 'ellipse-inner',
          initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
          handled: true,
        };
      }

      if (isFull) {
        if (startPt && Math.hypot(pt.x - startPt.x, pt.y - startPt.y) <= 12 / z) {
          this.quadrantCenter = { x: cx, y: cy };
          this.quadrantRadii = { rx, ry };
          this.quadrantGhostMode = type;
          this.quadrantGhostStartAngle = 0;
          this.quadrantGhostEndAngle = 360;
          this.ellipseInnerGhostRatio = currentInnerRatio;
          this.quadrantGhostD = selectedEl.attributes.d || '';
          return {
            activeHandle: 'quadrant-end',
            initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
            handled: true,
          };
        }
      } else {
        // Test start handle first
        if (startPt && Math.hypot(pt.x - startPt.x, pt.y - startPt.y) <= 12 / z) {
          this.quadrantCenter = { x: cx, y: cy };
          this.quadrantRadii = { rx, ry };
          this.quadrantGhostMode = type;
          this.quadrantGhostStartAngle = sAngle;
          this.quadrantGhostEndAngle = eAngle;
          this.ellipseInnerGhostRatio = currentInnerRatio;
          this.quadrantGhostD = selectedEl.attributes.d || '';
          return {
            activeHandle: 'quadrant-start',
            initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
            handled: true,
          };
        }
        // Test end handle
        if (endPt && Math.hypot(pt.x - endPt.x, pt.y - endPt.y) <= 12 / z) {
          this.quadrantCenter = { x: cx, y: cy };
          this.quadrantRadii = { rx, ry };
          this.quadrantGhostMode = type;
          this.quadrantGhostStartAngle = sAngle;
          this.quadrantGhostEndAngle = eAngle;
          this.ellipseInnerGhostRatio = currentInnerRatio;
          this.quadrantGhostD = selectedEl.attributes.d || '';
          return {
            activeHandle: 'quadrant-end',
            initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
            handled: true,
          };
        }
      }
    }

    // 2. Parametric rect corner radius control handles (FEAT-03)
    if (this.ctx.model.isParametricElement(selectedEl) && this.ctx.model.isRect(selectedEl)) {
      const cornerHandles = this.getRectCornerHandles(selectedEl, z);
      if (cornerHandles) {
        const cornersList: ('tl' | 'tr' | 'br' | 'bl')[] = ['tl', 'tr', 'br', 'bl'];
        for (const cornerKey of cornersList) {
          const hPt = cornerHandles[cornerKey];
          if (Math.hypot(pt.x - hPt.x, pt.y - hPt.y) <= 12 / z) {
            const x = parseFloat(selectedEl.attributes.x || '0');
            const y = parseFloat(selectedEl.attributes.y || '0');
            const w = parseFloat(selectedEl.attributes.width || '100');
            const h = parseFloat(selectedEl.attributes.height || '100');
            this.rectGhostBounds = { x, y, w, h };
            this.rectGhostCorners = this.ctx.model.getRectCorners(selectedEl, w, h);
            this.rectGhostActiveCorner = cornerKey;
            this.rectGhostActiveRadius = this.rectGhostCorners[cornerKey];
            this.rectGhostD = selectedEl.attributes.d || '';
            return {
              activeHandle: `corner-${cornerKey}`,
              initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
              handled: true,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Handles dragging of quadrant angles, inner donut ratios, or corner radii.
   */
  public handlePointerMove(
    selectedEl: VectorElement,
    activeHandle: string,
    pt: Point,
    isShift: boolean,
    isCtrl: boolean,
    isAlt: boolean
  ): { handled: boolean; ghostNodeVertices?: PathVertex[] } | null {
    // Quadrant angle dragging (FEAT-02 & FEAT-DualHandles)
    if (activeHandle === 'quadrant' || activeHandle === 'quadrant-start' || activeHandle === 'quadrant-end') {
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = Math.max(1, this.quadrantRadii.rx);
      const ry = Math.max(1, this.quadrantRadii.ry);

      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const D = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);

      const rad = Math.atan2(dy / ry, dx / rx);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      if (isShift || isCtrl) {
        deg = Math.round(deg / 15) * 15;
      } else {
        for (const cardinal of [0, 90, 180, 270, 360]) {
          if (Math.abs(deg - (cardinal % 360)) <= 3) {
            deg = cardinal % 360;
            break;
          }
        }
      }
      deg = Math.round(deg * 10) / 10;

      let startAngle = this.quadrantGhostStartAngle;
      let endAngle = this.quadrantGhostEndAngle;

      if (activeHandle === 'quadrant-start') {
        startAngle = deg;
      } else {
        endAngle = deg;
      }

      let deltaDeg = endAngle - startAngle;
      while (deltaDeg < 0) deltaDeg += 360;
      while (deltaDeg > 360) deltaDeg -= 360;

      let mode: 'ellipse' | 'pie' | 'arc' = 'pie';
      if (deltaDeg <= 3 || Math.abs(deltaDeg - 360) <= 3) {
        mode = 'ellipse';
        startAngle = 0;
        endAngle = 360;
      } else {
        mode = D > 1.0 ? 'arc' : 'pie';
      }

      this.quadrantGhostMode = mode;
      this.quadrantGhostStartAngle = startAngle;
      this.quadrantGhostEndAngle = endAngle;

      const ghostVerts = this.ctx.model.convertEllipseToVertices(
        cx,
        cy,
        rx,
        ry,
        mode,
        startAngle,
        endAngle,
        this.ellipseInnerGhostRatio
      );
      this.quadrantGhostD = this.ctx.model.compileEllipseD(
        cx,
        cy,
        rx,
        ry,
        mode,
        startAngle,
        endAngle,
        this.ellipseInnerGhostRatio
      );

      return { handled: true, ghostNodeVertices: ghostVerts };
    }

    // Inner donut/ring ratio dragging
    if (activeHandle === 'ellipse-inner') {
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = Math.max(1, this.quadrantRadii.rx);
      const ry = Math.max(1, this.quadrantRadii.ry);

      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const D = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      let ratio = Math.max(0, Math.min(0.95, D));

      if (ratio < 0.05) {
        ratio = 0;
      } else if (isShift || isCtrl) {
        ratio = Math.round(ratio * 20) / 20;
      } else {
        ratio = Math.round(ratio * 100) / 100;
      }

      this.ellipseInnerGhostRatio = ratio;

      const ghostVerts = this.ctx.model.convertEllipseToVertices(
        cx,
        cy,
        rx,
        ry,
        this.quadrantGhostMode,
        this.quadrantGhostStartAngle,
        this.quadrantGhostEndAngle,
        ratio
      );
      this.quadrantGhostD = this.ctx.model.compileEllipseD(
        cx,
        cy,
        rx,
        ry,
        this.quadrantGhostMode,
        this.quadrantGhostStartAngle,
        this.quadrantGhostEndAngle,
        ratio
      );

      return { handled: true, ghostNodeVertices: ghostVerts };
    }

    // Parametric rect corner radii dragging
    if (activeHandle.startsWith('corner-')) {
      const cornerKey = activeHandle.replace('corner-', '') as 'tl' | 'tr' | 'br' | 'bl';
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
      const ghostVerts = this.ctx.model.convertRectToVertices(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);
      this.rectGhostD = this.ctx.model.compileRectD(x, y, w, h, eff.tl, eff.tr, eff.br, eff.bl);

      return { handled: true, ghostNodeVertices: ghostVerts };
    }

    return null;
  }

  /**
   * Commits the parametric changes on pointer up.
   */
  public handlePointerUp(
    selectedEl: VectorElement,
    activeHandle: string,
    ghostNodeVertices: PathVertex[] | null,
    initialVertices: PathVertex[]
  ): boolean {
    if (activeHandle === 'quadrant' || activeHandle === 'quadrant-start' || activeHandle === 'quadrant-end') {
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

      const innerRatio = parseFloat(selectedEl.attributes['data-inner-ratio'] || '0');
      if (innerRatio > 0) {
        selectedEl.attributes['fill-rule'] = 'evenodd';
      }

      selectedEl.vertices = ghostNodeVertices || initialVertices;
      selectedEl.attributes.d = this.quadrantGhostD || this.ctx.model.compileEllipseD(
        this.quadrantCenter.x,
        this.quadrantCenter.y,
        this.quadrantRadii.rx,
        this.quadrantRadii.ry,
        this.quadrantGhostMode,
        this.quadrantGhostStartAngle,
        this.quadrantGhostEndAngle,
        innerRatio
      );
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      this.quadrantGhostD = '';
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }

    if (activeHandle === 'ellipse-inner') {
      this.ctx.pushUndo();
      selectedEl.attributes['data-inner-ratio'] = this.ellipseInnerGhostRatio > 0 ? this.ellipseInnerGhostRatio.toString() : '0';
      if (this.ellipseInnerGhostRatio > 0) {
        selectedEl.attributes['fill-rule'] = 'evenodd';
      } else {
        delete selectedEl.attributes['fill-rule'];
      }

      selectedEl.vertices = ghostNodeVertices || initialVertices;
      selectedEl.attributes.d = this.quadrantGhostD || this.ctx.model.compileEllipseD(
        this.quadrantCenter.x,
        this.quadrantCenter.y,
        this.quadrantRadii.rx,
        this.quadrantRadii.ry,
        this.quadrantGhostMode,
        this.quadrantGhostStartAngle,
        this.quadrantGhostEndAngle,
        this.ellipseInnerGhostRatio
      );
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      this.quadrantGhostD = '';
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }

    if (activeHandle.startsWith('corner-')) {
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

      selectedEl.vertices = ghostNodeVertices || initialVertices;
      selectedEl.attributes.d = this.rectGhostD || this.ctx.model.compilePathD(selectedEl.vertices, true);
      selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

      this.rectGhostD = '';
      if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
      this.ctx.render();
      this.ctx.syncToHost();
      return true;
    }

    return false;
  }

  /**
   * ARCHITECTURAL RATIONALE: Non-Destructive Cancellation (FIX-GhostFreeze)
   * Purges ephemeral drag states and preview strings ('quadrantGhostD', 'rectGhostD'),
   * preventing orphaned overlay artifacts when focus is lost or pointer interaction is cancelled.
   */
  public cancel(): boolean {
    const hadGhost = !!(this.quadrantGhostD || this.rectGhostD);
    this.quadrantGhostD = '';
    this.rectGhostD = '';
    return hadGhost;
  }

  /**
   * Renders ghost overlay during live dragging of parametric quadrant, donut inner ratio, or rect corners.
   */
  public renderGhostOverlay(activeHandle: string | null, z: number): string {
    if (!activeHandle) return '';

    // 1. Quadrant Ghost during active quadrant dragging (FEAT-02 & FEAT-DualHandles)
    if (activeHandle === 'quadrant' || activeHandle === 'quadrant-start' || activeHandle === 'quadrant-end') {
      const isArc = this.quadrantGhostMode === 'arc';
      const fill = isArc ? 'none' : 'rgba(245, 158, 11, 0.2)';
      const d = this.quadrantGhostD;
      let html = `<path d="${d}" fill="${fill}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = this.quadrantRadii.rx;
      const ry = this.quadrantRadii.ry;

      const activeAngle = activeHandle === 'quadrant-start' ? this.quadrantGhostStartAngle : this.quadrantGhostEndAngle;
      const activeRad = (activeAngle * Math.PI) / 180;
      const qx = cx + rx * Math.cos(activeRad);
      const qy = cy + ry * Math.sin(activeRad);

      // Ray from center to active handle
      html += `<line x1="${cx}" y1="${cy}" x2="${qx}" y2="${qy}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="#f59e0b" />`;
      // Active handle circle
      html += `<circle cx="${qx}" cy="${qy}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;
      // Angle and mode badge
      const badgeW = 96;
      const badgeH = 18;
      const label = activeHandle === 'quadrant-start' ? 'Ini' : 'Fin';
      html += `
        <g opacity="0.95">
          <rect x="${qx + 10}" y="${qy - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <text x="${qx + 14}" y="${qy - 9}" font-size="10" fill="#fde68a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">${label}: ${Math.round(activeAngle)}° [${this.quadrantGhostMode.toUpperCase()}]</text>
        </g>
      `;
      return html;
    }

    // 2. Ellipse Inner Ratio Ghost during active inner handle dragging (FEAT-10)
    if (activeHandle === 'ellipse-inner') {
      const isArc = this.quadrantGhostMode === 'arc';
      const fill = isArc ? 'none' : 'rgba(6, 182, 212, 0.2)';
      const d = this.quadrantGhostD;
      let html = `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#06b6d4" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = this.quadrantRadii.rx;
      const ry = this.quadrantRadii.ry;
      const ratio = this.ellipseInnerGhostRatio;

      const isFull = this.quadrantGhostMode === 'ellipse' || Math.abs(this.quadrantGhostEndAngle - this.quadrantGhostStartAngle) >= 360;
      let midAngle: number;
      if (isFull) {
        midAngle = 0;
      } else {
        let sweep = this.quadrantGhostEndAngle - this.quadrantGhostStartAngle;
        while (sweep < 0) sweep += 360;
        while (sweep > 360) sweep -= 360;
        midAngle = this.quadrantGhostStartAngle + sweep / 2;
      }
      const midRad = (midAngle * Math.PI) / 180;
      const inX = cx + rx * ratio * Math.cos(midRad);
      const inY = cy + ry * ratio * Math.sin(midRad);

      // Concentric inner ring/arc guide
      if (ratio > 0) {
        if (isFull) {
          html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx * ratio}" ry="${ry * ratio}" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        } else {
          const inRx = rx * ratio;
          const inRy = ry * ratio;
          const a1 = (this.quadrantGhostStartAngle * Math.PI) / 180;
          const a2 = (this.quadrantGhostEndAngle * Math.PI) / 180;
          let deltaDeg = this.quadrantGhostEndAngle - this.quadrantGhostStartAngle;
          while (deltaDeg < 0) deltaDeg += 360;
          while (deltaDeg > 360) deltaDeg -= 360;
          const largeArc = deltaDeg > 180 ? 1 : 0;
          const arcD = `M ${cx + inRx * Math.cos(a1)} ${cy + inRy * Math.sin(a1)} A ${inRx} ${inRy} 0 ${largeArc} 1 ${cx + inRx * Math.cos(a2)} ${cy + inRy * Math.sin(a2)}`;
          html += `<path d="${arcD}" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        }
      }
      html += `<line x1="${cx}" y1="${cy}" x2="${inX}" y2="${inY}" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="#06b6d4" />`;
      html += `<circle cx="${inX}" cy="${inY}" r="${6 / z}" fill="#06b6d4" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;

      const badgeW = 92;
      const badgeH = 18;
      const pct = Math.round(ratio * 100);
      html += `
        <g opacity="0.95">
          <rect x="${inX + 10}" y="${inY - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#083344" stroke="#06b6d4" stroke-width="1" vector-effect="non-scaling-stroke" />
          <text x="${inX + 14}" y="${inY - 9}" font-size="10" fill="#67e8f9" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">Hueco: ${pct}%</text>
        </g>
      `;
      return html;
    }

    // 3. Rect Corner Ghost during active corner dragging (FEAT-03)
    if (activeHandle.startsWith('corner-')) {
      if (!this.rectGhostD) return '';
      let html = `<path d="${this.rectGhostD}" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

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
      return html;
    }

    return '';
  }

  /**
   * Renders idle interactive handles on parametric ellipses and rectangles when in Node Mode.
   */
  public renderIdleHandles(selectedEls: VectorElement[], z: number): string {
    if (selectedEls.length !== 1 || !this.ctx.model.isParametricElement(selectedEls[0])) {
      return '';
    }

    const el = selectedEls[0];
    let html = '';

    // Quadrant Start and End handles and Inner ratio handles on ellipse (FEAT-DualHandles)
    if (this.ctx.model.isEllipse(el)) {
      const type = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
      const sAngle = Math.round(parseFloat(el.attributes['data-start-angle'] || '0'));
      const eAngle = Math.round(parseFloat(el.attributes['data-end-angle'] || '360'));
      const isFull = type === 'ellipse' || Math.abs(eAngle - sAngle) >= 360;

      const startPt = this.getQuadrantStartHandlePoint(el);
      const endPt = this.getQuadrantEndHandlePoint(el);

      if (isFull) {
        if (startPt) {
          html += `
            <g style="cursor: crosshair;" title="Tirador de Apertura Angular (Arrastrar para abrir tarta o arco)">
              <circle cx="${startPt.x}" cy="${startPt.y}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="${startPt.x}" cy="${startPt.y}" r="${2.5 / z}" fill="#ffffff" />
            </g>
          `;
        }
      } else {
        if (startPt) {
          html += `
            <g style="cursor: crosshair;" title="Tirador de Ángulo Inicial (${sAngle}°)">
              <circle cx="${startPt.x}" cy="${startPt.y}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="${startPt.x}" cy="${startPt.y}" r="${2.5 / z}" fill="#1e1b4b" />
            </g>
          `;
        }
        if (endPt) {
          html += `
            <g style="cursor: crosshair;" title="Tirador de Ángulo Final (${eAngle}°)">
              <circle cx="${endPt.x}" cy="${endPt.y}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="${endPt.x}" cy="${endPt.y}" r="${2.5 / z}" fill="#ffffff" />
            </g>
          `;
        }
      }

      const innerPt = this.getEllipseInnerHandlePoint(el);
      if (innerPt) {
        html += `
          <g style="cursor: crosshair;" title="Tirador de Hueco Interior (Radio Interno / Rosca)">
            <circle cx="${innerPt.x}" cy="${innerPt.y}" r="${5.5 / z}" fill="#06b6d4" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <circle cx="${innerPt.x}" cy="${innerPt.y}" r="${2 / z}" fill="#ffffff" />
          </g>
        `;
      }
    }

    // Corner radius handles on rect
    if (this.ctx.model.isRect(el)) {
      const cornerHandles = this.getRectCornerHandles(el, z);
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
