import { Point, VectorElement } from '../VectorModel.js';
import { GuideLine } from './GuideManager.js';
import { GridConfig } from './GridManager.js';
import { RulerConfig } from '../CanvasManager.js';
import { EdgeSnappingService } from './EdgeSnappingService.js';
import { IntersectionSnappingService } from './IntersectionSnappingService.js';
import { ContextualVectorGridService } from '../scene/ContextualVectorGridService.js';

export type SnapKind = 'none' | 'node' | 'edge' | 'intersection' | 'guide' | 'grid' | 'viewbox';

export interface SnapResult {
  x: number;
  y: number;
  kind: SnapKind;
  targetPt?: Point;
  xSnapped?: boolean;
  ySnapped?: boolean;
}

export interface SnappingContext {
  snapThreshold: number;
  zoom: number;
  snapToPixelGrid?: boolean;
  snapToGrid: boolean;
  snapToGuides: boolean;
  snapToVertices: boolean;
  snapToNodes?: boolean;
  snapToEdges?: boolean;
  snapToIntersections?: boolean;
  snapToViewBox: boolean;
  snapAngular?: boolean;
  showGuides: boolean;
  showGrid: boolean;
  guides: GuideLine[];
  grids: GridConfig[];
  rulerConfig: RulerConfig;
  elements?: VectorElement[];
  excludeElementIds?: string[];
  strokeWidth?: number;
  halfPixel?: boolean;
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
  public static lastSnapResult: SnapResult | null = null;

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
    let detectedKind: SnapKind = 'none';
    let targetPt: Point | undefined = undefined;
    const threshold = ctx.snapThreshold / (ctx.zoom || 1);

