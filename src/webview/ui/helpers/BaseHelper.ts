/**
 * ARCHITECTURAL RATIONALE: Universal Scale-Invariant Helper Base Architecture (BaseHelper)
 *
 * 1. The Zoom-Invariance Invariant:
 *    Interactive canvas elements in vector design applications divide into two distinct categories:
 *    - Document Content (Artboard, paths, shapes, text, fills, strokes):
 *      These are world-space elements that MUST scale and zoom proportionally with the camera.
 *    - Helper / Gizmo Visuals (Nodes, control handles, pivot markers, rotation arrows, guidelines, grids, labels):
 *      These are user-interface affordances that MUST NOT scale with the camera.
 *      A node or bounding box handle must remain exactly 6-8 physical screen pixels wide whether the user
 *      is at 5% zoom or 3000% zoom. If handles scale up, they occlude the artwork; if they shrink, they become
 *      invisible and impossible to click.
 *
 * 2. Unified Base Class Architecture:
 *    `BaseHelper` serves as the foundational abstract class from which all visual helpers inherit.
 *    It encapsulates the core mathematical invariant:
 *    - Counter-scaling transform projection: `scale(1 / z)`
 *    - Screen-to-world tolerance conversion: `toWorldRadius(screenPixels, z)`
 *    - Numerical stability guards: Prevents division by zero or NaN under extreme zoom thresholds.
 *
 * 3. Separation of Concerns:
 *    Decouples visual UI representation from vector document data models, ensuring that helper
 *    elements never serialize into the final exported SVG file.
 */
export abstract class BaseHelper {
  public id: string;
  public visible: boolean = true;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Calculates the scale-inversion factor (1 / zoom) with numerical stability guarding
   * against division by zero.
   */
  public static getInverseScale(zoom: number): number {
    return 1 / Math.max(0.0001, zoom || 1.0);
  }

  /**
   * Converts a fixed physical screen pixel radius into world SVG distance at the current zoom level.
   * Essential for hit-testing, proximity snapping, and pointer capture thresholds.
   */
  public static toWorldRadius(screenPixels: number, zoom: number): number {
    return screenPixels / Math.max(0.0001, zoom || 1.0);
  }

  /**
   * Converts world SVG distance into physical screen pixels at the current zoom level.
   */
  public static toScreenPixels(worldUnits: number, zoom: number): number {
    return worldUnits * (zoom || 1.0);
  }

  /**
   * Generates a scale-invariant SVG transform attribute string anchored at (x, y).
   * Applies `translate(x, y) scale(1 / z)` with optional additional rotations or offsets.
   */
  public static getScaleInvariantTransform(
    x: number,
    y: number,
    zoom: number,
    extraTransform: string = ''
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    const extra = extraTransform ? ` ${extraTransform}` : '';
    return `transform="translate(${x}, ${y}) scale(${inv})${extra}"`;
  }

  /**
   * Renders the scale-invariant visual SVG or canvas representation.
   */
  public abstract render(zoom: number, ...args: unknown[]): string | void;
}
