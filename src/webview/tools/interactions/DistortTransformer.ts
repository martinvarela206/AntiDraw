import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/SelectionTool.js';
import { ProjectiveHomography, QuadCorners } from '../../engine/geometry/ProjectiveHomography.js';

export interface DistortInitResult {
  initialBox: BoundingBox;
  initialQuad: QuadCorners;
  initialElementsMap: Map<string, PathVertex[]>;
  initialAttributesMap: Map<string, Record<string, string>>;
  ghostTransformMap: Map<string, PathVertex[]>;
}

export interface DistortComputeResult {
  ghostMap: Map<string, PathVertex[]>;
  quad: QuadCorners;
  snappedPt: Point | null;
  homography: ProjectiveHomography | null;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Free Distort Handler (DistortTransformer)
 *
 * 1. Industrial Parity (Free Transform Tool / CorelDraw / Illustrator / Figma):
 *    Free Distort allows independent manipulation of the 4 bounding corners of a vector
 *    selection, projecting the planar vector geometry through an arbitrary convex quadrilateral.
 *    Midpoint handles also remain interactive to allow concurrent directional shearing (skew).
 *
 * 2. Closed-Form Projective Homography Integration:
 *    Decomposes the quadrilateral displacement into canonical Heckbert projective matrices (PGL(3, R)).
 *    All interior anchor vertices and Bézier direction handles (handleIn, handleOut) are projected
 *    analytically, preserving C1 tangent continuity and smooth curvature without piecewise segmentation.
 *
 * 3. Magnetic Snapping on Deformation Nodes:
 *    Corner handles calculate real-time magnetic snapping against guidelines, canvas grid, viewbox
 *    edges, and unselected anchor vertices via ctx.snapPoint.
 *
 * 4. Rigid Parametric Primitives Conversion on Commit:
 *    Rigid SVG primitives (<rect>, <circle>, <ellipse>) enforce orthogonal geometric attributes.
 *    Upon committing a projective distortion, rigid primitives are cleanly converted to freeform
 *    Bézier paths (convertToCurves) so non-orthogonal geometry is faithfully preserved.
 *
 * 5. Reversible Base Geometry Persistence (data-distort-base):
 *    Before applying the first projective or skew distortion, pristine original vertex coordinates
 *    are recorded in el.attributes['data-distort-base'] (persisted to companion JSON metadata per Rule 18).
 *    This enables full, lossless geometric restoration via 'Restaurar Esquinas' or 'Restaurar Cizalla'.
 */
export class DistortTransformer {
  /**
   * Initializes Free Distort interaction state and caches pristine vertex topology.
   */
  public static initDistort(
    groupBox: BoundingBox,
    selectedEls: VectorElement[]
  ): DistortInitResult {
    const initialBox: BoundingBox = { ...groupBox };
    const initialQuad: QuadCorners = {
      nw: { x: groupBox.x, y: groupBox.y },
      ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
      se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
      sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
    };

    const initialElementsMap = new Map<string, PathVertex[]>();
    const initialAttributesMap = new Map<string, Record<string, string>>();
    const ghostTransformMap = new Map<string, PathVertex[]>();

    selectedEls.forEach((el) => {
      initialAttributesMap.set(el.id, { ...el.attributes });
      if (el.vertices) {
        const vertsCopy = el.vertices.map((v) => ({
          ...v,
          handleIn: v.handleIn ? { ...v.handleIn } : undefined,
          handleOut: v.handleOut ? { ...v.handleOut } : undefined,
        }));
        initialElementsMap.set(el.id, vertsCopy);
        ghostTransformMap.set(
          el.id,
          vertsCopy.map((v) => ({
            ...v,
            handleIn: v.handleIn ? { ...v.handleIn } : undefined,
            handleOut: v.handleOut ? { ...v.handleOut } : undefined,
          }))
        );
      }
    });

    return {
      initialBox,
      initialQuad,
      initialElementsMap,
      initialAttributesMap,
      ghostTransformMap,
    };
  }

  /**
   * Computes real-time projective distortion when dragging a corner handle.
   */
  public static computeCornerDistort(
    ctx: ToolContext,
    pt: Point,
    activeHandle: string,
    initialBox: BoundingBox,
    currentQuad: QuadCorners,
    initialElementsMap: Map<string, PathVertex[]>
  ): DistortComputeResult {
    const cornerKey = activeHandle.replace('distort-', '') as keyof QuadCorners;
    if (!['nw', 'ne', 'se', 'sw'].includes(cornerKey)) {
      return {
        ghostMap: new Map(),
        quad: currentQuad,
        snappedPt: null,
        homography: null,
      };
    }

    // Magnetic Snapping against guidelines, grid, canvas borders, and other elements
    const otherVertices = ctx.getOtherVertices(Array.from(ctx.selectionTool.selectedElementIds));
    const targetPt: Point = { x: pt.x, y: pt.y };
    const snappedPt = ctx.snapPoint(targetPt, otherVertices);

    const candidateQuad: QuadCorners = {
      nw: { ...currentQuad.nw },
      ne: { ...currentQuad.ne },
      se: { ...currentQuad.se },
      sw: { ...currentQuad.sw },
    };
    candidateQuad[cornerKey] = { x: snappedPt.x, y: snappedPt.y };

    // Numerical stability safeguard: reject non-convex or self-intersecting quads
    if (!ProjectiveHomography.isConvex(candidateQuad)) {
      return {
        ghostMap: new Map(),
        quad: currentQuad,
        snappedPt,
        homography: null,
      };
    }

    const homography = ProjectiveHomography.fromBoxToQuad(initialBox, candidateQuad);
    const ghostMap = new Map<string, PathVertex[]>();

    initialElementsMap.forEach((verts, id) => {
      ghostMap.set(id, homography.projectVertices(verts));
    });

    return {
      ghostMap,
      quad: candidateQuad,
      snappedPt,
      homography,
    };
  }

