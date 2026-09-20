import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point, RectCorners } from '../../engine/VectorModel.js';
import { EllipseHandleDelegate } from './delegates/EllipseHandleDelegate.js';
import { RectCornerHandleDelegate } from './delegates/RectCornerHandleDelegate.js';
import { StarHandleDelegate } from './delegates/StarHandleDelegate.js';

/**
 * ARCHITECTURAL RATIONALE: Encapsulated Parametric Handle Controller (SOLID / SRP & OCP)
 * Refactored into a high-level façade/coordinator that delegates specialized geometry
 * manipulation to dedicated primitive delegates:
 * - EllipseHandleDelegate: Quadrants, start/end angles, donut inner ratio ring
 * - RectCornerHandleDelegate: 4 corner radii, uniform vs independent, pixel/pct badges
 * - StarHandleDelegate: Midpoint edge handles, inward/outward star ratio, regular polygon snap
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle (SRP):
 *    Each primitive delegate encapsulates exclusively its own math, dragging, and visual overlays.
 * 2. Open/Closed Principle (OCP):
 *    New parametric primitives can be added with new delegates without modifying existing shape math.
 * 3. Non-Destructive Model Synchronization:
 *    Maintains 100% API compatibility with NodeToolHandler and NodeOverlayBuilder.
 */
export class ParametricHandleController {
  private ctx: ToolContext;

