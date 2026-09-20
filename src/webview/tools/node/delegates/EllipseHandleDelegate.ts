import { ToolContext } from '../../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../../engine/VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Ellipse/Arc/Pie/Donut Handle Delegate (SOLID / SRP)
 * Encapsulates quadrant angle opening, dual circumference handles (start & end),
 * and concentric inner ratio (donut hole) manipulation away from other primitives.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle:
 *    All polar angle conversions, cardinal snapping, and inner donut ring
 *    logic reside exclusively within this delegate.
 * 2. Shortest-Arc Magnetic Quadrant Snapping:
 *    Calculates modular angular distance to cardinal quadrants (0°, 90°, 180°, 270°)
 *    solving 0°/360° discontinuity.
 */
export class EllipseHandleDelegate {
  private ctx: ToolContext;

  public quadrantGhostMode: 'ellipse' | 'pie' | 'arc' = 'ellipse';
  public quadrantGhostStartAngle: number = 0;
  public quadrantGhostEndAngle: number = 360;
  public quadrantCenter: Point = { x: 0, y: 0 };
  public quadrantRadii: { rx: number; ry: number } = { rx: 1, ry: 1 };
  public quadrantGhostD: string = '';
  public ellipseInnerGhostRatio: number = 0;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

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

  public handlePointerDown(
    selectedEl: VectorElement,
    pt: Point,
    z: number
  ): { activeHandle: string; initialVertices: PathVertex[]; handled: boolean } | null {
    if (!this.ctx.model.isParametricElement(selectedEl) || !this.ctx.model.isEllipse(selectedEl)) return null;

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

    return null;
  }

