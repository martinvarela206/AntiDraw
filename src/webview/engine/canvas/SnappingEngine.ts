import { Point } from '../VectorModel.js';
import { GuideLine } from './GuideManager.js';
import { GridConfig } from './GridManager.js';
import { RulerConfig } from '../CanvasManager.js';

export interface SnappingContext {
  snapThreshold: number;
  zoom: number;
  snapToGrid: boolean;
  snapToGuides: boolean;
  snapToVertices: boolean;
  snapToViewBox: boolean;
  snapAngular?: boolean;
  showGuides: boolean;
  showGrid: boolean;
  guides: GuideLine[];
  grids: GridConfig[];
  rulerConfig: RulerConfig;
}

export interface AngledGuideSnapResult {
  pivotX: number;
  pivotY: number;
  snappedPt: Point | null;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Magnetic Snapping Engine (SnappingEngine)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates spatial magnetic proximity projections (Cartesian grids, non-orthogonal isometric/axonometric
 *    meshes, infinite and angled guideline intersections, ViewBox boundaries, and vertex anchors)
 *    from general canvas state management.
 *
 * 2. Multi-Target Snap Hierarchy:
 *    Vertices > Guide Lines & Intersections > ViewBox Frame & Keypoints > Parametric Grids.
 *
 * 3. 1D Coordinate Snapping for Infinite Guides & Axial Alignment:
 *    Horizontal guidelines span Y exclusively, and vertical guidelines span X exclusively.
 *    By adding secondary 1D coordinate checks, guidelines and aligned elements snap magnetically
 *    to any vertex matching their orthogonal coordinate across the entire canvas span.
 *
 * 4. Self-Snapping Glitch Prevention via excludeGuideId:
 *    When translating or adjusting the pivot of an existing guide line, testing against `guides`
 *    without exclusion causes the guide to snap to its own stale pre-drag coordinate or register
 *    degenerate self-intersections. Passing `excludeGuideId` skips the active guide cleanly.
 *
 * 5. Adaptive Non-Orthogonal Snapping (Isometric & Axonometric):
 *    In 30°/60° (isometric) and 45° (axonometric) grids, points are projected geometrically onto
 *    diagonal lines rather than snapping independently on X and Y, enforcing zero-tolerance closure.
 *
 * 6. Dual-Scope Angled Guide Translation Snapping:
 *    Oblique guidelines are translated strictly along their normal vector n = (-sin θ, cos θ).
 *    Evaluates both local cursor snapping and full-line perpendicular proximity sweep to keypoints.
 */
export class SnappingEngine {
  /**
   * Snaps a 2D point against all active geometric features according to hierarchy and thresholds.
   */
  public static snapPoint(
    pt: Point,
    ctx: SnappingContext,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number },
    excludeGuideId?: string
  ): Point {
    let snappedX = pt.x;
    let snappedY = pt.y;
    let xSnapped = false;
    let ySnapped = false;
    const threshold = ctx.snapThreshold / (ctx.zoom || 1);

    // 1. Snap to Vertices of other vector elements (highest priority)
    if (ctx.snapToVertices && otherVertices.length > 0) {
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
        snappedX = bestVertex.x;
        snappedY = bestVertex.y;
        xSnapped = true;
        ySnapped = true;
      }
    }

