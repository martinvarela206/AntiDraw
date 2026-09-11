import { Point } from '../VectorModel.js';

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical' | 'angled';
  position: number;
  angle: number;       // Angle in degrees: 0 = horizontal (left-to-right), 90 = vertical (top-to-bottom)
  pivotX: number;      // Center pivot point X in canvas coordinates
  pivotY: number;      // Center pivot point Y in canvas coordinates
  color?: string;      // Guide line color, default cyan (#00f0ff)
  visible?: boolean;   // Visibility toggle (default true)
  locked?: boolean;    // Lock toggle preventing accidental selection or drag
}

export interface GuideGeometry {
  p1: Point;
  p2: Point;
  arrow1: Point;
  arrow2: Point;
  pivot: Point;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Guide Lines Manager (GuideManager)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates creation, hit-testing, deletion, and geometric projection of horizontal,
 *    vertical, and angled guide lines from CanvasManager.
 *
 * 2. Infinite Line Spanning & Zoom-Invariant Proximity:
 *    Calculates unbounded span lines (spanning +/- 100,000 units) to visually cover arbitrary
 *    viewports. Hit testing scales tolerance inversely with zoom factor (`tolerance / zoom`)
 *    ensuring pixel-accurate cursor picking under any camera magnification.
 */
export class GuideManager {
  public guides: GuideLine[] = [];
  public showGuides: boolean = true;
  public selectedGuideId: string | null = null;
  public activeGuideTransformId: string | null = null;

  constructor(initialGuides: GuideLine[] = []) {
    this.guides = initialGuides;
  }

  /**
   * Adds a new guide line.
   */
  public addGuide(
    orientation: 'horizontal' | 'vertical' | 'angled',
    position: number,
    canvasW: number = 800,
    canvasH: number = 600,
    angle?: number
  ): GuideLine {
    const isHoriz = orientation === 'horizontal';
    const computedAngle = angle !== undefined ? angle : isHoriz ? 0 : 90;
    const pivotX = isHoriz ? canvasW / 2 : position;
    const pivotY = isHoriz ? position : canvasH / 2;

    const guide: GuideLine = {
      id: `guide_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      orientation,
      position,
      angle: computedAngle,
      pivotX,
      pivotY,
      color: '#00f0ff',
    };
    this.guides.push(guide);
    return guide;
  }

  /**
   * Removes a guide line and cleans active selection state.
   */
  public removeGuide(id: string): void {
    this.guides = this.guides.filter((g) => g.id !== id);
    if (this.selectedGuideId === id) this.selectedGuideId = null;
    if (this.activeGuideTransformId === id) this.activeGuideTransformId = null;
  }

  /**
   * Finds a guide line by its ID.
   */
  public getGuide(id: string): GuideLine | undefined {
    return this.guides.find((g) => g.id === id);
  }

  /**
   * Hit tests for a guide line located within screen tolerance of the given canvas point.
   */
  public hitTestGuide(
    pt: Point,
    canvasW: number,
    canvasH: number,
    zoom: number = 1,
    tolerance: number = 8
  ): GuideLine | null {
    if (!this.showGuides) return null;
    const threshold = tolerance / (zoom || 1);

    for (let i = this.guides.length - 1; i >= 0; i--) {
      const g = this.guides[i];
      if (g.visible === false || g.locked) continue;
      const rad = ((g.angle || 0) * Math.PI) / 180;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);
      const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : canvasW / 2);
      const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : canvasH / 2);

      const dist = Math.abs(nx * (pt.x - px) + ny * (pt.y - py));
      if (dist <= threshold) {
        return g;
      }
    }
    return null;
  }

  /**
   * Calculates guide endpoints and control handles for rendering.
   */
  public getGuideGeometry(guide: GuideLine, canvasW: number, canvasH: number): GuideGeometry {
    const rad = ((guide.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const px = guide.pivotX ?? (guide.orientation === 'vertical' ? guide.position : canvasW / 2);
    const py = guide.pivotY ?? (guide.orientation === 'horizontal' ? guide.position : canvasH / 2);

    const span = 100000;
    const p1 = { x: px - cos * span, y: py - sin * span };
    const p2 = { x: px + cos * span, y: py + sin * span };

    const arrowDist = Math.min(canvasW, canvasH) * 0.4;
    const arrow1 = { x: px - cos * arrowDist, y: py - sin * arrowDist };
    const arrow2 = { x: px + cos * arrowDist, y: py + sin * arrowDist };

    return { p1, p2, arrow1, arrow2, pivot: { x: px, y: py } };
  }
}
