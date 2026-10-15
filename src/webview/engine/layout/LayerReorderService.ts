import { VectorElement } from '../VectorModel.js';

export type ReorderAction = 'front' | 'forward' | 'backward' | 'back';
export type DropPosition = 'above' | 'below' | 'inside';

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
 *
 * 3. Hierarchical Drag & Drop and Group Nesting:
 *    `moveToPosition` handles reordering relative to any target layer ('above' / 'below' in Z-order)
 *    and non-destructive nesting / un-nesting with cycle detection.
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

  /**
   * Reorders or nests an element relative to another element or group in the document hierarchy.
   *
   * @param elements Array of vector elements.
   * @param sourceId ID of the dragged element.
   * @param targetId ID of the target drop zone element.
   * @param position Drop position ('above' | 'below' | 'inside').
   * @returns Updated array of vector elements in their new hierarchy and Z-order.
   */
  public static moveToPosition(
    elements: VectorElement[],
    sourceId: string,
    targetId: string,
    position: DropPosition
  ): VectorElement[] {
    if (sourceId === targetId) return elements;

    // Clone tree deeply enough to preserve immutability
    const cloneTree = (list: VectorElement[]): VectorElement[] =>
      list.map((el) => ({
        ...el,
        attributes: { ...el.attributes },
        children: el.children ? cloneTree(el.children) : undefined,
      }));

    const root = cloneTree(elements);

    // Guard against circular nesting (cannot drop an element into itself or its own descendants)
    const findSource = (list: VectorElement[]): VectorElement | null => {
      for (const el of list) {
        if (el.id === sourceId) return el;
        if (el.children) {
          const found = findSource(el.children);
          if (found) return found;
        }
      }
      return null;
    };

    const sourceRef = findSource(root);
    if (!sourceRef) return elements;

    if (this.containsElement(sourceRef, targetId)) {
      // Target is a descendant of source: invalid drop
      return elements;
    }

    // Extract source element from wherever it resides
    const { element: source } = this.extractElement(root, sourceId);
    if (!source) return elements;

    // Handle 'inside' target (nesting into group or creating group)
    if (position === 'inside') {
      const insertInside = (list: VectorElement[]): boolean => {
        for (const el of list) {
          if (el.id === targetId) {
            if (el.tagName !== 'g') {
              el.tagName = 'g';
            }
            el.children = el.children || [];
            el.children.push(source);
            return true;
          }
          if (el.children && insertInside(el.children)) {
            return true;
          }
        }
        return false;
      };

      if (insertInside(root)) {
        return root;
      }
    }

    // Handle 'above' or 'below' target in Z-order
    // Note: in SVG, index 0 is bottom (below), higher index is top (above).
    const insertRelative = (list: VectorElement[]): boolean => {
      const targetIdx = list.findIndex((e) => e.id === targetId);
      if (targetIdx !== -1) {
        const insertIdx = position === 'above' ? targetIdx + 1 : targetIdx;
        list.splice(insertIdx, 0, source);
        return true;
      }
      for (const el of list) {
        if (el.children && insertRelative(el.children)) {
          return true;
        }
      }
      return false;
    };

    if (insertRelative(root)) {
      return root;
    }

    // Fallback: append to root
    root.push(source);
    return root;
  }

  /**
   * Recursively extracts an element by ID from a tree of VectorElements.
   * Mutates the source list by removing the item and returns the extracted element.
   */
  public static extractElement(
    elements: VectorElement[],
    targetId: string
  ): { element: VectorElement | null; parent: VectorElement | null } {
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].id === targetId) {
        const [extracted] = elements.splice(i, 1);
        return { element: extracted, parent: null };
      }
      if (elements[i].children && elements[i].children.length > 0) {
        const res = this.extractElement(elements[i].children, targetId);
        if (res.element) {
          if (!res.parent) res.parent = elements[i];
          return res;
        }
      }
    }
    return { element: null, parent: null };
  }

  private static containsElement(parent: VectorElement, targetId: string): boolean {
    if (parent.id === targetId) return true;
    if (parent.children) {
      for (const child of parent.children) {
        if (this.containsElement(child, targetId)) return true;
      }
    }
    return false;
  }
}
