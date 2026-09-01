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

export class CanvasManager {
  public showGrid: boolean = true;
  public showGuides: boolean = true;
  public gridSpacing: number = 20;

  public snapToGrid: boolean = true;
  public snapToGuides: boolean = true;
  public snapToVertices: boolean = true;
  public snapThreshold: number = 6;

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

  // Snap point to active grid, guide lines, or existing vertices
  public snapPoint(pt: Point, otherVertices: Point[] = []): Point {
    let snappedX = pt.x;
    let snappedY = pt.y;

    // 1. Snap to Vertices
    if (this.snapToVertices && otherVertices.length > 0) {
      let minDist = this.snapThreshold / this.zoom;
      for (const v of otherVertices) {
        const d = Math.hypot(pt.x - v.x, pt.y - v.y);
        if (d < minDist) {
          return { x: v.x, y: v.y };
        }
      }
    }

    // 2. Snap to Guides (Horizontal, Vertical, or Arbitrary Angled)
    if (this.snapToGuides && this.showGuides && this.guides.length > 0) {
      const threshold = this.snapThreshold / this.zoom;
      for (const g of this.guides) {
        const rad = ((g.angle || 0) * Math.PI) / 180;
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);

        // Perpendicular distance from pt to line
        const dist = nx * (pt.x - px) + ny * (pt.y - py);
        if (Math.abs(dist) <= threshold) {
          snappedX = pt.x - dist * nx;
          snappedY = pt.y - dist * ny;
          return { x: snappedX, y: snappedY };
        }
      }
    }

    // 3. Snap to Grid
    if (this.snapToGrid) {
      const gx = Math.round(pt.x / this.gridSpacing) * this.gridSpacing;
      const gy = Math.round(pt.y / this.gridSpacing) * this.gridSpacing;

      if (Math.abs(pt.x - gx) <= this.snapThreshold / this.zoom) {
        snappedX = gx;
      }
      if (Math.abs(pt.y - gy) <= this.snapThreshold / this.zoom) {
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
