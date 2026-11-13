export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialGridItem<T> {
  id: string;
  box: BoundingBox2D;
  data: T;
}

/**
 * ARCHITECTURAL RATIONALE: High-Performance 2D Spatial Grid Broad-Phase Index (SpatialGrid)
 *
 * 1. Broad-Phase Collision & Proximity Acceleration:
 *    Avoids O(N^2) pairwise geometric comparisons and linear scans over thousands of
 *    vertices or curve segments by hashing coordinates into uniform spatial buckets (cells).
 *
 * 2. Constant-Time Neighborhood Lookups:
 *    Point queries within radius `r` or bounding box queries inspect only the relevant
 *    spatial cell neighborhood, achieving O(1) average lookup times.
 *
 * 3. Broad-Phase Overlap Detection:
 *    `findOverlappingPairs()` identifies all candidate intersections across all registered
 *    items by testing AABB overlap only for items co-inhabiting adjacent grid cells.
 */
export class SpatialGrid<T> {
  private cellSize: number;
  private items: Map<string, SpatialGridItem<T>> = new Map();
  private grid: Map<string, Set<string>> = new Map(); // "cellX:cellY" -> Set of item IDs

  constructor(cellSize: number = 64) {
    this.cellSize = Math.max(1, cellSize);
  }

  public get size(): number {
    return this.items.size;
  }

  public clear(): void {
    this.items.clear();
    this.grid.clear();
  }

  public getItem(id: string): SpatialGridItem<T> | undefined {
    return this.items.get(id);
  }

  private getCellCoords(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  public insert(id: string, box: BoundingBox2D, data: T): void {
    if (this.items.has(id)) {
      this.remove(id);
    }

    const item: SpatialGridItem<T> = { id, box, data };
    this.items.set(id, item);

    const minCell = this.getCellCoords(box.minX, box.minY);
    const maxCell = this.getCellCoords(box.maxX, box.maxY);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        let cell = this.grid.get(key);
        if (!cell) {
          cell = new Set<string>();
          this.grid.set(key, cell);
        }
        cell.add(id);
      }
    }
  }

  public insertPoint(id: string, pt: { x: number; y: number }, data: T, radius: number = 0): void {
    this.insert(
      id,
      {
        minX: pt.x - radius,
        minY: pt.y - radius,
        maxX: pt.x + radius,
        maxY: pt.y + radius,
      },
      data
    );
  }

  public remove(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    const minCell = this.getCellCoords(item.box.minX, item.box.minY);
    const maxCell = this.getCellCoords(item.box.maxX, item.box.maxY);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        const cell = this.grid.get(key);
        if (cell) {
          cell.delete(id);
          if (cell.size === 0) {
            this.grid.delete(key);
          }
        }
      }
    }

    this.items.delete(id);
    return true;
  }

  public queryPoint(pt: { x: number; y: number }, radius: number = 0): SpatialGridItem<T>[] {
    const qBox: BoundingBox2D = {
      minX: pt.x - radius,
      minY: pt.y - radius,
      maxX: pt.x + radius,
      maxY: pt.y + radius,
    };
    return this.queryBox(qBox);
  }

  public queryBox(box: BoundingBox2D): SpatialGridItem<T>[] {
    const minCell = this.getCellCoords(box.minX, box.minY);
    const maxCell = this.getCellCoords(box.maxX, box.maxY);

    const candidateIds = new Set<string>();
    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = `${cx}:${cy}`;
        const cell = this.grid.get(key);
        if (cell) {
          for (const id of cell) {
            candidateIds.add(id);
          }
        }
      }
    }

    const results: SpatialGridItem<T>[] = [];
    for (const id of candidateIds) {
      const item = this.items.get(id);
      if (!item) continue;
      // Exact AABB intersection check
      if (
        item.box.minX <= box.maxX &&
        item.box.maxX >= box.minX &&
        item.box.minY <= box.maxY &&
        item.box.maxY >= box.minY
      ) {
        results.push(item);
      }
    }

    return results;
  }

  public findNearestPoint(
    pt: { x: number; y: number },
    maxRadius: number,
    getPt?: (data: T) => { x: number; y: number }
  ): { item: T; dist: number; pt: { x: number; y: number } } | null {
    const candidates = this.queryPoint(pt, maxRadius);
    if (candidates.length === 0) return null;

    let bestDist = maxRadius;
    let bestResult: { item: T; dist: number; pt: { x: number; y: number } } | null = null;

    for (const cand of candidates) {
      const targetPt = getPt ? getPt(cand.data) : { x: (cand.box.minX + cand.box.maxX) / 2, y: (cand.box.minY + cand.box.maxY) / 2 };
      const d = Math.hypot(pt.x - targetPt.x, pt.y - targetPt.y);
      if (d <= bestDist) {
        bestDist = d;
        bestResult = { item: cand.data, dist: d, pt: targetPt };
      }
    }

    return bestResult;
  }

  /**
   * Discovers all potentially overlapping pairs in broad-phase O(N) time.
   */
  public findOverlappingPairs(): Array<[SpatialGridItem<T>, SpatialGridItem<T>]> {
    const pairs: Array<[SpatialGridItem<T>, SpatialGridItem<T>]> = [];
    const checkedPairs = new Set<string>();

    for (const cell of this.grid.values()) {
      if (cell.size < 2) continue;
      const cellIds = Array.from(cell);
      for (let i = 0; i < cellIds.length; i++) {
        for (let j = i + 1; j < cellIds.length; j++) {
          const idA = cellIds[i];
          const idB = cellIds[j];
          const pairKey = idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;

          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);

          const itemA = this.items.get(idA);
          const itemB = this.items.get(idB);
          if (!itemA || !itemB) continue;

          // AABB overlap test
          if (
            itemA.box.minX <= itemB.box.maxX &&
            itemA.box.maxX >= itemB.box.minX &&
            itemA.box.minY <= itemB.box.maxY &&
            itemA.box.maxY >= itemB.box.minY
          ) {
            pairs.push([itemA, itemB]);
          }
        }
      }
    }

    return pairs;
  }
}
