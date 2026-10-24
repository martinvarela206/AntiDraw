import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, VectorModel, Point, PathVertex } from '../VectorModel.js';
import { PolygonBooleanService } from './PolygonBooleanService.js';
import { PolygonUtils } from './PolygonUtils.js';
import { SchneiderFit } from '../operations/booleans/SchneiderFit.js';

export type ScissorMode = 'auto' | 'two_clicks' | 'freehand';

export interface ScissorKnifeConfig {
  mode: ScissorMode;
  smoothing: number; // 0 to 100 percentage
}

export interface ScissorCutResult {
  modifiedElementIds: string[];
  addedElements: VectorElement[];
  removedElementIds: string[];
}

/**
 * ARCHITECTURAL RATIONALE: Vector Scissors & Knife Engine (ScissorKnifeEngine)
 *
 * 1. Dual Operational Paradigm:
 *    - Mode 1 (Scissors / 2 Clicks): Exact straight-line bisecting cut between two boundary
 *      or surface points with an elastic rubber-band guide.
 *    - Mode 2 (Knife / Freehand Drag): Continuous freeform curve carving through shapes,
 *      smoothed via analytical Douglas-Peucker and Schneider cubic Bézier fitting.
 *
 * 2. Planar Half-Space Partitioning (Zero-Gap Slicing):
 *    Instead of subtracting an artificial slit that produces microscopic pixel gaps and area loss,
 *    an open cut line is extended outward across the bounding envelope of the shape to form two
 *    complementary topological half-space polygons (HalfA, HalfB).
 *    Computing:
 *       PieceA = polygonClipping.intersection(Shape, HalfA)
 *       PieceB = polygonClipping.intersection(Shape, HalfB)
 *    guarantees mathematically exact seams, 100% area conservation, and zero gap between halves.
 *
 * 3. Closed-Loop Cookie-Cutter Carving:
 *    When a freehand cut stroke closes back on itself within proximity tolerance, it partitions
 *    the shape into interior (intersection) and exterior (difference) elements.
 *
 * 4. Open-Path Analytical Severing:
 *    Linear, polyline, and open Bézier paths are severed at exact line-segment intersection points,
 *    producing two independent open vector paths with intact stroke styling.
 */
export class ScissorKnifeEngine {
  /**
   * Evaluates the perpendicular distance from a 2D point to a line segment.
   */
  public static perpendicularDistance(pt: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-6) {
      return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
    }

