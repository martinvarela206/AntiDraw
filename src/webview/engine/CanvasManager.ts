import { Point } from './VectorModel.js';
import { GridManager, GridConfig, GridType, GridAlignmentMode } from './canvas/GridManager.js';
import { GuideManager, GuideLine, GuideGeometry } from './canvas/GuideManager.js';

export {
  GridManager,
  GridConfig,
  GridType,
  GridAlignmentMode,
  GuideManager,
  GuideLine,
  GuideGeometry,
};

export interface RulerConfig {
  unit: 'px' | 'mm' | 'cm' | 'in';
  scale: number;       // pixels per unit
  originX: number;
  originY: number;
  step: number;        // major step interval
}

export interface ShapeToolConfig {
  aspectRatioW: number; // default 4
  aspectRatioH: number; // default 3
  starPoints: number;   // default 5
  starInnerRatio: number; // default 0.4
  rectCornerRadius: number; // default 0
}

export class CanvasManager {
  public showRulers: boolean = true;
  public showGuides: boolean = true;

  /**
   * ARCHITECTURAL RATIONALE: Parametric Multi-Grid Architecture
   * Why a unified GridConfig collection is used instead of monolithic scalar flags:
   * 1. Multi-Disciplinary CAD/Design workflows: Vector illustration requires simultaneous or switchable
   *    orthogonal, isometric (game assets, 2.5D), and axonometric grids with independent spacings, slants, and visual hierarchy.
   * 2. Non-Destructive Layering: Users can configure background guides (e.g. 100px major isometric) alongside a fine
   *    orthogonal grid (10px) without state collisions or loss of calibration.
   * 3. Backwards Compatibility & Graceful Degradation: Legacy properties (showGrid, gridSpacing) act as transparent proxies
   *    to the primary grid, ensuring zero breakage for top bar buttons, existing files, or regression tests.
   */
  public gridManager: GridManager = new GridManager([
    {
      id: 'default_grid',
      type: 'orthogonal',
      spacing: 20,
      angle: 0,
      color: 'rgba(255, 255, 255, 0.15)',
      visible: true,
      alignmentMode: 'origin',
    },
  ]);
  public guideManager: GuideManager = new GuideManager();

  public get grids(): GridConfig[] {
    return this.gridManager.grids;
  }
  public set grids(val: GridConfig[]) {
    this.gridManager.grids = val;
  }

  public get guides(): GuideLine[] {
    return this.guideManager.guides;
  }
  public set guides(val: GuideLine[]) {
    this.guideManager.guides = val;
  }

  public get selectedGuideId(): string | null {
    return this.guideManager.selectedGuideId;
  }
  public set selectedGuideId(val: string | null) {
    this.guideManager.selectedGuideId = val;
  }

  public get activeGuideTransformId(): string | null {
    return this.guideManager.activeGuideTransformId;
  }
  public set activeGuideTransformId(val: string | null) {
    this.guideManager.activeGuideTransformId = val;
  }

  public get showGrid(): boolean {
    return this.grids.some((g) => g.visible);
  }

  public set showGrid(val: boolean) {
    if (this.grids.length === 0) {
      this.addGrid('orthogonal', 20);
    }
    this.grids.forEach((g) => (g.visible = val));
  }

  public get gridSpacing(): number {
    const primary = this.grids[0];
    return primary ? primary.spacing : 20;
  }

  public set gridSpacing(val: number) {
    if (this.grids.length === 0) {
      this.addGrid('orthogonal', val);
    } else {
      this.grids[0].spacing = val;
    }
  }

  /**
   * ARCHITECTURAL RATIONALE: Dual-Mode Grid Alignment (Origin vs Cell-Center)
   * Why a global alignmentMode switch is provided:
   * 1. Mode A ('origin'): Lines and intersections coincide exactly with ruler (0, 0).
   *    Essential for precision engineering, boundary drawing, and direct coordinate tracing.
   * 2. Mode B ('cell-center'): Centers of virtual cells coincide with ruler (0, 0).
   *    Crucial for icon design, pixel art, sprite work, and typography where visual masses
   *    and optical centroids sit within cell interiors rather than straddling dividing gridlines.
   * 3. Unified Phase Shift: Sets alignmentMode uniformly across active grids, updating pattern
   *    phase offsets in generateGridDefsAndLayers and snapping calculations in snapPoint simultaneously.
   */
  public get gridAlignmentMode(): GridAlignmentMode {
    const primary = this.grids[0];
    return primary ? primary.alignmentMode : 'origin';
  }

