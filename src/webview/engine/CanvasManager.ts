import { Point } from './VectorModel.js';

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number;
}

export class CanvasManager {
  public showGrid: boolean = true;
  public showGuides: boolean = true;
  public gridSpacing: number = 20;

  public snapToGrid: boolean = true;
  public snapToGuides: boolean = true;
  public snapToVertices: boolean = true;
  public snapThreshold: number = 6;

  public guides: GuideLine[] = [
    { id: 'g_h1', orientation: 'horizontal', position: 100 },
    { id: 'g_v1', orientation: 'vertical', position: 100 },
  ];

  public zoom: number = 1.0;
  public panX: number = 0;
  public panY: number = 0;

  public isCanvasSelected: boolean = false;

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

    // 2. Snap to Guides
    if (this.snapToGuides) {
      for (const g of this.guides) {
        if (g.orientation === 'vertical') {
          if (Math.abs(pt.x - g.position) <= this.snapThreshold / this.zoom) {
            snappedX = g.position;
          }
        } else if (g.orientation === 'horizontal') {
          if (Math.abs(pt.y - g.position) <= this.snapThreshold / this.zoom) {
            snappedY = g.position;
          }
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

  public addGuide(orientation: 'horizontal' | 'vertical', position: number): GuideLine {
    const guide: GuideLine = {
      id: `guide_${Date.now().toString(36)}`,
      orientation,
      position,
    };
    this.guides.push(guide);
    return guide;
  }

  public removeGuide(id: string): void {
    this.guides = this.guides.filter((g) => g.id !== id);
  }
}
