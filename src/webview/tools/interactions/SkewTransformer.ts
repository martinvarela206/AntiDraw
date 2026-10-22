import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/SelectionTool.js';
import { GroupHierarchyService } from '../../engine/selection/GroupHierarchyService.js';

export interface SkewInitResult {
  initialBox: BoundingBox;
  initialElementsMap: Map<string, PathVertex[]>;
  initialAttributesMap: Map<string, Record<string, string>>;
  ghostTransformMap: Map<string, PathVertex[]>;
}

export interface SkewComputeResult {
  deltaDisplacement: number;
  skewAngleDeg: number;
  ghostMap: Map<string, PathVertex[]>;
  parallelogramCorners: Point[];
  transformPoint: (p: Point) => Point;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Skew / Shear Transformation Handler (SkewTransformer)
 *
 * 1. Mathematical Rigor & Affine Invariance:
 *    Skew (shear deformation) is an affine linear transformation that displaces coordinates
 *    proportionally along an axis perpendicular to the displacement:
 *    - Horizontal skew along X: x' = x + (y_anchor - y) * tan(theta_x), y' = y.
 *    - Vertical skew along Y:   y' = y + (x - x_anchor) * tan(theta_y), x' = x.
 *    Because affine maps preserve collinearity, distance ratios, and spline tangents,
 *    applying the transformation matrix identically to vertex anchors and Bézier control
 *    handles (handleIn, handleOut) guarantees mathematical curvature and tangency preservation.
 *
 * 2. CorelDraw Parity & Ergonomics:
 *    - Corner handles perform rotation around the pivot.
 *    - Midpoint handles (N, S, W, E) execute directional skew/shear deformation.
 *    - Stationary Baselines:
 *      * N handle: anchored to the bottom bounding edge (y = box.y + box.height).
 *      * S handle: anchored to the top bounding edge (y = box.y).
 *      * W handle: anchored to the right bounding edge (x = box.x + box.width).
 *      * E handle: anchored to the left bounding edge (x = box.x).
 *    - Holding Ctrl constrains the shear angle to strict 15° increments (0°, 15°, 30°, 45°, 60°, 75°).
 *    - Holding Alt/Shift provides symmetric shear anchored relative to the center/pivot.
 *
 * 3. Rigid Parametric Primitives Guard (ITEM-08):
 *    Rigid primitives (<rect>, <circle>, <ellipse>) enforce orthogonal geometric attributes
 *    (x, y, width, height, rx, ry). Attempting shear deformation without conversion would distort
 *    the orthogonal coordinate contract. Midpoint handles are visually locked with a disabled state
 *    and 'not-allowed' cursor, prompting the user to convert to Bézier curves (Ctrl+Q).
 */
export class SkewTransformer {
  /**
   * Evaluates whether all currently selected elements can undergo shear deformation.
   * Pure rigid parametric primitives require explicit conversion to Bézier curves (Ctrl+Q).
   */
  public static canSkewElements(selectedEls: VectorElement[], ctx: ToolContext): boolean {
    if (selectedEls.length === 0) return false;
    const leaves = GroupHierarchyService.collectAllLeafElements(selectedEls);
    return !leaves.some((el) => ctx.model.isParametricElement(el));
  }

  /**
   * Initializes skew interaction state and clones initial vertex topologies.
   */
  public static initSkew(
    groupBox: BoundingBox,
    selectedEls: VectorElement[]
  ): SkewInitResult {
    const initialBox: BoundingBox = { ...groupBox };
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
      initialElementsMap,
      initialAttributesMap,
      ghostTransformMap,
    };
  }