  public set gridAlignmentMode(val: GridAlignmentMode) {
    if (this.grids.length === 0) {
      this.addGrid('orthogonal', 20, 0, 'rgba(255, 255, 255, 0.15)', val);
    } else {
      this.grids.forEach((g) => (g.alignmentMode = val));
    }
  }

  public shapeConfig: ShapeToolConfig = {
    aspectRatioW: 4,
    aspectRatioH: 3,
    starPoints: 5,
    starInnerRatio: 0.4,
    rectCornerRadius: 0,
  };

  // Snap options disabled by default
  public snapToGrid: boolean = false;
  public snapToGuides: boolean = false;
  public snapToVertices: boolean = false;
  public snapToViewBox: boolean = false;
  public snapAngular: boolean = false;
  public snapThreshold: number = 5; // 5px proximity threshold

  public rulerConfig: RulerConfig = {
    unit: 'px',
    scale: 1,
    originX: 0,
    originY: 0,
    step: 50,
  };

  public static readonly ZOOM_FACTOR_IN: number = 1.10;
  public static readonly ZOOM_FACTOR_OUT: number = 0.90;
  public static readonly MIN_ZOOM: number = 0.05;
  public static readonly MAX_ZOOM: number = 20.0;

  public zoom: number = 1.0;
  public panX: number = 0;
  public panY: number = 0;

  /**
   * ARCHITECTURAL RATIONALE: Multiplicative Proportional Zoom Progression
   * Why multiplicative scaling (±10%) is implemented:
   * 1. Weber-Fechner Psychophysical Model: Human perception of optical scale operates logarithmically.
   *    Linear ±0.1 increments cause extreme disparity (sluggish at 500%, violently abrupt at 20%).
   * 2. Perceptual Velocity Uniformity: Multiplying current zoom by 1.10 (zoom in) or 0.90 (zoom out)
   *    preserves identical relative visual velocity across all scale tiers.
   * 3. Bounds and Numerical Precision: Constrains zoom securely within [MIN_ZOOM, MAX_ZOOM] and rounds
   *    to 3 decimals to avoid floating point precision artifacts.
   */
  public computeMultiplicativeZoom(factor: number): number {
    const raw = (this.zoom || 1.0) * factor;
    return Math.round(Math.max(CanvasManager.MIN_ZOOM, Math.min(CanvasManager.MAX_ZOOM, raw)) * 1000) / 1000;
  }

  public isCanvasSelected: boolean = false;

