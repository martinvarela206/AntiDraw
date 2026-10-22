import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/SelectionTool.js';
import { GroupHierarchyService } from '../../engine/selection/GroupHierarchyService.js';
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
    });

    const leaves = GroupHierarchyService.collectAllLeafElements(selectedEls);
    leaves.forEach((el) => {
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
    initialQuad: QuadCorners,
    initialElementsMap: Map<string, PathVertex[]>,
    modifiers: {
      shiftKey?: boolean;
      altKey?: boolean;
      ctrlKey?: boolean;
      selectedCorners?: Set<string>;
    } = {}
  ): DistortComputeResult {
    const cornerKey = activeHandle.replace('distort-', '') as keyof QuadCorners;
    if (!['nw', 'ne', 'se', 'sw'].includes(cornerKey)) {
      return {
        ghostMap: new Map(),
        quad: initialQuad,
        snappedPt: null,
        homography: null,
      };
    }

    // Magnetic Snapping against guidelines, grid, canvas borders, and other elements
    const otherVertices = ctx.getOtherVertices(Array.from(ctx.selectionTool.selectedElementIds));
    const targetPt: Point = { x: pt.x, y: pt.y };
    const snappedPt = ctx.snapPoint(targetPt, otherVertices);

    let dx = snappedPt.x - initialQuad[cornerKey].x;
    let dy = snappedPt.y - initialQuad[cornerKey].y;

    // 1. Shift Modifier: Restrict to dominant orthogonal axis (FEAT-TRANS-03)
    if (modifiers.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    const candidateQuad: QuadCorners = {
      nw: { ...initialQuad.nw },
      ne: { ...initialQuad.ne },
      se: { ...initialQuad.se },
      sw: { ...initialQuad.sw },
    };

    // 2. Ctrl Modifier: Concentric 4-Corner Symmetric Perspective Projection (FEAT-TRANS-03)
    if (modifiers.ctrlKey) {
      const sx = cornerKey === 'nw' || cornerKey === 'sw' ? 1 : -1;
      const sy = cornerKey === 'nw' || cornerKey === 'ne' ? 1 : -1;
      const effDx = dx * sx;
      const effDy = dy * sy;

      candidateQuad.nw = { x: initialQuad.nw.x + effDx, y: initialQuad.nw.y + effDy };
      candidateQuad.ne = { x: initialQuad.ne.x - effDx, y: initialQuad.ne.y + effDy };
      candidateQuad.se = { x: initialQuad.se.x - effDx, y: initialQuad.se.y - effDy };
      candidateQuad.sw = { x: initialQuad.sw.x + effDx, y: initialQuad.sw.y - effDy };
    } else if (modifiers.selectedCorners && modifiers.selectedCorners.size > 1 && modifiers.selectedCorners.has(cornerKey)) {
      // 3. Multi-Corner Selection: translate all selected corners coordinatedly (FEAT-TRANS-03)
      modifiers.selectedCorners.forEach((k) => {
        const cKey = k as keyof QuadCorners;
        if (candidateQuad[cKey]) {
          candidateQuad[cKey] = {
            x: initialQuad[cKey].x + dx,
            y: initialQuad[cKey].y + dy,
          };
        }
      });
    } else if (modifiers.altKey) {
      // 4. Alt Modifier: Symmetric Perspective Reflection (narrowing edge while opposite edge/base stays fixed)
      candidateQuad[cornerKey] = {
        x: initialQuad[cornerKey].x + dx,
        y: initialQuad[cornerKey].y + dy,
      };

      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal edge perspective: opposite corner along horizontal edge reflects dx symmetrically
        const oppHKey: keyof QuadCorners = cornerKey === 'nw' ? 'ne' : cornerKey === 'ne' ? 'nw' : cornerKey === 'se' ? 'sw' : 'se';
        candidateQuad[oppHKey] = {
          x: initialQuad[oppHKey].x - dx,
          y: initialQuad[oppHKey].y + dy,
        };
      } else {
        // Vertical edge perspective: opposite corner along vertical edge reflects dy symmetrically
        const oppVKey: keyof QuadCorners = cornerKey === 'nw' ? 'sw' : cornerKey === 'sw' ? 'nw' : cornerKey === 'ne' ? 'se' : 'ne';
        candidateQuad[oppVKey] = {
          x: initialQuad[oppVKey].x + dx,
          y: initialQuad[oppVKey].y - dy,
        };
      }
    } else {
      // 5. Default Free Distort: moves only the active corner freely, preserving the other 3 corners
      candidateQuad[cornerKey] = {
        x: initialQuad[cornerKey].x + dx,
        y: initialQuad[cornerKey].y + dy,
      };
    }

    // Numerical stability safeguard: reject non-convex or self-intersecting quads
    if (!ProjectiveHomography.isConvex(candidateQuad)) {
      return {
        ghostMap: new Map(),
        quad: initialQuad,
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

    const targetEls = GroupHierarchyService.collectAllLeafElements(selectedEls);
    targetEls.forEach((el) => {
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
