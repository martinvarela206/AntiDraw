import { ToolContext } from '../../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../../engine/VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Star and Regular Polygon Handle Delegate (SOLID / SRP)
 * Encapsulates the midpoint edge handle for unified regular polygon and star manipulation.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle:
 *    Edge midpoint calculations, inward and outward ratio adjustment, and snapping
 *    back to regular polygon ratio (cos(PI/points)) are cleanly isolated here.
 * 2. Visual Drag Feedback:
 *    Renders radial guide lines, color-coded badges (green for regular, blue for outward, purple for inward),
 *    and real-time percentage indicators.
 */
export class StarHandleDelegate {
  private ctx: ToolContext;

  public starCenter: Point = { x: 0, y: 0 };
  public starRadii: { rx: number; ry: number } = { rx: 50, ry: 50 };
  public starPoints: number = 5;
  public starGhostInnerRatio: number = 0.5;
  public starGhostD: string = '';

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  public getStarEdgeHandlePoint(el: VectorElement): Point | null {
    if (!this.ctx.model.isParametricElement(el) || !this.ctx.model.isStar(el)) return null;
    const cx = parseFloat(el.attributes.cx || '0');
    const cy = parseFloat(el.attributes.cy || '0');
    const rx = parseFloat(el.attributes.rx || el.attributes.r || '50');
    const ry = parseFloat(el.attributes.ry || el.attributes.r || '50');
    const points = Math.max(3, Math.min(64, parseInt(el.attributes['data-star-points'] || el.attributes['data-polygon-sides'] || el.attributes.points || '5', 10)));
    const regularRatio = Math.cos(Math.PI / points);
    const innerRatio = parseFloat(el.attributes['data-star-inner-ratio'] || el.attributes.innerRatio || regularRatio.toString());

    const midAngleRad = -Math.PI / 2 + Math.PI / points;
    return {
      x: cx + rx * innerRatio * Math.cos(midAngleRad),
      y: cy + ry * innerRatio * Math.sin(midAngleRad),
    };
  }