    // 2. Snap to Guide Lines and Guide Intersections
    if (ctx.snapToGuides && ctx.showGuides && ctx.guides.length > 0) {
      const activeGuides = ctx.guides.filter((g) => g.visible !== false && g.id !== excludeGuideId);

      // Check intersections between active guide lines
      if (!xSnapped || !ySnapped) {
        let minInterDist = threshold;
        let bestInter: Point | null = null;

        for (let i = 0; i < activeGuides.length; i++) {
          for (let j = i + 1; j < activeGuides.length; j++) {
            const g1 = activeGuides[i];
            const g2 = activeGuides[j];

            const r1 = ((g1.angle || 0) * Math.PI) / 180;
            const r2 = ((g2.angle || 0) * Math.PI) / 180;

            const n1x = -Math.sin(r1), n1y = Math.cos(r1);
            const n2x = -Math.sin(r2), n2y = Math.cos(r2);

            const g1px = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
            const g1py = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
            const g2px = g2.pivotX ?? (g2.orientation === 'vertical' ? g2.position : 0);
            const g2py = g2.pivotY ?? (g2.orientation === 'horizontal' ? g2.position : 0);

            const d1 = n1x * g1px + n1y * g1py;
            const d2 = n2x * g2px + n2y * g2py;

            const det = n1x * n2y - n1y * n2x;
            if (Math.abs(det) > 1e-4) {
              const ix = (d1 * n2y - d2 * n1y) / det;
              const iy = (n1x * d2 - n2x * d1) / det;
              const dist = Math.hypot(pt.x - ix, pt.y - iy);
              if (dist <= minInterDist) {
                minInterDist = dist;
                bestInter = { x: ix, y: iy };
              }
            }
          }
        }

        if (bestInter) {
          snappedX = bestInter.x;
          snappedY = bestInter.y;
          xSnapped = true;
          ySnapped = true;
        }
      }

      // Check individual guide lines
      if (!xSnapped || !ySnapped) {
        for (const g of activeGuides) {
          const isHoriz = g.orientation === 'horizontal';
          const isVert = g.orientation === 'vertical';

          if (isHoriz && !ySnapped) {
            const distY = Math.abs(pt.y - g.position);
            if (distY <= threshold) {
              snappedY = g.position;
              ySnapped = true;
            }
          } else if (isVert && !xSnapped) {
            const distX = Math.abs(pt.x - g.position);
            if (distX <= threshold) {
              snappedX = g.position;
              xSnapped = true;
            }
          } else if (g.orientation === 'angled') {
            const rad = ((g.angle || 0) * Math.PI) / 180;
            const nx = -Math.sin(rad);
            const ny = Math.cos(rad);
            const px = g.pivotX ?? 0;
            const py = g.pivotY ?? 0;

            const dist = Math.abs(nx * (pt.x - px) + ny * (pt.y - py));
            if (dist <= threshold && (!xSnapped || !ySnapped)) {
              const proj = nx * (pt.x - px) + ny * (pt.y - py);
              snappedX = pt.x - proj * nx;
              snappedY = pt.y - proj * ny;
              xSnapped = true;
              ySnapped = true;
            }
          }
        }
      }
    }

    // 3. Snap to ViewBox Frame (Artboard boundaries & keypoints)
    if (ctx.snapToViewBox && viewBoxBounds) {
      const vb = viewBoxBounds;
      const keypoints: Point[] = [
        { x: vb.minX, y: vb.minY },
        { x: vb.minX + vb.width, y: vb.minY },
        { x: vb.minX, y: vb.minY + vb.height },
        { x: vb.minX + vb.width, y: vb.minY + vb.height },
        { x: vb.minX + vb.width / 2, y: vb.minY + vb.height / 2 },
        { x: vb.minX + vb.width / 2, y: vb.minY },
        { x: vb.minX + vb.width / 2, y: vb.minY + vb.height },
        { x: vb.minX, y: vb.minY + vb.height / 2 },
        { x: vb.minX + vb.width, y: vb.minY + vb.height / 2 },
      ];

      if (!xSnapped && !ySnapped) {
        let minKpDist = threshold;
        let bestKp: Point | null = null;
        for (const kp of keypoints) {
          const d = Math.hypot(pt.x - kp.x, pt.y - kp.y);
          if (d <= minKpDist) {
            minKpDist = d;
            bestKp = kp;
          }
        }
        if (bestKp) {
          snappedX = bestKp.x;
          snappedY = bestKp.y;
          xSnapped = true;
          ySnapped = true;
        }
      }

      if (!xSnapped) {
        if (Math.abs(pt.x - vb.minX) <= threshold) {
          snappedX = vb.minX;
          xSnapped = true;
        } else if (Math.abs(pt.x - (vb.minX + vb.width)) <= threshold) {
          snappedX = vb.minX + vb.width;
          xSnapped = true;
        } else if (Math.abs(pt.x - (vb.minX + vb.width / 2)) <= threshold) {
          snappedX = vb.minX + vb.width / 2;
          xSnapped = true;
        }
      }

      if (!ySnapped) {
        if (Math.abs(pt.y - vb.minY) <= threshold) {
          snappedY = vb.minY;
          ySnapped = true;
        } else if (Math.abs(pt.y - (vb.minY + vb.height)) <= threshold) {
          snappedY = vb.minY + vb.height;
          ySnapped = true;
        } else if (Math.abs(pt.y - (vb.minY + vb.height / 2)) <= threshold) {
          snappedY = vb.minY + vb.height / 2;
          ySnapped = true;
        }
      }
    }

