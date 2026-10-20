import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel } from '../VectorModel.js';
import { PolygonUtils } from './PolygonUtils.js';

/**
 * ARCHITECTURAL RATIONALE: Pure Polygonal Boolean Operations Service (PolygonBooleanService)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Isolates constructive area geometry (CAG) based on the Martinez-Rueda clipping algorithm
 *    (polygonClipping: union, intersection, xor/exclude, difference, fragment).
 *
 * 2. Multi-Contour Assembly with EvenOdd Fill Rule:
 *    Combines multiple vector shapes (closed outlines, holes, rings) into a single unified `<path>` element.
 *    Under `fill-rule="evenodd"`, nested or concentric shapes naturally render as holes/cutouts without
 *    requiring destructive clipping.
 *
 * 3. Mandatory Parametric De-Structuring:
 *    When any participating element is a parametric primitive, it is de-structured and converted into
 *    freeform Bézier/linear path vertices (`shapeType: 'path'`, `isParametric: false`).
 */
export class PolygonBooleanService {
  /**
   * Convert a VectorElement into polygon-clipping MultiPolygon representation.
   */
  public static elementToGeom(el: VectorElement): MultiPolygon {
    if (!el.vertices || el.vertices.length < 3) return [];

    // Group vertices by subpaths (each subpath starts with 'M' or index 0)
    const subpaths: PathVertex[][] = [];
    let currentSubpath: PathVertex[] = [];

    for (let i = 0; i < el.vertices.length; i++) {
      const v = el.vertices[i];
      if ((v.command === 'M' || i === 0) && currentSubpath.length > 0) {
        subpaths.push(currentSubpath);
        currentSubpath = [];
      }
      currentSubpath.push(v);
    }
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
    }

    const polygons: Polygon[] = [];

    for (const sp of subpaths) {
      if (sp.length < 3) continue;
      const ring: Ring = [];

      for (let i = 0; i < sp.length; i++) {
        const v = sp[i];
        const nextV = sp[(i + 1) % sp.length];

        ring.push([v.x, v.y]);

        if (v.handleOut || nextV.handleIn) {
          const h1 = v.handleOut || { x: v.x, y: v.y };
          const h2 = nextV.handleIn || { x: nextV.x, y: nextV.y };
          const sampled = PolygonUtils.sampleBezier(v, h1, h2, nextV, 24);
          // sampleBezier ends at nextV; push intermediate points
          for (let j = 0; j < sampled.length - 1; j++) {
            ring.push(sampled[j]);
          }
        }
      }

      // Close ring for polygon-clipping: first point must equal last point
      if (ring.length >= 3) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.001) {
          ring.push([first[0], first[1]]);
        }
        polygons.push([ring]);
      }
    }

    return polygons;
  }

  /**
   * Join (Union / Weld): Combines all selected vector shapes into a single unified outline.
   */
  public static union(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length === 0) return null;
    if (elements.length === 1) return elements[0];

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length === 0) return null;

    const result = polygonClipping.union(geoms[0], ...geoms.slice(1));

    const id = `union_${Date.now().toString(36)}`;
    return PolygonUtils.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  /**
   * Intersect: Retains only the overlapping region between shapes.
   */
  public static intersect(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.intersection(result, geoms[i]);
    }

    const id = `intersect_${Date.now().toString(36)}`;
    return PolygonUtils.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  /**
   * Exclusion (XOR): Retains only non-overlapping regions.
   */
  public static exclude(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.xor(result, geoms[i]);
    }

    const id = `exclude_${Date.now().toString(36)}`;
    return PolygonUtils.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  /**
   * Fragment / Divide: Produces intersection and exclusion shapes simultaneously.
   */
  public static fragment(elements: VectorElement[], model: VectorModel): VectorElement[] | null {
    if (!elements || elements.length < 2) return null;

    const el1 = elements[0];
    const el2 = elements[1];

    const geom1 = this.elementToGeom(el1);
    const geom2 = this.elementToGeom(el2);
    if (geom1.length === 0 || geom2.length === 0) return null;

    const mpIntersect = polygonClipping.intersection(geom1, geom2);
    const mpExclude = polygonClipping.xor(geom1, geom2);

    const idInt = `frag_int_${Date.now().toString(36)}`;
    const idExc = `frag_exc_${Date.now().toString(36)}`;

    const elInt = PolygonUtils.multiPolygonToElement(
      mpIntersect,
      idInt,
      { ...el1.attributes, fill: el1.attributes.fill || '#6366f1' },
      model
    );
    const elExc = PolygonUtils.multiPolygonToElement(
      mpExclude,
      idExc,
      { ...el2.attributes, fill: el2.attributes.fill || '#ec4899' },
      model
    );

    const result: VectorElement[] = [];
    if (elInt) result.push(elInt);
    if (elExc) result.push(elExc);

    return result.length > 0 ? result : null;
  }

  /**
   * Evaluates polygonal difference (fallback for subtract).
   */
  public static difference(
    targetEl: VectorElement,
    cutterEl: VectorElement,
    model: VectorModel
  ): VectorElement | null {
    const cutterGeom = this.elementToGeom(cutterEl);
    const targetGeom = this.elementToGeom(targetEl);

    if (cutterGeom.length === 0 || targetGeom.length === 0) return null;

    const trimmedMp = polygonClipping.difference(targetGeom, cutterGeom);
    const id = `trimmed_${Date.now().toString(36)}`;
    return PolygonUtils.multiPolygonToElement(trimmedMp, id, targetEl.attributes, model);
  }

  /**
   * Compound Path Combination (Combine) with Parametric De-structuring (FIX-07).
   */
  public static combine(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length === 0) return null;
    if (elements.length === 1) {
      if (model.isParametricElement(elements[0])) {
        model.convertToCurves(elements[0]);
      }
      return elements[0];
    }

    const combinedVertices: PathVertex[] = [];

    elements.forEach((el, elIdx) => {
      const verts = el.vertices && el.vertices.length > 0
        ? el.vertices
        : (el.tagName !== 'path' ? model.convertShapeToVertices(el.tagName, el.attributes) : []);
      if (!verts || verts.length === 0) return;

      verts.forEach((v, vIdx) => {
        combinedVertices.push({
          ...v,
          id: `v_comb_${elIdx}_${vIdx}_${Date.now().toString(36)}`,
          command: vIdx === 0 ? 'M' : v.command,
        });
      });
    });

    if (combinedVertices.length === 0) return null;

    const id = `combine_${Date.now().toString(36)}`;
    const d = model.compilePathD(combinedVertices, true);
    const baseAttrs = elements[0].attributes || {};
    const attrs: Record<string, string> = {
      ...baseAttrs,
      id,
      d,
      'fill-rule': 'evenodd',
      'data-node-types': combinedVertices.map((v) => v.nodeType).join(','),
      'data-shape': 'path',
      'data-parametric': 'false',
    };

    const shapeAttrs = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
    shapeAttrs.forEach((attr) => delete attrs[attr]);

    if (attrs['fill'] && attrs['fill'].includes('ad-grad-')) {
      attrs['fill'] = `url(#ad-grad-${id})`;
    }
    if (attrs['filter'] && attrs['filter'].includes('ad-filter-shadow-')) {
      attrs['filter'] = `url(#ad-filter-shadow-${id})`;
    }

    return {
      id,
      tagName: 'path',
      shapeType: 'path',
      isParametric: false,
      attributes: attrs,
      vertices: combinedVertices,
      isClosed: true,
    };
  }
}
