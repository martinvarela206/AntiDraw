import polygonClipping, { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';
import { VectorElement, PathVertex, VectorModel } from './VectorModel.js';

export interface TrimResult {
  trimmed: VectorElement;
  targetId: string;
  cutterId: string;
}

export class BooleanOperations {
  // Sample a cubic Bezier curve into line segments
  private static sampleBezier(
    p1: { x: number; y: number },
    h1: { x: number; y: number },
    h2: { x: number; y: number },
    p2: { x: number; y: number },
    steps: number = 24
  ): Pair[] {
    const pts: Pair[] = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const inv = 1 - t;
      const x =
        inv * inv * inv * p1.x +
        3 * inv * inv * t * h1.x +
        3 * inv * t * t * h2.x +
        t * t * t * p2.x;
      const y =
        inv * inv * inv * p1.y +
        3 * inv * inv * t * h1.y +
        3 * inv * t * t * h2.y +
        t * t * t * p2.y;
      pts.push([x, y]);
    }
    return pts;
  }

  // Convert a VectorElement into polygon-clipping MultiPolygon
  private static elementToGeom(el: VectorElement): MultiPolygon {
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
          const sampled = this.sampleBezier(v, h1, h2, nextV, 24);
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

  // Convert a MultiPolygon back into a VectorElement with vertices and SVG path d
  private static multiPolygonToElement(
    mp: MultiPolygon,
    id: string,
    baseAttrs: Record<string, string>,
    model: VectorModel
  ): VectorElement | null {
    if (!mp || mp.length === 0) return null;

    const vertices: PathVertex[] = [];

    mp.forEach((polygon) => {
      polygon.forEach((ring) => {
        if (ring.length < 3) return;

        // Simplify consecutive duplicate points
        const cleanRing: Pair[] = [];
        for (let i = 0; i < ring.length; i++) {
          const pt = ring[i];
          if (
            cleanRing.length === 0 ||
            Math.hypot(pt[0] - cleanRing[cleanRing.length - 1][0], pt[1] - cleanRing[cleanRing.length - 1][1]) > 0.05
          ) {
            cleanRing.push(pt);
          }
        }

        // Drop the closing duplicate point for path vertices
        if (cleanRing.length >= 3) {
          const first = cleanRing[0];
          const last = cleanRing[cleanRing.length - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) {
            cleanRing.pop();
          }
        }

        if (cleanRing.length < 3) return;

        cleanRing.forEach((pt, idx) => {
          vertices.push({
            id: `v_${Date.now().toString(36)}_${vertices.length}`,
            x: Math.round(pt[0] * 100) / 100,
            y: Math.round(pt[1] * 100) / 100,
            command: idx === 0 ? 'M' : 'L',
            nodeType: 'asymmetric',
          });
        });
      });
    });

    if (vertices.length === 0) return null;

    const d = model.compilePathD(vertices, true);
    return {
      id,
      tagName: 'path',
      attributes: {
        ...baseAttrs,
        id,
        d,
        'fill-rule': 'evenodd',
        'data-node-types': vertices.map((v) => v.nodeType).join(','),
      },
      vertices,
      isClosed: true,
    };
  }

  // Join (Union / Weld): Combines all selected vector shapes into a single unified outline
  public static union(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length === 0) return null;
    if (elements.length === 1) return elements[0];

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length === 0) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.union(result, geoms[i]);
    }

    const id = `union_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  // Minus (Trim / Resta): The first selected vector (cutter) trims the last selected vector (target).
  // Cutter is retained in document, target is replaced with trimmed shape.
  public static subtract(elements: VectorElement[], model: VectorModel): TrimResult | null {
    if (!elements || elements.length < 2) return null;

    const cutterEl = elements[0];
    const targetEl = elements[elements.length - 1];

    const cutterGeom = this.elementToGeom(cutterEl);
    const targetGeom = this.elementToGeom(targetEl);

    if (cutterGeom.length === 0 || targetGeom.length === 0) return null;

    const trimmedMp = polygonClipping.difference(targetGeom, cutterGeom);
    const id = `trimmed_${Date.now().toString(36)}`;
    const trimmedEl = this.multiPolygonToElement(trimmedMp, id, targetEl.attributes, model);
    if (!trimmedEl) return null;

    return {
      trimmed: trimmedEl,
      targetId: targetEl.id,
      cutterId: cutterEl.id,
    };
  }

  // Intersect: Retains only the overlapping region between shapes
  public static intersect(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.intersection(result, geoms[i]);
    }

    const id = `intersect_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  // Exclusion (XOR): Retains only non-overlapping regions
  public static exclude(elements: VectorElement[], model: VectorModel): VectorElement | null {
    if (!elements || elements.length < 2) return null;

    const geoms: MultiPolygon[] = elements.map((el) => this.elementToGeom(el)).filter((g) => g.length > 0);
    if (geoms.length < 2) return null;

    let result = geoms[0];
    for (let i = 1; i < geoms.length; i++) {
      result = polygonClipping.xor(result, geoms[i]);
    }

    const id = `exclude_${Date.now().toString(36)}`;
    return this.multiPolygonToElement(result, id, elements[0].attributes, model);
  }

  // Fragment / Divide: Produces intersection and exclusion shapes simultaneously
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

    const elInt = this.multiPolygonToElement(
      mpIntersect,
      idInt,
      { ...el1.attributes, fill: el1.attributes.fill || '#6366f1' },
      model
    );
    const elExc = this.multiPolygonToElement(
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

  // Helper to get element bounding box
  private static getElementBox(
    el: VectorElement
  ): { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number } | null {
    if (!el.vertices || el.vertices.length === 0) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    el.vertices.forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2,
    };
  }

  // Align elements: left, center, right, top, middle, bottom
  public static alignElements(
    elements: VectorElement[],
    type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    canvasWidth: number,
    canvasHeight: number
  ): VectorElement[] {
    if (!elements || elements.length === 0) return elements;

    let targetX: number | null = null;
    let targetY: number | null = null;

    if (elements.length === 1) {
      // 1 vector selected: Align relative to Canvas
      if (type === 'left') targetX = 0;
      else if (type === 'center') targetX = canvasWidth / 2;
      else if (type === 'right') targetX = canvasWidth;
      else if (type === 'top') targetY = 0;
      else if (type === 'middle') targetY = canvasHeight / 2;
      else if (type === 'bottom') targetY = canvasHeight;
    } else {
      // Multiple vectors selected: Pivot is the first selected vector (elements[0])
      const pivotBox = this.getElementBox(elements[0]);
      if (pivotBox) {
        if (type === 'left') targetX = pivotBox.minX;
        else if (type === 'center') targetX = pivotBox.cx;
        else if (type === 'right') targetX = pivotBox.maxX;
        else if (type === 'top') targetY = pivotBox.minY;
        else if (type === 'middle') targetY = pivotBox.cy;
        else if (type === 'bottom') targetY = pivotBox.maxY;
      }
    }

    return elements.map((el, index) => {
      // For multi-selection, the pivot element (first selected) remains in place
      if (elements.length > 1 && index === 0) {
        return el;
      }

      if (!el.vertices || el.vertices.length === 0) return el;
      const box = this.getElementBox(el);
      if (!box) return el;

      let dx = 0;
      let dy = 0;

      if (targetX !== null) {
        if (type === 'left') dx = targetX - box.minX;
        else if (type === 'center') dx = targetX - box.cx;
        else if (type === 'right') dx = targetX - box.maxX;
      }

      if (targetY !== null) {
        if (type === 'top') dy = targetY - box.minY;
        else if (type === 'middle') dy = targetY - box.cy;
        else if (type === 'bottom') dy = targetY - box.maxY;
      }

      const newVertices = el.vertices.map((v) => ({
        ...v,
        x: v.x + dx,
        y: v.y + dy,
        handleIn: v.handleIn ? { x: v.handleIn.x + dx, y: v.handleIn.y + dy } : undefined,
        handleOut: v.handleOut ? { x: v.handleOut.x + dx, y: v.handleOut.y + dy } : undefined,
      }));

      return { ...el, vertices: newVertices };
    });
  }

  // Z-Order re-ordering
  public static reorder(
    elements: VectorElement[],
    targetId: string,
    action: 'front' | 'forward' | 'backward' | 'back'
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
