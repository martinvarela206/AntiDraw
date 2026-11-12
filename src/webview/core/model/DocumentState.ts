import { Point } from '../geom/Point.js';
import { VectorElement, CanvasSettings } from '../../engine/VectorModel.js';
import { GuideLine } from '../../engine/CanvasManager.js';
import { VectorScene } from './VectorScene.js';

export type NodeId = string;

/**
 * ARCHITECTURAL RATIONALE: Immutable Document State Container (L0 - DocumentState)
 *
 * Inspired by VectorCraft's `Arc<Document>` and structural sharing architecture:
 * 1. Structural Sharing (Zero-Cost Immutability):
 *    Modifications produce a new `DocumentState` instance that shares unmodified object references
 *    with previous states. Only modified elements/collections are cloned.
 *
 * 2. Monotonic Revisions:
 *    Each state transition increments `revision: number`. This enables O(1) identity checking
 *    and instant dirty-state verification (`current.revision === saved.revision`).
 *
 * 3. Decoupled Selection & Metrics:
 *    Selections and pivot anchors reference stable `NodeId` identifiers instead of raw DOM pointers,
 *    preventing dangling references and enabling atomic transactional undo/redo.
 */
export interface DocumentState {
  readonly revision: number;
  readonly canvas: Readonly<CanvasSettings>;
  readonly elements: ReadonlyArray<VectorElement>;
  readonly guides: ReadonlyArray<GuideLine>;
  readonly customPivot: Point | null;
  readonly elementPivots: ReadonlyMap<string, Point>;
  readonly selection: ReadonlySet<string>;
  readonly scene?: VectorScene;
}

export interface DocumentStateInit {
  revision?: number;
  canvas: CanvasSettings;
  elements?: VectorElement[] | ReadonlyArray<VectorElement>;
  guides?: GuideLine[] | ReadonlyArray<GuideLine>;
  customPivot?: Point | null;
  elementPivots?: Map<string, Point> | ReadonlyMap<string, Point> | [string, Point][];
  selection?: Set<string> | ReadonlySet<string> | string[];
  scene?: VectorScene;
}

export class DocumentStateFactory {
  public static create(init: DocumentStateInit): DocumentState {
    const elementPivotsMap: ReadonlyMap<string, Point> =
      init.elementPivots instanceof Map
        ? new Map(init.elementPivots)
        : Array.isArray(init.elementPivots)
        ? new Map(init.elementPivots)
        : new Map();

    const selectionSet: ReadonlySet<string> =
      init.selection instanceof Set
        ? new Set(init.selection)
        : Array.isArray(init.selection)
        ? new Set(init.selection)
        : new Set();

    return Object.freeze({
      revision: init.revision ?? 0,
      canvas: Object.freeze({ ...init.canvas }),
      elements: Object.freeze(
        init.elements
          ? init.elements.map((el) => ({
              ...el,
              attributes: { ...el.attributes },
              vertices: el.vertices
                ? el.vertices.map((v) => ({
                    ...v,
                    handleIn: v.handleIn ? { ...v.handleIn } : undefined,
                    handleOut: v.handleOut ? { ...v.handleOut } : undefined,
                  }))
                : undefined,
            }))
          : []
      ),
      guides: Object.freeze(init.guides ? [...init.guides] : []),
      customPivot: init.customPivot ? { ...init.customPivot } : null,
      elementPivots: elementPivotsMap,
      selection: selectionSet,
      scene: init.scene,
    });
  }

