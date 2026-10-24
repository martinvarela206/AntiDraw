import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, VectorModel, Point, PathVertex } from '../VectorModel.js';
import { PolygonBooleanService } from './PolygonBooleanService.js';
import { PolygonUtils } from './PolygonUtils.js';

export type EraserTipShape = 'circle' | 'square';

export interface EraserConfig {
  size: number; // Diameter in document coordinate units
  shape: EraserTipShape;
  preserveSwathOnAlt?: boolean;
}

export interface EraserResult {
  modifiedElementIds: string[];
  addedElements: VectorElement[];
  removedElementIds: string[];
  preservedSwathElement?: VectorElement;
}

/**
 * ARCHITECTURAL RATIONALE: Vector Eraser Engine (EraserEngine)
 *
 * 1. Continuous Swath Generation:
 *    Generates exact polygonal footprints along cursor trajectories:
 *    - 'circle': Swept capsule polygons with circular caps.
 *    - 'square': Swept convex hull polygons of bounding squares.
 *
 * 2. Planar Boolean Subtraction:
 *    Executes analytical constructive area difference (polygonClipping.difference)
 *    between the target elements and the accumulated eraser swath.
 *
 * 3. Automatic Shape Partitioning:
 *    When the eraser slices through a closed vector from boundary to boundary,
 *    polygonClipping produces a MultiPolygon with N >= 2 disjoint components.
 *    Each component is promoted to an independent VectorElement, preserving the
 *    original z-index order and presentation styling.
 *
 * 4. Alt Swath Preservation:
 *    When Alt is active during the gesture, the subtracted swath is synthesized
 *    into the document as a new independent vector element.
 */
export class EraserEngine {
  /**
   * Generates a tip polygon centered at a single point.
   */
  public static generateTipPolygon(center: Point, radius: number, shape: EraserTipShape): MultiPolygon {
    if (radius <= 0) return [];

    if (shape === 'square') {
      const minX = center.x - radius;
      const maxX = center.x + radius;
      const minY = center.y - radius;
      const maxY = center.y + radius;
      const ring: Ring = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ];
      return [[ring]];
    }

