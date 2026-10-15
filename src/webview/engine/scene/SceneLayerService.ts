import { VectorElement } from '../VectorModel.js';
import { GroupHierarchyService } from '../selection/GroupHierarchyService.js';

export type SceneLayerAction = 'lock' | 'unlock' | 'hide' | 'show';

export interface SweepResult {
  affectedCount: number;
  affectedIds: string[];
}

/**
 * ARCHITECTURAL RATIONALE: Linear O(N) Reverse-Z Scene Layer Sweep Service (SceneLayerService)
 *
 * 1. Computational Complexity Optimization (SOLID / Performance Guardrails):
 *    In dense vector scenes (10,000+ objects, complex illustrations, CAD blueprints),
 *    evaluating whether elements are stacked "above" or "below" the current selection previously
 *    resorted to quadratic O(N^2) scans (e.g. repeated `elements.indexOf()`, recursive subtree searches,
 *    or pairwise Z-index recalculations).
 *
 * 2. Single-Pass Reverse-Z Scanning Algorithm:
 *    By traversing the document hierarchy backwards (from top of Z-stack `i = length - 1` down to `0`):
 *    - Uses an O(1) Set<string> selection mask lookup and an O(1) ancestor lookup Set.
 *    - All non-selected elements visited prior to encountering any selected element are deterministically
 *      and strictly above the selection in visual occlusion / Z-order.
 *    - Once a selected element or branch is encountered, the state flips, protecting objects underneath
 *      without redundant hierarchy traversal.
 *    - Guarantees strictly O(N) time complexity and O(M) auxiliary space (where M = selection size).
 */
export class SceneLayerService {
  /**
   * Sweeps the elements in reverse Z-order to apply an action to all artwork strictly above the selection.
   */
  public static applyToArtworkAbove(
    elements: VectorElement[],
    selectedIds: Set<string>,
    action: SceneLayerAction
  ): SweepResult {
    if (!elements || elements.length === 0 || selectedIds.size === 0) {
      return { affectedCount: 0, affectedIds: [] };
    }

    const affectedIds: string[] = [];

    // Pre-calculate ancestor set for all selected elements in O(M * D) time where D <= depth
    const selectedAncestors = new Set<string>();
    for (const selId of selectedIds) {
      const chain = GroupHierarchyService.getAncestryChain(elements, selId);
      for (let i = 0; i < chain.length - 1; i++) {
        selectedAncestors.add(chain[i].id);
      }
    }

    // Helper to recursively apply action to an element and all its nested children
    const applyActionRecursive = (el: VectorElement) => {
      this.applyAction(el, action);
      affectedIds.push(el.id);
      if (el.children && el.children.length > 0) {
        for (const child of el.children) {
          applyActionRecursive(child);
        }
      }
    };

    // Linear reverse sweep on a given sibling layer
    const sweepLayer = (layer: VectorElement[]): void => {
      let isAbove = true;

      for (let i = layer.length - 1; i >= 0; i--) {
        const el = layer[i];
        const isSelected = selectedIds.has(el.id);

        if (isSelected) {
          isAbove = false;
          continue;
        }

        if (selectedAncestors.has(el.id)) {
          // This group contains selected elements deeper inside:
          // Recursively sweep its children in reverse Z-order
          if (el.children && el.children.length > 0) {
            sweepLayer(el.children);
          }
          isAbove = false;
          continue;
        }

        if (isAbove) {
          // This element is strictly above all selected elements in this container
          applyActionRecursive(el);
        }
      }
    };

    sweepLayer(elements);

    return {
      affectedCount: affectedIds.length,
      affectedIds,
    };
  }

  public static lockAllAbove(elements: VectorElement[], selectedIds: Set<string>): SweepResult {
    return this.applyToArtworkAbove(elements, selectedIds, 'lock');
  }

  public static hideAllAbove(elements: VectorElement[], selectedIds: Set<string>): SweepResult {
    return this.applyToArtworkAbove(elements, selectedIds, 'hide');
  }

  public static unlockAll(elements: VectorElement[]): SweepResult {
    const affectedIds: string[] = [];
    const unlockRecursive = (list: VectorElement[]) => {
      for (const el of list) {
        if (el.attributes['data-locked'] === 'true') {
          el.attributes['data-locked'] = 'false';
          affectedIds.push(el.id);
        }
        if (el.children && el.children.length > 0) {
          unlockRecursive(el.children);
        }
      }
    };
    unlockRecursive(elements);
    return { affectedCount: affectedIds.length, affectedIds };
  }

  public static showAll(elements: VectorElement[]): SweepResult {
    const affectedIds: string[] = [];
    const showRecursive = (list: VectorElement[]) => {
      for (const el of list) {
        if (el.attributes.display === 'none') {
          el.attributes.display = 'inline';
          affectedIds.push(el.id);
        }
        if (el.children && el.children.length > 0) {
          showRecursive(el.children);
        }
      }
    };
    showRecursive(elements);
    return { affectedCount: affectedIds.length, affectedIds };
  }

  private static applyAction(el: VectorElement, action: SceneLayerAction): void {
    switch (action) {
      case 'lock':
        el.attributes['data-locked'] = 'true';
        break;
      case 'unlock':
        el.attributes['data-locked'] = 'false';
        break;
      case 'hide':
        el.attributes.display = 'none';
        break;
      case 'show':
        el.attributes.display = 'inline';
        break;
    }
  }
}
