import { Point } from './VectorModel.js';

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical' | 'angled';
  position: number;
  angle: number;       // Angle in degrees: 0 = horizontal (left-to-right), 90 = vertical (top-to-bottom)
  pivotX: number;      // Center pivot point X in canvas coordinates
  pivotY: number;      // Center pivot point Y in canvas coordinates
  color?: string;      // Guide line color, default cyan (#00f0ff)
  visible?: boolean;   // Visibility toggle (default true)
  locked?: boolean;    // Lock toggle preventing accidental selection or drag
}

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

export type GridType = 'orthogonal' | 'isometric' | 'axonometric';
export type GridAlignmentMode = 'origin' | 'cell-center';

export interface GridConfig {
  id: string;
  type: GridType;
  spacing: number;      // Spacing in canvas pixels (e.g. 20)
  angle: number;        // Primary slant or inclination in degrees (e.g. 30 for isometric, 45 for axonometric)
  color: string;        // Render stroke color
  visible: boolean;     // Visibility toggle
  alignmentMode: GridAlignmentMode; // 'origin' (cross at 0,0) or 'cell-center' (center of virtual cell at 0,0)
  locked?: boolean;     // Optional lock
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
  public grids: GridConfig[] = [
    {
      id: 'default_grid',
      type: 'orthogonal',
      spacing: 20,
      angle: 0,
      color: 'rgba(255, 255, 255, 0.15)',
      visible: true,
      alignmentMode: 'origin',
    },
  ];

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
  public snapThreshold: number = 5; // 5px proximity threshold

  // By default, no guide lines exist
  public guides: GuideLine[] = [];

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
  public selectedGuideId: string | null = null;
  public activeGuideTransformId: string | null = null;

