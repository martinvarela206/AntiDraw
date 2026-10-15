import { Point } from '../../core/geom/Point.js';
import { VectorElement } from '../VectorModel.js';
import { GuideLine, GuideManager } from '../canvas/GuideManager.js';

export interface ViewBoxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ARCHITECTURAL RATIONALE: Contextual Vector & Ephemeral Guide Conversion Service (ContextElementService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates bidirectional conversions between finite vector geometry and ephemeral contextual
 *    guidelines, and between infinite guidelines and ViewBox-clipped standard vectors.
 *
 * 2. Non-Destructive Vector-to-Context Transition:
 *    When a standard vector element is converted into a contextual guide:
 *    - It adopts the universal cyan dashed guideline styling (`stroke="#00f0ff"`, `stroke-dasharray="4 2"`,
 *      `vector-effect="non-scaling-stroke"`, `fill="none"`).
 *    - Its original stroke, fill, stroke-width, dasharray, opacity, and vector-effect attributes are preserved
 *      in private `data-orig-*` metadata keys.
 *    - It is marked with `data-contextual="true"`.
 *    - Upon desconversion ("Desconvertir a Vector Ordinario"), 100% of its original appearance is restored.
 *
 * 3. Analytical ViewBox Infinite Line Clipping (Liang-Barsky):
 *    When an infinite guide line is converted to an ordinary vector:
 *    - Parameterized ray P(t) = P0 + t*(cos, sin) is clipped against the canvas ViewBox rectangle.
 *    - Intersections tMin and tMax define exact endpoints (x1, y1) and (x2, y2).
 *    - Synthesizes a native <line> primitive with sharp node endpoints, fully selectable and exportable.
 *
 * 4. Freezing with "Bloquear Guías":
 *    Contextual elements are solidarily frozen whenever guide locking (`lockGuides`) is active.
 *    Hit-testing ignores them, preventing accidental drags, transforms, or node mutations.
 */
export class ContextElementService {
  public static readonly CONTEXTUAL_ATTR = 'data-contextual';
  public static readonly GUIDE_STROKE = '#00f0ff';
  public static readonly GUIDE_DASH = '4 2';

  /**
   * Checks whether the given element is marked as contextual.
   */
  public static isContextElement(element: VectorElement): boolean {
    return element.attributes?.[this.CONTEXTUAL_ATTR] === 'true';
  }

  /**
   * Converts a standard vector element into an ephemeral contextual guide element.
   * Preserves original appearance attributes under `data-orig-*` for reversibility.
   */
  public static convertToContextElement(element: VectorElement): boolean {
    if (!element.attributes) element.attributes = {};

    // Backup original visual attributes
    element.attributes['data-orig-stroke'] = element.attributes.stroke || '';
    element.attributes['data-orig-fill'] = element.attributes.fill || '';
    element.attributes['data-orig-stroke-width'] = element.attributes['stroke-width'] || '';
    element.attributes['data-orig-stroke-dasharray'] = element.attributes['stroke-dasharray'] || '';
    element.attributes['data-orig-opacity'] = element.attributes.opacity || '';
    element.attributes['data-orig-vector-effect'] = element.attributes['vector-effect'] || '';

    // Apply ephemeral guide styling
    element.attributes.stroke = this.GUIDE_STROKE;
    element.attributes.fill = 'none';
    element.attributes['stroke-width'] = '1';
    element.attributes['stroke-dasharray'] = this.GUIDE_DASH;
    element.attributes['vector-effect'] = 'non-scaling-stroke';
    element.attributes.opacity = '0.85';
    element.attributes[this.CONTEXTUAL_ATTR] = 'true';

    // If container group, apply recursively to children
    if (element.children && element.children.length > 0) {
      for (const child of element.children) {
        this.convertToContextElement(child);
      }
    }

    return true;
  }

  /**
   * Reverts an ephemeral contextual element back into a standard vector element,
   * restoring original visual properties and removing contextual metadata.
   */
  public static convertToOrdinaryVector(element: VectorElement): boolean {
    if (!element.attributes) return false;

    // Restore original properties or fallback to clean defaults
    if (element.attributes['data-orig-stroke']) {
      element.attributes.stroke = element.attributes['data-orig-stroke'];
    } else {
      element.attributes.stroke = '#000000';
    }

    if (element.attributes['data-orig-fill']) {
      element.attributes.fill = element.attributes['data-orig-fill'];
    } else {
      element.attributes.fill = 'none';
    }

    if (element.attributes['data-orig-stroke-width']) {
      element.attributes['stroke-width'] = element.attributes['data-orig-stroke-width'];
    } else {
      element.attributes['stroke-width'] = '1';
    }

    if (element.attributes['data-orig-stroke-dasharray']) {
      element.attributes['stroke-dasharray'] = element.attributes['data-orig-stroke-dasharray'];
    } else {
      delete element.attributes['stroke-dasharray'];
    }

    if (element.attributes['data-orig-opacity']) {
      element.attributes.opacity = element.attributes['data-orig-opacity'];
    } else {
      delete element.attributes.opacity;
    }

    if (element.attributes['data-orig-vector-effect']) {
      element.attributes['vector-effect'] = element.attributes['data-orig-vector-effect'];
    } else {
      delete element.attributes['vector-effect'];
    }

    // Purge backup metadata keys and contextual marker
    delete element.attributes['data-orig-stroke'];
    delete element.attributes['data-orig-fill'];
    delete element.attributes['data-orig-stroke-width'];
    delete element.attributes['data-orig-stroke-dasharray'];
    delete element.attributes['data-orig-opacity'];
    delete element.attributes['data-orig-vector-effect'];
    delete element.attributes[this.CONTEXTUAL_ATTR];

    // If container group, revert children recursively
    if (element.children && element.children.length > 0) {
      for (const child of element.children) {
        this.convertToOrdinaryVector(child);
      }
    }

    return true;
  }

  /**
   * Converts an infinite guide line into a standard vector element (<line>)
   * clipped analytically to the canvas ViewBox rectangle.
   */
  public static convertGuideToVector(
    guide: GuideLine,
    viewBox: ViewBoxBounds
  ): VectorElement | null {
    const rad = ((guide.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rect = {
      minX: viewBox.x,
      minY: viewBox.y,
      maxX: viewBox.x + viewBox.width,
      maxY: viewBox.y + viewBox.height,
    };

    const isHoriz = guide.orientation === 'horizontal';
    const isVert = guide.orientation === 'vertical';

    const p0: Point = {
      x: isVert ? guide.position : (guide.pivotX ?? viewBox.x + viewBox.width / 2),
      y: isHoriz ? guide.position : (guide.pivotY ?? viewBox.y + viewBox.height / 2),
    };

    const clipped = GuideManager.clipInfiniteLineToRect(p0, cos, sin, rect);
    if (!clipped) {
      return null; // Guide line does not cross ViewBox
    }

    const x1 = Number((p0.x + clipped.tMin * cos).toFixed(3));
    const y1 = Number((p0.y + clipped.tMin * sin).toFixed(3));
    const x2 = Number((p0.x + clipped.tMax * cos).toFixed(3));
    const y2 = Number((p0.y + clipped.tMax * sin).toFixed(3));

    const id = `line_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const vectorElement: VectorElement = {
      id,
      tagName: 'line',
      attributes: {
        id,
        x1: x1.toString(),
        y1: y1.toString(),
        x2: x2.toString(),
        y2: y2.toString(),
        stroke: '#000000',
        'stroke-width': '1',
        fill: 'none',
      },
      vertices: [
        { id: `v1_${id}`, x: x1, y: y1, command: 'M', nodeType: 'sharp' },
        { id: `v2_${id}`, x: x2, y: y2, command: 'L', nodeType: 'sharp' },
      ],
      isClosed: false,
      isParametric: true,
      shapeType: 'line',
    };

    return vectorElement;
  }
}
