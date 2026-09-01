import { VectorElement, PathVertex, Point } from './VectorModel.js';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export type HandleType =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

export interface DragState {
  initialElement: VectorElement;
  initialBox: BoundingBox;
  initialVertices: PathVertex[];
  startPoint: Point;
  activeHandle: HandleType | 'move' | null;
}

export class SelectionTool {
  public selectedElementIds: Set<string> = new Set();
  public hoveredElementId: string | null = null;
  public hoverTolerance: number = 3.0; // 3px diameter stroke tolerance
  public marqueeRect: { x: number; y: number; width: number; height: number } | null = null;
  public isDeselectMarquee: boolean = false;

  // Backward compatibility getter & setter
  public get selectedElementId(): string | null {
    return this.selectedElementIds.values().next().value || null;
  }

  public set selectedElementId(id: string | null) {
    this.selectedElementIds.clear();
    if (id) {
      this.selectedElementIds.add(id);
    }
  }

  public isSelected(id: string): boolean {
    return this.selectedElementIds.has(id);
  }

  public select(id: string): void {
    this.selectedElementIds.clear();
    this.selectedElementIds.add(id);
  }

  public toggleSelect(id: string): void {
    if (this.selectedElementIds.has(id)) {
      this.selectedElementIds.delete(id);
    } else {
      this.selectedElementIds.add(id);
    }
  }

  public deselect(id: string): void {
    this.selectedElementIds.delete(id);
  }

  public deselectAll(): void {
    this.selectedElementIds.clear();
  }

  // Calculate bounding box for a single element
  public getBoundingBox(element: VectorElement): BoundingBox | null {
    if (!element.vertices || element.vertices.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    element.vertices.forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });

