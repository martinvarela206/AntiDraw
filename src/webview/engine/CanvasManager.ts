import { Point } from './VectorModel.js';

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical' | 'angled';
  position: number;
  angle: number;       // Angle in degrees: 0 = horizontal (left-to-right), 90 = vertical (top-to-bottom)
  pivotX: number;      // Center pivot point X in canvas coordinates
  pivotY: number;      // Center pivot point Y in canvas coordinates
  color?: string;      // Guide line color, default cyan (#00f0ff)
}

export interface RulerConfig {
  unit: 'px' | 'mm' | 'cm' | 'in';
  scale: number;       // pixels per unit
  originX: number;
  originY: number;
  step: number;        // major step interval
}

export interface ShapeToolConfig {
  aspectRatioW: number; // default 4
  aspectRatioH: number; // default 3
  starPoints: number;   // default 5
  starInnerRatio: number; // default 0.4
  rectCornerRadius: number; // default 0
}

export class CanvasManager {
  public showGrid: boolean = true;
  public showGuides: boolean = true;
  public gridSpacing: number = 20;

  public shapeConfig: ShapeToolConfig = {
    aspectRatioW: 4,
    aspectRatioH: 3,
    starPoints: 5,
    starInnerRatio: 0.4,
    rectCornerRadius: 0,
  };

  // Snap options disabled by default
  public snapToGrid: boolean = false;
  public snapToGuides: boolean = false;
  public snapToVertices: boolean = false;
  public snapThreshold: number = 5; // 5px proximity threshold

  // By default, no guide lines exist
  public guides: GuideLine[] = [];

  public rulerConfig: RulerConfig = {
    unit: 'px',
    scale: 1,
    originX: 0,
    originY: 0,
    step: 50,
  };

  public zoom: number = 1.0;
  public panX: number = 0;
  public panY: number = 0;

  public isCanvasSelected: boolean = false;
  public selectedGuideId: string | null = null;
  public activeGuideTransformId: string | null = null;

  // Snap point to active vertices, guide lines / guide intersections, or grid lines / grid intersections (3px proximity)
  public snapPoint(pt: Point, otherVertices: Point[] = [], origin?: Point): Point {
    let snappedX = pt.x;
    let snappedY = pt.y;
    const threshold = this.snapThreshold / (this.zoom || 1);

    // 1. Snap to Vertices of other vector elements (highest priority)
    if (this.snapToVertices && otherVertices.length > 0) {
      let minDist = threshold;
      let bestVertex: Point | null = null;
      for (const v of otherVertices) {
        const d = Math.hypot(pt.x - v.x, pt.y - v.y);
        if (d <= minDist) {
          minDist = d;
          bestVertex = v;
        }
      }
      if (bestVertex) {
        return { x: bestVertex.x, y: bestVertex.y };
      }
    }

    // 2. Snap to Guide Lines & Guide-Guide Intersections
    if (this.snapToGuides && this.showGuides && this.guides.length > 0) {
      // 2a. Check Guide-to-Guide Intersections first
      let minIntDist = threshold;
      let bestIntersection: Point | null = null;

      for (let i = 0; i < this.guides.length; i++) {
        for (let j = i + 1; j < this.guides.length; j++) {
          const g1 = this.guides[i];
          const g2 = this.guides[j];
          const rad1 = ((g1.angle || 0) * Math.PI) / 180;
          const rad2 = ((g2.angle || 0) * Math.PI) / 180;
          const n1x = -Math.sin(rad1), n1y = Math.cos(rad1);
          const n2x = -Math.sin(rad2), n2y = Math.cos(rad2);
          const px1 = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
          const py1 = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
          const px2 = g2.pivotX ?? (g2.orientation === 'vertical' ? g2.position : 0);
          const py2 = g2.pivotY ?? (g2.orientation === 'horizontal' ? g2.position : 0);
          const d1 = n1x * px1 + n1y * py1;
          const d2 = n2x * px2 + n2y * py2;
          const det = n1x * n2y - n1y * n2x;

          if (Math.abs(det) > 1e-4) {
            const ix = (d1 * n2y - d2 * n1y) / det;
            const iy = (n1x * d2 - n2x * d1) / det;
            const dist = Math.hypot(pt.x - ix, pt.y - iy);
            if (dist <= minIntDist) {
              minIntDist = dist;
              bestIntersection = { x: ix, y: iy };
            }
          }
        }
      }

      if (bestIntersection) {
        return { x: bestIntersection.x, y: bestIntersection.y };
      }

      // 2b. Snap along single guide lines
      let minLineDist = threshold;
      let bestLineSnap: Point | null = null;

      for (const g of this.guides) {
        const rad = ((g.angle || 0) * Math.PI) / 180;
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);
        const dist = nx * (pt.x - px) + ny * (pt.y - py);

        if (Math.abs(dist) <= minLineDist) {
          minLineDist = Math.abs(dist);
          bestLineSnap = {
            x: pt.x - dist * nx,
            y: pt.y - dist * ny,
          };
        }
      }

      if (bestLineSnap) {
        snappedX = bestLineSnap.x;
        snappedY = bestLineSnap.y;
      }
    }

    // 3. Snap to Grid Lines & Grid Intersections (Origin-Aligned)
    if (this.snapToGrid && this.showGrid) {
      const ox = origin ? origin.x : (this.rulerConfig.originX || 0);
      const oy = origin ? origin.y : (this.rulerConfig.originY || 0);
      const step = Math.max(1, this.gridSpacing || 20);
      const gx = ox + Math.round((pt.x - ox) / step) * step;
      const gy = oy + Math.round((pt.y - oy) / step) * step;

      if (Math.abs(pt.x - gx) <= threshold) {
        snappedX = gx;
      }
      if (Math.abs(pt.y - gy) <= threshold) {
        snappedY = gy;
      }
    }

    return { x: snappedX, y: snappedY };
  }

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

  public removeGuide(id: string): void {
    this.guides = this.guides.filter((g) => g.id !== id);
    if (this.selectedGuideId === id) this.selectedGuideId = null;
    if (this.activeGuideTransformId === id) this.activeGuideTransformId = null;
  }

  public getGuide(id: string): GuideLine | undefined {
    return this.guides.find((g) => g.id === id);
  }
}
