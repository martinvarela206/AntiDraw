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
export type AlignmentTarget = 'selection' | 'key_object' | 'canvas';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Element Aligner Service (ElementAligner)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Alignment of vector elements is a layout coordination concern, completely separate from
 *    constructive area geometry (boolean operations). Extracting alignment from BooleanOperations.ts
 *    decouples spatial layout logic from polygon clipping and Bézier intersection pipelines.
 *
 * 2. Multi-Target Alignment Mechanics (Illustrator/Figma/Inkscape Parity):
 *    - 'selection': Collective AABB of all selected elements serves as boundary/center.
 *      Elements translate towards collective min/center/max without altering the selection envelope.
 *    - 'key_object': The designated key object (or first selected) remains 100% stationary.
 *      All other selected elements align to its boundary/center.
 *    - 'canvas': Elements align directly to active artboard/canvas bounds (0 to canvasWidth/Height).
 *    - Single Element: Naturally aligns relative to Canvas (or artboard).
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
   * Computes the collective bounding box enclosing an array of elements.
   */
  public static getCollectiveBoundingBox(elements: VectorElement[]): ElementBoundingBox | null {
    if (!elements || elements.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidBox = false;

    for (const el of elements) {
      const b = this.getElementBox(el);
      if (b) {
        hasValidBox = true;
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      }
    }

    if (!hasValidBox) return null;

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
   * Aligns vector elements along a specified geometric axis according to the chosen alignment target.
   *
   * @param elements Array of elements to align.
   * @param type Alignment axis ('left', 'center', 'right', 'top', 'middle', 'bottom').
   * @param canvasWidth Current canvas/viewBox width for canvas alignment.
   * @param canvasHeight Current canvas/viewBox height for canvas alignment.
   * @param target Alignment reference target ('selection' | 'key_object' | 'canvas'). Defaults to 'selection'.
   * @param keyObjectId Optional ID of the designated key object when target is 'key_object'.
   * @returns Cloned array of elements with updated vertex positions.
   */
  public static alignElements(
    elements: VectorElement[],
    type: AlignmentType,
    canvasWidth: number,
    canvasHeight: number,
    target: AlignmentTarget = 'selection',
    keyObjectId?: string | null
  ): VectorElement[] {
    if (!elements || elements.length === 0) return elements;

    // Single vector selected: Align relative to Canvas
    if (elements.length === 1 || target === 'canvas') {
      let targetX: number | null = null;
      let targetY: number | null = null;

      if (type === 'left') targetX = 0;
      else if (type === 'center') targetX = canvasWidth / 2;
      else if (type === 'right') targetX = canvasWidth;
      else if (type === 'top') targetY = 0;
      else if (type === 'middle') targetY = canvasHeight / 2;
      else if (type === 'bottom') targetY = canvasHeight;

      return elements.map((el) => {
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

        return this.translateElement(el, dx, dy);
      });
    }

    if (target === 'key_object') {
      // Find key element: designated by keyObjectId or fallback to elements[0]
      const keyIndex = keyObjectId
        ? elements.findIndex((e) => e.id === keyObjectId)
        : 0;
      const validKeyIndex = keyIndex >= 0 ? keyIndex : 0;
      const keyElement = elements[validKeyIndex];
      const keyBox = this.getElementBox(keyElement);

      if (!keyBox) return elements;

      let targetX: number | null = null;
      let targetY: number | null = null;

      if (type === 'left') targetX = keyBox.minX;
      else if (type === 'center') targetX = keyBox.cx;
      else if (type === 'right') targetX = keyBox.maxX;
      else if (type === 'top') targetY = keyBox.minY;
      else if (type === 'middle') targetY = keyBox.cy;
      else if (type === 'bottom') targetY = keyBox.maxY;

      return elements.map((el, index) => {
        // The key object remains completely stationary
        if (index === validKeyIndex) return el;

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

        return this.translateElement(el, dx, dy);
      });
    }

    // Default: target === 'selection' (collective bounding box)
    const collectiveBox = this.getCollectiveBoundingBox(elements);
    if (!collectiveBox) return elements;

    let targetX: number | null = null;
    let targetY: number | null = null;

    if (type === 'left') targetX = collectiveBox.minX;
    else if (type === 'center') targetX = collectiveBox.cx;
    else if (type === 'right') targetX = collectiveBox.maxX;
    else if (type === 'top') targetY = collectiveBox.minY;
    else if (type === 'middle') targetY = collectiveBox.cy;
    else if (type === 'bottom') targetY = collectiveBox.maxY;

    return elements.map((el) => {
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

      return this.translateElement(el, dx, dy);
    });
  }

  private static translateElement(el: VectorElement, dx: number, dy: number): VectorElement {
    if (dx === 0 && dy === 0) return el;
    const newVertices = (el.vertices || []).map((v) => ({
      ...v,
      x: v.x + dx,
      y: v.y + dy,
      handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
      handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
    }));

    return { ...el, vertices: newVertices };
  }
}