  public handlePointerMove(
    selectedEl: VectorElement,
    activeHandle: string,
    usePt: Point,
    isShift: boolean,
    isCtrl: boolean
  ): { handled: boolean; ghostNodeVertices?: PathVertex[] } | null {
    if (activeHandle === 'quadrant' || activeHandle === 'quadrant-start' || activeHandle === 'quadrant-end') {
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = Math.max(1, this.quadrantRadii.rx);
      const ry = Math.max(1, this.quadrantRadii.ry);

      const dx = usePt.x - cx;
      const dy = usePt.y - cy;
      const D = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);

      const rad = Math.atan2(dy / ry, dx / rx);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      // Candidate handle position along the circumference
      const H_cand: Point = {
        x: cx + rx * Math.cos(rad),
        y: cy + ry * Math.sin(rad),
      };

      const otherNodes = this.ctx.getOtherVertices([selectedEl.id]);
      otherNodes.push({ x: cx, y: cy });
      for (const r of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        otherNodes.push({ x: cx + rx * Math.cos(r), y: cy + ry * Math.sin(r) });
      }

      const snappedH = this.ctx.snapPoint(H_cand, otherNodes);
      const isSnapped = Math.abs(snappedH.x - H_cand.x) > 1e-4 || Math.abs(snappedH.y - H_cand.y) > 1e-4;

      if (isSnapped) {
        const snapRad = Math.atan2((snappedH.y - cy) / ry, (snappedH.x - cx) / rx);
        deg = (snapRad * 180) / Math.PI;
        if (deg < 0) deg += 360;
      } else {
        if (isShift || isCtrl) {
          deg = Math.round(deg / 15) * 15;
        } else {
          const snapTol = 4;
          for (const cardinal of [0, 90, 180, 270]) {
            const diff = Math.abs(((deg - cardinal + 540) % 360) - 180);
            if (diff <= snapTol) {
              deg = cardinal;
              break;
            }
          }
        }
        deg = Math.round(deg * 10) / 10;
      }

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

    if (activeHandle === 'ellipse-inner') {
      const cx = this.quadrantCenter.x;
      const cy = this.quadrantCenter.y;
      const rx = Math.max(1, this.quadrantRadii.rx);
      const ry = Math.max(1, this.quadrantRadii.ry);

      // Determine radial angle of the inner hole handle
      const isFull =
        this.quadrantGhostMode === 'ellipse' ||
        Math.abs(this.quadrantGhostEndAngle - this.quadrantGhostStartAngle) >= 360;
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
      const cosMid = Math.cos(midRad);
      const sinMid = Math.sin(midRad);

      const dx = usePt.x - cx;
      const dy = usePt.y - cy;
      const denom = (rx * cosMid) ** 2 + (ry * sinMid) ** 2;
      // Raw unconstrained ratio along the ray
      const rawRatio = Math.max(
        0,
        Math.min(0.95, (dx * rx * cosMid + dy * ry * sinMid) / (denom > 0 ? denom : 1))
      );

      // Candidate handle position along the ray
      const H_cand: Point = {
        x: cx + rx * rawRatio * cosMid,
        y: cy + ry * rawRatio * sinMid,
      };

      // Collect snapping landmarks: other elements, active center, and boundary quadrants
      const otherNodes = this.ctx.getOtherVertices([selectedEl.id]);
      otherNodes.push({ x: cx, y: cy });
      for (const r of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        otherNodes.push({ x: cx + rx * Math.cos(r), y: cy + ry * Math.sin(r) });
      }

      const snappedH = this.ctx.snapPoint(H_cand, otherNodes);
      const isSnapped = Math.abs(snappedH.x - H_cand.x) > 1e-4 || Math.abs(snappedH.y - H_cand.y) > 1e-4;

      let ratio = rawRatio;
      const zoom = this.ctx.canvasMgr?.zoom || 1;
      const centerThreshold = 14 / zoom;

      if (
        Math.hypot(usePt.x - cx, usePt.y - cy) <= centerThreshold ||
        Math.hypot(snappedH.x - cx, snappedH.y - cy) <= centerThreshold
      ) {
        // Snapped directly to center: solid circle with no inner hole
        ratio = 0;
      } else if (isSnapped) {
        // Project the snapped coordinate onto the radial ray to maintain exact grid intersection
        const snapDx = snappedH.x - cx;
        const snapDy = snappedH.y - cy;
        const projRatio = (snapDx * rx * cosMid + snapDy * ry * sinMid) / (denom > 0 ? denom : 1);
        ratio = Math.max(0, Math.min(0.95, projRatio));
      } else {
        if (ratio < 0.05) {
          ratio = 0;
        } else if (isShift || isCtrl) {
          ratio = Math.round(ratio * 20) / 20;
        } else {
          ratio = Math.round(ratio * 100) / 100;
        }
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

    return null;
  }

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

    return false;
  }

  public cancel(): boolean {
    const hadGhost = !!this.quadrantGhostD;
    this.quadrantGhostD = '';
    return hadGhost;
  }

  public renderGhostOverlay(activeHandle: string | null, z: number): string {
    if (!activeHandle) return '';

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

      const quadrantAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      quadrantAngles.forEach((qRad) => {
        const refX = cx + rx * Math.cos(qRad);
        const refY = cy + ry * Math.sin(qRad);
        html += `<circle cx="${refX}" cy="${refY}" r="${3.5 / z}" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none" />`;
      });

      html += `<line x1="${cx}" y1="${cy}" x2="${qx}" y2="${qy}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="#f59e0b" />`;
      html += `<circle cx="${qx}" cy="${qy}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;

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

    if (activeHandle === 'ellipse-inner') {
      const isArc = this.quadrantGhostMode === 'arc';
      const fill = isArc ? 'none' : 'rgba(245, 158, 11, 0.2)';
      const d = this.quadrantGhostD;
      let html = `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
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

      if (ratio > 0) {
        if (isFull) {
          html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx * ratio}" ry="${ry * ratio}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
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
          html += `<path d="${arcD}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
        }
      }

      const quadrantAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      quadrantAngles.forEach((qRad) => {
        const refX = cx + rx * Math.cos(qRad);
        const refY = cy + ry * Math.sin(qRad);
        html += `<circle cx="${refX}" cy="${refY}" r="${3.5 / z}" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none" />`;
      });

      html += `<line x1="${cx}" y1="${cy}" x2="${inX}" y2="${inY}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="#f59e0b" />`;
      html += `<circle cx="${inX}" cy="${inY}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;

      const badgeW = 92;
      const badgeH = 18;
      const pct = Math.round(ratio * 100);
      html += `
        <g opacity="0.95">
          <rect x="${inX + 10}" y="${inY - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <text x="${inX + 14}" y="${inY - 9}" font-size="10" fill="#fde68a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">Hueco: ${pct}%</text>
        </g>
      `;
      return html;
    }

    return '';
  }

  public renderIdleHandles(el: VectorElement, z: number): string {
    if (!this.ctx.model.isEllipse(el)) return '';

    let html = '';
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
          <circle cx="${innerPt.x}" cy="${innerPt.y}" r="${6 / z}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <circle cx="${innerPt.x}" cy="${innerPt.y}" r="${2.5 / z}" fill="#ffffff" />
        </g>
      `;
    }

    return html;
  }
}