  /**
   * Computes the real-time affine shear transformation, angular displacement,
   * and ghost deformed vertices for the active pointer position.
   */
  public static computeSkew(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point,
    activeHandle: string,
    initialBox: BoundingBox,
    initialElementsMap: Map<string, PathVertex[]>,
    isConstrained: boolean = false,
    isSymmetric: boolean = false,
    pivot?: Point | null
  ): SkewComputeResult {
    const H = Math.max(initialBox.height, 1);
    const W = Math.max(initialBox.width, 1);
    let deltaDisplacement = 0;
    let skewAngleDeg = 0;
    let transformPoint: (p: Point) => Point = (p) => ({ ...p });

    const maxAngleRad = (85 * Math.PI) / 180;

    if (activeHandle === 'skew-n') {
      // Top midpoint dragged horizontally; baseline is bottom edge
      const yAnchor = isSymmetric && pivot ? pivot.y : initialBox.y + initialBox.height;
      const effH = isSymmetric ? H / 2 : H;
      const rawDeltaX = pt.x - dragStartPt.x;
      let angleRad = Math.atan2(rawDeltaX, effH);
      angleRad = Math.max(-maxAngleRad, Math.min(maxAngleRad, angleRad));

      let deg = (angleRad * 180) / Math.PI;
      if (isConstrained || ctx.canvasMgr.snapAngular) {
        deg = Math.round(deg / 15) * 15;
        angleRad = (deg * Math.PI) / 180;
      }
      skewAngleDeg = Math.round(deg * 10) / 10;
      deltaDisplacement = effH * Math.tan(angleRad);

      transformPoint = (p: Point): Point => {
        const factor = (yAnchor - p.y) / effH;
        return {
          x: p.x + deltaDisplacement * factor,
          y: p.y,
        };
      };
    } else if (activeHandle === 'skew-s') {
      // Bottom midpoint dragged horizontally; baseline is top edge
      const yAnchor = isSymmetric && pivot ? pivot.y : initialBox.y;
      const effH = isSymmetric ? H / 2 : H;
      const rawDeltaX = pt.x - dragStartPt.x;
      let angleRad = Math.atan2(rawDeltaX, effH);
      angleRad = Math.max(-maxAngleRad, Math.min(maxAngleRad, angleRad));

      let deg = (angleRad * 180) / Math.PI;
      if (isConstrained || ctx.canvasMgr.snapAngular) {
        deg = Math.round(deg / 15) * 15;
        angleRad = (deg * Math.PI) / 180;
      }
      skewAngleDeg = Math.round(deg * 10) / 10;
      deltaDisplacement = effH * Math.tan(angleRad);

      transformPoint = (p: Point): Point => {
        const factor = (p.y - yAnchor) / effH;
        return {
          x: p.x + deltaDisplacement * factor,
          y: p.y,
        };
      };
    } else if (activeHandle === 'skew-w') {
      // Left midpoint dragged vertically; baseline is right edge
      const xAnchor = isSymmetric && pivot ? pivot.x : initialBox.x + initialBox.width;
      const effW = isSymmetric ? W / 2 : W;
      const rawDeltaY = pt.y - dragStartPt.y;
      let angleRad = Math.atan2(rawDeltaY, effW);
      angleRad = Math.max(-maxAngleRad, Math.min(maxAngleRad, angleRad));

      let deg = (angleRad * 180) / Math.PI;
      if (isConstrained || ctx.canvasMgr.snapAngular) {
        deg = Math.round(deg / 15) * 15;
        angleRad = (deg * Math.PI) / 180;
      }
      skewAngleDeg = Math.round(deg * 10) / 10;
      deltaDisplacement = effW * Math.tan(angleRad);

      transformPoint = (p: Point): Point => {
        const factor = (xAnchor - p.x) / effW;
        return {
          x: p.x,
          y: p.y + deltaDisplacement * factor,
        };
      };
    } else if (activeHandle === 'skew-e') {
      // Right midpoint dragged vertically; baseline is left edge
      const xAnchor = isSymmetric && pivot ? pivot.x : initialBox.x;
      const effW = isSymmetric ? W / 2 : W;
      const rawDeltaY = pt.y - dragStartPt.y;
      let angleRad = Math.atan2(rawDeltaY, effW);
      angleRad = Math.max(-maxAngleRad, Math.min(maxAngleRad, angleRad));

      let deg = (angleRad * 180) / Math.PI;
      if (isConstrained || ctx.canvasMgr.snapAngular) {
        deg = Math.round(deg / 15) * 15;
        angleRad = (deg * Math.PI) / 180;
      }
      skewAngleDeg = Math.round(deg * 10) / 10;
      deltaDisplacement = effW * Math.tan(angleRad);

      transformPoint = (p: Point): Point => {
        const factor = (p.x - xAnchor) / effW;
        return {
          x: p.x,
          y: p.y + deltaDisplacement * factor,
        };
      };
    }

    const ghostMap = new Map<string, PathVertex[]>();
    initialElementsMap.forEach((origVerts, id) => {
      const transformedVerts: PathVertex[] = origVerts.map((v) => {
        const pTrans = transformPoint({ x: v.x, y: v.y });
        const hInTrans = v.handleIn ? transformPoint(v.handleIn) : undefined;
        const hOutTrans = v.handleOut ? transformPoint(v.handleOut) : undefined;
        return {
          ...v,
          x: pTrans.x,
          y: pTrans.y,
          handleIn: hInTrans,
          handleOut: hOutTrans,
        };
      });
      ghostMap.set(id, transformedVerts);
    });

    // 4 transformed bounding box corners forming a parallelogram
    const boxCorners: Point[] = [
      { x: initialBox.x, y: initialBox.y },
      { x: initialBox.x + initialBox.width, y: initialBox.y },
      { x: initialBox.x + initialBox.width, y: initialBox.y + initialBox.height },
      { x: initialBox.x, y: initialBox.y + initialBox.height },
    ];
    const parallelogramCorners = boxCorners.map((c) => transformPoint(c));

    return {
      deltaDisplacement,
      skewAngleDeg,
      ghostMap,
      parallelogramCorners,
      transformPoint,
    };
  }