    // 4. Snap to Parametric Multi-Grids
    if (ctx.snapToGrid && ctx.showGrid && ctx.grids.length > 0) {
      const origX = origin ? origin.x : ctx.rulerConfig.originX;
      const origY = origin ? origin.y : ctx.rulerConfig.originY;

      const activeGrids = ctx.grids.filter((g) => g.visible);

      for (const grid of activeGrids) {
        if (xSnapped && ySnapped) break;

        const S = Math.max(1, grid.spacing || 20);
        let phaseX = origX;
        let phaseY = origY;

        if (grid.type === 'isometric') {
          const tileH = S;
          const tileW = S * Math.sqrt(3);

          if (grid.alignmentMode === 'cell-center') {
            phaseX += tileW / 2;
            phaseY += tileH / 2;
          }

          const relX = pt.x - phaseX;
          const relY = pt.y - phaseY;

          // Vertical lines at k * (tileW / 2)
          const colSpacing = tileW / 2;
          const kCol = Math.round(relX / colSpacing);
          const snapColX = phaseX + kCol * colSpacing;
          const distV = Math.abs(pt.x - snapColX);

          // Diagonal lines at +30° and -30°
          const rowSpacing = tileH;
          const diagPos = (relY - relX / Math.sqrt(3)) / rowSpacing;
          const kDiagPos = Math.round(diagPos);
          const distDiagPos = Math.abs(relY - (relX / Math.sqrt(3) + kDiagPos * rowSpacing)) * (Math.sqrt(3) / 2);

          const diagNeg = (relY + relX / Math.sqrt(3)) / rowSpacing;
          const kDiagNeg = Math.round(diagNeg);
          const distDiagNeg = Math.abs(relY - (-relX / Math.sqrt(3) + kDiagNeg * rowSpacing)) * (Math.sqrt(3) / 2);

          // Check intersection of diagonals with vertical lines (diamond vertices)
          const interY1 = (snapColX - phaseX) / Math.sqrt(3) + kDiagPos * rowSpacing + phaseY;
          const distInter1 = Math.hypot(pt.x - snapColX, pt.y - interY1);

          const interY2 = -(snapColX - phaseX) / Math.sqrt(3) + kDiagNeg * rowSpacing + phaseY;
          const distInter2 = Math.hypot(pt.x - snapColX, pt.y - interY2);

          if (distInter1 <= threshold && distInter1 <= distInter2) {
            snappedX = snapColX;
            snappedY = interY1;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (distInter2 <= threshold) {
            snappedX = snapColX;
            snappedY = interY2;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (distV <= threshold && !xSnapped) {
            snappedX = snapColX;
            xSnapped = true;
          }
        } else if (grid.type === 'axonometric') {
          const tileW = S;
          const tileH = S;

          if (grid.alignmentMode === 'cell-center') {
            phaseX += tileW / 2;
            phaseY += tileH / 2;
          }

          const relX = pt.x - phaseX;
          const relY = pt.y - phaseY;

          // Vertical lines
          const kX = Math.round(relX / tileW);
          const snapX = phaseX + kX * tileW;
          const distV = Math.abs(pt.x - snapX);

          // Diagonal intersections (+45° and -45°)
          const kSum = Math.round((relY + relX) / tileW);
          const kDiff = Math.round((relY - relX) / tileW);

          const ix = phaseX + (kSum - kDiff) * tileW / 2;
          const iy = phaseY + (kSum + kDiff) * tileW / 2;
          const distInter = Math.hypot(pt.x - ix, pt.y - iy);

          if (distInter <= threshold) {
            snappedX = ix;
            snappedY = iy;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (distV <= threshold && !xSnapped) {
            snappedX = snapX;
            xSnapped = true;
          }
        } else {
          // Orthogonal
          if (grid.alignmentMode === 'cell-center') {
            phaseX += S / 2;
            phaseY += S / 2;
          }

          const relX = pt.x - phaseX;
          const relY = pt.y - phaseY;

          if (!xSnapped) {
            const kX = Math.round(relX / S);
            const targetX = phaseX + kX * S;
            if (Math.abs(pt.x - targetX) <= threshold) {
              snappedX = targetX;
              xSnapped = true;
            }
          }

          if (!ySnapped) {
            const kY = Math.round(relY / S);
            const targetY = phaseY + kY * S;
            if (Math.abs(pt.y - targetY) <= threshold) {
              snappedY = targetY;
              ySnapped = true;
            }
          }
        }
      }
    }

    return {
      x: Math.round(snappedX * 100) / 100,
      y: Math.round(snappedY * 100) / 100,
    };
  }

  /**
   * Snaps the parallel translation of an angled guideline along its normal vector.
   */
  public static snapAngledGuideTranslation(
    guide: GuideLine,
    initialGuide: GuideLine,
    dragStartPt: Point,
    currentPt: Point,
    ctx: SnappingContext,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number }
  ): AngledGuideSnapResult {
    const rad = ((guide.angle || 0) * Math.PI) / 180;
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);

    const px0 = initialGuide.pivotX ?? (initialGuide.orientation === 'vertical' ? initialGuide.position : 0);
    const py0 = initialGuide.pivotY ?? (initialGuide.orientation === 'horizontal' ? initialGuide.position : 0);

    // Initial grab point projected onto the initial guide line
    const dx0 = dragStartPt.x - px0;
    const dy0 = dragStartPt.y - py0;
    const tangentDist0 = dx0 * ux + dy0 * uy;
    const g0x = px0 + tangentDist0 * ux;
    const g0y = py0 + tangentDist0 * uy;

    // Pointer delta and perpendicular component of translation
    const dx = currentPt.x - dragStartPt.x;
    const dy = currentPt.y - dragStartPt.y;
    const rawDeltaPerp = dx * nx + dy * ny;

    // Tentative grip point on the translated guide line
    const gRawX = g0x + rawDeltaPerp * nx;
    const gRawY = g0y + rawDeltaPerp * ny;

    const threshold = ctx.snapThreshold / (ctx.zoom || 1);

    // 1. Check local cursor snap via unified snapPoint
    const snappedCursor = this.snapPoint({ x: gRawX, y: gRawY }, ctx, otherVertices, origin, viewBoxBounds, guide.id);
    const hasCursorSnap = Math.hypot(snappedCursor.x - gRawX, snappedCursor.y - gRawY) > 0.001;

    let finalDeltaPerp = rawDeltaPerp;
    let snappedPointResult: Point | null = null;

    if (hasCursorSnap) {
      finalDeltaPerp = (snappedCursor.x - px0) * nx + (snappedCursor.y - py0) * ny;
      snappedPointResult = snappedCursor;
    } else {
      // 2. Check full-line perpendicular proximity to all active keypoints (vertices, other guides, viewBox)
      let minPerpDist = threshold;
      let bestKeypoint: Point | null = null;

      const candidates: Point[] = [];

      // Vector vertices
      if (ctx.snapToVertices && otherVertices.length > 0) {
        for (const v of otherVertices) {
          candidates.push(v);
        }
      }

      // Other guide intersections and guide pivots
      if (ctx.snapToGuides && ctx.showGuides && ctx.guides.length > 0) {
        for (let i = 0; i < ctx.guides.length; i++) {
          const g1 = ctx.guides[i];
          if (g1.visible === false || g1.id === guide.id) continue;
          const g1px = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
          const g1py = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
          candidates.push({ x: g1px, y: g1py });

          for (let j = i + 1; j < ctx.guides.length; j++) {
            const g2 = ctx.guides[j];
            if (g2.visible === false || g2.id === guide.id) continue;
            const r1 = ((g1.angle || 0) * Math.PI) / 180;
            const r2 = ((g2.angle || 0) * Math.PI) / 180;
            const n1x = -Math.sin(r1), n1y = Math.cos(r1);
            const n2x = -Math.sin(r2), n2y = Math.cos(r2);
            const g2px = g2.pivotX ?? (g2.orientation === 'vertical' ? g2.position : 0);
            const g2py = g2.pivotY ?? (g2.orientation === 'horizontal' ? g2.position : 0);
            const d1 = n1x * g1px + n1y * g1py;
            const d2 = n2x * g2px + n2y * g2py;
            const det = n1x * n2y - n1y * n2x;
            if (Math.abs(det) > 1e-4) {
              candidates.push({
                x: (d1 * n2y - d2 * n1y) / det,
                y: (n1x * d2 - n2x * d1) / det,
              });
            }
          }
        }
      }

      // ViewBox frame corners, midpoints, and center
      if (ctx.snapToViewBox && viewBoxBounds) {
        const vb = viewBoxBounds;
        candidates.push(
          { x: vb.minX, y: vb.minY },
          { x: vb.minX + vb.width, y: vb.minY },
          { x: vb.minX, y: vb.minY + vb.height },
          { x: vb.minX + vb.width, y: vb.minY + vb.height },
          { x: vb.minX + vb.width / 2, y: vb.minY + vb.height / 2 },
          { x: vb.minX + vb.width / 2, y: vb.minY },
          { x: vb.minX + vb.width / 2, y: vb.minY + vb.height },
          { x: vb.minX, y: vb.minY + vb.height / 2 },
          { x: vb.minX + vb.width, y: vb.minY + vb.height / 2 }
        );
      }

      // Origin point
      if (origin) {
        candidates.push(origin);
      }

      for (const k of candidates) {
        const kPerp = (k.x - px0) * nx + (k.y - py0) * ny;
        const dist = Math.abs(kPerp - rawDeltaPerp);
        if (dist <= minPerpDist) {
          minPerpDist = dist;
          bestKeypoint = k;
          finalDeltaPerp = kPerp;
        }
      }

      if (bestKeypoint) {
        snappedPointResult = bestKeypoint;
      }
    }

    const newPivotX = px0 + finalDeltaPerp * nx;
    const newPivotY = py0 + finalDeltaPerp * ny;

    return {
      pivotX: Math.round(newPivotX * 100) / 100,
      pivotY: Math.round(newPivotY * 100) / 100,
      snappedPt: snappedPointResult,
    };
  }
}
