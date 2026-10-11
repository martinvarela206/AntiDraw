import polygonClipping, { MultiPolygon } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel } from '../VectorModel.js';
import { ElementBoundingBox } from '../layout/ElementAligner.js';
import { PolygonBooleanService } from './PolygonBooleanService.js';

export type BooleanOperationType = 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine' | 'fragment';

export interface BooleanPreflightResult {
  /**
   * Whether the operation is structurally valid and can proceed.
   */
  canExecute: boolean;

  /**
   * Parametric primitives that will undergo geometric mutation and MUST be converted to <path>.
   * Requires explicit user approval via modal before execution.
   */
  affectedPrimitives: VectorElement[];

  /**
   * Parametric primitives that participate in selection but will NOT experience any geometric
   * modification (e.g. outside the cutting zone, completely disjoint).
   * MUST remain canonical pure primitives (<rect>, <circle>, <ellipse>, etc.).
   */
  unmodifiedPrimitives: VectorElement[];

  /**
   * Diagnostic reason or cancellation notice if the operation cannot or should not execute.
   */
  reason?: string;

  /**
   * Elements that are actually involved in the constructive CAG computation.
   */
  activeElements: VectorElement[];
}

/**
 * ARCHITECTURAL RATIONALE: Constructive Area Geometry Preflight Evaluator (BooleanPreflightService)
 *
 * Requirements Reference:
 * - FEAT-01 / FEAT-02: Strict SVG Native Primitive Preservation (<rect>, <circle>, <ellipse>, <line>, etc.).
 * - FEAT-09: Explicit Designer Consent via ConfirmationModal prior to destructive Bézier de-structuring.
 *
 * Responsibilities:
 * 1. Non-destructive spatial collision audit:
 *    Performs fast AABB (axis-aligned bounding box) screening followed by exact polygon clipping
 *    intersection tests without altering the in-memory DocumentState or mutating element tagNames.
 * 2. Exact Mutation Differentiation:
 *    Accurately classifies selected primitives into:
 *    - `affectedPrimitives`: Shapes whose topology or outline will be trimmed, merged or carved.
 *    - `unmodifiedPrimitives`: Shapes that remain 100% physically intact. These shapes MUST NOT be
 *      degraded to <path> and must keep their native W3C SVG tags and parametric inspector metadata.
 */
export class BooleanPreflightService {
  /**
   * Extracts or computes vertices for any VectorElement (primitive or path) without mutating it.
   */
  public static getElementVertices(el: VectorElement, model: VectorModel): PathVertex[] {
    if (el.vertices && el.vertices.length > 0) {
      return el.vertices;
    }
    if (el.tagName !== 'path') {
      const computed = model.convertShapeToVertices(el.shapeType || el.tagName, el.attributes || {});
      if (computed && computed.length > 0) {
        return computed;
      }
    }
    return [];
  }

