import { ToolContext } from '../../IToolHandler.js';
import { VectorElement, PathVertex, Point, RectCorners } from '../../../engine/VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Rect Corner Radius Delegate (SOLID / SRP)
 * Encapsulates rectangle rounded corner handle computation, live dragging,
 * uniform vs independent per-corner radius calculations, and SVG path synthesis.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle:
 *    Isolates corner geometry (TL, TR, BR, BL), inset constraints, and badge feedback
 *    from general Bézier or polar shape math.
 * 2. Visual Drag Feedback:
 *    Renders real-time pixel and percentage radius badges and corner leader lines.
 */
export class RectCornerHandleDelegate {
  private ctx: ToolContext;

  public rectGhostD: string = '';
  public rectGhostCorners: RectCorners = { tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' };
  public rectGhostBounds: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  public rectGhostActiveRadius: number = 0;
  public rectGhostActiveCorner: 'tl' | 'tr' | 'br' | 'bl' = 'tl';

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

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

  public handlePointerDown(
    selectedEl: VectorElement,
    pt: Point,
    z: number
  ): { activeHandle: string; initialVertices: PathVertex[]; handled: boolean } | null {
    if (!this.ctx.model.isParametricElement(selectedEl) || !this.ctx.model.isRect(selectedEl)) return null;

    const cornerHandles = this.getRectCornerHandles(selectedEl, z);
    if (!cornerHandles) return null;

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

    return null;
  }

  public handlePointerMove(
    selectedEl: VectorElement,
    activeHandle: string,
    usePt: Point,
    isShift: boolean,
    isCtrl: boolean,
    isAlt: boolean
  ): { handled: boolean; ghostNodeVertices?: PathVertex[] } | null {
    if (!activeHandle.startsWith('corner-')) return null;

    const cornerKey = activeHandle.replace('corner-', '') as 'tl' | 'tr' | 'br' | 'bl';
    const { x, y, w, h } = this.rectGhostBounds;
    const maxRadius = Math.min(w, h) / 2;

    let rawRadiusPx = 0;
    if (cornerKey === 'tl') {
      const dx = Math.max(0, usePt.x - x);
      const dy = Math.max(0, usePt.y - y);
      rawRadiusPx = (dx + dy) / 2;
    } else if (cornerKey === 'tr') {
      const dx = Math.max(0, x + w - usePt.x);
      const dy = Math.max(0, usePt.y - y);
      rawRadiusPx = (dx + dy) / 2;
    } else if (cornerKey === 'br') {
      const dx = Math.max(0, x + w - usePt.x);
      const dy = Math.max(0, y + h - usePt.y);
      rawRadiusPx = (dx + dy) / 2;
    } else if (cornerKey === 'bl') {
      const dx = Math.max(0, usePt.x - x);
      const dy = Math.max(0, y + h - usePt.y);
      rawRadiusPx = (dx + dy) / 2;
    }

    rawRadiusPx = Math.max(0, Math.min(maxRadius, rawRadiusPx));

    // Candidate corner handle point along the corner inset diagonal
    let H_cand: Point = { x: 0, y: 0 };
    if (cornerKey === 'tl') {
      H_cand = { x: x + rawRadiusPx, y: y + rawRadiusPx };
    } else if (cornerKey === 'tr') {
      H_cand = { x: x + w - rawRadiusPx, y: y + rawRadiusPx };
    } else if (cornerKey === 'br') {
      H_cand = { x: x + w - rawRadiusPx, y: y + h - rawRadiusPx };
    } else if (cornerKey === 'bl') {
      H_cand = { x: x + rawRadiusPx, y: y + h - rawRadiusPx };
    }

    const otherNodes = this.ctx.getOtherVertices([selectedEl.id]);
    otherNodes.push({ x: x + w / 2, y: y + h / 2 });
    otherNodes.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h });

    const snappedH = this.ctx.snapPoint(H_cand, otherNodes);
    const isSnapped = Math.abs(snappedH.x - H_cand.x) > 1e-4 || Math.abs(snappedH.y - H_cand.y) > 1e-4;

    if (isSnapped) {
      if (cornerKey === 'tl') {
        const rX = Math.abs(snappedH.x - H_cand.x) > 1e-4 ? snappedH.x - x : snappedH.y - y;
        rawRadiusPx = Math.max(0, Math.min(maxRadius, rX));
      } else if (cornerKey === 'tr') {
        const rX = Math.abs(snappedH.x - H_cand.x) > 1e-4 ? x + w - snappedH.x : snappedH.y - y;
        rawRadiusPx = Math.max(0, Math.min(maxRadius, rX));
      } else if (cornerKey === 'br') {
        const rX = Math.abs(snappedH.x - H_cand.x) > 1e-4 ? x + w - snappedH.x : y + h - snappedH.y;
        rawRadiusPx = Math.max(0, Math.min(maxRadius, rX));
      } else if (cornerKey === 'bl') {
        const rX = Math.abs(snappedH.x - H_cand.x) > 1e-4 ? snappedH.x - x : y + h - snappedH.y;
        rawRadiusPx = Math.max(0, Math.min(maxRadius, rX));
      }
    } else {
      if (isShift || isCtrl) {
        rawRadiusPx = Math.round(rawRadiusPx / 5) * 5;
      } else {
        rawRadiusPx = Math.round(rawRadiusPx * 10) / 10;
      }
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

  public handlePointerUp(
    selectedEl: VectorElement,
    activeHandle: string,
    ghostNodeVertices: PathVertex[] | null,
    initialVertices: PathVertex[]
  ): boolean {
    if (!activeHandle.startsWith('corner-')) return false;

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

  public cancel(): boolean {
    const hadGhost = !!this.rectGhostD;
    this.rectGhostD = '';
    return hadGhost;
  }

  public renderGhostOverlay(activeHandle: string | null, z: number): string {
    if (!activeHandle || !activeHandle.startsWith('corner-') || !this.rectGhostD) return '';

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

  public renderIdleHandles(el: VectorElement, z: number): string {
    if (!this.ctx.model.isRect(el)) return '';

    const cornerHandles = this.getRectCornerHandles(el, z);
    if (!cornerHandles) return '';

    let html = '';
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
    return html;
  }
}
