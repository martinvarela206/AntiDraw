import { Point } from './VectorModel.js';
import { GridManager, GridConfig, GridType, GridAlignmentMode } from './canvas/GridManager.js';
import { GuideManager, GuideLine, GuideGeometry } from './canvas/GuideManager.js';
import { SnappingEngine, SnappingContext, AngledGuideSnapResult } from './canvas/SnappingEngine.js';

export {
  GridManager,
  GridConfig,
  GridType,
  GridAlignmentMode,
  GuideManager,
  GuideLine,
  GuideGeometry,
  SnappingEngine,
  SnappingContext,
  AngledGuideSnapResult,
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
   * Snaps a 2D point against all active geometric features (delegated to SnappingEngine).
   */
  public snapPoint(
    pt: Point,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number },
    excludeGuideId?: string
  ): Point {
    return SnappingEngine.snapPoint(pt, this, otherVertices, origin, viewBoxBounds, excludeGuideId);
  }

  /**
   * Snaps the parallel translation of an angled guideline along its normal vector (delegated to SnappingEngine).
   */
  public snapAngledGuideTranslation(
    guide: GuideLine,
    initialGuide: GuideLine,
    dragStartPt: Point,
    currentPt: Point,
    otherVertices: Point[] = [],
    origin?: Point,
    viewBoxBounds?: { minX: number; minY: number; width: number; height: number }
  ): AngledGuideSnapResult {
    return SnappingEngine.snapAngledGuideTranslation(
      guide,
      initialGuide,
      dragStartPt,
      currentPt,
      this,
      otherVertices,
      origin,
      viewBoxBounds
    );
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