  /**
   * Calculates the bounding box of any vector element without side effects.
   */
  public static getElementBoundingBox(el: VectorElement, model: VectorModel): ElementBoundingBox | null {
    const verts = this.getElementVertices(el, model);
    if (verts.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
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
   * Fast AABB overlap detection.
   */
  public static doBoxesOverlap(b1: ElementBoundingBox, b2: ElementBoundingBox): boolean {
    return !(b1.maxX < b2.minX || b1.minX > b2.maxX || b1.maxY < b2.minY || b1.minY > b2.maxY);
  }

  /**
   * Computes polygon-clipping geometry representation for any element without modifying its state.
   */
  public static getElementGeometry(el: VectorElement, model: VectorModel): MultiPolygon {
    if (el.vertices && el.vertices.length >= 3) {
      return PolygonBooleanService.elementToGeom(el);
    }
    const verts = this.getElementVertices(el, model);
    if (verts.length < 3) return [];

    // Synthesize a non-destructive temporary descriptor
    const virtualEl: VectorElement = {
      ...el,
      vertices: verts,
    };
    return PolygonBooleanService.elementToGeom(virtualEl);
  }

  /**
   * Determines if two vector elements geometrically overlap/intersect in 2D space.
   */
  public static doElementsOverlap(el1: VectorElement, el2: VectorElement, model: VectorModel): boolean {
    const b1 = this.getElementBoundingBox(el1, model);
    const b2 = this.getElementBoundingBox(el2, model);
    if (!b1 || !b2) return false;

    // Fast reject
    if (!this.doBoxesOverlap(b1, b2)) return false;

    // Exact topological intersection test
    const geom1 = this.getElementGeometry(el1, model);
    const geom2 = this.getElementGeometry(el2, model);
    if (geom1.length === 0 || geom2.length === 0) return false;

    try {
      const intersection = polygonClipping.intersection(geom1, geom2);
      return intersection.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Preflight analysis of a constructive boolean operation.
   *
   * @param elements Array of selected VectorElements participating in the action
   * @param op Boolean operation type
   * @param model Active VectorModel
   */
  public static analyze(
    elements: VectorElement[],
    op: BooleanOperationType,
    model: VectorModel
  ): BooleanPreflightResult {
    if (!elements || elements.length < 2) {
      return {
        canExecute: false,
        affectedPrimitives: [],
        unmodifiedPrimitives: [],
        reason: 'Se requieren al menos dos elementos para una operación booleana.',
        activeElements: [],
      };
    }

    const parametricElements = elements.filter((el) => model.isParametricElement(el));

    // If there are zero parametric primitives, no modal confirmation is needed
    if (parametricElements.length === 0) {
      return {
        canExecute: true,
        affectedPrimitives: [],
        unmodifiedPrimitives: [],
        activeElements: elements,
      };
    }

    const affectedSet = new Set<string>();
    const unmodifiedSet = new Set<string>();

    switch (op) {
      case 'subtract': {
        /**
         * Subtract semantics in AntiDraw (BezierCurveTrimmer.subtract):
         * elements[N-1] (last selected) is the target shape being trimmed.
         * elements[0..N-2] are cutters that trim the target.
         * Target is trimmed by cutters; cutters themselves are not destroyed or modified in subtract().
         */
        const target = elements[elements.length - 1];
        const cutters = elements.slice(0, elements.length - 1);

        let targetOverlapsWithAnyCutter = false;
        for (const cutter of cutters) {
          if (this.doElementsOverlap(target, cutter, model)) {
            targetOverlapsWithAnyCutter = true;
            break;
          }
        }

        if (model.isParametricElement(target)) {
          if (targetOverlapsWithAnyCutter) {
            affectedSet.add(target.id);
          } else {
            unmodifiedSet.add(target.id);
          }
        }

        // Cutters are not modified by subtract
        cutters.forEach((cutter) => {
          if (model.isParametricElement(cutter)) {
            unmodifiedSet.add(cutter.id);
          }
        });
        break;
      }

      case 'intersect': {
        /**
         * Intersect retains only the common overlapping area.
         * If shapes do not overlap, result is empty.
         * Any primitive contributing to a non-empty intersection is restructured into the intersection path.
         */
        let anyOverlap = false;
        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            if (this.doElementsOverlap(elements[i], elements[j], model)) {
              anyOverlap = true;
              break;
            }
          }
          if (anyOverlap) break;
        }

        if (!anyOverlap) {
          // Disjoint: no modification should take place
          parametricElements.forEach((p) => unmodifiedSet.add(p.id));
          return {
            canExecute: false,
            affectedPrimitives: [],
            unmodifiedPrimitives: parametricElements,
            reason: 'Las figuras seleccionadas no se intersecan entre sí.',
            activeElements: elements,
          };
        }

        parametricElements.forEach((p) => affectedSet.add(p.id));
        break;
      }

      case 'union':
      case 'exclude':
      case 'fragment': {
        /**
         * Union / Exclude / Fragment:
         * Check pairwise collision among elements.
         * If a primitive does not collide with ANY other element in the selection:
         * - In union: it stays isolated as its own unmodified shape.
         * - In exclude/fragment: disjoint shapes have nothing to exclude/split.
         */
        const collidingIds = new Set<string>();

        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            if (this.doElementsOverlap(elements[i], elements[j], model)) {
              collidingIds.add(elements[i].id);
              collidingIds.add(elements[j].id);
            }
          }
        }

        parametricElements.forEach((p) => {
          if (collidingIds.has(p.id)) {
            affectedSet.add(p.id);
          } else {
            unmodifiedSet.add(p.id);
          }
        });
        break;
      }

      case 'combine': {
        /**
         * Compound Path (Combine):
         * Explicitly merges multiple shapes into a single unified compound <path> with evenodd rule.
         * All participating parametric shapes are de-structured into sub-paths of the compound path.
         */
        parametricElements.forEach((p) => affectedSet.add(p.id));
        break;
      }
    }

    const affectedPrimitives = parametricElements.filter((p) => affectedSet.has(p.id));
    const unmodifiedPrimitives = parametricElements.filter((p) => unmodifiedSet.has(p.id));

    return {
      canExecute: true,
      affectedPrimitives,
      unmodifiedPrimitives,
      activeElements: elements,
    };
  }
}
