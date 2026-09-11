import { VectorElement } from '../VectorModel.js';

export type ReorderAction = 'front' | 'forward' | 'backward' | 'back';

/**
 * ARCHITECTURAL RATIONALE: Dedicated Layer Reordering Service (LayerReorderService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Z-Index and SVG document tree node order manipulation is a document structure management
 *    responsibility. Isolating it from BooleanOperations simplifies maintainability and allows
 *    layer ordering to be reused across future layer panels, context menus, and keyboard commands.
 *
 * 2. Predictable Bounds Clamping:
 *    - 'forward' clamps index at list.length to avoid out-of-range insertions.
 *    - 'backward' clamps index at 0 to avoid negative indexing.
 *    - 'front' / 'back' use push / unshift respectively to guarantee terminal stack position.
 */
export class LayerReorderService {
  /**
   * Reorders an element within the document elements array.
   *
   * @param elements Current array of vector elements.
   * @param targetId ID of the element being moved.
   * @param action Reorder direction ('front', 'forward', 'backward', 'back').
   * @returns Updated array of vector elements in their new Z-order.
   */
  public static reorder(
    elements: VectorElement[],
    targetId: string,
    action: ReorderAction
  ): VectorElement[] {
    const index = elements.findIndex((e) => e.id === targetId);
    if (index === -1) return elements;

    const list = [...elements];
    const [target] = list.splice(index, 1);

    if (action === 'front') {
      list.push(target);
    } else if (action === 'back') {
      list.unshift(target);
    } else if (action === 'forward') {
      const newIdx = Math.min(index + 1, list.length);
      list.splice(newIdx, 0, target);
    } else if (action === 'backward') {
      const newIdx = Math.max(index - 1, 0);
      list.splice(newIdx, 0, target);
    }

    return list;
  }
}