  /**
   * Commits the projected distortion to selected elements, converting parametric
   * primitives to freeform paths and archiving base geometry for lossless restoration.
   */
  public static applyDistortCommit(
    ctx: ToolContext,
    ghostMap: Map<string, PathVertex[]>,
    selectedEls: VectorElement[],
    initialBox: BoundingBox
  ): void {
    if (ghostMap.size === 0) return;

    ctx.pushUndo();

    selectedEls.forEach((el) => {
      // 1. Preserve pristine pre-distort vertices in companion metadata before first deformation
      if (!el.attributes['data-distort-base'] && el.vertices) {
        const baseSnapshot = {
          box: { ...initialBox },
          vertices: el.vertices.map((v) => ({
            ...v,
            handleIn: v.handleIn ? { ...v.handleIn } : undefined,
            handleOut: v.handleOut ? { ...v.handleOut } : undefined,
          })),
        };
        el.attributes['data-distort-base'] = JSON.stringify(baseSnapshot);
      }

      // 2. Convert parametric primitives to Bézier curves so distorted geometry is valid SVG
      if (ctx.model.isParametricElement(el)) {
        ctx.model.convertToCurves(el);
      }

      // 3. Assign deformed vertices from ghost map
      const deformedVerts = ghostMap.get(el.id);
      if (deformedVerts && deformedVerts.length > 0) {
        el.vertices = deformedVerts.map((v) => ({
          ...v,
          handleIn: v.handleIn ? { ...v.handleIn } : undefined,
          handleOut: v.handleOut ? { ...v.handleOut } : undefined,
        }));
        const isClosed = ctx.model.isElementClosed(el);
        el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
      }
    });

    ctx.syncToHost();
    ctx.render();
  }

  /**
   * Sets a specific corner coordinate numerically from the inspector.
   */
  public static setCornerCoordinate(
    ctx: ToolContext,
    cornerKey: keyof QuadCorners,
    newCoord: Point,
    selectedEls: VectorElement[],
    initialBox: BoundingBox,
    currentQuad: QuadCorners
  ): QuadCorners | null {
    const candidateQuad: QuadCorners = {
      nw: { ...currentQuad.nw },
      ne: { ...currentQuad.ne },
      se: { ...currentQuad.se },
      sw: { ...currentQuad.sw },
    };
    candidateQuad[cornerKey] = { x: newCoord.x, y: newCoord.y };

    if (!ProjectiveHomography.isConvex(candidateQuad)) {
      return null;
    }

    const homography = ProjectiveHomography.fromBoxToQuad(initialBox, candidateQuad);
    const ghostMap = new Map<string, PathVertex[]>();

    selectedEls.forEach((el) => {
      if (el.vertices) {
        ghostMap.set(el.id, homography.projectVertices(el.vertices));
      }
    });

    this.applyDistortCommit(ctx, ghostMap, selectedEls, initialBox);
    return candidateQuad;
  }

  /**
   * Restores a single corner back to its orthogonal bounding box coordinate.
   */
  public static resetCorner(
    ctx: ToolContext,
    cornerKey: keyof QuadCorners,
    selectedEls: VectorElement[],
    initialBox: BoundingBox,
    currentQuad: QuadCorners
  ): QuadCorners | null {
    let defaultPt: Point;
    switch (cornerKey) {
      case 'nw':
        defaultPt = { x: initialBox.x, y: initialBox.y };
        break;
      case 'ne':
        defaultPt = { x: initialBox.x + initialBox.width, y: initialBox.y };
        break;
      case 'se':
        defaultPt = { x: initialBox.x + initialBox.width, y: initialBox.y + initialBox.height };
        break;
      case 'sw':
        defaultPt = { x: initialBox.x, y: initialBox.y + initialBox.height };
        break;
    }

    return this.setCornerCoordinate(ctx, cornerKey, defaultPt, selectedEls, initialBox, currentQuad);
  }

  /**
   * Restores all 4 corners and selected elements back to their pristine pre-distort state.
   */
  public static resetAllCorners(
    ctx: ToolContext,
    selectedEls: VectorElement[]
  ): QuadCorners | null {
    ctx.pushUndo();

    let restoredBox: BoundingBox | null = null;

    selectedEls.forEach((el) => {
      const baseJson = el.attributes['data-distort-base'];
      if (baseJson) {
        try {
          const base = JSON.parse(baseJson);
          if (base.vertices && Array.isArray(base.vertices)) {
            el.vertices = base.vertices.map((v: PathVertex) => ({
              ...v,
              handleIn: v.handleIn ? { ...v.handleIn } : undefined,
              handleOut: v.handleOut ? { ...v.handleOut } : undefined,
            }));
          }
          if (base.box) {
            restoredBox = base.box;
          }
          delete el.attributes['data-distort-base'];
          if (el.vertices) {
            const isClosed = ctx.model.isElementClosed(el);
            el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
          }
        } catch {}
      }
    });

    ctx.syncToHost();
    ctx.render();

    if (restoredBox) {
      const b: BoundingBox = restoredBox;
      return {
        nw: { x: b.x, y: b.y },
        ne: { x: b.x + b.width, y: b.y },
        se: { x: b.x + b.width, y: b.y + b.height },
        sw: { x: b.x, y: b.y + b.height },
      };
    }

    const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
    if (groupBox) {
      return {
        nw: { x: groupBox.x, y: groupBox.y },
        ne: { x: groupBox.x + groupBox.width, y: groupBox.y },
        se: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
        sw: { x: groupBox.x, y: groupBox.y + groupBox.height },
      };
    }

    return null;
  }
}
