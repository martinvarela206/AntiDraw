/**
 * ARCHITECTURAL RATIONALE: Transactional State Patches (RFC 6902 / Immer-style Diffing)
 * Capa L0: DocumentPatch
 *
 * Direct parity with VectorCraft's transactional command & patch log:
 * 1. Structural Sharing (Zero Full-Tree Clones):
 *    Avoids deep-cloning thousands of unmodified vector nodes during frequent
 *    user interactions, drag previews, and continuous command executions.
 *
 * 2. Bi-directional Patches (Forward / Inverse):
 *    Every state mutation computes minimal RFC 6902 JSON-patch operations along with
 *    their exact inverse patches, enabling instant micro-undo/redo without storing
 *    redundant full-canvas snapshots.
 *
 * 3. Atomic Transactions:
 *    Transactions bundle related patches under a unique `txId`, allowing composite
 *    commands (e.g., boolean cut + re-color + move) to commit or roll back atomically.
 */

import { DocumentState, DocumentStateFactory } from './DocumentState.js';
import { VectorElement } from '../../engine/VectorModel.js';
import { GuideLine } from '../../engine/CanvasManager.js';

export type PatchOp = 'add' | 'remove' | 'replace';

export interface PatchOperation {
  op: PatchOp;
  path: string; // e.g. '/elements/el_1', '/elements/el_1/attributes/fill', '/canvas/viewBox', '/guides'
  value?: any;
  oldValue?: any;
}

export interface TransactionalPatch {
  readonly txId: string;
  readonly description: string;
  readonly timestamp: number;
  readonly forward: ReadonlyArray<PatchOperation>;
  readonly inverse: ReadonlyArray<PatchOperation>;
}