    // 1. Snap to Vector Nodes (Structural, Handles, Positional)
    const snapToNodesActive = ctx.snapToNodes ?? ctx.snapToVertices;
    if (snapToNodesActive && otherVertices.length > 0) {
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
        detectedKind = 'node';
        targetPt = { x: bestVertex.x, y: bestVertex.y };
      }
    }

    // 1.5. Contextual Vector Grid Discrete Snapping (Pre-computed Nodes, Centroids & Intersections)
    if (!xSnapped || !ySnapped) {
      const gridSnap = ContextualVectorGridService.querySnap(pt, threshold);
      if (gridSnap) {
        snappedX = gridSnap.point.x;
        snappedY = gridSnap.point.y;
        xSnapped = true;
        ySnapped = true;
        detectedKind = gridSnap.point.kind === 'node' ? 'node' : 'intersection';
        targetPt = { x: gridSnap.point.x, y: gridSnap.point.y };
      }
    }

    // 2. Universal Intersection Snapping (Path × Path, Path × Guide, Guide × Guide, Guide × Grid)
    // ARCHITECTURAL RATIONALE: Canonical Snapping Hierarchy (Item 1.1 feat(snap))
    // Anchor / Vertex ('node') > Universal Intersection ('intersection') > Edge / Guide ('edge' / 'guide')
    const snapToInterActive = ctx.snapToIntersections ?? (ctx.snapToGuides || ctx.snapToVertices || ctx.snapToEdges);
    if (snapToInterActive && (!xSnapped || !ySnapped)) {
      const activeGuides = (ctx.snapToGuides && ctx.showGuides && ctx.guides) ? ctx.guides : [];
      const activeElements = ctx.elements || [];

      let bestInterPt: Point | null = null;
      let minInterDist = threshold;

      // a) Universal Intersections: Path × Path, Path × Guide, Guide × Guide with Meeting Algorithm
      const univInter = IntersectionSnappingService.findClosestIntersection(
        pt,
        activeElements,
        activeGuides,
        ctx.excludeElementIds,
        excludeGuideId,
        threshold
      );
      if (univInter) {
        const d = Math.hypot(pt.x - univInter.x, pt.y - univInter.y);
        if (d <= minInterDist) {
          minInterDist = d;
          bestInterPt = univInter;
        }
      }

      // b) Compound Intersections with Grids: Guides ∩ Grids
      if (activeGuides.length > 0 && ctx.grids && ctx.grids.length > 0) {
        const compInters = EdgeSnappingService.collectCompoundIntersections(
          pt,
          activeGuides,
          ctx.grids,
          [],
          excludeGuideId,
          threshold
        );
        for (const ci of compInters) {
          const d = Math.hypot(pt.x - ci.x, pt.y - ci.y);
          if (d <= minInterDist) {
            minInterDist = d;
            bestInterPt = ci;
          }
        }
      }

      if (bestInterPt) {
        snappedX = bestInterPt.x;
        snappedY = bestInterPt.y;
        xSnapped = true;
        ySnapped = true;
        detectedKind = 'intersection';
        targetPt = { x: bestInterPt.x, y: bestInterPt.y };
      }
    }

    // 3. Snap to 1D Guide Lines
    if (ctx.snapToGuides && ctx.showGuides && ctx.guides.length > 0 && (!xSnapped || !ySnapped)) {
      const activeGuides = ctx.guides.filter((g) => g.visible !== false && g.id !== excludeGuideId);
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

    // 3. Snap to ViewBox Frame (Artboard boundaries & keypoints)
    // ARCHITECTURAL RATIONALE: ViewBox frame snapping is decoupled from guideline snapping (snapToGuides).
    // This allows users to independently snap to infinite guidelines without magnetic interference from artboard margins,
    // or vice versa when aligning vectors strictly against canvas boundaries without requiring guidelines.
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
    if (ctx.snapToGrid) {
      const origX = origin ? origin.x : ctx.rulerConfig.originX;
      const origY = origin ? origin.y : ctx.rulerConfig.originY;

      // When snapToGrid is active, snap against visible grids or fall back to primary grid definition
      let activeGrids = (ctx.grids || []).filter((g) => g.visible);
      if (activeGrids.length === 0) {
        if (ctx.grids && ctx.grids.length > 0) {
          activeGrids = [ctx.grids[0]];
        } else {
          activeGrids = [
            {
              id: 'fallback_grid',
              type: 'orthogonal',
              spacing: ctx.rulerConfig?.step || 20,
              visible: true,
              alignmentMode: 'origin',
            } as GridConfig,
          ];
        }
      }

      for (const grid of activeGrids) {
        if (xSnapped && ySnapped) break;

        const S = Math.max(1, grid.spacing || 20);
        let phaseX = origX;
        let phaseY = origY;

        if (grid.type === 'isometric') {
          /**
           * ARCHITECTURAL RATIONALE: Rigorous Isometric Grid Snapping (Lines, Continuous Diagonals, and Intersections)
           *
           * 1. Row Spacing Calibration (S / 2):
           *    Visual isometric diagonals cross vertical axes at y = 0, S/2, S, 3S/2...
           *    Using rowSpacing = S previously missed exactly 50% of the rendered grid lines.
           *    Setting rowSpacing = S / 2 provides 100% geometric parity with GridManager SVG pattern.
           *
           * 2. Continuous Sliding Projection along ±30° Diagonals:
           *    Rather than only snapping to discrete vertices at line crossings, points within threshold
           *    of any ±30° diagonal are projected orthogonally onto the line:
           *      P_proj = P - d_signed * n_unit
           *    This allows continuous, smooth magnetic sliding along isometric axes during drawing and editing.
           *
           * 3. Intersection Prioritization:
           *    When a point is near the crossing of two diagonals or a diagonal and a vertical line,
           *    the exact analytical intersection is prioritized over single-line projection.
           */
          const tileH = S;
          const tileW = S * Math.sqrt(3);
          const rowSpacing = tileH / 2;
          const colSpacing = tileW / 2;
          const m = 1 / Math.sqrt(3); // tan(30°)
          const cos30 = Math.sqrt(3) / 2;
          const sin30 = 0.5;

          const relX = pt.x - phaseX;
          const relY = pt.y - phaseY;

          // 1. Vertical lines at k * (tileW / 2)
          const kCol = Math.round(relX / colSpacing);
          const snapColX = phaseX + kCol * colSpacing;
          const distV = Math.abs(pt.x - snapColX);

          // 2. +30° Diagonal line: y - m*x = c1
          const c1 = relY - m * relX;
          const k1 = Math.round(c1 / rowSpacing);
          const c1Snap = k1 * rowSpacing;
          const signedDist1 = (c1 - c1Snap) * cos30;
          const dist1 = Math.abs(signedDist1);
          const proj1X = pt.x + signedDist1 * sin30;
          const proj1Y = pt.y - signedDist1 * cos30;

          // 3. -30° Diagonal line: y + m*x = c2
          const c2 = relY + m * relX;
          const k2 = Math.round(c2 / rowSpacing);
          const c2Snap = k2 * rowSpacing;
          const signedDist2 = (c2 - c2Snap) * cos30;
          const dist2 = Math.abs(signedDist2);
          const proj2X = pt.x - signedDist2 * sin30;
          const proj2Y = pt.y - signedDist2 * cos30;

          // Analytical Candidates:
          // Point 1: Intersections (diagonal-diagonal and diagonal-vertical)
          // Point 2: Cell centers (diamond centers)
          // Point 3: Segment midpoints (midpoints along vertical and diagonal segments)
          const candidates: Point[] = [];

          // 1. Intersections
          candidates.push({
            x: phaseX + (c2Snap - c1Snap) * cos30,
            y: phaseY + (c1Snap + c2Snap) / 2,
          });
          candidates.push({
            x: snapColX,
            y: phaseY + m * (snapColX - phaseX) + c1Snap,
          });
          candidates.push({
            x: snapColX,
            y: phaseY - m * (snapColX - phaseX) + c2Snap,
          });

          // 2. Cell Centers (Diamond Centers)
          const kXDia = Math.round(relX / tileW);
          const kYDia = Math.round(relY / rowSpacing);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const curKX = kXDia + dx;
              const curKY = kYDia + dy;
              candidates.push({
                x: phaseX + curKX * tileW + (Math.abs(curKY) % 2 === 1 ? colSpacing : 0),
                y: phaseY + curKY * rowSpacing,
              });
            }
          }

          // 3. Segment Midpoints
          // Vertical segment midpoints
          candidates.push({
            x: snapColX,
            y: phaseY + m * (snapColX - phaseX) + c1Snap + rowSpacing / 2,
          });
          candidates.push({
            x: snapColX,
            y: phaseY - m * (snapColX - phaseX) + c2Snap + rowSpacing / 2,
          });
          // Diagonal segment midpoints
          candidates.push({
            x: phaseX + (c2Snap - c1Snap) * cos30 + (cos30 * rowSpacing) / 2,
            y: phaseY + (c1Snap + c2Snap) / 2 + rowSpacing / 4,
          });
          candidates.push({
            x: phaseX + (c2Snap - c1Snap) * cos30 - (cos30 * rowSpacing) / 2,
            y: phaseY + (c1Snap + c2Snap) / 2 + rowSpacing / 4,
          });

          // Prioritize closest keypoint within threshold
          let bestDist = threshold + 1;
          let bestPt: Point | null = null;
          for (const cand of candidates) {
            const d = Math.hypot(pt.x - cand.x, pt.y - cand.y);
            if (d <= threshold && d < bestDist) {
              bestDist = d;
              bestPt = cand;
            }
          }

          if (bestPt) {
            snappedX = bestPt.x;
            snappedY = bestPt.y;
            xSnapped = true;
            ySnapped = true;
            break;
          }

          // Fallback to continuous projection onto nearest diagonal or vertical line
          if (dist1 <= threshold && dist1 <= dist2 && dist1 <= distV) {
            snappedX = proj1X;
            snappedY = proj1Y;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (dist2 <= threshold && dist2 <= distV) {
            snappedX = proj2X;
            snappedY = proj2Y;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (distV <= threshold && !xSnapped) {
            snappedX = snapColX;
            xSnapped = true;
          }
        } else if (grid.type === 'axonometric') {
          /**
           * ARCHITECTURAL RATIONALE: Unified Axonometric Grid Snapping
           * Concurrently snaps to:
           * 1. Intersections: ±45° diagonal crossings and diagonal-vertical vertices
           * 2. Cell Centers: Center of square axonometric tiles
           * 3. Segment Midpoints: Halfway along vertical and diagonal segments
           */
          const tileW = S;
          const tileH = S;

          const relX = pt.x - phaseX;
          const relY = pt.y - phaseY;

          // Vertical lines at k * tileW
          const kX = Math.round(relX / tileW);
          const snapX = phaseX + kX * tileW;
          const distV = Math.abs(pt.x - snapX);

          // +45° Diagonal line: y - x = c1
          const c1 = relY - relX;
          const k1 = Math.round(c1 / tileH);
          const c1Snap = k1 * tileH;
          const signedDist1 = (c1 - c1Snap) / Math.SQRT2;
          const dist1 = Math.abs(signedDist1);
          const proj1X = pt.x + signedDist1 / Math.SQRT2;
          const proj1Y = pt.y - signedDist1 / Math.SQRT2;

          // -45° Diagonal line: y + x = c2
          const c2 = relY + relX;
          const k2 = Math.round(c2 / tileH);
          const c2Snap = k2 * tileH;
          const signedDist2 = (c2 - c2Snap) / Math.SQRT2;
          const dist2 = Math.abs(signedDist2);
          const proj2X = pt.x - signedDist2 / Math.SQRT2;
          const proj2Y = pt.y - signedDist2 / Math.SQRT2;

          // 2D Candidate Keypoints:
          // 1. Intersections
          const ixDiag = phaseX + (c2Snap - c1Snap) / 2;
          const iyDiag = phaseY + (c1Snap + c2Snap) / 2;
          const iyV1 = phaseY + (snapX - phaseX) + c1Snap;
          const iyV2 = phaseY - (snapX - phaseX) + c2Snap;

          // 2. Cell Centers
          const kXCenter = Math.round((relX - tileW / 2) / tileW);
          const kYCenter = Math.round((relY - tileH / 2) / tileH);
          const centerX = phaseX + kXCenter * tileW + tileW / 2;
          const centerY = phaseY + kYCenter * tileH + tileH / 2;

          // 3. Segment Midpoints
          const kYMid = Math.round((relY - tileH / 2) / tileH);
          const midYV = phaseY + kYMid * tileH + tileH / 2;
          const kXMid = Math.round((relX - tileW / 2) / tileW);
          const midXH = phaseX + kXMid * tileW + tileW / 2;
          const midXDiag1 = ixDiag + tileW / 4;
          const midYDiag1 = iyDiag + tileH / 4;
          const midXDiag2 = ixDiag - tileW / 4;
          const midYDiag2 = iyDiag - tileH / 4;

          const candidates: Point[] = [
            { x: ixDiag, y: iyDiag },
            { x: snapX, y: iyV1 },
            { x: snapX, y: iyV2 },
            { x: centerX, y: centerY },
            { x: snapX, y: midYV },
            { x: midXH, y: phaseY + Math.round(relY / tileH) * tileH },
            { x: midXDiag1, y: midYDiag1 },
            { x: midXDiag2, y: midYDiag2 },
          ];

          let bestDist = threshold + 1;
          let bestPt: Point | null = null;
          for (const cand of candidates) {
            const d = Math.hypot(pt.x - cand.x, pt.y - cand.y);
            if (d <= threshold && d < bestDist) {
              bestDist = d;
              bestPt = cand;
            }
          }

          if (bestPt) {
            snappedX = bestPt.x;
            snappedY = bestPt.y;
            xSnapped = true;
            ySnapped = true;
            break;
          }

          if (dist1 <= threshold && dist1 <= dist2 && dist1 <= distV) {
            snappedX = proj1X;
            snappedY = proj1Y;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (dist2 <= threshold && dist2 <= distV) {
            snappedX = proj2X;
            snappedY = proj2Y;
            xSnapped = true;
            ySnapped = true;
            break;
          } else if (distV <= threshold && !xSnapped) {
            snappedX = snapX;
            xSnapped = true;
          }
        } else {
          /**
           * ARCHITECTURAL RATIONALE: Comprehensive Orthogonal Grid Snapping
           * Natively integrates 3 concurrent snapping targets without requiring manual mode toggling:
           * 1. Grid Line Intersections / Corners (k * S, m * S)
           * 2. Cell Centers ((k + 0.5) * S, (m + 0.5) * S)
           * 3. Grid Line Segment Midpoints ((k + 0.5) * S, m * S) and (k * S, (m + 0.5) * S)
           */
          const halfS = S / 2;
          const kXHalf = Math.round((pt.x - phaseX) / halfS);
          const kYHalf = Math.round((pt.y - phaseY) / halfS);
          const candX = phaseX + kXHalf * halfS;
          const candY = phaseY + kYHalf * halfS;
          const dist2D = Math.hypot(pt.x - candX, pt.y - candY);

          // 1. Prioritize 2D Keypoint Snap: Intersections (1), Cell Centers (2), and Segment Midpoints (3)
          if (dist2D <= threshold) {
            snappedX = candX;
            snappedY = candY;
            xSnapped = true;
            ySnapped = true;
            break;
          }

          // 2. Continuous 1D Line Projections (Grid lines prioritized, then half-step lines)
          if (!xSnapped) {
            const kXFull = Math.round((pt.x - phaseX) / S);
            const lineXFull = phaseX + kXFull * S;
            if (Math.abs(pt.x - lineXFull) <= threshold) {
              snappedX = lineXFull;
              xSnapped = true;
            } else if (Math.abs(pt.x - candX) <= threshold) {
              snappedX = candX;
              xSnapped = true;
            }
          }

          if (!ySnapped) {
            const kYFull = Math.round((pt.y - phaseY) / S);
            const lineYFull = phaseY + kYFull * S;
            if (Math.abs(pt.y - lineYFull) <= threshold) {
              snappedY = lineYFull;
              ySnapped = true;
            } else if (Math.abs(pt.y - candY) <= threshold) {
              snappedY = candY;
              ySnapped = true;
            }
          }
        }
      }
    }

    // 5. Continuous Vector Edge Snapping (snapToEdges)
    if (ctx.snapToEdges && ctx.elements && ctx.elements.length > 0 && (!xSnapped || !ySnapped)) {
      const edgeCand = EdgeSnappingService.snapToVectorEdges(
        pt,
        ctx.elements,
        ctx.excludeElementIds || [],
        threshold
      );
      if (edgeCand) {
        snappedX = edgeCand.snappedPt.x;
        snappedY = edgeCand.snappedPt.y;
        xSnapped = true;
        ySnapped = true;
        detectedKind = 'edge';
        targetPt = edgeCand.snappedPt;
      }
    }

    const hasMagneticSnap = xSnapped || ySnapped;
    if (hasMagneticSnap) {
      if (detectedKind === 'none') {
        detectedKind = 'grid';
      }
    }

    // 6. Snap to Pixel Grid (Pixel-Perfect with Half-Pixel Awareness)
    // Acota coordenadas a la cuadrícula de píxeles enteros (o ±0.5px para trazos impares como 1px).
    // Al desactivarse (false), habilita libertad analítica continua subpíxel en R^2.
    const snapToPixel = ctx.snapToPixelGrid ?? true;
    if (snapToPixel) {
      const isOddStroke =
        ctx.halfPixel === true ||
        (ctx.strokeWidth !== undefined &&
          Math.round(ctx.strokeWidth) > 0 &&
          Math.round(ctx.strokeWidth) % 2 === 1);
      const halfOffset = isOddStroke ? 0.5 : 0.0;

      if (!xSnapped) {
        snappedX = Math.round(snappedX - halfOffset) + halfOffset;
      }
      if (!ySnapped) {
        snappedY = Math.round(snappedY - halfOffset) + halfOffset;
      }
    }

    SnappingEngine.lastSnapResult = hasMagneticSnap
      ? {
          x: Math.round(snappedX * 100) / 100,
          y: Math.round(snappedY * 100) / 100,
          kind: detectedKind,
          targetPt: targetPt ? { x: Math.round(targetPt.x * 100) / 100, y: Math.round(targetPt.y * 100) / 100 } : undefined,
          xSnapped,
          ySnapped,
        }
      : null;

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

      // Vector nodes (structural, handles, positional)
      const snapToNodesActive = ctx.snapToNodes ?? ctx.snapToVertices;
      if (snapToNodesActive && otherVertices.length > 0) {
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
