import { VectorElement } from '../VectorModel.js';

/**
 * ARCHITECTURAL RATIONALE: Hierarchical Group Navigation & Drill-Down Service (GroupHierarchyService)
 *
 * 1. Industry-Standard Group Navigation Protocol (Illustrator / Figma / CorelDraw):
 *    - Single click on canvas: selects the root group ancestor, treating grouped shapes as a cohesive unit.
 *    - Double click on a selected group: drills down one level into the hierarchy, selecting the clicked child.
 *    - Repeated double clicks: continues drilling down step-by-step until reaching the innermost leaf vector.
 *    - Escape key: ascends one level in the hierarchy (from child to parent group), deselecting when reaching the root.
 *    - Shift + Click: additive multi-selection restricted to the current drill-down level, preventing inadvertent
 *      selection or toggling of ancestor groups.
 *
 * 2. Pure Functional Ancestry Computation:
 *    Avoids circular references and state divergence by computing element chains dynamically from the immutable
 *    document tree.
 */
export class GroupHierarchyService {
  /**
   * Computes the linear ancestry chain of an element from root to leaf:
   * e.g. [rootGroup, subGroup, ..., targetElement]
   */
  public static getAncestryChain(elements: VectorElement[], targetId: string): VectorElement[] {
    const chain: VectorElement[] = [];

    const search = (list: VectorElement[]): boolean => {
      for (const el of list) {
        chain.push(el);
        if (el.id === targetId) {
          return true;
        }
        if (el.children && el.children.length > 0) {
          if (search(el.children)) {
            return true;
          }
        }
        chain.pop();
      }
      return false;
    };

    search(elements);
    return chain;
  }

  /**
   * Resolves the target element ID to select on single click based on the active drill-down context.
   */
  public static resolveSelection(
    elements: VectorElement[],
    hitElementId: string,
    activeContextId: string | null
  ): { targetId: string; nextContextId: string | null } {
    const chain = this.getAncestryChain(elements, hitElementId);
    if (chain.length <= 1) {
      return { targetId: hitElementId, nextContextId: null };
    }

    if (!activeContextId) {
      // No active drill-down: select root ancestor
      return { targetId: chain[0].id, nextContextId: null };
    }

    // Active drill-down context exists: check if hit element is within this context
    const contextIdx = chain.findIndex((el) => el.id === activeContextId);
    if (contextIdx !== -1 && contextIdx < chain.length - 1) {
      // Clicked inside active context: select immediate child at the next level
      return { targetId: chain[contextIdx + 1].id, nextContextId: activeContextId };
    }

    // Clicked outside active drill-down context: reset context and select root ancestor of clicked item
    return { targetId: chain[0].id, nextContextId: null };
  }

  /**
   * Ascends one level in the hierarchy upon Escape.
   */
  public static ascend(
    elements: VectorElement[],
    currentSelectedId: string | null
  ): { nextSelectedId: string | null; nextContextId: string | null; handled: boolean } {
    if (!currentSelectedId) {
      return { nextSelectedId: null, nextContextId: null, handled: false };
    }

    const chain = this.getAncestryChain(elements, currentSelectedId);
    if (chain.length <= 1) {
      // Already at root: deselect all
      return { nextSelectedId: null, nextContextId: null, handled: true };
    }

    // Ascend to immediate parent
    const parent = chain[chain.length - 2];
    const grandparent = chain.length >= 3 ? chain[chain.length - 3] : null;

    return {
      nextSelectedId: parent.id,
      nextContextId: grandparent ? grandparent.id : null,
      handled: true,
    };
  }

  /**
   * Drills down one level into a group upon double click.
   */
  public static drillDown(
    elements: VectorElement[],
    currentSelectedId: string,
    hitTargetId?: string
  ): { nextSelectedId: string | null; nextContextId: string | null; isLeaf: boolean } {
    const chain = this.getAncestryChain(elements, hitTargetId || currentSelectedId);
    const selectedIdx = chain.findIndex((el) => el.id === currentSelectedId);

    if (selectedIdx !== -1 && selectedIdx < chain.length - 1) {
      // Can drill down to next child in chain
      const nextChild = chain[selectedIdx + 1];
      const isLeaf = nextChild.tagName !== 'g' && (!nextChild.children || nextChild.children.length === 0);
      return {
        nextSelectedId: nextChild.id,
        nextContextId: currentSelectedId,
        isLeaf,
      };
    }

    // Check if currentSelected is a group with children
    const el = chain[chain.length - 1];
    if (el && el.tagName === 'g' && el.children && el.children.length > 0) {
      const child = el.children[0];
      const isLeaf = child.tagName !== 'g' && (!child.children || child.children.length === 0);
      return {
        nextSelectedId: child.id,
        nextContextId: el.id,
        isLeaf,
      };
    }

    // Leaf element reached
    return {
      nextSelectedId: currentSelectedId,
      nextContextId: null,
      isLeaf: true,
    };
  }

  /**
   * Resolves additive selection (Shift + Click), blocking ancestor selection.
   */
  public static resolveAdditiveSelection(
    elements: VectorElement[],
    hitElementId: string,
    activeContextId: string | null
  ): string {
    const chain = this.getAncestryChain(elements, hitElementId);
    if (chain.length <= 1) {
      return hitElementId;
    }

    if (!activeContextId) {
      return chain[0].id;
    }

    const contextIdx = chain.findIndex((el) => el.id === activeContextId);
    if (contextIdx !== -1 && contextIdx < chain.length - 1) {
      return chain[contextIdx + 1].id;
    }

    return chain[0].id;
  }

  /**
   * Recursively collects all descendant leaf vector elements contained within an element or group.
   * If the element is a leaf itself, returns [element].
   */
  public static collectLeafElements(element: VectorElement): VectorElement[] {
    if (element.tagName === 'g' && element.children && element.children.length > 0) {
      const leaves: VectorElement[] = [];
      for (const child of element.children) {
        leaves.push(...this.collectLeafElements(child));
      }
      return leaves;
    }
    return [element];
  }

  /**
   * Recursively collects all descendant leaf vector elements for an array of elements or groups.
   */
  public static collectAllLeafElements(elements: VectorElement[]): VectorElement[] {
    const leaves: VectorElement[] = [];
    for (const el of elements) {
      leaves.push(...this.collectLeafElements(el));
    }
    return leaves;
  }

  /**
   * Finds the immediate parent container, parent list, and index of a target element in the element tree.
   */
  public static findParent(
    elements: VectorElement[],
    targetId: string
  ): { parent: VectorElement | null; list: VectorElement[]; index: number } | null {
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].id === targetId) {
        return { parent: null, list: elements, index: i };
      }
    }

    const search = (
      parent: VectorElement,
      list: VectorElement[]
    ): { parent: VectorElement; list: VectorElement[]; index: number } | null => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === targetId) {
          return { parent, list, index: i };
        }
        if (list[i].tagName === 'g' && list[i].children && list[i].children!.length > 0) {
          const res = search(list[i], list[i].children!);
          if (res) return res;
        }
      }
      return null;
    };

    for (const el of elements) {
      if (el.tagName === 'g' && el.children && el.children.length > 0) {
        const res = search(el, el.children);
        if (res) return res;
      }
    }

    return null;
  }
}