  /**
   * ARCHITECTURAL RATIONALE: Unified Magnetic Snapping Engine (snapPoint)
   *
   * 1. Multi-Target Snap Hierarchy:
   *    Vertices > Guide Lines & Intersections > ViewBox Frame & Keypoints > Parametric Grids.
   *
   * 2. 1D Coordinate Snapping for Infinite Guides & Axial Alignment:
   *    Horizontal guidelines span Y exclusively, and vertical guidelines span X exclusively.
   *    If only 2D distance (Math.hypot) were evaluated, dragging a horizontal guide across the canvas
   *    would only snap if the cursor happened to be within threshold pixels of a vertex in BOTH X and Y.
   *    By adding secondary 1D coordinate checks, guidelines and aligned elements snap magnetically
   *    to any vertex matching their orthogonal coordinate across the entire canvas span.
   *
   * 3. Self-Snapping Glitch Prevention via excludeGuideId:
   *    When translating or adjusting the pivot of an existing guide line, testing against `this.guides`
   *    without exclusion causes the guide to snap to its own stale pre-drag coordinate or register
   *    degenerate self-intersections. Passing `excludeGuideId` skips the active guide cleanly.
   */
  public snapPoint(
    pt: Point,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number },
    excludeGuideId?: string
  ): Point {
    let snappedX = pt.x;
    let snappedY = pt.y;
    let xSnapped = false;
    let ySnapped = false;
    const threshold = this.snapThreshold / (this.zoom || 1);

    // 1. Snap to Vertices of other vector elements (highest priority)
    if (this.snapToVertices && otherVertices.length > 0) {
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
      } else {
        // 1b. Check 1D coordinate alignment to vertices if not snapped to a 2D keypoint
        if (!xSnapped) {
          let minXDist = threshold;
          let bestX: number | null = null;
          for (const v of otherVertices) {
            const dx = Math.abs(pt.x - v.x);
            if (dx <= minXDist) {
              minXDist = dx;
              bestX = v.x;
            }
          }
          if (bestX !== null) {
            snappedX = bestX;
            xSnapped = true;
          }
        }
        if (!ySnapped) {
          let minYDist = threshold;
          let bestY: number | null = null;
          for (const v of otherVertices) {
            const dy = Math.abs(pt.y - v.y);
            if (dy <= minYDist) {
              minYDist = dy;
              bestY = v.y;
            }
          }
          if (bestY !== null) {
            snappedY = bestY;
            ySnapped = true;
          }
        }
      }
    }

    // 2. Snap to Guide Lines & Guide-Guide Intersections
    if (this.snapToGuides && this.showGuides && this.guides.length > 0) {
      // 2a. Check Guide-to-Guide Intersections first
      let minIntDist = threshold;
      let bestIntersection: Point | null = null;

      for (let i = 0; i < this.guides.length; i++) {
        const g1 = this.guides[i];
        if (g1.visible === false || g1.id === excludeGuideId) continue;
        for (let j = i + 1; j < this.guides.length; j++) {
          const g2 = this.guides[j];
          if (g2.visible === false || g2.id === excludeGuideId) continue;
          const rad1 = ((g1.angle || 0) * Math.PI) / 180;
          const rad2 = ((g2.angle || 0) * Math.PI) / 180;
          const n1x = -Math.sin(rad1), n1y = Math.cos(rad1);
          const n2x = -Math.sin(rad2), n2y = Math.cos(rad2);
          const px1 = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
          const py1 = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
          const px2 = g2.pivotX ?? (g2.orientation === 'vertical' ? g2.position : 0);
          const py2 = g2.pivotY ?? (g2.orientation === 'horizontal' ? g2.position : 0);
          const d1 = n1x * px1 + n1y * py1;
          const d2 = n2x * px2 + n2y * py2;
          const det = n1x * n2y - n1y * n2x;

          if (Math.abs(det) > 1e-4) {
            const ix = (d1 * n2y - d2 * n1y) / det;
            const iy = (n1x * d2 - n2x * d1) / det;
            const dist = Math.hypot(pt.x - ix, pt.y - iy);
            if (dist <= minIntDist) {
              minIntDist = dist;
              bestIntersection = { x: ix, y: iy };
            }
          }
        }
      }

      if (bestIntersection) {
        snappedX = bestIntersection.x;
        snappedY = bestIntersection.y;
        xSnapped = true;
        ySnapped = true;
      }

      // 2b. Snap along single guide lines
      if (!xSnapped || !ySnapped) {
        let minLineDist = threshold;
        let bestLineSnap: { x: number; y: number; orientation?: 'vertical' | 'horizontal' | 'angled'; angled?: boolean } | null = null;

        for (const g of this.guides) {
          if (g.visible === false || g.id === excludeGuideId) continue;
          const rad = ((g.angle || 0) * Math.PI) / 180;
          const nx = -Math.sin(rad);
          const ny = Math.cos(rad);
          const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
          const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);
          const dist = nx * (pt.x - px) + ny * (pt.y - py);

          if (Math.abs(dist) <= minLineDist) {
            minLineDist = Math.abs(dist);
            const isAngled = Math.abs((g.angle || 0) % 90) !== 0;
            bestLineSnap = {
              x: pt.x - dist * nx,
              y: pt.y - dist * ny,
              orientation: g.orientation,
              angled: isAngled,
            };
          }
        }

        if (bestLineSnap) {
          if (bestLineSnap.orientation === 'vertical' && !bestLineSnap.angled) {
            if (!xSnapped) {
              snappedX = bestLineSnap.x;
              xSnapped = true;
            }
          } else if (bestLineSnap.orientation === 'horizontal' && !bestLineSnap.angled) {
            if (!ySnapped) {
              snappedY = bestLineSnap.y;
              ySnapped = true;
            }
          } else {
            if (!xSnapped) snappedX = bestLineSnap.x;
            if (!ySnapped) snappedY = bestLineSnap.y;
            xSnapped = true;
            ySnapped = true;
          }
        }
      }
    }

    /**
     * ARCHITECTURAL RATIONALE: ViewBox (Artboard Frame) Adaptive Edge & Corner Snapping
     * Why dedicated ViewBox magnetic snapping is required:
     * 1. Physical Canvas Anchoring: Technical drawings, web mockups, and icon canvases depend on strict
     *    alignment to the SVG document view boundaries (artboard limits).
     * 2. Dual-Tier Priority Hierarchy (Vertices > Guides > ViewBox > Grids):
     *    - 2D Keypoints (Corners, Midpoints, Optical Center) are checked first within the threshold.
     *      If the cursor is near an artboard corner (e.g., top-left, bottom-right) or center, both
     *      X and Y coordinates collapse to that exact point.
     *    - 1D Boundary Edges (Left, Right, Top, Bottom, and Horizontal/Vertical Center axes) are checked
     *      secondarily. If only one dimension is within threshold (e.g., close to the right edge of the artboard),
     *      only that axis is snapped, allowing the orthogonal axis to remain free or snap to a grid line.
     * 3. Numerical Stability & Zoom Scaling: Evaluated against threshold = snapThreshold / zoom, ensuring
     *    consistent pixel-screen touch sensitivity regardless of canvas zoom factor.
     */
    if (this.snapToViewBox && viewBoxBounds) {
      const left = viewBoxBounds.minX;
      const right = viewBoxBounds.minX + viewBoxBounds.width;
      const top = viewBoxBounds.minY;
      const bottom = viewBoxBounds.minY + viewBoxBounds.height;
      const centerX = viewBoxBounds.minX + viewBoxBounds.width / 2;
      const centerY = viewBoxBounds.minY + viewBoxBounds.height / 2;

      // 3a. Check 2D Keypoints: 4 Corners, 4 Edge Midpoints, and Artboard Center
      const vbPoints: Point[] = [
        { x: left, y: top },
        { x: right, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: centerX, y: centerY },
        { x: centerX, y: top },
        { x: centerX, y: bottom },
        { x: left, y: centerY },
        { x: right, y: centerY },
      ];

      let bestVbPoint: Point | null = null;
      let minPointDist = threshold;
      for (const p of vbPoints) {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d <= minPointDist) {
          minPointDist = d;
          bestVbPoint = p;
        }
      }

      if (bestVbPoint) {
        if (!xSnapped) {
          snappedX = bestVbPoint.x;
          xSnapped = true;
        }
        if (!ySnapped) {
          snappedY = bestVbPoint.y;
          ySnapped = true;
        }
      } else {
        // 3b. Check 1D Edges: Left, Right, CenterX
        if (!xSnapped) {
          const xCandidates = [left, right, centerX];
          let bestX: number | null = null;
          let minXDist = threshold;
          for (const candX of xCandidates) {
            const dist = Math.abs(pt.x - candX);
            if (dist <= minXDist) {
              minXDist = dist;
              bestX = candX;
            }
          }
          if (bestX !== null) {
            snappedX = bestX;
            xSnapped = true;
          }
        }

        // 3c. Check 1D Edges: Top, Bottom, CenterY
        if (!ySnapped) {
          const yCandidates = [top, bottom, centerY];
          let bestY: number | null = null;
          let minYDist = threshold;
          for (const candY of yCandidates) {
            const dist = Math.abs(pt.y - candY);
            if (dist <= minYDist) {
              minYDist = dist;
              bestY = candY;
            }
          }
          if (bestY !== null) {
            snappedY = bestY;
            ySnapped = true;
          }
        }
      }
    }

    // 4. Snap to Grid Lines & Grid Intersections (Origin-Aligned or Cell-Center)
    if (this.snapToGrid && this.showGrid && (!xSnapped || !ySnapped)) {
      for (const grid of this.grids) {
        if (!grid.visible) continue;
        const step = Math.max(1, grid.spacing || 20);
        let ox = origin ? origin.x : (this.rulerConfig.originX || 0);
        let oy = origin ? origin.y : (this.rulerConfig.originY || 0);

        // Alignment mode offset: 'cell-center' shifts grid lines by half-spacing
        if (grid.alignmentMode === 'cell-center') {
          ox += step / 2;
          oy += step / 2;
        }

        /**
         * ARCHITECTURAL RATIONALE: Adaptive Non-Orthogonal Projection Snapping
         * Why geometric normal projection is required for isometric and axonometric grids:
         * 1. Multi-Axis Vector Tracing: In 30°/60° isometric and 45° axonometric spaces, lines and vertices
         *    do not adhere to orthogonal Cartesian X/Y increments. Standard rounding distorts diagonal lines.
         * 2. Intersection Prioritization: Snapping detects triple-axis crossing vertices (diamond edges and centers)
         *    first, collapsing cursor coordinates to exact nodes within the proximity threshold.
         * 3. Normal Vector Projection: For points near a diagonal or vertical segment between crossings,
         *    projects the point onto the nearest continuous line vector using unit normal displacement,
         *    maintaining seamless alignment during pen/polyline and node manipulation.
         */
        if (grid.type === 'orthogonal') {
          const gx = ox + Math.round((pt.x - ox) / step) * step;
          const gy = oy + Math.round((pt.y - oy) / step) * step;

          if (!xSnapped && Math.abs(pt.x - gx) <= threshold) {
            snappedX = gx;
          }
          if (!ySnapped && Math.abs(pt.y - gy) <= threshold) {
            snappedY = gy;
          }
        } else if (grid.type === 'isometric') {
          // Cell dimensions match SVG pattern exactly:
          const S = Math.max(5, grid.spacing || 20);
          const tileH = S;
          const tileW = Math.round(S * Math.sqrt(3) * 1000) / 1000;
          const halfW = tileW / 2;
          const halfH = tileH / 2;

          let gOx = ox;
          let gOy = oy;
          if (grid.alignmentMode === 'cell-center') {
            gOx += halfW;
            gOy += halfH;
          }

          const dx = pt.x - gOx;
          const dy = pt.y - gOy;

          // 1. Triple-axis intersection snapping (highest priority)
          const nearK = Math.round(dx / halfW);
          const nearM = Math.round(dy / halfH);
          const ix = gOx + nearK * halfW;
          const iy = gOy + nearM * halfH;
          const intDist = Math.hypot(pt.x - ix, pt.y - iy);

          if (intDist <= threshold) {
            if (!xSnapped) snappedX = ix;
            if (!ySnapped) snappedY = iy;
          } else {
            // 2. Individual Line Projections: vertical or 30-deg diagonals
            let bestDist = threshold;
            let bestSnap: Point | null = null;

            // Vertical line snap
            const vx = gOx + nearK * halfW;
            const vDist = Math.abs(pt.x - vx);
            if (vDist <= bestDist) {
              bestDist = vDist;
              bestSnap = { x: vx, y: pt.y };
            }

            // Diagonal +30 deg family: n1 = (-1/2, sqrt(3)/2)
            const stepD = (S * Math.sqrt(3)) / 4;
            const d1 = (Math.sqrt(3) * dy - dx) / 2;
            const snapD1 = Math.round(d1 / stepD) * stepD;
            const err1 = d1 - snapD1;
            if (Math.abs(err1) < bestDist) {
              bestDist = Math.abs(err1);
              bestSnap = {
                x: pt.x - err1 * (-0.5),
                y: pt.y - err1 * (Math.sqrt(3) / 2),
              };
            }

            // Diagonal -30 deg family: n2 = (1/2, sqrt(3)/2)
            const d2 = (Math.sqrt(3) * dy + dx) / 2;
            const snapD2 = Math.round(d2 / stepD) * stepD;
            const err2 = d2 - snapD2;
            if (Math.abs(err2) < bestDist) {
              bestDist = Math.abs(err2);
              bestSnap = {
                x: pt.x - err2 * 0.5,
                y: pt.y - err2 * (Math.sqrt(3) / 2),
              };
            }

            if (bestSnap) {
              if (!xSnapped) snappedX = bestSnap.x;
              if (!ySnapped) snappedY = bestSnap.y;
            }
          }
        } else if (grid.type === 'axonometric') {
          // 45-degree axonometric projection
          const S = Math.max(5, grid.spacing || 20);
          let gOx = ox;
          let gOy = oy;
          if (grid.alignmentMode === 'cell-center') {
            gOx += S / 2;
            gOy += S / 2;
          }

          const dx = pt.x - gOx;
          const dy = pt.y - gOy;

          // 1. Check crossing intersections at grid vertices or diamond centers
          const nearK = Math.round(dx / (S / 2));
          const nearM = Math.round(dy / (S / 2));
          const parity = (Math.abs(nearK) + Math.abs(nearM)) % 2;
          let ix = gOx + nearK * (S / 2);
          let iy = gOy + nearM * (S / 2);
          if (parity !== 0) {
            const altM = Math.abs(dy - (nearM + 1) * (S / 2)) < Math.abs(dy - (nearM - 1) * (S / 2)) ? nearM + 1 : nearM - 1;
            ix = gOx + nearK * (S / 2);
            iy = gOy + altM * (S / 2);
          }
          const intDist = Math.hypot(pt.x - ix, pt.y - iy);

          if (intDist <= threshold) {
            if (!xSnapped) snappedX = ix;
            if (!ySnapped) snappedY = iy;
          } else {
            // 2. Line projections: vertical or 45-deg diagonals
            let bestDist = threshold;
            let bestSnap: Point | null = null;

            // Vertical line
            const vx = gOx + Math.round(dx / S) * S;
            const vDist = Math.abs(pt.x - vx);
            if (vDist <= bestDist) {
              bestDist = vDist;
              bestSnap = { x: vx, y: pt.y };
            }

            // Diagonal +45 deg: normal = (-1/sqrt(2), 1/sqrt(2))
            const invSqrt2 = 1 / Math.SQRT2;
            const d1 = (dy - dx) * invSqrt2;
            const step45 = S * invSqrt2;
            const snapD1 = Math.round(d1 / step45) * step45;
            const err1 = d1 - snapD1;
            if (Math.abs(err1) < bestDist) {
              bestDist = Math.abs(err1);
              bestSnap = {
                x: pt.x - err1 * (-invSqrt2),
                y: pt.y - err1 * invSqrt2,
              };
            }

            // Diagonal -45 deg: normal = (1/sqrt(2), 1/sqrt(2))
            const d2 = (dy + dx) * invSqrt2;
            const snapD2 = Math.round(d2 / step45) * step45;
            const err2 = d2 - snapD2;
            if (Math.abs(err2) < bestDist) {
              bestDist = Math.abs(err2);
              bestSnap = {
                x: pt.x - err2 * invSqrt2,
                y: pt.y - err2 * invSqrt2,
              };
            }

            if (bestSnap) {
              if (!xSnapped) snappedX = bestSnap.x;
              if (!ySnapped) snappedY = bestSnap.y;
            }
          }
        }
      }
    }

    return { x: snappedX, y: snappedY };
  }

  /**
   * ARCHITECTURAL RATIONALE: Magnetic Parallel Translation Snapping for Angled Guidelines (FIX-09)
   *
   * 1. Perpendicular Normal Projection:
   *    Unlike 1D orthogonal guidelines (which independently bind to X or Y), an oblique guideline
   *    with angle θ has a single degree of translational freedom along its normal vector
   *    n = (-sin θ, cos θ). Free dragging produces arbitrary (dx, dy) mouse displacements.
   *    To preserve pure parallel translation without lateral drift, mouse movement is first
   *    projected onto the line normal: Δ_perp = n · (currentPt - dragStartPt).
   *
   * 2. Dual-Scope Magnetic Snapping:
   *    a) Cursor-Locality Snapping: The grab point on the guideline G_raw = G_0 + Δ_perp * n
   *       is evaluated via `snapPoint()`. If the cursor/grab point snaps to a 2D vertex,
   *       guideline intersection, grid point, or ViewBox anchor, the displacement required to
   *       pass through that snapped coordinate is computed along n.
   *    b) Whole-Line Sweep Snapping: If the cursor did not directly capture a local feature,
   *       all visible canvas keypoints (other vector vertices, other guideline intersections,
   *       and ViewBox frame points) are tested against the line's infinite ray. If any keypoint
   *       lies within perpendicular proximity (|dist_perp| <= threshold), the guideline snaps
   *       perpendicularly to pass through that keypoint.
   *
   * 3. Synchronized Pivot Transformation:
   *    The guide's pivot point (pivotX, pivotY) is updated strictly along the normal vector n
   *    (newPivot = initialPivot + final_perp * n). This guarantees that the pivot never shifts
   *    longitudinally along the line, keeping rotation handles and polar controls stable across
   *    successive translations.
   *
   * 4. Discarded Alternate Approaches:
   *    - Unconstrained 2D Snap (snapping raw pivot coordinates in Cartesian space):
   *      Discarded because arbitrary (dx, dy) jumps alter the angle or slide the line tangentially
   *      rather than executing parallel translation.
   */
  public snapAngledGuideTranslation(
    guide: GuideLine,
    initialGuide: GuideLine,
    dragStartPt: Point,
    currentPt: Point,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number }
  ): { pivotX: number; pivotY: number; snappedPt: Point | null } {
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

    const threshold = this.snapThreshold / (this.zoom || 1);

    // 1. Check local cursor snap via unified snapPoint
    const snappedCursor = this.snapPoint({ x: gRawX, y: gRawY }, otherVertices, origin, viewBoxBounds, guide.id);
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
      if (this.snapToVertices && otherVertices.length > 0) {
        for (const v of otherVertices) {
          candidates.push(v);
        }
      }

      // Other guide intersections and guide pivots
      if (this.snapToGuides && this.showGuides && this.guides.length > 0) {
        for (let i = 0; i < this.guides.length; i++) {
          const g1 = this.guides[i];
          if (g1.visible === false || g1.id === guide.id) continue;
          const g1px = g1.pivotX ?? (g1.orientation === 'vertical' ? g1.position : 0);
          const g1py = g1.pivotY ?? (g1.orientation === 'horizontal' ? g1.position : 0);
          candidates.push({ x: g1px, y: g1py });

          for (let j = i + 1; j < this.guides.length; j++) {
            const g2 = this.guides[j];
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
      if (this.snapToViewBox && viewBoxBounds) {
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

  /**
   * Parametric Grid Management (delegated to GridManager)
   */
  public addGrid(
    type: GridType = 'orthogonal',
    spacing: number = 20,
    angle: number = type === 'isometric' ? 30 : type === 'axonometric' ? 45 : 0,
    color: string = 'rgba(255, 255, 255, 0.15)',
    alignmentMode: GridAlignmentMode = 'origin'
  ): GridConfig {
    return this.gridManager.addGrid(type, spacing, angle, color, alignmentMode);
  }

  public removeGrid(id: string): void {
    this.gridManager.removeGrid(id);
  }

  public getGrid(id: string): GridConfig | undefined {
    return this.gridManager.getGrid(id);
  }

  public updateGrid(id: string, partial: Partial<GridConfig>): void {
    this.gridManager.updateGrid(id, partial);
  }

  public reorderGrid(id: string, direction: 'up' | 'down'): void {
    this.gridManager.reorderGrid(id, direction);
  }

  public generateGridDefsAndLayers(
    workBounds: { minX: number; minY: number; width: number; height: number; maxX?: number; maxY?: number },
    originX: number,
    originY: number
  ): { defsHtml: string; layersHtml: string } {
    return this.gridManager.generateGridDefsAndLayers(workBounds, originX, originY);
  }

  /**
   * Parametric Guide Management (delegated to GuideManager)
   */
  public addGuide(
    orientation: 'horizontal' | 'vertical' | 'angled',
    position: number,
    canvasW: number = 800,
    canvasH: number = 600,
    angle?: number
  ): GuideLine {
    return this.guideManager.addGuide(orientation, position, canvasW, canvasH, angle);
  }

  public removeGuide(id: string): void {
    this.guideManager.removeGuide(id);
  }

  public getGuide(id: string): GuideLine | undefined {
    return this.guideManager.getGuide(id);
  }

  public hitTestGuide(pt: Point, canvasW: number, canvasH: number, tolerance: number = 8): GuideLine | null {
    return this.guideManager.hitTestGuide(pt, canvasW, canvasH, this.zoom, tolerance);
  }

  public getGuideGeometry(guide: GuideLine, canvasW: number, canvasH: number): GuideGeometry {
    return this.guideManager.getGuideGeometry(guide, canvasW, canvasH);
  }
}
