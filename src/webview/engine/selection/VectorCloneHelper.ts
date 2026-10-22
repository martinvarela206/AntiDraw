import { VectorElement, VectorModel, Point } from '../VectorModel.js';

/**
 * VectorCloneHelper
 *
 * ARCHITECTURAL RATIONALE: Centralized Vector Duplication and Clone Sanitization
 *
 * 1. Single Responsibility Principle (SRP):
 *    Extracts deep cloning, ID regeneration, vertex offset displacement, parametric arc/pie
 *    synchronization, and filter/gradient/marker reference remapping into a shared, decoupled service.
 *
 * 2. Strict ID Synchronization (FIX-19):
 *    Ensures both in-memory `el.id` and serialized SVG `el.attributes.id` receive identical, globally
 *    unique timestamps and random suffixes (`el_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`),
 *    preventing identifier collisions and phantom multi-selection coupling upon file reload.
 *
 * 3. Faithful Parametric and Bézier Recompilation:
 *    Preserves canonical SVG arc commands ('A') for pies, arcs, and donuts, and synchronizes
 *    parametric attributes or Bézier cubic commands ('C') consistently.
 */
export class VectorCloneHelper {
  public static cloneWithOffset(
    srcEl: VectorElement,
    offset: Point,
    model: VectorModel
  ): VectorElement {
    const clone: VectorElement = JSON.parse(JSON.stringify(srcEl));

    if (clone.tagName === 'g' && clone.children && clone.children.length > 0) {
      const newGroupId = `group_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      clone.id = newGroupId;
      clone.attributes.id = newGroupId;
      clone.children = clone.children.map((child) => VectorCloneHelper.cloneWithOffset(child, offset, model));
      return clone;
    }

    const newElId = `el_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    clone.id = newElId;
    clone.attributes.id = newElId;

    if (clone.vertices && clone.vertices.length > 0) {
      clone.vertices.forEach((v) => {
        v.id = `v_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        v.x += offset.x;
        v.y += offset.y;
        if (v.handleIn) {
          v.handleIn.x += offset.x;
          v.handleIn.y += offset.y;
        }
        if (v.handleOut) {
          v.handleOut.x += offset.x;
          v.handleOut.y += offset.y;
        }
      });

      const isClosed = model.isElementClosed(clone);
      const isPieOrArc =
        clone.attributes['data-ellipse-type'] === 'pie' ||
        clone.attributes['data-ellipse-type'] === 'arc';
      const innerRatio = parseFloat(clone.attributes['data-inner-ratio'] || '0');

      if (model.isParametricElement(clone) && (isPieOrArc || innerRatio > 0)) {
        const oldCx = parseFloat(clone.attributes.cx || '0');
        const oldCy = parseFloat(clone.attributes.cy || '0');
        const newCx = Math.round((oldCx + offset.x) * 100) / 100;
        const newCy = Math.round((oldCy + offset.y) * 100) / 100;
        clone.attributes.cx = newCx.toString();
        clone.attributes.cy = newCy.toString();
        const rx = parseFloat(clone.attributes.rx || clone.attributes.r || '1');
        const ry = parseFloat(clone.attributes.ry || clone.attributes.r || '1');
        const type = (clone.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';
        const s = parseFloat(clone.attributes['data-start-angle'] || '0');
        const e = parseFloat(clone.attributes['data-end-angle'] || '360');
        clone.attributes.d = model.compileEllipseD(newCx, newCy, rx, ry, type, s, e, innerRatio);
        if (innerRatio > 0) {
          clone.attributes['fill-rule'] = 'evenodd';
        }
      } else {
        clone.attributes.d = model.compilePathD(clone.vertices, isClosed);
        if (model.isParametricElement(clone)) {
          model.syncParametricAttributes(clone);
        }
      }
    }

    if (clone.attributes.x) clone.attributes.x = (parseFloat(clone.attributes.x) + offset.x).toString();
    if (clone.attributes.y) clone.attributes.y = (parseFloat(clone.attributes.y) + offset.y).toString();
    if (clone.attributes.cx && !clone.vertices) clone.attributes.cx = (parseFloat(clone.attributes.cx) + offset.x).toString();
    if (clone.attributes.cy && !clone.vertices) clone.attributes.cy = (parseFloat(clone.attributes.cy) + offset.y).toString();

    // Rebind filter references to prevent cross-element mutation
    if (clone.attributes['filter'] && clone.attributes['filter'].includes('ad-filter-shadow-')) {
      clone.attributes['filter'] = `url(#ad-filter-shadow-${clone.id})`;
    }

    // Rebind gradient references to prevent cross-element mutation
    if (clone.attributes['fill'] && clone.attributes['fill'].includes('ad-grad-')) {
      clone.attributes['fill'] = `url(#ad-grad-${clone.id})`;
    }

    // Rebind marker references
    ['marker-start', 'marker-mid', 'marker-end'].forEach((attr) => {
      if (clone.attributes[attr] && clone.attributes[attr].includes('ad-marker-')) {
        clone.attributes[attr] = clone.attributes[attr].replace(/(ad-marker-[^)]+)-[a-zA-Z0-9_-]+(\))/, `$1-${clone.id}$2`);
      }
    });

    return clone;
  }
}