  public static updateElement(
    state: DocumentState,
    elementId: string,
    updater: (el: VectorElement) => VectorElement
  ): DocumentState {
    const idx = state.elements.findIndex((e) => e.id === elementId);
    if (idx === -1) return state;

    const currentEl = state.elements[idx];
    const updatedEl = updater(currentEl);
    if (updatedEl === currentEl) return state;

    const newElements = [...state.elements];
    newElements[idx] = updatedEl;

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      elements: Object.freeze(newElements),
    });
  }

  public static updateElements(
    state: DocumentState,
    elementIds: Set<string> | string[],
    updater: (el: VectorElement) => VectorElement
  ): DocumentState {
    const idSet = elementIds instanceof Set ? elementIds : new Set(elementIds);
    if (idSet.size === 0) return state;

    let hasChanges = false;
    const newElements = state.elements.map((el) => {
      if (idSet.has(el.id)) {
        const updated = updater(el);
        if (updated !== el) {
          hasChanges = true;
          return updated;
        }
      }
      return el;
    });

    if (!hasChanges) return state;

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      elements: Object.freeze(newElements),
    });
  }

  public static addElement(
    state: DocumentState,
    element: VectorElement,
    index?: number
  ): DocumentState {
    const newElements = [...state.elements];
    if (index !== undefined && index >= 0 && index <= newElements.length) {
      newElements.splice(index, 0, element);
    } else {
      newElements.push(element);
    }

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      elements: Object.freeze(newElements),
    });
  }

  public static removeElement(state: DocumentState, elementId: string): DocumentState {
    const idx = state.elements.findIndex((e) => e.id === elementId);
    if (idx === -1) return state;

    const newElements = state.elements.filter((e) => e.id !== elementId);
    let newSelection = state.selection;
    if (state.selection.has(elementId)) {
      const updatedSel = new Set(state.selection);
      updatedSel.delete(elementId);
      newSelection = updatedSel;
    }

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      elements: Object.freeze(newElements),
      selection: newSelection,
    });
  }

  public static removeElements(state: DocumentState, elementIds: Set<string>): DocumentState {
    if (elementIds.size === 0) return state;

    const newElements = state.elements.filter((e) => !elementIds.has(e.id));
    if (newElements.length === state.elements.length) return state;

    const updatedSel = new Set(state.selection);
    for (const id of elementIds) {
      updatedSel.delete(id);
    }

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      elements: Object.freeze(newElements),
      selection: updatedSel,
    });
  }

  public static updateCanvas(
    state: DocumentState,
    canvasUpdate: Partial<CanvasSettings>
  ): DocumentState {
    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      canvas: Object.freeze({ ...state.canvas, ...canvasUpdate }),
    });
  }

  public static updateGuides(state: DocumentState, guides: GuideLine[]): DocumentState {
    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      guides: Object.freeze([...guides]),
    });
  }

  public static updateSelection(
    state: DocumentState,
    selection: Set<string> | string[]
  ): DocumentState {
    const newSelection = selection instanceof Set ? new Set(selection) : new Set(selection);
    return Object.freeze({
      ...state,
      selection: newSelection,
    });
  }

  public static updatePivots(
    state: DocumentState,
    customPivot: Point | null,
    elementPivots: Map<string, Point> | [string, Point][]
  ): DocumentState {
    const newPivots =
      elementPivots instanceof Map ? new Map(elementPivots) : new Map(elementPivots);

    return Object.freeze({
      ...state,
      revision: state.revision + 1,
      customPivot: customPivot ? { ...customPivot } : null,
      elementPivots: newPivots,
    });
  }

  public static isDirty(current: DocumentState, saved: DocumentState): boolean {
    return current !== saved && current.revision !== saved.revision;
  }

  public static freezeElement(el: VectorElement): VectorElement {
    return Object.freeze({
      ...el,
      attributes: Object.freeze({ ...el.attributes }),
      vertices: el.vertices
        ? el.vertices.map((v) =>
            Object.freeze({
              ...v,
              handleIn: v.handleIn ? Object.freeze({ ...v.handleIn }) : undefined,
              handleOut: v.handleOut ? Object.freeze({ ...v.handleOut }) : undefined,
            })
          )
        : undefined,
    }) as VectorElement;
  }

  public static areElementsIdentical(e1: VectorElement, e2: VectorElement): boolean {
    if (e1 === e2) return true;
    if (e1.id !== e2.id || e1.tagName !== e2.tagName || e1.shapeType !== e2.shapeType) return false;
    const k1 = Object.keys(e1.attributes);
    const k2 = Object.keys(e2.attributes);
    if (k1.length !== k2.length) return false;
    for (const k of k1) {
      if (e1.attributes[k] !== e2.attributes[k]) return false;
    }
    const v1Len = e1.vertices?.length || 0;
    const v2Len = e2.vertices?.length || 0;
    if (v1Len !== v2Len) return false;
    if (e1.vertices && e2.vertices) {
      for (let i = 0; i < v1Len; i++) {
        const v1 = e1.vertices[i];
        const v2 = e2.vertices[i];
        if (v1.x !== v2.x || v1.y !== v2.y || v1.command !== v2.command || (v1 as any).nodeType !== (v2 as any).nodeType) return false;
        if (v1.handleIn?.x !== v2.handleIn?.x || v1.handleIn?.y !== v2.handleIn?.y) return false;
        if (v1.handleOut?.x !== v2.handleOut?.x || v1.handleOut?.y !== v2.handleOut?.y) return false;
      }
    }
    return true;
  }

  public static createWithSharing(init: DocumentStateInit, previousState?: DocumentState): DocumentState {
    if (!previousState || !previousState.elements || previousState.elements.length === 0) {
      return DocumentStateFactory.create(init);
    }

    const prevMap = new Map<string, VectorElement>();
    for (const el of previousState.elements) {
      prevMap.set(el.id, el);
    }

    const sharedElements = (init.elements || []).map((el) => {
      const prevEl = prevMap.get(el.id);
      if (prevEl && DocumentStateFactory.areElementsIdentical(prevEl, el)) {
        return prevEl; // Structural sharing: reuse unmodified reference
      }
      return DocumentStateFactory.freezeElement(el);
    });

    const elementPivotsMap: ReadonlyMap<string, Point> =
      init.elementPivots instanceof Map
        ? new Map(init.elementPivots)
        : Array.isArray(init.elementPivots)
        ? new Map(init.elementPivots)
        : new Map();

    const selectionSet: ReadonlySet<string> =
      init.selection instanceof Set
        ? new Set(init.selection)
        : Array.isArray(init.selection)
        ? new Set(init.selection)
        : new Set();

    return Object.freeze({
      revision: init.revision ?? (previousState.revision + 1),
      canvas: Object.freeze({ ...init.canvas }),
      elements: Object.freeze(sharedElements),
      guides: Object.freeze(init.guides ? [...init.guides] : []),
      customPivot: init.customPivot ? { ...init.customPivot } : null,
      elementPivots: elementPivotsMap,
      selection: selectionSet,
      scene: init.scene || previousState.scene,
    });
  }
}
