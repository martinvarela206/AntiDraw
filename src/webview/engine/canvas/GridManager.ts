export type GridType = 'orthogonal' | 'isometric' | 'axonometric';
export type GridAlignmentMode = 'origin' | 'cell-center';

export interface GridConfig {
  id: string;
  type: GridType;
  spacing: number;
  angle: number; // in degrees
  color: string;
  visible: boolean;
  alignmentMode: GridAlignmentMode;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Parametric Grid Manager (GridManager)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Extracts multi-type grid state management (orthogonal, isometric, axonometric) and GPU-accelerated
 *    SVG pattern generation from CanvasManager.
 *
 * 2. High-Performance GPU-Accelerated SVG Pattern Grids:
 *    Why <defs><pattern> tiling is used instead of individual <line> elements:
 *    - DOM Complexity & Memory: Rendering individual <line> elements across large or zoomed-out
 *      canvases produces thousands of DOM nodes (e.g. 5000x5000 canvas with 10px spacing = 1,000 lines).
 *      In SVG, this triggers severe garbage collection pauses and DOM layout recalculations on every pan/zoom frame.
 *    - Hardware Acceleration: SVG native <pattern> rendering is handled directly by the browser's GPU graphics
 *      pipeline in userSpaceOnUse coordinates, rendering any canvas extent with exactly 1 <rect> per grid layer (O(1) DOM nodes).
 *    - Geometric Rigor for Non-Orthogonal Meshes: Isometric (30°/60°) and Axonometric (45°) grids require
 *      trigonometrically precise tiling (e.g. W = S * sqrt(3), H = S) so diagonal seams match seamlessly without
 *      visual drifting or moiré artifacts.
 */
export class GridManager {
  public grids: GridConfig[] = [];
  public showGrid: boolean = true;

  constructor(initialGrids: GridConfig[] = []) {
    this.grids = initialGrids;
  }

  /**
   * Adds a new parametric grid layer.
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

  /**
   * Removes a grid layer by its identifier.
   */
  public removeGrid(id: string): void {
    this.grids = this.grids.filter((g) => g.id !== id);
  }

  /**
   * Finds a grid configuration by its ID.
   */
  public getGrid(id: string): GridConfig | undefined {
    return this.grids.find((g) => g.id === id);
  }

  /**
   * Updates partial properties on a grid layer.
   */
  public updateGrid(id: string, partial: Partial<GridConfig>): void {
    const g = this.getGrid(id);
    if (g) {
      Object.assign(g, partial);
    }
  }

  /**
   * Reorders a grid layer up or down in the rendering stack.
   */
  public reorderGrid(id: string, direction: 'up' | 'down'): void {
    const idx = this.grids.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.grids.length) return;
    const [removed] = this.grids.splice(idx, 1);
    this.grids.splice(targetIdx, 0, removed);
  }

  /**
   * Generates hardware-accelerated SVG pattern definitions and layer rectangles.
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
        const S = Math.max(1, grid.spacing ?? 20);
        tileW = S;
        tileH = S;
        pathD = `M ${tileW} 0 L 0 0 0 ${tileH}`;
      }

      /**
       * ARCHITECTURAL RATIONALE: Fixed Visual Grid Anchoring & Decoupled Cell Center Snapping
       *
       * 1. Grid Line Definition:
       *    Grid lines strictly define the geometric matrix and boundaries of the canvas cells,
       *    originating cleanly at the ruler/viewBox reference point (originX, originY).
       *
       * 2. Elimination of Visual Drift ('corrimiento'):
       *    Previously, shifting the SVG pattern (patX += tileW / 2) physically displaced the rendered
       *    grid lines away from the artboard boundary (0, 0), which broke the visual alignment
       *    with the viewBox and produced visual confusion. The visual grid lines must NEVER shift.
       *
       * 3. Pixel Precision in Vector Construction:
       *    When 'cell-center' alignment is enabled, the visual grid lines remain firmly fixed at cell
       *    boundaries [0, S], [S, 2S]..., while SnappingEngine shifts its magnetic attraction target
       *    to the barycenter of each cell: (originX + (k + 0.5) * S, originY + (m + 0.5) * S).
       *    For a 1px x 1px grid, cell (0, 0) occupies [0, 1] x [0, 1] with its center at (0.5, 0.5).
       *    A 1px vector stroke placed at (0.5, 0.5) renders crisply from 0 to 1 without anti-aliasing blur.
       */
      const patX = originX;
      const patY = originY;

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
}
