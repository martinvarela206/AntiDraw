import { MultiPolygon } from 'polygon-clipping';
import { VectorElement, VectorModel } from './VectorModel.js';
import { ElementAligner, AlignmentType, ElementBoundingBox } from './layout/ElementAligner.js';
import { LayerReorderService, ReorderAction } from './layout/LayerReorderService.js';
import { StrokeOutlineGenerator } from './boolean/StrokeOutlineGenerator.js';
import { PolygonBooleanService } from './boolean/PolygonBooleanService.js';
import { BezierCurveTrimmer, TrimResult } from './boolean/BezierCurveTrimmer.js';

export {
  ElementAligner,
  AlignmentType,
  ElementBoundingBox,
  LayerReorderService,
  ReorderAction,
  StrokeOutlineGenerator,
  PolygonBooleanService,
  BezierCurveTrimmer,
  TrimResult,
};

/**
 * ARCHITECTURAL RATIONALE: Constructive Area Geometry & Boolean Coordinator (BooleanOperations)
 *
 * Serves as the primary public facade for constructive vector geometry, path combining,
 * outline stroke synthesis, layer ordering, and alignment.
 * Preserves 100% of the public API and delegates internal computational workloads to
 * specialized modular subsystems adhering to SRP:
 * - PolygonBooleanService: union, intersect, exclude, fragment, combine, difference.
 * - BezierCurveTrimmer: analytical non-destructive cubic Bézier curve clipping (subtract).
 * - StrokeOutlineGenerator: stroke-to-path extrusion, marker geometry, and join mitering.
 * - ElementAligner: axis alignment and distribution.
 * - LayerReorderService: SVG document tree Z-ordering.
 */
export class BooleanOperations {
  /**
   * Converts a vector element to a polygon-clipping MultiPolygon.
   */
  public static elementToGeom(el: VectorElement): MultiPolygon {
    return PolygonBooleanService.elementToGeom(el);
  }

  /**
   * Combines multiple vector shapes into a single unified outline (Union).
   * Employs analytical Bézier curve preservation for minimal node count.
   */
  public static union(elements: VectorElement[], model: VectorModel): VectorElement | null {
    return BezierCurveTrimmer.union(elements, model);
  }

  /**
   * Subtracts (trims) the target shape with the cutter shape(s).
   * Supports 2 or more elements with analytical Bézier curve preservation.
   */
  public static subtract(elements: VectorElement[], model: VectorModel): TrimResult | null {
    return BezierCurveTrimmer.subtract(elements, model);
  }

  /**
   * Retains only the overlapping region between vector shapes (Intersection).
   * Employs analytical Bézier curve preservation for minimal node count.
   */
  public static intersect(elements: VectorElement[], model: VectorModel): VectorElement | null {
    return BezierCurveTrimmer.intersect(elements, model);
  }

  /**
   * Retains only non-overlapping regions between vector shapes (Exclusion / XOR).
   * Employs analytical Bézier curve preservation.
   */
  public static exclude(elements: VectorElement[], model: VectorModel): VectorElement | null {
    return BezierCurveTrimmer.exclude(elements, model);
  }

  /**
   * Produces intersection and exclusion shapes simultaneously (Fragment / Divide).
   */
  public static fragment(elements: VectorElement[], model: VectorModel): VectorElement[] | null {
    return PolygonBooleanService.fragment(elements, model);
  }

  /**
   * Combines multiple shapes into a compound path with evenodd fill rule.
   */
  public static combine(elements: VectorElement[], model: VectorModel): VectorElement | null {
    return PolygonBooleanService.combine(elements, model);
  }

  /**
   * Computes the axis-aligned bounding box of a vector element.
   */
  public static getElementBox(el: VectorElement): ElementBoundingBox | null {
    return ElementAligner.getElementBox(el);
  }

  /**
   * Aligns vector elements along a specified spatial axis.
   */
  public static alignElements(
    elements: VectorElement[],
    type: AlignmentType,
    canvasWidth: number,
    canvasHeight: number
  ): VectorElement[] {
    return ElementAligner.alignElements(elements, type, canvasWidth, canvasHeight);
  }

  /**
   * Reorders an element within the document Z-stack.
   */
  public static reorder(
    elements: VectorElement[],
    targetId: string,
    action: ReorderAction
  ): VectorElement[] {
    return LayerReorderService.reorder(elements, targetId, action);
  }

  /**
   * Converts a stroked path to a filled outline path.
   */
  public static outlineStroke(element: VectorElement, model: VectorModel): VectorElement | null {
    return StrokeOutlineGenerator.outlineStroke(element, model);
  }

  /**
   * Converts a stroked path and its markers into independent outline vector elements.
   */
  public static outlineStrokeElements(element: VectorElement, model: VectorModel): VectorElement[] {
    return StrokeOutlineGenerator.outlineStrokeElements(element, model);
  }
}