    if (minX === Infinity) return null;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    return {
      x: minX,
      y: minY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2,
    };
  }

  // Calculate composite group bounding box for multiple elements
  public getGroupBoundingBox(elements: VectorElement[]): BoundingBox | null {
    if (!elements || elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((el) => {
      if (!el.vertices) return;
      el.vertices.forEach((v) => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      });
    });

    if (minX === Infinity) return null;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    return {
      x: minX,
      y: minY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2,
    };
  }

  // Test which elements intersect or are contained inside a marquee selection rectangle
  public hitTestMarquee(
    elements: VectorElement[],
    marquee: { x: number; y: number; width: number; height: number }
  ): string[] {
    const hits: string[] = [];
    const mRight = marquee.x + marquee.width;
    const mBottom = marquee.y + marquee.height;

    elements.forEach((el) => {
      const box = this.getBoundingBox(el);
      if (!box) return;

      const bRight = box.x + box.width;
      const bBottom = box.y + box.height;

      // Check AABB overlap
      const overlaps =
        box.x < mRight &&
        bRight > marquee.x &&
        box.y < mBottom &&
        bBottom > marquee.y;

      if (overlaps) {
        hits.push(el.id);
      }
    });

    return hits;
  }

  // Hit test vector elements based on fill or stroke tolerance (3px diameter = 1.5px radius or tolerance threshold)
  public hitTest(
    elements: VectorElement[],
    pt: Point,
    zoomScale: number = 1.0
  ): { element: VectorElement; hitOnFill: boolean } | null {
    const effectiveTolerance = (this.hoverTolerance / 2) / zoomScale;

    // Search top-to-bottom (reverse array)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el.vertices || el.vertices.length === 0) continue;

      const fill = el.attributes.fill || 'none';
      const isFilled = fill !== 'none' && fill !== 'transparent' && fill !== 'rgba(0,0,0,0)';

      // 1. Edge/Stroke Hit test (within 3px diameter tolerance)
      const edgeHit = this.hitTestPathEdge(el.vertices, pt, effectiveTolerance);
      if (edgeHit) {
        return { element: el, hitOnFill: false };
      }

      // 2. Fill area hit test
      if (isFilled && this.hitTestPolygonFill(el.vertices, pt)) {
        return { element: el, hitOnFill: true };
      }
    }

    return null;
  }

  // Distance from point to path edge segments (lines and Bezier curves)
  private hitTestPathEdge(vertices: PathVertex[], pt: Point, tolerance: number): boolean {
    for (let i = 0; i < vertices.length - 1; i++) {
      const p1 = vertices[i];
      const p2 = vertices[i + 1];

      if (p1.handleOut || p2.handleIn) {
        const h1 = p1.handleOut || { x: p1.x, y: p1.y };
        const h2 = p2.handleIn || { x: p2.x, y: p2.y };
        if (distToBezier(pt, p1, h1, h2, p2) <= tolerance) {
          return true;
        }
      } else {
        if (distToSegment(pt, p1, p2) <= tolerance) {
          return true;
        }
      }
    }
    return false;
  }

  // Polygon point-in-polygon fill test
  private hitTestPolygonFill(vertices: PathVertex[], pt: Point): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;

      const intersect =
        yi > pt.y !== yj > pt.y &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Check hit on 8 bounding box resize handles + 1 rotation handle
  public hitTestHandle(
    box: BoundingBox,
    pt: Point,
    handleRadius: number = 12
  ): HandleType | null {
    const handles: { type: HandleType; x: number; y: number }[] = [
      { type: 'nw', x: box.x, y: box.y },
      { type: 'n',  x: box.cx, y: box.y },
      { type: 'ne', x: box.x + box.width, y: box.y },
      { type: 'w',  x: box.x, y: box.cy },
      { type: 'e',  x: box.x + box.width, y: box.cy },
      { type: 'sw', x: box.x, y: box.y + box.height },
      { type: 's',  x: box.cx, y: box.y + box.height },
      { type: 'se', x: box.x + box.width, y: box.y + box.height },
      { type: 'rotate', x: box.cx, y: box.y - 18 },
    ];

    for (const h of handles) {
      const dx = pt.x - h.x;
      const dy = pt.y - h.y;
      if (Math.hypot(dx, dy) <= handleRadius) {
        return h.type;
      }
    }

    return null;
  }

  // Resize / Scale vector element vertices based on drag handle movement
  public transformVertices(
    initialVertices: PathVertex[],
    initialBox: BoundingBox,
    handle: HandleType,
    dx: number,
    dy: number,
    aspectRatio: boolean = false
  ): PathVertex[] {
    let newX = initialBox.x;
    let newY = initialBox.y;
    let newW = initialBox.width;
    let newH = initialBox.height;

    switch (handle) {
      case 'e':
        newW += dx;
        break;
      case 'w':
        newX += dx;
        newW -= dx;
        break;
      case 's':
        newH += dy;
        break;
      case 'n':
        newY += dy;
        newH -= dy;
        break;
      case 'se':
        newW += dx;
        newH += dy;
        break;
      case 'nw':
        newX += dx;
        newW -= dx;
        newY += dy;
        newH -= dy;
        break;
      case 'ne':
        newW += dx;
        newY += dy;
        newH -= dy;
        break;
      case 'sw':
        newX += dx;
        newW -= dx;
        newH += dy;
        break;
    }

    if (newW < 2) newW = 2;
    if (newH < 2) newH = 2;

    const scaleX = newW / initialBox.width;
    const scaleY = newH / initialBox.height;

    return initialVertices.map((v) => {
      const next: PathVertex = {
        ...v,
        x: newX + (v.x - initialBox.x) * scaleX,
        y: newY + (v.y - initialBox.y) * scaleY,
      };

      if (v.handleIn) {
        next.handleIn = {
          x: newX + (v.handleIn.x - initialBox.x) * scaleX,
          y: newY + (v.handleIn.y - initialBox.y) * scaleY,
        };
      }
      if (v.handleOut) {
        next.handleOut = {
          x: newX + (v.handleOut.x - initialBox.x) * scaleX,
          y: newY + (v.handleOut.y - initialBox.y) * scaleY,
        };
      }
      return next;
    });
  }
}

// Distance from point to line segment
function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Distance from point to cubic Bezier curve (sampled)
function distToBezier(p: Point, p0: Point, p1: Point, p2: Point, p3: Point, samples: number = 20): number {
  let minDist = Infinity;
  let prevPt = p0;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const currPt: Point = {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
    const d = distToSegment(p, prevPt, currPt);
    if (d < minDist) minDist = d;
    prevPt = currPt;
  }

  return minDist;
}