  /**
   * Commits the affine shear transformation to the vector model.
   */
  public static applySkewCommit(
    ctx: ToolContext,
    ghostTransformMap: Map<string, PathVertex[]>,
    transformPoint: (p: Point) => Point,
    selectedEls: VectorElement[]
  ): void {
    ghostTransformMap.forEach((transformedVerts, id) => {
      const el = ctx.model.getElementById(id) || ctx.model.elements.find((e) => e.id === id);
      if (!el) return;

      el.vertices = transformedVerts;
      const isClosed = ctx.model.isElementClosed(el);
      el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
      el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');

      // Ensure parametric flags reflect freeform path state
      if (ctx.model.isParametricElement(el)) {
        ctx.model.syncParametricAttributes(el);
      }
    });

    ctx.selectionTool.updatePivotOnSkew(transformPoint, selectedEls);
  }

  /**
   * Generates SVG markup for the ghost dashed parallelogram bounding frame.
   */
  public static renderGhostParallelogram(corners: Point[]): string {
    if (corners.length < 4) return '';
    const pts = corners.map((c) => `${c.x},${c.y}`).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`;
  }

  /**
   * Renders the real-time angular degree badge next to the transformed geometry.
   */
  public static renderAngleBadge(angleDeg: number, anchorPt: Point, z: number): string {
    const inv = 1 / z;
    const degText = `${angleDeg > 0 ? '+' : ''}${angleDeg}°`;
    const badgeX = anchorPt.x + 18 / z;
    const badgeY = anchorPt.y - 18 / z;
    return `
      <g transform="translate(${badgeX}, ${badgeY}) scale(${inv})" pointer-events="none">
        <rect x="0" y="-14" width="56" height="18" rx="3" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1" opacity="0.9" />
        <text x="6" y="-1" font-size="11" fill="#fde68a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">∠ ${degText}</text>
      </g>
    `;
  }
}
