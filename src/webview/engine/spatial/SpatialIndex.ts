import { VectorElement, Point } from '../VectorModel.js';
import { BoundingBox, BoundingBoxCalculator } from '../geometry/BoundingBoxCalculator.js';

export interface SpatialItem {
  id: string;
  element: VectorElement;
  box: BoundingBox;
}

export interface ViewportRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * ARCHITECTURAL RATIONALE: Accelerated Spatial Index & Viewport Culling Engine (SpatialIndex)
 *
 * 1. Sub-Millisecond Spatial Hit Queries:
 *    Avoids inspecting hundreds or thousands of elements with heavy cubic Bézier sampling
 *    and Jordan-curve raycasting by performing high-speed Axis-Aligned Bounding Box (AABB)
 *    and spatial grid bucket filtering before complex geometric evaluation.
 *
 * 2. Viewport Culling (VectorCraft Parity):
 *    Quickly computes the visible subset of vectors intersecting the canvas viewport,
 *    enabling the editor to skip offscreen elements during intense zoom and pan cycles.
 *
 * 3. Spatial Cell Bucketing:
 *    Divides the 2D coordinate space into a uniform grid of spatial buckets (cells)
 *    enabling sub-millisecond point and marquee queries on dense documents (5,000+ vectors).
 */
export class SpatialIndex {
  private cellSize: number;
  private items: Map<string, SpatialItem> = new Map();
  private grid: Map<string, Set<string>> = new Map(); // "cellX:cellY" -> Set of item IDs

  constructor(cellSize: number = 256) {
    this.cellSize = cellSize;
  }

  public clear(): void {
    this.items.clear();
    this.grid.clear();
  }

  public get size(): number {
    return this.items.size;
  }

  public getItem(id: string): SpatialItem | undefined {
    return this.items.get(id);
  }

  private getCellCoords(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  public insert(element: VectorElement): boolean {
    const box = BoundingBoxCalculator.getBoundingBox(element);
    if (!box) return false;

    const item: SpatialItem = { id: element.id, element, box };
    this.items.set(element.id, item);

    const minCell = this.getCellCoords(box.x, box.y);
    const maxCell = this.getCellCoords(box.x + box.width, box.y + box.height);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        let set = this.grid.get(key);
        if (!set) {
          set = new Set();
          this.grid.set(key, set);
        }
        set.add(element.id);
      }
    }
    return true;
  }

  public build(elements: VectorElement[]): void {
    this.clear();
    for (const el of elements) {
      this.insert(el);
    }
  }

  public queryPoint(pt: Point, tolerance: number = 3): VectorElement[] {
    const minCell = this.getCellCoords(pt.x - tolerance, pt.y - tolerance);
    const maxCell = this.getCellCoords(pt.x + tolerance, pt.y + tolerance);

    const candidateIds = new Set<string>();
    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        const set = this.grid.get(key);
        if (set) {
          for (const id of set) {
            candidateIds.add(id);
          }
        }
      }
    }

    const results: VectorElement[] = [];
    for (const id of candidateIds) {
      const item = this.items.get(id);
      if (!item) continue;
      const b = item.box;
      if (
        pt.x >= b.x - tolerance &&
        pt.x <= b.x + b.width + tolerance &&
        pt.y >= b.y - tolerance &&
        pt.y <= b.y + b.height + tolerance
      ) {
        results.push(item.element);
      }
    }
    return results;
  }

  public queryRect(
    rect: { x: number; y: number; width: number; height: number },
    touching: boolean = false
  ): VectorElement[] {
    const rLeft = Math.min(rect.x, rect.x + rect.width);
    const rRight = Math.max(rect.x, rect.x + rect.width);
    const rTop = Math.min(rect.y, rect.y + rect.height);
    const rBottom = Math.max(rect.y, rect.y + rect.height);

    const minCell = this.getCellCoords(rLeft, rTop);
    const maxCell = this.getCellCoords(rRight, rBottom);

    const candidateIds = new Set<string>();
    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        const set = this.grid.get(key);
        if (set) {
          for (const id of set) {
            candidateIds.add(id);
          }
        }
      }
    }

    const results: VectorElement[] = [];
    for (const id of candidateIds) {
      const item = this.items.get(id);
      if (!item) continue;
      const b = item.box;
      const bRight = b.x + b.width;
      const bBottom = b.y + b.height;

      if (touching) {
        if (b.x <= rRight && bRight >= rLeft && b.y <= rBottom && bBottom >= rTop) {
          results.push(item.element);
        }
      } else {
        if (b.x >= rLeft && bRight <= rRight && b.y >= rTop && bBottom <= rBottom) {
          results.push(item.element);
        }
      }
    }
    return results;
  }

  public queryViewport(visible: ViewportRect): VectorElement[] {
    return this.queryRect(
      {
        x: visible.minX,
        y: visible.minY,
        width: visible.maxX - visible.minX,
        height: visible.maxY - visible.minY,
      },
      true
    );
  }

  public static isElementInViewport(element: VectorElement, visible: ViewportRect): boolean {
    const box = BoundingBoxCalculator.getBoundingBox(element);
    if (!box) return false;
    return (
      box.x <= visible.maxX &&
      box.x + box.width >= visible.minX &&
      box.y <= visible.maxY &&
      box.y + box.height >= visible.minY
    );
  }
}
