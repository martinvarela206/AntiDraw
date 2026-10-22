import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point } from '../../engine/VectorModel.js';
import { BoundingBox } from '../../engine/SelectionTool.js';
import { GroupHierarchyService } from '../../engine/selection/GroupHierarchyService.js';

export interface RotateInitResult {
  rotationPivot: Point;
  initialRotationAngle: number;
  initialElementsMap: Map<string, PathVertex[]>;
  initialAttributesMap: Map<string, Record<string, string>>;
  ghostTransformMap: Map<string, PathVertex[]>;
}

export interface RotateComputeResult {
  deltaAngle: number;
  snappedPt: Point | null;
  ghostMap: Map<string, PathVertex[]>;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Rotate Transformation Handler (RotateTransformer)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates affine rotation around arbitrary pivots, intelligent angular snapping
 *    (strict 15° increments and soft 3° primary angle snapping), magnetic vertex/guide capture,
 *    parametric circular arc/pie angle shift preservation, and solidary gradient rotation (FIX-06).
 *
 * 2. Solidary Gradient Rotation (FIX-06):
 *    Rotates linear gradient angles and transforms radial gradient center, focus, radii (rx, ry),
 *    and internal orientation solidarily with vector geometry around the custom pivot.
 *
 * 3. Circular Arc/Pie Non-Destructive Rotation:
 *    For uniform circular arcs/pies (rx == ry), rotating around the element or selection pivot
 *    simply shifts startAngle and endAngle by lastDeltaAngle, completely avoiding conversion to curves.
 */
export class RotateTransformer {
  /**
   * Initializes rotation state and pre-populates ghost maps for immediate drag feedback.
   */
  public static initRotate(
    pivot: Point,
    dragStartPt: Point,
    selectedEls: VectorElement[]
  ): RotateInitResult {
    const rotationPivot = { ...pivot };
    const initialRotationAngle = Math.atan2(dragStartPt.y - pivot.y, dragStartPt.x - pivot.x);
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
      rotationPivot,
      initialRotationAngle,
      initialElementsMap,
      initialAttributesMap,
      ghostTransformMap,
    };
  }

  /**
   * Computes the angular displacement and magnetic snapping for the active pointer position.
   *
   * ARCHITECTURAL RATIONALE: CorelDraw Benchmark Angular Restriction with Ctrl (ITEM-07)
   * In CorelDraw, holding the Ctrl key during interactive rotation constrains the angle strictly
   * to fixed 15° increments (0°, 15°, 30°, 45°, 60°, ...). Shift key is also supported as an
   * ergonomic alternative.
   */
  public static computeRotation(
    ctx: ToolContext,
    pt: Point,
    rotationPivot: Point,
    initialRotationAngle: number,
    initialElementsMap: Map<string, PathVertex[]>,
    isConstrained: boolean = false
  ): RotateComputeResult {
    const otherVertices: Point[] = [];
    ctx.model.elements.forEach((el) => {
      if (!ctx.selectionTool.isSelected(el.id) && el.vertices) {
        el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
      }
    });

    const snappedPt = ctx.snapPoint(pt, otherVertices);
    const isMagneticallySnapped = Math.hypot(snappedPt.x - pt.x, snappedPt.y - pt.y) > 0.001;
    const currentSnappedPt = isMagneticallySnapped ? snappedPt : null;

    const currentAngle = Math.atan2(snappedPt.y - rotationPivot.y, snappedPt.x - rotationPivot.x);
    let rawDelta = currentAngle - initialRotationAngle;
    let deg = (rawDelta * 180) / Math.PI;

    const shouldSnapAngular = isConstrained || (ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
    if (shouldSnapAngular) {
      deg = Math.round(deg / 15) * 15;
    } else if (!isMagneticallySnapped) {
      const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -90, -135, -180, -225, -270, -315];
      for (const sa of snapAngles) {
        if (Math.abs(deg - sa) <= 3) {
          deg = sa;
          break;
        }
      }
    }

    const deltaAngle = (deg * Math.PI) / 180;
    const ghostMap = new Map<string, PathVertex[]>();

    initialElementsMap.forEach((origVerts, id) => {
      const rotated = ctx.selectionTool.rotateVerticesAroundPivot(
        origVerts,
        rotationPivot,
        deltaAngle
      );
      ghostMap.set(id, rotated);
    });

    return {
      deltaAngle,
      snappedPt: currentSnappedPt,
      ghostMap,
    };
  }