  public handlePointerDown(
    selectedEl: VectorElement,
    pt: Point,
    z: number
  ): { activeHandle: string; initialVertices: PathVertex[]; handled: boolean } | null {
    if (!this.ctx.model.isParametricElement(selectedEl) || !this.ctx.model.isStar(selectedEl)) return null;

    const starEdgePt = this.getStarEdgeHandlePoint(selectedEl);
    if (starEdgePt && Math.hypot(pt.x - starEdgePt.x, pt.y - starEdgePt.y) <= 12 / z) {
      const cx = parseFloat(selectedEl.attributes.cx || '0');
      const cy = parseFloat(selectedEl.attributes.cy || '0');
      const rx = parseFloat(selectedEl.attributes.rx || selectedEl.attributes.r || '50');
      const ry = parseFloat(selectedEl.attributes.ry || selectedEl.attributes.r || '50');
      const points = Math.max(3, Math.min(64, parseInt(selectedEl.attributes['data-star-points'] || selectedEl.attributes['data-polygon-sides'] || selectedEl.attributes.points || '5', 10)));
      const regularRatio = Math.cos(Math.PI / points);
      const currentRatio = parseFloat(selectedEl.attributes['data-star-inner-ratio'] || selectedEl.attributes.innerRatio || regularRatio.toString());

      this.starCenter = { x: cx, y: cy };
      this.starRadii = { rx, ry };
      this.starPoints = points;
      this.starGhostInnerRatio = currentRatio;
      this.starGhostD = selectedEl.attributes.d || '';
      return {
        activeHandle: 'star-edge',
        initialVertices: JSON.parse(JSON.stringify(selectedEl.vertices)),
        handled: true,
      };
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
    if (activeHandle !== 'star-edge') return null;

    const cx = this.starCenter.x;
    const cy = this.starCenter.y;
    const rx = Math.max(1, this.starRadii.rx);
    const ry = Math.max(1, this.starRadii.ry);
    const points = this.starPoints;
    const regularRatio = Math.cos(Math.PI / points);

    const midAngleRad = -Math.PI / 2 + Math.PI / points;
    const cosMid = Math.cos(midAngleRad);
    const sinMid = Math.sin(midAngleRad);

    const dx = usePt.x - cx;
    const dy = usePt.y - cy;
    const denom = (rx * cosMid) ** 2 + (ry * sinMid) ** 2;
    const rawRatio = Math.max(
      0.05,
      Math.min(2.0, (dx * rx * cosMid + dy * ry * sinMid) / (denom > 0 ? denom : 1))
    );

    // Candidate star edge handle along the radial ray
    const H_cand: Point = {
      x: cx + rx * rawRatio * cosMid,
      y: cy + ry * rawRatio * sinMid,
    };

    const otherNodes = this.ctx.getOtherVertices([selectedEl.id]);
    otherNodes.push({ x: cx, y: cy });
    for (let i = 0; i < points; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / points;
      otherNodes.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }

    const snappedH = this.ctx.snapPoint(H_cand, otherNodes);
    const isSnapped = Math.abs(snappedH.x - H_cand.x) > 1e-4 || Math.abs(snappedH.y - H_cand.y) > 1e-4;

    let ratio = rawRatio;
    const snapThreshold = 0.04;
    if (Math.abs(ratio - regularRatio) <= snapThreshold) {
      ratio = regularRatio;
    } else if (isSnapped) {
      const snapDx = snappedH.x - cx;
      const snapDy = snappedH.y - cy;
      const projRatio = (snapDx * rx * cosMid + snapDy * ry * sinMid) / (denom > 0 ? denom : 1);
      ratio = Math.max(0.05, Math.min(2.0, projRatio));
      if (Math.abs(ratio - regularRatio) <= snapThreshold) {
        ratio = regularRatio;
      }
    } else if (isShift || isCtrl) {
      ratio = Math.round(ratio * 20) / 20;
    } else {
      ratio = Math.round(ratio * 100) / 100;
    }

    this.starGhostInnerRatio = ratio;

    const ghostVerts = this.ctx.model.convertShapeToVertices('star', {
      cx: cx.toString(),
      cy: cy.toString(),
      rx: rx.toString(),
      ry: ry.toString(),
      points: points.toString(),
      innerRatio: ratio.toString(),
    });
    this.starGhostD = this.ctx.model.compilePathD(ghostVerts, true);

    return { handled: true, ghostNodeVertices: ghostVerts };
  }

  public handlePointerUp(
    selectedEl: VectorElement,
    activeHandle: string,
    ghostNodeVertices: PathVertex[] | null,
    initialVertices: PathVertex[]
  ): boolean {
    if (activeHandle !== 'star-edge') return false;

    this.ctx.pushUndo();
    const points = this.starPoints;
    const regularRatio = Math.cos(Math.PI / points);
    const ratio = this.starGhostInnerRatio;
    const isRegular = Math.abs(ratio - regularRatio) < 0.005;

    selectedEl.attributes['data-star-points'] = points.toString();
    selectedEl.attributes['data-star-inner-ratio'] = ratio.toString();
    selectedEl.attributes['points'] = points.toString();
    selectedEl.attributes['innerRatio'] = ratio.toString();
    if (isRegular) {
      selectedEl.attributes['data-shape'] = 'polygon';
      selectedEl.attributes['data-polygon-sides'] = points.toString();
    } else {
      selectedEl.attributes['data-shape'] = 'star';
    }

    selectedEl.vertices = ghostNodeVertices || initialVertices;
    selectedEl.attributes.d = this.starGhostD || this.ctx.model.compilePathD(selectedEl.vertices, true);
    selectedEl.attributes['data-node-types'] = selectedEl.vertices.map((v) => v.nodeType).join(',');

    this.starGhostD = '';
    if (this.ctx.applyCanvasSize) this.ctx.applyCanvasSize();
    this.ctx.render();
    this.ctx.syncToHost();
    return true;
  }

  public cancel(): boolean {
    const hadGhost = !!this.starGhostD;
    this.starGhostD = '';
    return hadGhost;
  }

  public renderGhostOverlay(activeHandle: string | null, z: number): string {
    if (activeHandle !== 'star-edge' || !this.starGhostD) return '';

    const cx = this.starCenter.x;
    const cy = this.starCenter.y;
    const rx = this.starRadii.rx;
    const ry = this.starRadii.ry;
    const points = this.starPoints;
    const ratio = this.starGhostInnerRatio;
    const regularRatio = Math.cos(Math.PI / points);
    const isRegular = Math.abs(ratio - regularRatio) < 0.005;

    const strokeColor = isRegular ? '#10b981' : ratio > regularRatio ? '#38bdf8' : '#8b5cf6';
    const fill = isRegular ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)';
    let html = `<path d="${this.starGhostD}" fill="${fill}" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;

    const midAngleRad = -Math.PI / 2 + Math.PI / points;
    const hx = cx + rx * ratio * Math.cos(midAngleRad);
    const hy = cy + ry * ratio * Math.sin(midAngleRad);

    html += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
    html += `<circle cx="${cx}" cy="${cy}" r="${3 / z}" fill="${strokeColor}" />`;
    html += `<circle cx="${hx}" cy="${hy}" r="${6 / z}" fill="${strokeColor}" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke" />`;

    let badgeText = '';
    if (isRegular) {
      badgeText = `POLÍGONO REGULAR (${points} LADOS)`;
    } else if (ratio < regularRatio) {
      badgeText = `ESTRELLA INTERNA: ${Math.round(ratio * 100)}%`;
    } else {
      badgeText = `ESTRELLA EXTERNA: ${Math.round(ratio * 100)}%`;
    }

    const badgeW = 126;
    const badgeH = 18;
    html += `
      <g opacity="0.95">
        <rect x="${hx + 10}" y="${hy - 22}" width="${badgeW}" height="${badgeH}" rx="3" fill="#1e1b4b" stroke="${strokeColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
        <text x="${hx + 14}" y="${hy - 9}" font-size="10" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">${badgeText}</text>
      </g>
    `;
    return html;
  }

  public renderIdleHandles(el: VectorElement, z: number): string {
    if (!this.ctx.model.isStar(el)) return '';

    const starEdgePt = this.getStarEdgeHandlePoint(el);
    if (!starEdgePt) return '';

    const points = Math.max(3, Math.min(64, parseInt(el.attributes['data-star-points'] || el.attributes['data-polygon-sides'] || el.attributes.points || '5', 10)));
    const regularRatio = Math.cos(Math.PI / points);
    const innerRatio = parseFloat(el.attributes['data-star-inner-ratio'] || el.attributes.innerRatio || regularRatio.toString());
    const isSnapped = Math.abs(innerRatio - regularRatio) < 0.01;
    const title = isSnapped
      ? `Tirador de Arista (Arrastrar para formar estrella hacia adentro o afuera)`
      : `Tirador de Estrella / Arista (Arrastrar para modular puntas, snap a regular)`;
    const fill = isSnapped ? '#10b981' : '#8b5cf6';
    return `
      <g style="cursor: crosshair;" title="${title}">
        <circle cx="${starEdgePt.x}" cy="${starEdgePt.y}" r="${6 / z}" fill="${fill}" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <circle cx="${starEdgePt.x}" cy="${starEdgePt.y}" r="${2.5 / z}" fill="#ffffff" />
      </g>
    `;
  }
}