export class DocumentPatchEngine {
  /**
   * Computes the forward and inverse patches between two DocumentStates.
   */
  public static createDiff(
    prevState: DocumentState,
    nextState: DocumentState,
    description: string = 'Document Mutation'
  ): TransactionalPatch {
    const forward: PatchOperation[] = [];
    const inverse: PatchOperation[] = [];

    // 1. Canvas Settings Diff
    if (prevState.canvas !== nextState.canvas) {
      const prevCanvas = prevState.canvas;
      const nextCanvas = nextState.canvas;
      if (prevCanvas.width !== nextCanvas.width) {
        forward.push({ op: 'replace', path: '/canvas/width', value: nextCanvas.width, oldValue: prevCanvas.width });
        inverse.push({ op: 'replace', path: '/canvas/width', value: prevCanvas.width, oldValue: nextCanvas.width });
      }
      if (prevCanvas.height !== nextCanvas.height) {
        forward.push({ op: 'replace', path: '/canvas/height', value: nextCanvas.height, oldValue: prevCanvas.height });
        inverse.push({ op: 'replace', path: '/canvas/height', value: prevCanvas.height, oldValue: nextCanvas.height });
      }
      if (prevCanvas.viewBox !== nextCanvas.viewBox) {
        forward.push({ op: 'replace', path: '/canvas/viewBox', value: nextCanvas.viewBox, oldValue: prevCanvas.viewBox });
        inverse.push({ op: 'replace', path: '/canvas/viewBox', value: prevCanvas.viewBox, oldValue: nextCanvas.viewBox });
      }
      if (prevCanvas.backgroundColor !== nextCanvas.backgroundColor) {
        forward.push({ op: 'replace', path: '/canvas/backgroundColor', value: nextCanvas.backgroundColor, oldValue: prevCanvas.backgroundColor });
        inverse.push({ op: 'replace', path: '/canvas/backgroundColor', value: prevCanvas.backgroundColor, oldValue: nextCanvas.backgroundColor });
      }
    }

    // 2. Elements Diff (Structural diffing by ID)
    if (prevState.elements !== nextState.elements) {
      const prevMap = new Map<string, { el: VectorElement; idx: number }>();
      prevState.elements.forEach((el, idx) => prevMap.set(el.id, { el, idx }));

      const nextMap = new Map<string, { el: VectorElement; idx: number }>();
      nextState.elements.forEach((el, idx) => nextMap.set(el.id, { el, idx }));

      // Check additions & replacements
      for (const nextEl of nextState.elements) {
        const prevEntry = prevMap.get(nextEl.id);
        if (!prevEntry) {
          // Added element
          forward.push({ op: 'add', path: `/elements/${nextEl.id}`, value: nextEl });
          inverse.push({ op: 'remove', path: `/elements/${nextEl.id}`, oldValue: nextEl });
        } else if (prevEntry.el !== nextEl) {
          // Modified element (reference differed)
          if (!DocumentStateFactory.areElementsIdentical(prevEntry.el, nextEl)) {
            forward.push({ op: 'replace', path: `/elements/${nextEl.id}`, value: nextEl, oldValue: prevEntry.el });
            inverse.push({ op: 'replace', path: `/elements/${nextEl.id}`, value: prevEntry.el, oldValue: nextEl });
          }
        }
      }

      // Check deletions
      for (const prevEl of prevState.elements) {
        if (!nextMap.has(prevEl.id)) {
          forward.push({ op: 'remove', path: `/elements/${prevEl.id}`, oldValue: prevEl });
          inverse.push({ op: 'add', path: `/elements/${prevEl.id}`, value: prevEl });
        }
      }
    }

    // 3. Guides Diff
    if (prevState.guides !== nextState.guides) {
      const prevGuidesJson = JSON.stringify(prevState.guides);
      const nextGuidesJson = JSON.stringify(nextState.guides);
      if (prevGuidesJson !== nextGuidesJson) {
        forward.push({ op: 'replace', path: '/guides', value: nextState.guides, oldValue: prevState.guides });
        inverse.push({ op: 'replace', path: '/guides', value: prevState.guides, oldValue: nextState.guides });
      }
    }

    const txId = `tx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      txId,
      description,
      timestamp: Date.now(),
      forward: Object.freeze(forward),
      inverse: Object.freeze(inverse),
    };
  }

  /**
   * Applies patch operations to a DocumentState producing a new immutable DocumentState.
   * Leverages structural sharing: untouched elements retain identical references.
   */
  public static applyPatches(
    baseState: DocumentState,
    patches: ReadonlyArray<PatchOperation>
  ): DocumentState {
    if (!patches || patches.length === 0) {
      return baseState;
    }

    let nextCanvas = { ...baseState.canvas };
    let elementsMap = new Map<string, VectorElement>();
    baseState.elements.forEach((el) => elementsMap.set(el.id, el));
    let nextGuides = [...baseState.guides];
    let hasElementChanges = false;
    let hasCanvasChanges = false;
    let hasGuideChanges = false;

    for (const patch of patches) {
      const path = patch.path;

      if (path.startsWith('/canvas/')) {
        const prop = path.substring('/canvas/'.length);
        (nextCanvas as any)[prop] = patch.value;
        hasCanvasChanges = true;
      } else if (path.startsWith('/elements/')) {
        const rest = path.substring('/elements/'.length);
        const slashIdx = rest.indexOf('/');
        const elementId = slashIdx === -1 ? rest : rest.substring(0, slashIdx);

        if (patch.op === 'add') {
          elementsMap.set(elementId, patch.value);
          hasElementChanges = true;
        } else if (patch.op === 'remove') {
          elementsMap.delete(elementId);
          hasElementChanges = true;
        } else if (patch.op === 'replace') {
          if (slashIdx === -1) {
            elementsMap.set(elementId, patch.value);
            hasElementChanges = true;
          } else {
            const currentEl = elementsMap.get(elementId);
            if (currentEl) {
              const subPath = rest.substring(slashIdx + 1);
              if (subPath.startsWith('attributes/')) {
                const attrKey = subPath.substring('attributes/'.length);
                const updatedEl: VectorElement = {
                  ...currentEl,
                  attributes: { ...currentEl.attributes, [attrKey]: patch.value },
                };
                elementsMap.set(elementId, updatedEl);
                hasElementChanges = true;
              }
            }
          }
        }
      } else if (path === '/guides') {
        nextGuides = patch.value ? [...patch.value] : [];
        hasGuideChanges = true;
      }
    }

    const finalElements = hasElementChanges
      ? Array.from(elementsMap.values())
      : baseState.elements;

    return Object.freeze({
      revision: baseState.revision + 1,
      canvas: hasCanvasChanges ? Object.freeze(nextCanvas) : baseState.canvas,
      elements: hasElementChanges ? Object.freeze(finalElements) : baseState.elements,
      guides: hasGuideChanges ? Object.freeze(nextGuides) : baseState.guides,
      customPivot: baseState.customPivot,
      elementPivots: baseState.elementPivots,
      selection: baseState.selection,
      scene: baseState.scene,
    });
  }

  /**
   * Inverts a TransactionalPatch so undo becomes redo.
   */
  public static invert(tx: TransactionalPatch): TransactionalPatch {
    return {
      txId: `inv_${tx.txId}`,
      description: `Undo: ${tx.description}`,
      timestamp: Date.now(),
      forward: tx.inverse,
      inverse: tx.forward,
    };
  }
}
