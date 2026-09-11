import { VectorElement } from '../VectorModel.js';

export interface ElementBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Element Aligner Service (ElementAligner)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Alignment of vector elements is a layout coordination concern, completely separate from
 *    constructive area geometry (boolean operations). Extracting alignment from BooleanOperations.ts
 *    decouples spatial layout logic from polygon clipping and Bézier intersection pipelines.
 *
 * 2. Pivot Selection Mechanics:
 *    - Single Element: Aligns against the active Canvas boundary (viewBox bounds 0 to width/height).
 *    - Multiple Elements: Uses the first selected element (elements[0]) as the stationary pivot/anchor,
 *      ensuring deterministic alignment without shifting the entire user selection unpredictably.
 *
 * 3. Bézier Control Point Preservation:
 *    When translating vertices by (dx, dy), both handleIn and handleOut control vectors must be translated
 *    by the exact same delta to preserve the shape curvature without distortion.
 */
export class ElementAligner {
  /**
   * Computes the axis-aligned bounding box and centroid of an element based on its path vertices.
   */
  public static getElementBox(el: VectorElement): ElementBoundingBox | null {
    if (!el.vertices || el.vertices.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < el.vertices.length; i++) {
      const v = el.vertices[i];
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2,
    };
  }

  /**
   * Aligns vector elements along a specified geometric axis.
   *
   * @param elements Array of elements to align.
   * @param type Alignment axis ('left', 'center', 'right', 'top', 'middle', 'bottom').
   * @param canvasWidth Current canvas/viewBox width for single element alignment.
   * @param canvasHeight Current canvas/viewBox height for single element alignment.
   * @returns Cloned array of elements with updated vertex positions.
   */
  public static alignElements(
    elements: VectorElement[],
    type: AlignmentType,
    canvasWidth: number,
    canvasHeight: number
  ): VectorElement[] {
    if (!elements || elements.length === 0) return elements;

    let targetX: number | null = null;
    let targetY: number | null = null;

    if (elements.length === 1) {
      // 1 vector selected: Align relative to Canvas
      if (type === 'left') targetX = 0;
      else if (type === 'center') targetX = canvasWidth / 2;
      else if (type === 'right') targetX = canvasWidth;
      else if (type === 'top') targetY = 0;
      else if (type === 'middle') targetY = canvasHeight / 2;
      else if (type === 'bottom') targetY = canvasHeight;
    } else {
      // Multiple vectors selected: Pivot is the first selected vector (elements[0])
      const pivotBox = this.getElementBox(elements[0]);
      if (pivotBox) {
        if (type === 'left') targetX = pivotBox.minX;
        else if (type === 'center') targetX = pivotBox.cx;
        else if (type === 'right') targetX = pivotBox.maxX;
        else if (type === 'top') targetY = pivotBox.minY;
        else if (type === 'middle') targetY = pivotBox.cy;
        else if (type === 'bottom') targetY = pivotBox.maxY;
      }
    }

    return elements.map((el, index) => {
      // For multi-selection, the pivot element (first selected) remains in place
      if (elements.length > 1 && index === 0) {
        return el;
      }

      if (!el.vertices || el.vertices.length === 0) return el;
      const box = this.getElementBox(el);
      if (!box) return el;

      let dx = 0;
      let dy = 0;

      if (targetX !== null) {
        if (type === 'left') dx = targetX - box.minX;
        else if (type === 'center') dx = targetX - box.cx;
        else if (type === 'right') dx = targetX - box.maxX;
      }

      if (targetY !== null) {
        if (type === 'top') dy = targetY - box.minY;
        else if (type === 'middle') dy = targetY - box.cy;
        else if (type === 'bottom') dy = targetY - box.maxY;
      }

      const newVertices = el.vertices.map((v) => ({
        ...v,
        x: v.x + dx,
        y: v.y + dy,
        handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
        handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
      }));

      return { ...el, vertices: newVertices };
    });
  }
}