  public readonly ellipseDelegate: EllipseHandleDelegate;
  public readonly rectDelegate: RectCornerHandleDelegate;
  public readonly starDelegate: StarHandleDelegate;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
    this.ellipseDelegate = new EllipseHandleDelegate(ctx);
    this.rectDelegate = new RectCornerHandleDelegate(ctx);
    this.starDelegate = new StarHandleDelegate(ctx);
  }

  // Ellipse Delegated State Accessors
  public get quadrantGhostMode(): 'ellipse' | 'pie' | 'arc' { return this.ellipseDelegate.quadrantGhostMode; }
  public set quadrantGhostMode(v: 'ellipse' | 'pie' | 'arc') { this.ellipseDelegate.quadrantGhostMode = v; }
  public get quadrantGhostStartAngle(): number { return this.ellipseDelegate.quadrantGhostStartAngle; }
  public set quadrantGhostStartAngle(v: number) { this.ellipseDelegate.quadrantGhostStartAngle = v; }
  public get quadrantGhostEndAngle(): number { return this.ellipseDelegate.quadrantGhostEndAngle; }
  public set quadrantGhostEndAngle(v: number) { this.ellipseDelegate.quadrantGhostEndAngle = v; }
  public get quadrantCenter(): Point { return this.ellipseDelegate.quadrantCenter; }
  public set quadrantCenter(v: Point) { this.ellipseDelegate.quadrantCenter = v; }
  public get quadrantRadii(): { rx: number; ry: number } { return this.ellipseDelegate.quadrantRadii; }
  public set quadrantRadii(v: { rx: number; ry: number }) { this.ellipseDelegate.quadrantRadii = v; }
  public get quadrantGhostD(): string { return this.ellipseDelegate.quadrantGhostD; }
  public set quadrantGhostD(v: string) { this.ellipseDelegate.quadrantGhostD = v; }
  public get ellipseInnerGhostRatio(): number { return this.ellipseDelegate.ellipseInnerGhostRatio; }
  public set ellipseInnerGhostRatio(v: number) { this.ellipseDelegate.ellipseInnerGhostRatio = v; }

  // Rect Delegated State Accessors
  public get rectGhostD(): string { return this.rectDelegate.rectGhostD; }
  public set rectGhostD(v: string) { this.rectDelegate.rectGhostD = v; }
  public get rectGhostCorners(): RectCorners { return this.rectDelegate.rectGhostCorners; }
  public set rectGhostCorners(v: RectCorners) { this.rectDelegate.rectGhostCorners = v; }
  public get rectGhostBounds(): { x: number; y: number; w: number; h: number } { return this.rectDelegate.rectGhostBounds; }
  public set rectGhostBounds(v: { x: number; y: number; w: number; h: number }) { this.rectDelegate.rectGhostBounds = v; }
  public get rectGhostActiveRadius(): number { return this.rectDelegate.rectGhostActiveRadius; }
  public set rectGhostActiveRadius(v: number) { this.rectDelegate.rectGhostActiveRadius = v; }
  public get rectGhostActiveCorner(): 'tl' | 'tr' | 'br' | 'bl' { return this.rectDelegate.rectGhostActiveCorner; }
  public set rectGhostActiveCorner(v: 'tl' | 'tr' | 'br' | 'bl') { this.rectDelegate.rectGhostActiveCorner = v; }

  // Star Delegated State Accessors
  public get starCenter(): Point { return this.starDelegate.starCenter; }
  public set starCenter(v: Point) { this.starDelegate.starCenter = v; }
  public get starRadii(): { rx: number; ry: number } { return this.starDelegate.starRadii; }
  public set starRadii(v: { rx: number; ry: number }) { this.starDelegate.starRadii = v; }
  public get starPoints(): number { return this.starDelegate.starPoints; }
  public set starPoints(v: number) { this.starDelegate.starPoints = v; }
  public get starGhostInnerRatio(): number { return this.starDelegate.starGhostInnerRatio; }
  public set starGhostInnerRatio(v: number) { this.starDelegate.starGhostInnerRatio = v; }
  public get starGhostD(): string { return this.starDelegate.starGhostD; }
  public set starGhostD(v: string) { this.starDelegate.starGhostD = v; }

  // Handle Point Queries
  public getQuadrantStartHandlePoint(el: VectorElement): Point | null {
    return this.ellipseDelegate.getQuadrantStartHandlePoint(el);
  }

  public getQuadrantEndHandlePoint(el: VectorElement): Point | null {
    return this.ellipseDelegate.getQuadrantEndHandlePoint(el);
  }

  public getQuadrantHandlePoint(el: VectorElement): Point | null {
    return this.ellipseDelegate.getQuadrantHandlePoint(el);
  }

  public getEllipseInnerHandlePoint(el: VectorElement): Point | null {
    return this.ellipseDelegate.getEllipseInnerHandlePoint(el);
  }

  public getRectCornerHandles(el: VectorElement, z: number = 1): { tl: Point; tr: Point; br: Point; bl: Point } | null {
    return this.rectDelegate.getRectCornerHandles(el, z);
  }

  public getStarEdgeHandlePoint(el: VectorElement): Point | null {
    return this.starDelegate.getStarEdgeHandlePoint(el);
  }

  // Pointer Interaction Routing
  public handlePointerDown(
    selectedEl: VectorElement,
    pt: Point,
    z: number
  ): { activeHandle: string; initialVertices: PathVertex[]; handled: boolean } | null {
    const ellipseRes = this.ellipseDelegate.handlePointerDown(selectedEl, pt, z);
    if (ellipseRes) return ellipseRes;

    const rectRes = this.rectDelegate.handlePointerDown(selectedEl, pt, z);
    if (rectRes) return rectRes;

    const starRes = this.starDelegate.handlePointerDown(selectedEl, pt, z);
    if (starRes) return starRes;

    return null;
  }

  public handlePointerMove(
    selectedEl: VectorElement,
    activeHandle: string,
    pt: Point,
    isShift: boolean,
    isCtrl: boolean,
    isAlt: boolean
  ): { handled: boolean; ghostNodeVertices?: PathVertex[] } | null {
    // Collect magnetic landmarks from other elements and fixed quadrants of active element
    const otherNodes = this.ctx.getOtherVertices([selectedEl.id]);
    if (this.ctx.model.isEllipse(selectedEl)) {
      const cx = parseFloat(selectedEl.attributes.cx || '0');
      const cy = parseFloat(selectedEl.attributes.cy || '0');
      const rx = parseFloat(selectedEl.attributes.rx || selectedEl.attributes.r || '1');
      const ry = parseFloat(selectedEl.attributes.ry || selectedEl.attributes.r || '1');
      for (const r of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        otherNodes.push({ x: cx + rx * Math.cos(r), y: cy + ry * Math.sin(r) });
      }
    }
    const snappedPt = this.ctx.snapPoint(pt, otherNodes);
    const usePt = snappedPt || pt;

    const ellipseMove = this.ellipseDelegate.handlePointerMove(selectedEl, activeHandle, usePt, isShift, isCtrl);
    if (ellipseMove) return ellipseMove;

    const rectMove = this.rectDelegate.handlePointerMove(selectedEl, activeHandle, usePt, isShift, isCtrl, isAlt);
    if (rectMove) return rectMove;

    const starMove = this.starDelegate.handlePointerMove(selectedEl, activeHandle, usePt, isShift, isCtrl);
    if (starMove) return starMove;

    return null;
  }

  public handlePointerUp(
    selectedEl: VectorElement,
    activeHandle: string,
    ghostNodeVertices: PathVertex[] | null,
    initialVertices: PathVertex[]
  ): boolean {
    if (this.ellipseDelegate.handlePointerUp(selectedEl, activeHandle, ghostNodeVertices, initialVertices)) {
      return true;
    }
    if (this.rectDelegate.handlePointerUp(selectedEl, activeHandle, ghostNodeVertices, initialVertices)) {
      return true;
    }
    if (this.starDelegate.handlePointerUp(selectedEl, activeHandle, ghostNodeVertices, initialVertices)) {
      return true;
    }
    return false;
  }

  public cancel(): boolean {
    const c1 = this.ellipseDelegate.cancel();
    const c2 = this.rectDelegate.cancel();
    const c3 = this.starDelegate.cancel();
    return c1 || c2 || c3;
  }

  public renderGhostOverlay(activeHandle: string | null, z: number): string {
    if (!activeHandle) return '';
    return (
      this.ellipseDelegate.renderGhostOverlay(activeHandle, z) +
      this.rectDelegate.renderGhostOverlay(activeHandle, z) +
      this.starDelegate.renderGhostOverlay(activeHandle, z)
    );
  }

  public renderIdleHandles(selectedEls: VectorElement[], z: number): string {
    if (selectedEls.length !== 1 || !this.ctx.model.isParametricElement(selectedEls[0])) {
      return '';
    }
    const el = selectedEls[0];
    return (
      this.ellipseDelegate.renderIdleHandles(el, z) +
      this.rectDelegate.renderIdleHandles(el, z) +
      this.starDelegate.renderIdleHandles(el, z)
    );
  }
}