  // Snap point to active vertices, guide lines / guide intersections, or grid lines / grid intersections (3px proximity)
  public snapPoint(pt: Point, otherVertices: Point[] = [], origin?: Point): Point {
    let snappedX = pt.x;
    let snappedY = pt.y;
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
        return { x: bestVertex.x, y: bestVertex.y };
      }
    }

    // 2. Snap to Guide Lines & Guide-Guide Intersections
    if (this.snapToGuides && this.showGuides && this.guides.length > 0) {
      // 2a. Check Guide-to-Guide Intersections first
      let minIntDist = threshold;
      let bestIntersection: Point | null = null;

      for (let i = 0; i < this.guides.length; i++) {
        const g1 = this.guides[i];
        if (g1.visible === false) continue;
        for (let j = i + 1; j < this.guides.length; j++) {
          const g2 = this.guides[j];
          if (g2.visible === false) continue;
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
        return { x: bestIntersection.x, y: bestIntersection.y };
      }

      // 2b. Snap along single guide lines
      let minLineDist = threshold;
      let bestLineSnap: Point | null = null;

      for (const g of this.guides) {
        if (g.visible === false) continue;
        const rad = ((g.angle || 0) * Math.PI) / 180;
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        const px = g.pivotX ?? (g.orientation === 'vertical' ? g.position : 0);
        const py = g.pivotY ?? (g.orientation === 'horizontal' ? g.position : 0);
        const dist = nx * (pt.x - px) + ny * (pt.y - py);

        if (Math.abs(dist) <= minLineDist) {
          minLineDist = Math.abs(dist);
          bestLineSnap = {
            x: pt.x - dist * nx,
            y: pt.y - dist * ny,
          };
        }
      }

      if (bestLineSnap) {
        snappedX = bestLineSnap.x;
        snappedY = bestLineSnap.y;
      }
    }

    // 3. Snap to Grid Lines & Grid Intersections (Origin-Aligned or Cell-Center)
    if (this.snapToGrid && this.showGrid) {
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

        if (grid.type === 'orthogonal') {
          const gx = ox + Math.round((pt.x - ox) / step) * step;
          const gy = oy + Math.round((pt.y - oy) / step) * step;

          if (Math.abs(pt.x - gx) <= threshold) {
            snappedX = gx;
          }
          if (Math.abs(pt.y - gy) <= threshold) {
            snappedY = gy;
          }
        }
      }
    }

    return { x: snappedX, y: snappedY };
  }

  /**
   * Parametric Grid Management
   * Allows creating, deleting, and modifying multi-type grids (orthogonal, isometric, axonometric).
   */
  public addGrid(
    type: GridType = 'orthogonal',
    spacing: number = 20,
    angle: number = type === 'isometric' ? 30 : type === 'axonometric' ? 45 : 0,
    color: string = 'rgba(255, 255, 255, 0.15)',
    alignmentMode: GridAlignmentMode = 'origin'
  ): GridConfig {
    const grid: GridConfig = {
      id: `grid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      spacing: Math.max(1, spacing),
      angle,
      color,
      visible: true,
      alignmentMode,
    };
    this.grids.push(grid);
    return grid;
  }

  public removeGrid(id: string): void {
    this.grids = this.grids.filter((g) => g.id !== id);
  }

  public getGrid(id: string): GridConfig | undefined {
    return this.grids.find((g) => g.id === id);
  }

  public updateGrid(id: string, partial: Partial<GridConfig>): void {
    const g = this.getGrid(id);
    if (g) {
      Object.assign(g, partial);
    }
  }

  public reorderGrid(id: string, direction: 'up' | 'down'): void {
    const idx = this.grids.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.grids.length) return;
    const [removed] = this.grids.splice(idx, 1);
    this.grids.splice(targetIdx, 0, removed);
  }

  /**
   * ARCHITECTURAL RATIONALE: High-Performance GPU-Accelerated SVG Pattern Grids
   * Why <defs><pattern> tiling is used instead of individual <line> elements:
   * 1. DOM Complexity & Memory: Rendering individual <line> elements across large or zoomed-out
   *    canvases produces thousands of DOM nodes (e.g. 5000x5000 canvas with 10px spacing = 1,000 lines).
   *    In SVG, this triggers severe garbage collection pauses and DOM layout recalculations on every pan/zoom frame.
   * 2. Hardware Acceleration: SVG native <pattern> rendering is handled directly by the browser's GPU graphics
   *    pipeline in userSpaceOnUse coordinates, rendering any canvas extent with exactly 1 <rect> per grid layer (O(1) DOM nodes).
   * 3. Geometric Rigor for Non-Orthogonal Meshes: Isometric (30°/60°) and Axonometric (45°) grids require
   *    trigonometrically precise tiling (e.g. W = S * sqrt(3), H = S) so diagonal seams match seamlessly without
   *    visual drifting or moiré artifacts.
   */
  public generateGridDefsAndLayers(
    workBounds: { minX: number; minY: number; width: number; height: number; maxX?: number; maxY?: number },
    originX: number,
    originY: number
  ): { defsHtml: string; layersHtml: string } {
    let defsHtml = '';
    let layersHtml = '';

    if (!this.showGrid) {
      return { defsHtml, layersHtml };
    }

    const visibleGrids = this.grids.filter((g) => g.visible);
    if (visibleGrids.length === 0) {
      return { defsHtml, layersHtml };
    }

    const maxX = workBounds.maxX !== undefined ? workBounds.maxX : workBounds.minX + workBounds.width;
    const maxY = workBounds.maxY !== undefined ? workBounds.maxY : workBounds.minY + workBounds.height;

    visibleGrids.forEach((grid, idx) => {
      const patternId = `antidraw_pattern_${grid.id || idx}`;
      const color = grid.color || 'rgba(255, 255, 255, 0.15)';
      let tileW = 20;
      let tileH = 20;
      let pathD = '';

      if (grid.type === 'isometric') {
        const S = Math.max(5, grid.spacing || 20);
        tileH = S;
        tileW = Math.round(S * Math.sqrt(3) * 1000) / 1000;
        const halfW = tileW / 2;
        const halfH = tileH / 2;
        // Seamless 3-axis isometric lines: vertical, +30 deg, -30 deg
        const vLines = `M 0 0 L 0 ${tileH} M ${halfW} 0 L ${halfW} ${tileH}`;
        const diamond = `M 0 ${halfH} L ${halfW} 0 L ${tileW} ${halfH} L ${halfW} ${tileH} Z`;
        const corners = `M 0 0 L ${halfW} ${halfH} L ${tileW} 0 M 0 ${tileH} L ${halfW} ${halfH} L ${tileW} ${tileH}`;
        pathD = `${vLines} ${diamond} ${corners}`;
      } else if (grid.type === 'axonometric') {
        const S = Math.max(5, grid.spacing || 20);
        tileW = S;
        tileH = S;
        // 45-degree crossing diagonals + vertical axis
        pathD = `M 0 0 L ${tileW} ${tileH} M 0 ${tileH} L ${tileW} 0 M 0 0 L 0 ${tileH}`;
      } else {
        // Orthogonal
        const S = Math.max(2, grid.spacing || 20);
        tileW = S;
        tileH = S;
        pathD = `M ${tileW} 0 L 0 0 0 ${tileH}`;
      }

      let patX = originX;
      let patY = originY;
      if (grid.alignmentMode === 'cell-center') {
        patX += tileW / 2;
        patY += tileH / 2;
      }

      defsHtml += `
        <pattern id="${patternId}" x="${patX}" y="${patY}" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">
          <path d="${pathD}" fill="none" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
        </pattern>
      `;

      layersHtml += `<rect x="${workBounds.minX}" y="${workBounds.minY}" width="${workBounds.width}" height="${workBounds.height}" fill="url(#${patternId})" pointer-events="none" />`;
    });

    // Origin calibration reference axes
    layersHtml += `
      <line x1="${originX}" y1="${workBounds.minY}" x2="${originX}" y2="${maxY}" stroke="#4f566b" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none" />
      <line x1="${workBounds.minX}" y1="${originY}" x2="${maxX}" y2="${originY}" stroke="#4f566b" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none" />
    `;

    return { defsHtml, layersHtml };
  }

  public addGuide(
    orientation: 'horizontal' | 'vertical' | 'angled',
    position: number,
    canvasW: number = 800,
    canvasH: number = 600,
    angle?: number
  ): GuideLine {
    const isHoriz = orientation === 'horizontal';
    const computedAngle = angle !== undefined ? angle : isHoriz ? 0 : 90;
    const pivotX = isHoriz ? canvasW / 2 : position;
    const pivotY = isHoriz ? position : canvasH / 2;

    const guide: GuideLine = {
      id: `guide_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      orientation,
      position,
      angle: computedAngle,
      pivotX,
      pivotY,
      color: '#00f0ff',
    };
    this.guides.push(guide);
    return guide;
  }

  public removeGuide(id: string): void {
    this.guides = this.guides.filter((g) => g.id !== id);
    if (this.selectedGuideId === id) this.selectedGuideId = null;
    if (this.activeGuideTransformId === id) this.activeGuideTransformId = null;
  }

  public getGuide(id: string): GuideLine | undefined {
    return this.guides.find((g) => g.id === id);
  }
}
