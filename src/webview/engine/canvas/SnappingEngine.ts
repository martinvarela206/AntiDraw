import { Point, VectorElement } from '../VectorModel.js';
import { GuideLine } from './GuideManager.js';
import { GridConfig } from './GridManager.js';
import { RulerConfig } from '../CanvasManager.js';
import { EdgeSnappingService } from './EdgeSnappingService.js';

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
          detectedKind = 'intersection';
          targetPt = { x: bestInter.x, y: bestInter.y };
        }

        // Compound Intersections: Guides ∩ Grids & Guides ∩ Vector Contours
        if ((!xSnapped || !ySnapped) && ctx.elements && ctx.elements.length > 0) {
          const compInters = EdgeSnappingService.collectCompoundIntersections(
            pt,
            ctx.guides,
            ctx.grids,
            ctx.elements,
            excludeGuideId,
            threshold
          );
          let minCompDist = threshold;
          let bestCompInter: Point | null = null;
          for (const ci of compInters) {
            const d = Math.hypot(pt.x - ci.x, pt.y - ci.y);
            if (d < minCompDist) {
              minCompDist = d;
              bestCompInter = ci;
            }
          }
          if (bestCompInter) {
            snappedX = bestCompInter.x;
            snappedY = bestCompInter.y;
            xSnapped = true;
            ySnapped = true;
            detectedKind = 'intersection';
            targetPt = bestCompInter;
          }
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

          if (grid.alignmentMode === 'cell-center') {
            // Isometric diamond cell centers and triangle barycenters
            const relX = pt.x - phaseX;
            const relY = pt.y - phaseY;
            const kX = Math.round(relX / tileW);
            const kY = Math.round(relY / rowSpacing);

            // Candidate cell center in alternating isometric lattice
            const candidateCenterX = phaseX + kX * tileW + (Math.abs(kY) % 2 === 1 ? colSpacing : 0);
            const candidateCenterY = phaseY + kY * rowSpacing;
            const distCenter = Math.hypot(pt.x - candidateCenterX, pt.y - candidateCenterY);

            if (distCenter <= threshold) {
              snappedX = candidateCenterX;
              snappedY = candidateCenterY;
              xSnapped = true;
              ySnapped = true;
              break;
            }
          }

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

          // 4. Analytical Intersections
          // a) Intersection of +30° and -30° diagonals
          const interYDiag = phaseY + (c1Snap + c2Snap) / 2;
          const interXDiag = phaseX + (c2Snap - c1Snap) * cos30;
          const distInterDiag = Math.hypot(pt.x - interXDiag, pt.y - interYDiag);

          // b) Intersection of +30° diagonal with vertical line
          const interYV1 = phaseY + m * (snapColX - phaseX) + c1Snap;
          const distInterV1 = Math.hypot(pt.x - snapColX, pt.y - interYV1);

          // c) Intersection of -30° diagonal with vertical line
          const interYV2 = phaseY - m * (snapColX - phaseX) + c2Snap;
          const distInterV2 = Math.hypot(pt.x - snapColX, pt.y - interYV2);

          // Prioritize closest intersection within threshold
          let bestInterDist = threshold + 1;
          let bestInterPt: Point | null = null;

          if (distInterDiag <= threshold && distInterDiag < bestInterDist) {
            bestInterDist = distInterDiag;
            bestInterPt = { x: interXDiag, y: interYDiag };
          }
          if (distInterV1 <= threshold && distInterV1 < bestInterDist) {
            bestInterDist = distInterV1;
            bestInterPt = { x: snapColX, y: interYV1 };
          }
          if (distInterV2 <= threshold && distInterV2 < bestInterDist) {
            bestInterDist = distInterV2;
            bestInterPt = { x: snapColX, y: interYV2 };
          }

          if (bestInterPt) {
            snappedX = bestInterPt.x;
            snappedY = bestInterPt.y;
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
           * ARCHITECTURAL RATIONALE: Rigorous Axonometric Grid Snapping
           * Continuous sliding projection onto ±45° diagonals and intersection snapping.
           */
          const tileW = S;
          const tileH = S;

          if (grid.alignmentMode === 'cell-center') {
            const relX = pt.x - phaseX;
            const relY = pt.y - phaseY;
            const kX = Math.round((relX - tileW / 2) / tileW);
            const kY = Math.round((relY - tileH / 2) / tileH);
            const candidateCenterX = phaseX + kX * tileW + tileW / 2;
            const candidateCenterY = phaseY + kY * tileH + tileH / 2;
            const distCenter = Math.hypot(pt.x - candidateCenterX, pt.y - candidateCenterY);
            if (distCenter <= threshold) {
              snappedX = candidateCenterX;
              snappedY = candidateCenterY;
              xSnapped = true;
              ySnapped = true;
              break;
            }
          }

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

          // Intersections
          const ixDiag = phaseX + (c2Snap - c1Snap) / 2;
          const iyDiag = phaseY + (c1Snap + c2Snap) / 2;
          const distInterDiag = Math.hypot(pt.x - ixDiag, pt.y - iyDiag);

          const iyV1 = phaseY + (snapX - phaseX) + c1Snap;
          const distInterV1 = Math.hypot(pt.x - snapX, pt.y - iyV1);

          const iyV2 = phaseY - (snapX - phaseX) + c2Snap;
          const distInterV2 = Math.hypot(pt.x - snapX, pt.y - iyV2);

          let bestInterDist = threshold + 1;
          let bestInterPt: Point | null = null;

          if (distInterDiag <= threshold && distInterDiag < bestInterDist) {
            bestInterDist = distInterDiag;
            bestInterPt = { x: ixDiag, y: iyDiag };
          }
          if (distInterV1 <= threshold && distInterV1 < bestInterDist) {
            bestInterDist = distInterV1;
            bestInterPt = { x: snapX, y: iyV1 };
          }
          if (distInterV2 <= threshold && distInterV2 < bestInterDist) {
            bestInterDist = distInterV2;
            bestInterPt = { x: snapX, y: iyV2 };
          }

          if (bestInterPt) {
            snappedX = bestInterPt.x;
            snappedY = bestInterPt.y;
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
          // ARCHITECTURAL RATIONALE: Orthogonal Grid Barycentric / Cell-Center Snapping
          // Why phase shift (+S/2, +S/2) is applied strictly to snapping targets:
          // 1. Decoupled Snapping Coordinates: The visual grid lines remain anchored at (origX, origY)
          //    defining boundary segments [k*S, (k+1)*S]. Cell centers are geometrically at (k + 0.5) * S.
          // 2. Pixel Precision Alignment:
          //    For a 1px x 1px grid (S = 1), vertices snap to 0.5, 1.5, 2.5... which places 1px vector
          //    strokes dead-center inside the pixel cell, rendering cleanly between integer boundaries
          //    without fuzzy subpixel anti-aliasing.
          // 3. Coordinate Symmetry: Works identically across positive and negative quadrants.
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