  /**
   * Commits the rotation transform to model elements, preserving circular parametric arc/pie
   * geometries, updating the rotation pivot, and rotating gradients solidarily.
   */
  public static applyRotateCommit(
    ctx: ToolContext,
    ghostTransformMap: Map<string, PathVertex[]>,
    rotationPivot: Point,
    lastDeltaAngle: number,
    initialElementsMap: Map<string, PathVertex[]>,
    initialBox: any,
    selectedEls: VectorElement[]
  ): void {
    ghostTransformMap.forEach((transformedVerts, id) => {
      const el = ctx.model.getElementById(id) || ctx.model.elements.find((e) => e.id === id);
      if (!el) return;

      const isPieOrArc =
        el.attributes['data-ellipse-type'] === 'pie' || el.attributes['data-ellipse-type'] === 'arc';

      if (ctx.model.isParametricElement(el)) {
        const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
        const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
        if (isPieOrArc && Math.abs(rx - ry) < 0.5) {
          // Circular arc or pie: preserve parametric! Shift angular bounds by lastDeltaAngle
          const sAngle = parseFloat(el.attributes['data-start-angle'] || '0');
          const eAngle = parseFloat(el.attributes['data-end-angle'] || '360');
          let newStart = Math.round((sAngle + lastDeltaAngle) * 10) / 10;
          let newEnd = Math.round((eAngle + lastDeltaAngle) * 10) / 10;
          newStart = ((newStart % 360) + 360) % 360;
          newEnd = ((newEnd % 360) + 360) % 360;
          if (newStart === newEnd) newEnd = newStart + 360;

          el.attributes['data-start-angle'] = newStart.toString();
          el.attributes['data-end-angle'] = newEnd.toString();
          const cx = parseFloat(el.attributes.cx || '0');
          const cy = parseFloat(el.attributes.cy || '0');
          const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
          el.attributes.d = ctx.model.compileEllipseD(
            cx,
            cy,
            rx,
            ry,
            el.attributes['data-ellipse-type'] as any,
            newStart,
            newEnd,
            innerRatio
          );
          el.vertices = ctx.model.convertEllipseToVertices(
            cx,
            cy,
            rx,
            ry,
            el.attributes['data-ellipse-type'] as any,
            newStart,
            newEnd,
            innerRatio
          );
          el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
          if (innerRatio > 0) {
            el.attributes['fill-rule'] = 'evenodd';
          }
          return;
        } else {
          ctx.model.convertToCurves(el);
        }
      }

      el.vertices = transformedVerts;
      const isClosed = ctx.model.isElementClosed(el);
      el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
      if (ctx.model.isParametricElement(el)) {
        ctx.model.syncParametricAttributes(el);
      }
    });

    ctx.selectionTool.updatePivotOnRotate(rotationPivot, lastDeltaAngle, selectedEls);

    // Solidary Gradient Rotation (FIX-06)
    selectedEls.forEach((el) => {
      if (el.attributes['data-gradient']) {
        const initialVerts = initialElementsMap.get(el.id);
        const oldElBox = initialVerts
          ? ctx.selectionTool.getBoundingBox({ ...el, vertices: initialVerts })
          : initialBox;
        const newElBox = ctx.selectionTool.getBoundingBox(el);
        if (oldElBox && newElBox) {
          ctx.selectionTool.rotateElementGradient(
            el,
            rotationPivot,
            lastDeltaAngle,
            oldElBox,
            newElBox
          );
        }
      }
    });
  }

  /**
   * Renders the ghost bounding box rotated around the pivot.
   */
  public static renderGhostBoundingBox(
    box: BoundingBox,
    pivot: Point,
    lastDeltaAngle: number
  ): string {
    const deg = (lastDeltaAngle * 180) / Math.PI;
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" transform="rotate(${deg}, ${pivot.x}, ${pivot.y})" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`;
  }

  /**
   * Renders the visual magnetic snap indicator for rotation.
   */
  public static renderSnapIndicator(sp: Point, z: number): string {
    const sR = 6 / z;
    const sCross = 9 / z;
    return `
      <g class="rotation-snap-indicator" pointer-events="none">
        <circle cx="${sp.x}" cy="${sp.y}" r="${sR}" fill="none" stroke="#f59e0b" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <line x1="${sp.x - sCross}" y1="${sp.y}" x2="${sp.x + sCross}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
        <line x1="${sp.x}" y1="${sp.y - sCross}" x2="${sp.x}" y2="${sp.y + sCross}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
        <circle cx="${sp.x}" cy="${sp.y}" r="${1.8 / z}" fill="#f59e0b" />
      </g>
    `;
  }
}