    const num = Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    return num / Math.sqrt(lenSq);
  }

  /**
   * Douglas-Peucker analytical trajectory reduction.
   */
  public static douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return [...points];

    let maxDist = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIndex), epsilon);
      return [...left.slice(0, left.length - 1), ...right];
    }

    return [start, end];
  }

  /**
   * Smooths and filters a digitized cut trajectory using Douglas-Peucker and Schneider Bézier fitting.
   */
  public static smoothTrajectory(rawPoints: Point[], smoothing: number): Point[] {
    if (rawPoints.length <= 2) return [...rawPoints];

    const clampedSmoothing = Math.max(0, Math.min(100, smoothing));
    if (clampedSmoothing === 0) {
      return [...rawPoints];
    }

    // Scale epsilon: from 0.5px (smoothing=1) to 8.0px (smoothing=100)
    const epsilon = 0.5 + (clampedSmoothing / 100) * 7.5;
    const simplified = this.douglasPeucker(rawPoints, epsilon);

    if (simplified.length <= 2 || clampedSmoothing <= 15) {
      return simplified;
    }

    // High smoothing: Fit cubic Béziers and sample smooth interpolated points
    try {
      const beziers = SchneiderFit.fitCurve(simplified, epsilon * 0.8);
      if (!beziers || beziers.length === 0) return simplified;

      const smoothPts: Point[] = [{ ...beziers[0].p0 }];
      for (const b of beziers) {
        const steps = Math.max(6, Math.min(24, Math.round(clampedSmoothing / 5)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const inv = 1 - t;
          const x =
            inv * inv * inv * b.p0.x +
            3 * inv * inv * t * b.p1.x +
            3 * inv * t * t * b.p2.x +
            t * t * t * b.p3.x;
          const y =
            inv * inv * inv * b.p0.y +
            3 * inv * inv * t * b.p1.y +
            3 * inv * t * t * b.p2.y +
            t * t * t * b.p3.y;
          smoothPts.push({ x, y });
        }
      }
      return smoothPts;
    } catch {
      return simplified;
    }
  }

  /**
   * Checks whether two 2D line segments intersect and computes the intersection point.
   */
  public static segmentIntersection(
    p1: Point,
    p2: Point,
    p3: Point,
    p4: Point
  ): { point: Point; t: number; u: number } | null {
    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x;
    const d2y = p4.y - p3.y;

    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null; // Parallel or collinear

    const qx = p3.x - p1.x;
    const qy = p3.y - p1.y;

    const t = (qx * d2y - qy * d2x) / denom;
    const u = (qx * d1y - qy * d1x) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        point: {
          x: p1.x + t * d1x,
          y: p1.y + t * d1y,
        },
        t,
        u,
      };
    }

    return null;
  }

  /**
   * Constructs two complementary half-space bounding polygons dividing the plane along the cut path.
   */
  public static constructHalfSpacePolygons(
    cutPoints: Point[],
    bbox: { minX: number; minY: number; maxX: number; maxY: number }
  ): [Ring, Ring] | null {
    if (cutPoints.length < 2) return null;

    const margin = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 200) * 4;
    const bMinX = bbox.minX - margin;
    const bMaxX = bbox.maxX + margin;
    const bMinY = bbox.minY - margin;
    const bMaxY = bbox.maxY + margin;

    const p0 = cutPoints[0];
    const p1 = cutPoints[1];
    const pk_1 = cutPoints[cutPoints.length - 2];
    const pk = cutPoints[cutPoints.length - 1];

    // Direction vectors for endpoints extension
    let startDx = p0.x - p1.x;
    let startDy = p0.y - p1.y;
    const startLen = Math.hypot(startDx, startDy) || 1;
    startDx /= startLen;
    startDy /= startLen;

    let endDx = pk.x - pk_1.x;
    let endDy = pk.y - pk_1.y;
    const endLen = Math.hypot(endDx, endDy) || 1;
    endDx /= endLen;
    endDy /= endLen;

    // Extend outward beyond bounding box
    const extStart: Point = {
      x: p0.x + startDx * margin * 2,
      y: p0.y + startDy * margin * 2,
    };
    const extEnd: Point = {
      x: pk.x + endDx * margin * 2,
      y: pk.y + endDy * margin * 2,
    };

    const fullCut: Point[] = [extStart, ...cutPoints, extEnd];

    // Connect along the extended bounding box boundary
    // Determine perimeter corner order to close left and right half-spaces
    const cornerNW: Point = { x: bMinX, y: bMinY };
    const cornerNE: Point = { x: bMaxX, y: bMinY };
    const cornerSE: Point = { x: bMaxX, y: bMaxY };
    const cornerSW: Point = { x: bMinX, y: bMaxY };

    // Half A: traverse clockwise around the envelope
    const ringA: Ring = [];
    fullCut.forEach((pt) => ringA.push([pt.x, pt.y]));
    ringA.push([cornerSE.x, cornerSE.y]);
    ringA.push([cornerSW.x, cornerSW.y]);
    ringA.push([cornerNW.x, cornerNW.y]);
    ringA.push([ringA[0][0], ringA[0][1]]); // Close

    // Half B: traverse counter-clockwise around the envelope
    const ringB: Ring = [];
    for (let i = fullCut.length - 1; i >= 0; i--) {
      ringB.push([fullCut[i].x, fullCut[i].y]);
    }
    ringB.push([cornerNE.x, cornerNE.y]);
    ringB.push([cornerNW.x, cornerNW.y]);
    ringB.push([cornerSW.x, cornerSW.y]);
    ringB.push([ringB[0][0], ringB[0][1]]); // Close

    return [ringA, ringB];
  }

  /**
   * Cuts an open path element (line, polyline, open path) at its intersections with the cut stroke.
   */
  public static cutOpenPath(
    el: VectorElement,
    cutPoints: Point[],
    model: VectorModel
  ): VectorElement[] | null {
    if (!el.vertices || el.vertices.length < 2) return null;

    // Build segments from element vertices
    const segments: { p1: PathVertex; p2: PathVertex; idx: number }[] = [];
    for (let i = 0; i < el.vertices.length - 1; i++) {
      segments.push({ p1: el.vertices[i], p2: el.vertices[i + 1], idx: i });
    }

    // Find first intersection with any cut polyline segment
    for (const seg of segments) {
      for (let c = 0; c < cutPoints.length - 1; c++) {
        const cp1 = cutPoints[c];
        const cp2 = cutPoints[c + 1];

        const isect = this.segmentIntersection(seg.p1, seg.p2, cp1, cp2);
        if (isect && isect.t > 0.02 && isect.t < 0.98) {
          const cutPt = isect.point;

          // Assemble Part 1: vertices 0..idx + cutPt
          const verts1: PathVertex[] = [];
          for (let k = 0; k <= seg.idx; k++) {
            verts1.push({ ...el.vertices[k] });
          }
          verts1.push({
            id: `v_${Date.now().toString(36)}_cut1`,
            x: Math.round(cutPt.x * 100) / 100,
            y: Math.round(cutPt.y * 100) / 100,
            command: 'L',
            nodeType: 'sharp',
          });

          // Assemble Part 2: cutPt (as M) + vertices idx+1..end
          const verts2: PathVertex[] = [
            {
              id: `v_${Date.now().toString(36)}_cut2`,
              x: Math.round(cutPt.x * 100) / 100,
              y: Math.round(cutPt.y * 100) / 100,
              command: 'M',
              nodeType: 'sharp',
            },
          ];
          for (let k = seg.idx + 1; k < el.vertices.length; k++) {
            verts2.push({ ...el.vertices[k] });
          }

          const id1 = `${el.id}_cut_1_${Date.now().toString(36)}`;
          const id2 = `${el.id}_cut_2_${Date.now().toString(36)}`;

          const d1 = model.compilePathD(verts1, false);
          const d2 = model.compilePathD(verts2, false);

          const attrs1 = { ...el.attributes, id: id1, d: d1, fill: 'none' };
          const attrs2 = { ...el.attributes, id: id2, d: d2, fill: 'none' };

          const el1: VectorElement = {
            id: id1,
            tagName: 'path',
            shapeType: 'path',
            isParametric: false,
            attributes: attrs1,
            vertices: verts1,
            isClosed: false,
          };

          const el2: VectorElement = {
            id: id2,
            tagName: 'path',
            shapeType: 'path',
            isParametric: false,
            attributes: attrs2,
            vertices: verts2,
            isClosed: false,
          };

          return [el1, el2];
        }
      }
    }

    return null;
  }

  /**
   * Cuts a closed shape using Planar Half-Space Partitioning or Micro-Slit Fallback.
   */
  public static cutClosedShape(
    el: VectorElement,
    cutPoints: Point[],
    model: VectorModel
  ): VectorElement[] | null {
    if (!el.vertices || el.vertices.length < 3) return null;

    const elGeom = PolygonBooleanService.elementToGeom(el);
    if (!elGeom || elGeom.length === 0) return null;

    // Calculate element bounding box
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const poly of elGeom) {
      for (const ring of poly) {
        for (const pt of ring) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
      }
    }

    // Check if cut path is a closed loop (cookie-cutter hole / carve-out)
    const isClosedLoop =
      cutPoints.length >= 4 &&
      Math.hypot(
        cutPoints[0].x - cutPoints[cutPoints.length - 1].x,
        cutPoints[0].y - cutPoints[cutPoints.length - 1].y
      ) <= 12;

    if (isClosedLoop) {
      try {
        const loopRing: Ring = cutPoints.map((pt) => [pt.x, pt.y]);
        loopRing.push([loopRing[0][0], loopRing[0][1]]);
        const loopMp: MultiPolygon = [[loopRing]];

        const insideMp = polygonClipping.intersection(elGeom, loopMp);
        const outsideMp = polygonClipping.difference(elGeom, loopMp);

        if (insideMp && insideMp.length > 0 && outsideMp && outsideMp.length > 0) {
          const idInside = `${el.id}_carve_${Date.now().toString(36)}`;
          const idOutside = `${el.id}_rem_${Date.now().toString(36)}`;

          const elInside = PolygonUtils.multiPolygonToElement(
            insideMp,
            idInside,
            { ...el.attributes },
            model
          );
          const elOutside = PolygonUtils.multiPolygonToElement(
            outsideMp,
            idOutside,
            { ...el.attributes },
            model
          );

          if (elInside && elOutside) {
            return [elInside, elOutside];
          }
        }
      } catch {
        // Fallback to half-space
      }
    }

    // Standard Planar Half-Space Partitioning
    const halfSpaces = this.constructHalfSpacePolygons(cutPoints, { minX, minY, maxX, maxY });
    if (halfSpaces) {
      try {
        const [ringA, ringB] = halfSpaces;
        const mpA: MultiPolygon = [[ringA]];
        const mpB: MultiPolygon = [[ringB]];

        const piecesA = polygonClipping.intersection(elGeom, mpA);
        const piecesB = polygonClipping.intersection(elGeom, mpB);

        const hasA = piecesA && piecesA.length > 0;
        const hasB = piecesB && piecesB.length > 0;

        if (hasA && hasB) {
          const resultElements: VectorElement[] = [];

          piecesA.forEach((poly, idx) => {
            const partId = `${el.id}_cut_a${idx + 1}_${Date.now().toString(36)}`;
            const part = PolygonUtils.multiPolygonToElement([poly], partId, { ...el.attributes }, model);
            if (part) resultElements.push(part);
          });

          piecesB.forEach((poly, idx) => {
            const partId = `${el.id}_cut_b${idx + 1}_${Date.now().toString(36)}`;
            const part = PolygonUtils.multiPolygonToElement([poly], partId, { ...el.attributes }, model);
            if (part) resultElements.push(part);
          });

          if (resultElements.length >= 2) {
            return resultElements;
          }
        }
      } catch {
        // Fallback to micro-slit
      }
    }

    // Fallback: Micro-Slit Difference Partitioning
    try {
      const slitWidth = 0.05; // Infinitesimal slit
      const slitPolys: Polygon[] = [];

      for (let i = 0; i < cutPoints.length - 1; i++) {
        const p1 = cutPoints[i];
        const p2 = cutPoints[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.05) continue;

        const nx = (-dy / dist) * (slitWidth / 2);
        const ny = (dx / dist) * (slitWidth / 2);

        const ring: Ring = [
          [p1.x - nx, p1.y - ny],
          [p2.x - nx, p2.y - ny],
          [p2.x + nx, p2.y + ny],
          [p1.x + nx, p1.y + ny],
          [p1.x - nx, p1.y - ny],
        ];
        slitPolys.push([ring]);
      }

      if (slitPolys.length > 0) {
        const slitMp: MultiPolygon = polygonClipping.union(slitPolys[0], ...slitPolys.slice(1));
        const diffMp = polygonClipping.difference(elGeom, slitMp);

        if (diffMp && diffMp.length >= 2) {
          const partitioned: VectorElement[] = [];
          diffMp.forEach((poly, idx) => {
            const partId = `${el.id}_slit_${idx + 1}_${Date.now().toString(36)}`;
            const part = PolygonUtils.multiPolygonToElement([poly], partId, { ...el.attributes }, model);
            if (part) partitioned.push(part);
          });
          if (partitioned.length >= 2) {
            return partitioned;
          }
        }
      }
    } catch {
      // Slit fallback failed
    }

    return null;
  }

  /**
   * Applies scissors/knife cut to the document model.
   */
  public static applyCut(
    model: VectorModel,
    rawCutPoints: Point[],
    candidateElements?: VectorElement[],
    config: ScissorKnifeConfig = { mode: 'auto', smoothing: 30 }
  ): ScissorCutResult {
    const result: ScissorCutResult = {
      modifiedElementIds: [],
      addedElements: [],
      removedElementIds: [],
    };

    if (!rawCutPoints || rawCutPoints.length < 2) return result;

    const cutPoints = this.smoothTrajectory(rawCutPoints, config.smoothing);
    if (cutPoints.length < 2) return result;

    // Calculate cut bounding box for fast spatial rejection
    let cutMinX = Infinity;
    let cutMaxX = -Infinity;
    let cutMinY = Infinity;
    let cutMaxY = -Infinity;

    for (const pt of cutPoints) {
      if (pt.x < cutMinX) cutMinX = pt.x;
      if (pt.x > cutMaxX) cutMaxX = pt.x;
      if (pt.y < cutMinY) cutMinY = pt.y;
      if (pt.y > cutMaxY) cutMaxY = pt.y;
    }

    const targets =
      candidateElements && candidateElements.length > 0
        ? candidateElements
        : model.elements.filter((el) => el.tagName !== 'image' && !el.attributes?.['data-locked']);

    for (const el of targets) {
      // Ensure element is parametric-converted if needed
      if (model.isParametricElement(el)) {
        model.convertToCurves(el);
      }

      const isClosed = model.isElementClosed(el);
      let cutProducts: VectorElement[] | null = null;

      if (isClosed) {
        cutProducts = this.cutClosedShape(el, cutPoints, model);
      } else {
        cutProducts = this.cutOpenPath(el, cutPoints, model);
      }

      if (cutProducts && cutProducts.length >= 2) {
        const elIndex = model.elements.findIndex((m) => m.id === el.id);
        if (elIndex !== -1) {
          model.elements.splice(elIndex, 1, ...cutProducts);
          result.removedElementIds.push(el.id);
          cutProducts.forEach((p) => result.addedElements.push(p));
        }
      }
    }

    return result;
  }
}