    // Default: 'circle'
    const steps = 24;
    const ring: Ring = [];
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      ring.push([
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
      ]);
    }
    ring.push([ring[0][0], ring[0][1]]);
    return [[ring]];
  }

  /**
   * Generates an extruded capsule/hull polygon connecting two consecutive points.
   */
  public static generateSegmentSwath(
    p1: Point,
    p2: Point,
    radius: number,
    shape: EraserTipShape
  ): MultiPolygon {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.1) {
      return this.generateTipPolygon(p2, radius, shape);
    }

    if (shape === 'square') {
      // Convex hull of the two squares at p1 and p2
      const pts: Pair[] = [
        [p1.x - radius, p1.y - radius],
        [p1.x + radius, p1.y - radius],
        [p1.x + radius, p1.y + radius],
        [p1.x - radius, p1.y + radius],
        [p2.x - radius, p2.y - radius],
        [p2.x + radius, p2.y - radius],
        [p2.x + radius, p2.y + radius],
        [p2.x - radius, p2.y + radius],
      ];
      const hull = this.computeConvexHull(pts);
      if (hull.length >= 3) {
        hull.push([hull[0][0], hull[0][1]]);
        return [[hull]];
      }
      return this.generateTipPolygon(p2, radius, shape);
    }

    // Circle Capsule
    const nx = (-dy / dist) * radius;
    const ny = (dx / dist) * radius;
    const angleBase = Math.atan2(dy, dx);

    const ring: Ring = [];
    // Side 1: from p1 to p2 along positive normal
    ring.push([p1.x + nx, p1.y + ny]);
    ring.push([p2.x + nx, p2.y + ny]);

    // Cap at p2 (semicircle from +normal to -normal)
    const arcSteps = 12;
    for (let i = 1; i < arcSteps; i++) {
      const a = angleBase + Math.PI / 2 - (i / arcSteps) * Math.PI;
      ring.push([p2.x + radius * Math.cos(a), p2.y + radius * Math.sin(a)]);
    }

    // Side 2: from p2 to p1 along negative normal
    ring.push([p2.x - nx, p2.y - ny]);
    ring.push([p1.x - nx, p1.y - ny]);

    // Cap at p1 (semicircle from -normal to +normal)
    for (let i = 1; i < arcSteps; i++) {
      const a = angleBase - Math.PI / 2 - (i / arcSteps) * Math.PI;
      ring.push([p1.x + radius * Math.cos(a), p1.y + radius * Math.sin(a)]);
    }

    ring.push([ring[0][0], ring[0][1]]);
    return [[ring]];
  }

  /**
   * Computes the 2D convex hull using Monotone Chain algorithm.
   */
  public static computeConvexHull(points: Pair[]): Pair[] {
    const pts = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    if (pts.length <= 2) return pts;

    const cross = (o: Pair, a: Pair, b: Pair) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

    const lower: Pair[] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper: Pair[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /**
   * Combines an array of trajectory points into a single consolidated MultiPolygon swath.
   */
  public static buildSwathFromPoints(points: Point[], radius: number, shape: EraserTipShape): MultiPolygon {
    if (!points || points.length === 0 || radius <= 0) return [];
    if (points.length === 1) {
      return this.generateTipPolygon(points[0], radius, shape);
    }

    const swaths: MultiPolygon[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segSwath = this.generateSegmentSwath(points[i], points[i + 1], radius, shape);
      if (segSwath.length > 0) {
        swaths.push(segSwath);
      }
    }

    if (swaths.length === 0) {
      return this.generateTipPolygon(points[points.length - 1], radius, shape);
    }

    try {
      return polygonClipping.union(swaths[0], ...swaths.slice(1));
    } catch {
      // Fallback: return first swath
      return swaths[0];
    }
  }

  /**
   * Applies the eraser swath to candidate elements in the model with auto-partitioning.
   */
  public static applyEraser(
    model: VectorModel,
    swathMp: MultiPolygon,
    candidateElements?: VectorElement[],
    preserveSwath: boolean = false
  ): EraserResult {
    const result: EraserResult = {
      modifiedElementIds: [],
      addedElements: [],
      removedElementIds: [],
    };

    if (!swathMp || swathMp.length === 0) return result;

    // Determine target elements: explicit candidates or all unlocked non-image vectors
    const targets = candidateElements && candidateElements.length > 0
      ? candidateElements
      : model.elements.filter((el) => el.tagName !== 'image' && !el.attributes?.['data-locked']);

    if (targets.length === 0) return result;

    // Calculate swath bounding box for fast spatial rejection
    let swathMinX = Infinity;
    let swathMaxX = -Infinity;
    let swathMinY = Infinity;
    let swathMaxY = -Infinity;

    for (const poly of swathMp) {
      for (const ring of poly) {
        for (const pt of ring) {
          if (pt[0] < swathMinX) swathMinX = pt[0];
          if (pt[0] > swathMaxX) swathMaxX = pt[0];
          if (pt[1] < swathMinY) swathMinY = pt[1];
          if (pt[1] > swathMaxY) swathMaxY = pt[1];
        }
      }
    }

    for (const el of targets) {
      // Check parametric auto-promotion
      if (model.isParametricElement(el)) {
        model.convertToCurves(el);
      }

      const elGeom = PolygonBooleanService.elementToGeom(el);
      if (elGeom.length === 0) continue;

      // Spatial bounding box check
      let elMinX = Infinity;
      let elMaxX = -Infinity;
      let elMinY = Infinity;
      let elMaxY = -Infinity;
      for (const poly of elGeom) {
        for (const ring of poly) {
          for (const pt of ring) {
            if (pt[0] < elMinX) elMinX = pt[0];
            if (pt[0] > elMaxX) elMaxX = pt[0];
            if (pt[1] < elMinY) elMinY = pt[1];
            if (pt[1] > elMaxY) elMaxY = pt[1];
          }
        }
      }

      const overlaps = !(
        elMaxX < swathMinX ||
        elMinX > swathMaxX ||
        elMaxY < swathMinY ||
        elMinY > swathMaxY
      );

      if (!overlaps) continue;

      // Test intersection
      let hasIntersection = false;
      try {
        const intMp = polygonClipping.intersection(elGeom, swathMp);
        hasIntersection = intMp && intMp.length > 0;
      } catch {
        hasIntersection = false;
      }

      if (!hasIntersection) continue;

      // Execute subtraction
      let diffMp: MultiPolygon;
      try {
        diffMp = polygonClipping.difference(elGeom, swathMp);
      } catch {
        continue;
      }

      const elIndex = model.elements.findIndex((m) => m.id === el.id);
      if (elIndex === -1) continue;

      if (!diffMp || diffMp.length === 0) {
        // Completely erased
        model.elements.splice(elIndex, 1);
        result.removedElementIds.push(el.id);
      } else if (diffMp.length === 1) {
        // Modified in place
        const updated = PolygonUtils.multiPolygonToElement(diffMp, el.id, el.attributes, model);
        if (updated) {
          model.elements[elIndex] = updated;
          result.modifiedElementIds.push(el.id);
        }
      } else {
        // Partitioned into multiple independent vectors (N >= 2)
        const partitionedElements: VectorElement[] = [];
        diffMp.forEach((poly, polyIdx) => {
          const partId = `${el.id}_part_${polyIdx + 1}_${Date.now().toString(36)}`;
          const partEl = PolygonUtils.multiPolygonToElement([poly], partId, { ...el.attributes }, model);
          if (partEl) {
            partitionedElements.push(partEl);
          }
        });

        if (partitionedElements.length > 0) {
          // Replace in-place at same z-index
          model.elements.splice(elIndex, 1, ...partitionedElements);
          result.removedElementIds.push(el.id);
          partitionedElements.forEach((p) => result.addedElements.push(p));
        }
      }
    }

    // Preserve swath as new vector if Alt was active
    if (preserveSwath && swathMp.length > 0) {
      const swathId = `swath_${Date.now().toString(36)}`;
      const swathEl = PolygonUtils.multiPolygonToElement(
        swathMp,
        swathId,
        {
          fill: '#ec4899',
          stroke: '#be185d',
          'stroke-width': '1.5',
        },
        model
      );
      if (swathEl) {
        model.elements.push(swathEl);
        result.addedElements.push(swathEl);
        result.preservedSwathElement = swathEl;
      }
    }

    return result;
  }
}
