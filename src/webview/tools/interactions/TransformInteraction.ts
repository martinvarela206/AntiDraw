import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point, GradientConfig } from '../../engine/VectorModel.js';
import { HandleType } from '../../engine/SelectionTool.js';
import { SvgSerializer } from '../../engine/serialization/SvgSerializer.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * TransformInteraction
 *
 * Encapsulates scaling, affine rotation, arbitrary pivot manipulation, and interactive
 * gradient handles for active vector selections:
 * 1. Scaling:
 *    - 8 bounding box resize handles (nw, ne, se, sw, n, s, e, w).
 *    - Preserves aspect ratio with Shift key; scales from center with Alt.
 * 2. Rotation:
 *    - Top stem handle + 4 corner rotation handles in 'rotate' mode.
 *    - Magnetic snapping against vertices, grids, and ViewBox edges (FIX-08).
 *    - Strict 15° snapping with Shift; soft 3° primary angle snapping when not locked.
 *    - Solidary Gradient Rotation (FIX-06): Rotates linear angle and transforms radial gradient
 *      center, focus, radii (rx, ry), and rotation solidarily with vector geometry.
 * 3. Interactive Arbitrary Pivot Relocation (FIX-05):
 *    - Displaced rotation pivot with dashed connection lever to bounding box center.
 *    - In 'transform' mode: muted reference indicator.
 *    - In 'rotate' mode: interactive, magnetically relocatable anchor.
 * 4. Interactive Radial Gradient Manipulation:
 *    - Center, focus, radius-x, and radius-y handles with direct SVG defs attribute mutation for 60fps responsiveness.
 */
export class TransformInteraction {
  public activeGradientElementId: string | null = null;
  public initialGradientJson: string | null = null;
  public rotationPivot: Point | null = null;
  public initialRotationAngle: number = 0;
  public initialPivot: Point | null = null;
  public lastDeltaAngle: number = 0;
  public currentRotationSnappedPt: Point | null = null;
  public currentScaleSnappedPt: Point | null = null;

  public initialElementsMap: Map<string, PathVertex[]> = new Map();
  public initialAttributesMap: Map<string, Record<string, string>> = new Map();
  public initialBox: any = null;
  public initialBoxPadding: number = 0;
  public ghostTransformMap: Map<string, PathVertex[]> = new Map();

  /**
   * ARCHITECTURAL RATIONALE: Zero-Clearance Tight Selection Box Hit-Testing
   * 1. Exact Alignment with Geometry Extents:
   *    Selection boxes and handles are positioned flush against the true geometric bounds (padding = 0).
   * 2. Hit-Testing:
   *    Handle radius (12 / z) provides comfortable grab target tolerance without requiring
   *    artificial bounding box expansion.
   */
  public getHoverCursor(ctx: ToolContext, pt: Point, selectedEls: VectorElement[]): string | null {
    if (selectedEls.length === 0) return null;
    const z = ctx.canvasMgr.zoom || 1;
    const box = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
    if (!box) return null;

    if (ctx.selectionTool.selectionMode === 'rotate') {
      if (ctx.selectionTool.hitTestPivot(box, pt, 8 / z)) {
        return 'move';
      }
      const h = ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'rotate');
      if (h === 'rotate') return 'grab';
    } else {
      const h = ctx.selectionTool.hitTestHandle(box, pt, 12 / z, 18 / z, 'transform');
      if (h) {
        if (h === 'nw' || h === 'se') return 'nwse-resize';
        if (h === 'ne' || h === 'sw') return 'nesw-resize';
        if (h === 'n' || h === 's') return 'ns-resize';
        if (h === 'w' || h === 'e') return 'ew-resize';
      }
    }

    // Radial gradient handles hover
    if (selectedEls.length === 1 && selectedEls[0].attributes['data-gradient']) {
      const el = selectedEls[0];
      try {
        const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
        if (grad.type === 'radial') {
          const elBox = ctx.selectionTool.getBoundingBox(el);
          if (elBox && elBox.width > 0 && elBox.height > 0) {
            const hSize = 8 / z;
            const cx = elBox.x + (grad.cx ?? 0.5) * elBox.width;
            const cy = elBox.y + (grad.cy ?? 0.5) * elBox.height;
            const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
            const cosRot = Math.cos(rotRad);
            const sinRot = Math.sin(rotRad);
            const spanU = Math.hypot(elBox.width * cosRot, elBox.height * sinRot);
            const spanV = Math.hypot(elBox.width * sinRot, elBox.height * cosRot);
            const rx = (grad.rx ?? grad.r ?? 0.5) * spanU;
            const ry = (grad.ry ?? grad.r ?? 0.5) * spanV;
            const hx1 = cx + rx * cosRot;
            const hy1 = cy + rx * sinRot;
            const hx2 = cx - ry * sinRot;
            const hy2 = cy + ry * cosRot;
            const fx = elBox.x + (grad.fx ?? grad.cx ?? 0.5) * elBox.width;
            const fy = elBox.y + (grad.fy ?? grad.cy ?? 0.5) * elBox.height;
            const isCoincident = Math.hypot(fx - cx, fy - cy) < 4 / z;

            if (Math.hypot(pt.x - hx1, pt.y - hy1) <= hSize) return 'ew-resize';
            if (Math.hypot(pt.x - hx2, pt.y - hy2) <= hSize) return 'ns-resize';
            if (!isCoincident && Math.hypot(pt.x - fx, pt.y - fy) <= hSize) return 'crosshair';
            if (Math.hypot(pt.x - cx, pt.y - cy) <= hSize) return 'move';
          }
        }
      } catch {}
    }

    return null;
  }

  public startScale(
    handle: HandleType,
    groupBox: any,
    selectedEls: VectorElement[],
    padding: number = 0
  ): void {
    this.initialBox = { ...groupBox };
    this.initialBoxPadding = padding;
    this.initialElementsMap.clear();
    this.initialAttributesMap.clear();
    selectedEls.forEach((el) => {
      this.initialAttributesMap.set(el.id, { ...el.attributes });
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.ghostTransformMap.clear();
    this.currentScaleSnappedPt = null;
  }

  public startRotate(
    pivot: Point,
    dragStartPt: Point,
    selectedEls: VectorElement[]
  ): void {
    this.rotationPivot = { ...pivot };
    this.initialRotationAngle = Math.atan2(dragStartPt.y - pivot.y, dragStartPt.x - pivot.x);
    this.lastDeltaAngle = 0;
    this.initialElementsMap.clear();
    this.initialAttributesMap.clear();
    selectedEls.forEach((el) => {
      this.initialAttributesMap.set(el.id, { ...el.attributes });
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.ghostTransformMap.clear();
    /**
     * ARCHITECTURAL RATIONALE: Instant Ghost Pre-Allocation on Drag Start
     * Populating ghostTransformMap at rotation initiation guarantees immediate visual feedback
     * upon handle press without waiting for the first mouse movement delta.
     */
    this.initialElementsMap.forEach((origVerts, id) => {
      this.ghostTransformMap.set(
        id,
        origVerts.map((v) => ({
          ...v,
          handleIn: v.handleIn ? { ...v.handleIn } : undefined,
          handleOut: v.handleOut ? { ...v.handleOut } : undefined,
        }))
      );
    });
  }

  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    dragStartPt: Point,
    activeHandle: string,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    const dx = pt.x - dragStartPt.x;
    const dy = pt.y - dragStartPt.y;

    if (activeHandle === 'selection-pivot') {
      callbacks.setCursor?.('move');
      const otherVertices: Point[] = [];
      ctx.model.elements.forEach((el) => {
        if (el.vertices) {
          el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
        }
      });
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      if (selectedEls.length > 0) {
        const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
        if (groupBox) {
          otherVertices.push({ x: groupBox.cx, y: groupBox.cy });
          otherVertices.push({ x: groupBox.x, y: groupBox.y });
          otherVertices.push({ x: groupBox.x + groupBox.width, y: groupBox.y });
          otherVertices.push({ x: groupBox.x, y: groupBox.y + groupBox.height });
          otherVertices.push({ x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height });
        }
      }
      const snapped = ctx.snapPoint(pt, otherVertices);
      ctx.selectionTool.customPivot = { x: Math.round(snapped.x), y: Math.round(snapped.y) };
      ctx.renderOverlay();
      return true;
    }

    // Radial gradient interactive handles
    if (
      (activeHandle === 'grad-radial-center' ||
        activeHandle === 'grad-radial-radius' ||
        activeHandle === 'grad-radial-radius-y' ||
        activeHandle === 'grad-radial-focus') &&
      this.activeGradientElementId
    ) {
      const el = ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el && el.attributes['data-gradient']) {
        try {
          const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
          const box = ctx.selectionTool.getBoundingBox(el);
          if (box && box.width > 0 && box.height > 0) {
            if (activeHandle === 'grad-radial-center') {
              callbacks.setCursor?.('move');
              const newCx = (pt.x - box.x) / box.width;
              const newCy = (pt.y - box.y) / box.height;
              const oldCx = grad.cx ?? 0.5;
              const oldCy = grad.cy ?? 0.5;
              const dFx = (grad.fx ?? oldCx) - oldCx;
              const dFy = (grad.fy ?? oldCy) - oldCy;

              grad.cx = Math.round(newCx * 1000) / 1000;
              grad.cy = Math.round(newCy * 1000) / 1000;
              grad.fx = Math.round((newCx + dFx) * 1000) / 1000;
              grad.fy = Math.round((newCy + dFy) * 1000) / 1000;
            } else if (activeHandle === 'grad-radial-radius') {
              callbacks.setCursor?.('ew-resize');
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
              const cosRot = Math.cos(rotRad);
              const sinRot = Math.sin(rotRad);
              const gdx = pt.x - cx;
              const gdy = pt.y - cy;
              const projX = gdx * cosRot + gdy * sinRot;
              const spanU = Math.hypot(box.width * cosRot, box.height * sinRot);
              const newRx = Math.max(0.01, Math.abs(projX) / (spanU || 1));
              grad.rx = Math.round(newRx * 1000) / 1000;
              grad.r = grad.rx;

              if (e.shiftKey) {
                const angleDeg = Math.round((Math.atan2(gdy, gdx) * 180) / Math.PI);
                grad.rotation = ((angleDeg % 360) + 360) % 360;
              }
            } else if (activeHandle === 'grad-radial-radius-y') {
              callbacks.setCursor?.('ns-resize');
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
              const cosRot = Math.cos(rotRad);
              const sinRot = Math.sin(rotRad);
              const gdx = pt.x - cx;
              const gdy = pt.y - cy;
              const projY = -gdx * sinRot + gdy * cosRot;
              const spanV = Math.hypot(box.width * sinRot, box.height * cosRot);
              const newRy = Math.max(0.01, Math.abs(projY) / (spanV || 1));
              grad.ry = Math.round(newRy * 1000) / 1000;
            } else if (activeHandle === 'grad-radial-focus') {
              callbacks.setCursor?.('crosshair');
              const newFx = (pt.x - box.x) / box.width;
              const newFy = (pt.y - box.y) / box.height;
              grad.fx = Math.round(newFx * 1000) / 1000;
              grad.fy = Math.round(newFy * 1000) / 1000;
            }

            el.attributes['data-gradient'] = JSON.stringify(grad);

            const gradDom = document.getElementById(`ad-grad-${el.id}`);
            if (gradDom) {
              const comp = SvgSerializer.computeRadialGradientMatrix(grad, box);
              gradDom.setAttribute('cx', comp.cx.toString());
              gradDom.setAttribute('cy', comp.cy.toString());
              gradDom.setAttribute('r', comp.r.toString());
              gradDom.setAttribute('fx', comp.fx.toString());
              gradDom.setAttribute('fy', comp.fy.toString());
              gradDom.setAttribute('gradientTransform', comp.transform);
            }

            ctx.renderOverlay();
            return true;
          }
        } catch {}
      }
    }

    if (activeHandle === 'rotate' && this.rotationPivot && this.initialElementsMap.size > 0) {
      callbacks.setCursor?.('grabbing');

      const otherVertices: Point[] = [];
      ctx.model.elements.forEach((el) => {
        if (!ctx.selectionTool.isSelected(el.id) && el.vertices) {
          el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
        }
      });

      const snappedPt = ctx.snapPoint(pt, otherVertices);
      const isMagneticallySnapped = Math.hypot(snappedPt.x - pt.x, snappedPt.y - pt.y) > 0.001;
      this.currentRotationSnappedPt = isMagneticallySnapped ? snappedPt : null;

      const currentAngle = Math.atan2(snappedPt.y - this.rotationPivot.y, snappedPt.x - this.rotationPivot.x);
      let rawDelta = currentAngle - this.initialRotationAngle;
      let deg = (rawDelta * 180) / Math.PI;

      const shouldSnapAngular = e.shiftKey || (ctx.canvasMgr.snapAngular && !isMagneticallySnapped);
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
      this.lastDeltaAngle = deltaAngle;

      this.ghostTransformMap.clear();
      this.initialElementsMap.forEach((origVerts, id) => {
        const rotated = ctx.selectionTool.rotateVerticesAroundPivot(
          origVerts,
          this.rotationPivot!,
          deltaAngle
        );
        this.ghostTransformMap.set(id, rotated);
      });
      ctx.renderOverlay();
      return true;
    }

    // Scaling with directional handle Snap To (Snapping to grid, guidelines, artboard bounds, and unselected vertices)
    if (this.initialBox && activeHandle !== 'move' && this.initialElementsMap.size > 0) {
      const b = this.initialBox;
      let handleInitialX = b.x;
      let handleInitialY = b.y;

      switch (activeHandle) {
        case 'nw':
          handleInitialX = b.x;
          handleInitialY = b.y;
          break;
        case 'n':
          handleInitialX = b.cx;
          handleInitialY = b.y;
          break;
        case 'ne':
          handleInitialX = b.x + b.width;
          handleInitialY = b.y;
          break;
        case 'w':
          handleInitialX = b.x;
          handleInitialY = b.cy;
          break;
        case 'e':
          handleInitialX = b.x + b.width;
          handleInitialY = b.cy;
          break;
        case 'sw':
          handleInitialX = b.x;
          handleInitialY = b.y + b.height;
          break;
        case 's':
          handleInitialX = b.cx;
          handleInitialY = b.y + b.height;
          break;
        case 'se':
          handleInitialX = b.x + b.width;
          handleInitialY = b.y + b.height;
          break;
      }

      // Collect unselected vertices for magnetic vertex snapping
      const otherVertices: Point[] = [];
      ctx.model.elements.forEach((el) => {
        if (!ctx.selectionTool.isSelected(el.id) && el.vertices) {
          el.vertices.forEach((v) => otherVertices.push({ x: v.x, y: v.y }));
        }
      });

      const rawDx = pt.x - dragStartPt.x;
      const rawDy = pt.y - dragStartPt.y;

      const isXHandle = ['nw', 'ne', 'w', 'e', 'sw', 'se'].includes(activeHandle);
      const isYHandle = ['nw', 'n', 'ne', 'sw', 's', 'se'].includes(activeHandle);

      const targetHandlePt: Point = {
        x: handleInitialX + (isXHandle ? rawDx : 0),
        y: handleInitialY + (isYHandle ? rawDy : 0),
      };

      const snappedHandlePt = ctx.snapPoint(targetHandlePt, otherVertices);

      let effectiveDx = 0;
      let effectiveDy = 0;

      if (isXHandle) {
        effectiveDx = snappedHandlePt.x - handleInitialX;
      }
      if (isYHandle) {
        effectiveDy = snappedHandlePt.y - handleInitialY;
      }

      const didSnap =
        Math.hypot(snappedHandlePt.x - targetHandlePt.x, snappedHandlePt.y - targetHandlePt.y) > 0.001;
      this.currentScaleSnappedPt = didSnap ? snappedHandlePt : null;

      const isProportional = ctx.selectionTool.isAspectRatioLocked || e.ctrlKey;

      this.ghostTransformMap.clear();
      this.initialElementsMap.forEach((origVerts, id) => {
        const transformed = ctx.selectionTool.transformVertices(
          origVerts,
          this.initialBox,
          activeHandle as HandleType,
          effectiveDx,
          effectiveDy,
          this.initialBoxPadding,
          e.shiftKey,
          isProportional
        );
        this.ghostTransformMap.set(id, transformed);
      });
      ctx.renderOverlay();
      return true;
    }

    return false;
  }

  public onPointerUp(
    ctx: ToolContext,
    activeHandle: string,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (activeHandle === 'selection-pivot') {
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      if (selectedEls.length === 1 && ctx.selectionTool.customPivot) {
        ctx.selectionTool.setCustomPivotForElement(selectedEls[0], ctx.selectionTool.customPivot);
        ctx.syncToHost();
      }
      this.initialPivot = null;
      callbacks.onSelectionChanged?.();
      ctx.renderOverlay();
      return true;
    }

    if (
      activeHandle === 'grad-radial-center' ||
      activeHandle === 'grad-radial-radius' ||
      activeHandle === 'grad-radial-radius-y' ||
      activeHandle === 'grad-radial-focus'
    ) {
      let gradChanged = false;
      const el = ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el && this.initialGradientJson && el.attributes['data-gradient'] !== this.initialGradientJson) {
        const finalGradJson = el.attributes['data-gradient'];
        el.attributes['data-gradient'] = this.initialGradientJson;
        ctx.pushUndo();
        el.attributes['data-gradient'] = finalGradJson;
        gradChanged = true;
      }
      this.activeGradientElementId = null;
      this.initialGradientJson = null;
      ctx.render();
      if (gradChanged) {
        callbacks.onSelectionChanged?.();
        ctx.syncToHost();
      }
      return true;
    }

    if (activeHandle && activeHandle !== 'move' && this.ghostTransformMap.size > 0) {
      ctx.pushUndo();
      const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
      this.ghostTransformMap.forEach((transformedVerts, id) => {
        const el = ctx.model.elements.find((e) => e.id === id);
        if (el) {
          /**
           * ARCHITECTURAL RATIONALE: Non-Destructive Parametric Transformation (FIX-21)
           *
           * 1. Preserving Parametric Status on Scale:
           *    Previously, any transformation of arc or pie primitives triggered `convertToCurves(el)`,
           *    stripping all parametric metadata (cx, cy, rx, ry, angles, data-ellipse-type) and locking
           *    the element into an irreversible freeform path.
           *    Under non-rotational scale (`activeHandle !== 'rotate'`), the affine bounding box transform
           *    is mapped directly to center and radii:
           *      newCx = newBox.x + (oldCx - oldBox.x) * scaleX
           *      newCy = newBox.y + (oldCy - oldBox.y) * scaleY
           *      newRx = oldRx * |scaleX|
           *      newRy = oldRy * |scaleY|
           *    The exact SVG path is recompiled via `compileEllipseD` preserving native SVG arc commands ('A')
           *    and maintaining full parametric inspector controls.
           *
           * 2. Circular Arc/Pie Rotation without De-Structuring:
           *    For uniform circular arcs/pies (rx == ry), rotating around the element or selection pivot
           *    simply shifts startAngle and endAngle by lastDeltaAngle, completely avoiding conversion to curves.
           *
           * 3. Fallback for Non-Uniform Tilted Primitives:
           *    Standard SVG 1.1 lacks an intrinsic rotation angle attribute on <rect> and <ellipse> scalars.
           *    Non-uniform ellipses rotated arbitrarily without a container transform attribute must de-structure
           *    to Béziers to maintain visual fidelity without shearing.
           */
          const isRotate = activeHandle === 'rotate';
          const isPieOrArc = el.attributes['data-ellipse-type'] === 'pie' || el.attributes['data-ellipse-type'] === 'arc';

          if (isRotate && ctx.model.isParametricElement(el)) {
            const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
            const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
            if (isPieOrArc && Math.abs(rx - ry) < 0.5) {
              // Circular arc or pie: preserve parametric! Shift angular bounds by lastDeltaAngle
              const sAngle = parseFloat(el.attributes['data-start-angle'] || '0');
              const eAngle = parseFloat(el.attributes['data-end-angle'] || '360');
              let newStart = Math.round((sAngle + this.lastDeltaAngle) * 10) / 10;
              let newEnd = Math.round((eAngle + this.lastDeltaAngle) * 10) / 10;
              newStart = ((newStart % 360) + 360) % 360;
              newEnd = ((newEnd % 360) + 360) % 360;
              if (newStart === newEnd) newEnd = newStart + 360;

              el.attributes['data-start-angle'] = newStart.toString();
              el.attributes['data-end-angle'] = newEnd.toString();
              const cx = parseFloat(el.attributes.cx || '0');
              const cy = parseFloat(el.attributes.cy || '0');
              el.attributes.d = ctx.model.compileEllipseD(cx, cy, rx, ry, el.attributes['data-ellipse-type'] as any, newStart, newEnd);
              el.vertices = ctx.model.convertEllipseToVertices(cx, cy, rx, ry, el.attributes['data-ellipse-type'] as any, newStart, newEnd);
              el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
              return;
            } else {
              ctx.model.convertToCurves(el);
            }
          }

          if (!isRotate && isPieOrArc && ctx.model.isParametricElement(el) && this.initialBox) {
            const initAttrs = this.initialAttributesMap.get(id);
            const oldCx = parseFloat((initAttrs && initAttrs.cx) || el.attributes.cx || '0');
            const oldCy = parseFloat((initAttrs && initAttrs.cy) || el.attributes.cy || '0');
            const oldRx = parseFloat((initAttrs && (initAttrs.rx || initAttrs.r)) || el.attributes.rx || '1');
            const oldRy = parseFloat((initAttrs && (initAttrs.ry || initAttrs.r)) || el.attributes.ry || '1');
            const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
            const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');
            const type = (el.attributes['data-ellipse-type'] as 'pie' | 'arc') || 'pie';

            const newBox = ctx.selectionTool.getBoundingBox({ ...el, vertices: transformedVerts });
            const oldBox = this.initialBox;
            if (newBox && oldBox.width > 0 && oldBox.height > 0) {
              const scaleX = newBox.width / oldBox.width;
              const scaleY = newBox.height / oldBox.height;
              const newCx = newBox.x + (oldCx - oldBox.x) * scaleX;
              const newCy = newBox.y + (oldCy - oldBox.y) * scaleY;
              const newRx = Math.max(0.1, oldRx * scaleX);
              const newRy = Math.max(0.1, oldRy * scaleY);

              el.attributes.cx = Math.round(newCx * 100) / 100 + '';
              el.attributes.cy = Math.round(newCy * 100) / 100 + '';
              el.attributes.rx = Math.round(newRx * 100) / 100 + '';
              el.attributes.ry = Math.round(newRy * 100) / 100 + '';
              el.attributes.d = ctx.model.compileEllipseD(newCx, newCy, newRx, newRy, type, startAngle, endAngle);
              el.vertices = ctx.model.convertEllipseToVertices(newCx, newCy, newRx, newRy, type, startAngle, endAngle);
              el.attributes['data-node-types'] = el.vertices.map((v) => v.nodeType).join(',');
              return;
            }
          }

          el.vertices = transformedVerts;
          const isClosed = ctx.model.isElementClosed(el);
          el.attributes.d = ctx.model.compilePathD(el.vertices, isClosed);
          if (ctx.model.isParametricElement(el)) {
            ctx.model.syncParametricAttributes(el);
          }
        }
      });

      if (activeHandle === 'rotate' && this.rotationPivot) {
        ctx.selectionTool.updatePivotOnRotate(this.rotationPivot, this.lastDeltaAngle, selectedEls);

        // ARCHITECTURAL RATIONALE: Solidary Gradient Rotation (FIX-06)
        // Rotates linear angles and transforms radial gradient center, focus, radii (rx, ry)
        // and rotation angle solidarily around the rotation pivot.
        selectedEls.forEach((el) => {
          if (el.attributes['data-gradient']) {
            const initialVerts = this.initialElementsMap.get(el.id);
            const oldElBox = initialVerts
              ? ctx.selectionTool.getBoundingBox({ ...el, vertices: initialVerts })
              : this.initialBox;
            const newElBox = ctx.selectionTool.getBoundingBox(el);
            if (oldElBox && newElBox) {
              ctx.selectionTool.rotateElementGradient(
                el,
                this.rotationPivot!,
                this.lastDeltaAngle,
                oldElBox,
                newElBox
              );
            }
          }
        });
      } else if (this.initialBox) {
        const newBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
        if (newBox) {
          ctx.selectionTool.updatePivotOnScale(this.initialBox, newBox, selectedEls);
        }

        // Compensate gradients for elements with lockScale === false (FIX-FillLocks)
        selectedEls.forEach((el) => {
          if (el.attributes['data-gradient']) {
            const initialVerts = this.initialElementsMap.get(el.id);
            const oldElBox = initialVerts
              ? ctx.selectionTool.getBoundingBox({ ...el, vertices: initialVerts })
              : this.initialBox;
            const newElBox = ctx.selectionTool.getBoundingBox(el);
            if (oldElBox && newElBox) {
              ctx.selectionTool.compensateGradientOnScale(el, oldElBox, newElBox);
            }
          }
        });
      }

      this.ghostTransformMap.clear();
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.rotationPivot = null;
      this.currentRotationSnappedPt = null;
      this.currentScaleSnappedPt = null;
      callbacks.onSelectionChanged?.();
      ctx.syncToHost();
      ctx.render();
      return true;
    }

    this.ghostTransformMap.clear();
    this.initialElementsMap.clear();
    this.initialBox = null;
    this.rotationPivot = null;
    this.currentRotationSnappedPt = null;
    this.currentScaleSnappedPt = null;
    return false;
  }

  public cancel(ctx: ToolContext): boolean {
    let handled = false;
    if (this.ghostTransformMap.size > 0 || this.initialBox) {
      this.ghostTransformMap.clear();
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.rotationPivot = null;
      this.currentRotationSnappedPt = null;
      this.currentScaleSnappedPt = null;
      handled = true;
    }

    if (this.initialPivot) {
      ctx.selectionTool.customPivot = this.initialPivot;
      this.initialPivot = null;
      handled = true;
    }

    if (this.activeGradientElementId && this.initialGradientJson) {
      const el = ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el) {
        el.attributes['data-gradient'] = this.initialGradientJson;
        ctx.render();
      }
      this.activeGradientElementId = null;
      this.initialGradientJson = null;
      handled = true;
    }

    return handled;
  }

  public lastToggleTime: number = 0;

  /**
   * ARCHITECTURAL RATIONALE: Encapsulated Selection Mode Toggle (FIX-22)
   * Alternates between 'transform' (scale/bounding box resize handles) and 'rotate' (rotation handles & pivot).
   * Encapsulating this in TransformInteraction respects Single Responsibility Principle (SRP)
   * and allows both synthetic double-click gesture detectors and native DOM dblclick events
   * to trigger clean, synchronized state transitions across UI inspectors and canvas overlays.
   */
  public toggleSelectionMode(ctx: ToolContext, callbacks: SelectToolCallbacks): void {
    if (ctx.selectionTool.selectionMode === 'move') {
      ctx.selectionTool.selectionMode = 'scale';
    } else if (ctx.selectionTool.selectionMode === 'scale') {
      ctx.selectionTool.selectionMode = 'rotate';
    } else {
      ctx.selectionTool.selectionMode = 'move';
    }
    this.lastToggleTime = Date.now();
    callbacks.onSelectionChanged?.();
    ctx.renderOverlay();
  }

  public onDoubleClick(ctx: ToolContext, pt: Point, callbacks: SelectToolCallbacks): boolean {
    const now = Date.now();
    if (now - this.lastToggleTime < 250) {
      return true; // Debounce if synthetic double-click already handled the transition
    }

    const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
    const z = ctx.canvasMgr.zoom || 1;

    if (selectedEls.length > 0) {
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (groupBox && ctx.selectionTool.hitTestPivot(groupBox, pt, 10 / z)) {
        ctx.selectionTool.resetPivot(selectedEls.length === 1 ? selectedEls[0] : undefined);
        callbacks.onSelectionChanged?.();
        ctx.syncToHost();
        ctx.renderOverlay();
        return true;
      }

      const hit = ctx.selectionTool.hitTest(ctx.model.elements, pt, ctx.canvasMgr.zoom);
      const isInsideBox =
        groupBox &&
        pt.x >= groupBox.x &&
        pt.x <= groupBox.x + groupBox.width &&
        pt.y >= groupBox.y &&
        pt.y <= groupBox.y + groupBox.height;

      if ((hit && ctx.selectionTool.isSelected(hit.element.id)) || isInsideBox) {
        this.toggleSelectionMode(ctx, callbacks);
        return true;
      }
    }

    return false;
  }

  public renderOverlay(
    ctx: ToolContext,
    zoom: number,
    activeHandle: string | null,
    ghostDragOffset: Point | null
  ): string {
    let html = '';
    const z = zoom || 1;
    const selectedEls = ctx.model.elements.filter((e) => ctx.selectionTool.isSelected(e.id));

    if (selectedEls.length > 0) {
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (groupBox) {
        const mode = ctx.selectionTool.selectionMode;
        const boxStroke = mode === 'rotate' ? '#f59e0b' : '#38bdf8';
        
        if (mode !== 'move') {
          html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="${boxStroke}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

          const rotOffset = 18 / z;

          if (mode === 'scale') {
            const handles = [
              { x: groupBox.x, y: groupBox.y },
              { x: groupBox.cx, y: groupBox.y },
              { x: groupBox.x + groupBox.width, y: groupBox.y },
              { x: groupBox.x, y: groupBox.cy },
              { x: groupBox.x + groupBox.width, y: groupBox.cy },
              { x: groupBox.x, y: groupBox.y + groupBox.height },
              { x: groupBox.cx, y: groupBox.y + groupBox.height },
              { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
            ];

            const hSize = 7 / z;
            const hHalf = hSize / 2;
            const hRx = 1 / z;
            handles.forEach((hPos) => {
              html += `<rect x="${hPos.x - hHalf}" y="${hPos.y - hHalf}" width="${hSize}" height="${hSize}" fill="#ffffff" stroke="#0284c7" stroke-width="1" rx="${hRx}" vector-effect="non-scaling-stroke" />`;
            });
          } else if (mode === 'rotate') {
            const rotR = 4 / z;

            const rotCorners = [
              { x: groupBox.x, y: groupBox.y },
              { x: groupBox.cx, y: groupBox.y },
              { x: groupBox.x + groupBox.width, y: groupBox.y },
              { x: groupBox.x, y: groupBox.cy },
              { x: groupBox.x + groupBox.width, y: groupBox.cy },
              { x: groupBox.x, y: groupBox.y + groupBox.height },
              { x: groupBox.cx, y: groupBox.y + groupBox.height },
              { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
            ];
            rotCorners.forEach((c) => {
              html += `<circle cx="${c.x}" cy="${c.y}" r="${rotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke" style="cursor: grab;" />`;
            });
          }
        } else {
          // Mode: Move - Render vertices for visualization and snapping reference
          const hSize = 5 / z;
          selectedEls.forEach((el) => {
            if (el.vertices) {
              el.vertices.forEach((v) => {
                html += `<circle cx="${v.x}" cy="${v.y}" r="${hSize}" fill="#ffffff" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" style="pointer-events: none;" />`;
              });
            }
          });
        }

        if (selectedEls.length === 1 && !ctx.selectionTool.customPivot && ctx.selectionTool.elementPivots.has(selectedEls[0].id)) {
          ctx.selectionTool.restorePivotForElement(selectedEls[0]);
        }
        let pivot = ctx.selectionTool.getPivot(groupBox);
        if (activeHandle === 'move' && ghostDragOffset) {
          pivot = { x: pivot.x + ghostDragOffset.x, y: pivot.y + ghostDragOffset.y };
        }
        const isCustomPivot = ctx.selectionTool.customPivot !== null;

        if (isCustomPivot) {
          const leverColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
          html += `<line x1="${groupBox.cx}" y1="${groupBox.cy}" x2="${pivot.x}" y2="${pivot.y}" stroke="${leverColor}" stroke-width="1" stroke-dasharray="2 2" opacity="0.75" vector-effect="non-scaling-stroke" />`;
        }

        if (mode !== 'scale') {
          const pR = 5.5 / z;
          const tick = 8.5 / z;
          const pColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
          const pCursor = 'move';
          const pPointerEvents = 'auto';
          const pOpacity = '1.0';

          html += `
            <g class="selection-pivot-marker" style="cursor: ${pCursor}; pointer-events: ${pPointerEvents};" opacity="${pOpacity}">
              <circle cx="${pivot.x}" cy="${pivot.y}" r="${pR}" fill="#ffffff" stroke="${pColor}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <line x1="${pivot.x - tick}" y1="${pivot.y}" x2="${pivot.x + tick}" y2="${pivot.y}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <line x1="${pivot.x}" y1="${pivot.y - tick}" x2="${pivot.x}" y2="${pivot.y + tick}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <circle cx="${pivot.x}" cy="${pivot.y}" r="${1.6 / z}" fill="${pColor}" />
            </g>
          `;
        }

        if (activeHandle === 'rotate' && this.rotationPivot) {
          if (this.currentRotationSnappedPt) {
            html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${this.currentRotationSnappedPt.x}" y2="${this.currentRotationSnappedPt.y}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.9" vector-effect="non-scaling-stroke" />`;
          }
        }
      }

      // Radial & Linear Gradient overlay
      if (selectedEls.length === 1 && selectedEls[0].attributes['data-gradient']) {
        const el = selectedEls[0];
        try {
          const grad = JSON.parse(el.attributes['data-gradient']);
          const box = ctx.selectionTool.getBoundingBox(el);
          if (box && grad) {
            if (grad.type === 'linear') {
              let x1 = grad.x1 ?? 0;
              let y1 = grad.y1 ?? 0;
              let x2 = grad.x2 ?? 1;
              let y2 = grad.y2 ?? 0;
              if (grad.angle !== undefined) {
                const rad = (grad.angle * Math.PI) / 180;
                x1 = 0.5 - 0.5 * Math.cos(rad);
                y1 = 0.5 - 0.5 * Math.sin(rad);
                x2 = 0.5 + 0.5 * Math.cos(rad);
                y2 = 0.5 + 0.5 * Math.sin(rad);
              }
              const p1x = box.x + x1 * box.width;
              const p1y = box.y + y1 * box.height;
              const p2x = box.x + x2 * box.width;
              const p2y = box.y + y2 * box.height;
              const hSize = 6 / z;
              html += `<line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" stroke="#ec4899" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />`;
              html += `<rect x="${p1x - hSize / 2}" y="${p1y - hSize / 2}" width="${hSize}" height="${hSize}" fill="#ec4899" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${p2x}" cy="${p2y}" r="${hSize / 2}" fill="#3b82f6" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke" />`;
            } else if (grad.type === 'radial') {
              const cx = box.x + (grad.cx ?? 0.5) * box.width;
              const cy = box.y + (grad.cy ?? 0.5) * box.height;
              const rot = grad.rotation ?? 0;
              const rotRad = (rot * Math.PI) / 180;
              const cosRot = Math.cos(rotRad);
              const sinRot = Math.sin(rotRad);
              const spanU = Math.hypot(box.width * cosRot, box.height * sinRot);
              const spanV = Math.hypot(box.width * sinRot, box.height * cosRot);
              const rx = (grad.rx ?? grad.r ?? 0.5) * spanU;
              const ry = (grad.ry ?? grad.r ?? 0.5) * spanV;
              const fx = box.x + (grad.fx ?? grad.cx ?? 0.5) * box.width;
              const fy = box.y + (grad.fy ?? grad.cy ?? 0.5) * box.height;
              const hSize = 7 / z;
              const isCoincident = Math.hypot(fx - cx, fy - cy) < 4 / z;

              const hx1 = cx + rx * cosRot;
              const hy1 = cy + rx * sinRot;
              const hx2 = cx - ry * sinRot;
              const hy2 = cy + ry * cosRot;

              html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot}, ${cx}, ${cy})" fill="none" stroke="#ec4899" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.85" vector-effect="non-scaling-stroke" />`;
              html += `<line x1="${cx}" y1="${cy}" x2="${hx1}" y2="${hy1}" stroke="#3b82f6" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${hx1}" cy="${hy1}" r="${hSize / 2}" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: ew-resize;" />`;
              html += `<line x1="${cx}" y1="${cy}" x2="${hx2}" y2="${hy2}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
              html += `<circle cx="${hx2}" cy="${hy2}" r="${hSize / 2}" fill="#10b981" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: ns-resize;" />`;

              if (!isCoincident) {
                html += `<line x1="${cx}" y1="${cy}" x2="${fx}" y2="${fy}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
                html += `<circle cx="${fx}" cy="${fy}" r="${hSize / 2}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: crosshair;" />`;
              }

              html += `<circle cx="${cx}" cy="${cy}" r="${hSize / 1.8}" fill="#ec4899" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor: move;" />`;
              if (isCoincident) {
                html += `<circle cx="${cx}" cy="${cy}" r="${hSize / 3.8}" fill="#f59e0b" style="pointer-events: none;" />`;
              }
            }
          }
        } catch {}
      }

      if (selectedEls.length > 1) {
        selectedEls.forEach((el) => {
          const elBox = ctx.selectionTool.getSelectionBoundingBox(el, 0);
          if (elBox) {
            html += `<rect x="${elBox.x}" y="${elBox.y}" width="${elBox.width}" height="${elBox.height}" fill="none" stroke="#60a5fa" stroke-width="0.75" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke" />`;
          }
        });
      }
    }

    // Ghost Transform Vector
    if (this.ghostTransformMap.size > 0) {
      this.ghostTransformMap.forEach((gVerts, id) => {
        const el = ctx.model.elements.find((e) => e.id === id);
        if (el) {
          const isClosed = ctx.model.isElementClosed(el);
          const d = ctx.model.compilePathD(gVerts, isClosed);
          html += `<path d="${d}" fill="rgba(99, 102, 241, 0.45)" stroke="#6366f1" stroke-width="3" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
          gVerts.forEach((gv) => {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#a5b4fc" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });
    }

    // Ghost dashed bounding box during interactive scaling
    if (activeHandle && activeHandle !== 'move' && activeHandle !== 'rotate' && this.ghostTransformMap.size > 0) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      this.ghostTransformMap.forEach((gVerts) => {
        gVerts.forEach((v) => {
          if (v.x < gMinX) gMinX = v.x;
          if (v.x > gMaxX) gMaxX = v.x;
          if (v.y < gMinY) gMinY = v.y;
          if (v.y > gMaxY) gMaxY = v.y;
        });
      });
      if (gMinX !== Infinity) {
        html += `<rect x="${gMinX}" y="${gMinY}" width="${Math.max(gMaxX - gMinX, 1)}" height="${Math.max(gMaxY - gMinY, 1)}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`;
      }
    }

    if (activeHandle === 'rotate' && this.rotationPivot && selectedEls.length > 0) {
      const gBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 0);
      if (gBox) {
        const deg = (this.lastDeltaAngle * 180) / Math.PI;
        html += `<rect x="${gBox.x}" y="${gBox.y}" width="${gBox.width}" height="${gBox.height}" transform="rotate(${deg}, ${this.rotationPivot.x}, ${this.rotationPivot.y})" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`;
      }
    }

    // Magnetic Snap Target Indicator during Vector or Guideline Rotation (FIX-08)
    if (this.currentRotationSnappedPt) {
      const sp = this.currentRotationSnappedPt;
      const sR = 6 / z;
      const sCross = 9 / z;
      html += `
        <g class="rotation-snap-indicator" pointer-events="none">
          <circle cx="${sp.x}" cy="${sp.y}" r="${sR}" fill="none" stroke="#f59e0b" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x - sCross}" y1="${sp.y}" x2="${sp.x + sCross}" y2="${sp.y}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x}" y1="${sp.y - sCross}" x2="${sp.x}" y2="${sp.y + sCross}" stroke="#f59e0b" stroke-width="1" vector-effect="non-scaling-stroke" />
          <circle cx="${sp.x}" cy="${sp.y}" r="${1.8 / z}" fill="#f59e0b" />
        </g>
      `;
    }

    // Magnetic Snap Target Indicator during Vector Scaling (Snapping to grid, guides, artboard, vertices)
    if (this.currentScaleSnappedPt) {
      const sp = this.currentScaleSnappedPt;
      const sR = 6 / z;
      const sCross = 9 / z;
      html += `
        <g class="scale-snap-indicator" pointer-events="none">
          <circle cx="${sp.x}" cy="${sp.y}" r="${sR}" fill="none" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x - sCross}" y1="${sp.y}" x2="${sp.x + sCross}" y2="${sp.y}" stroke="#38bdf8" stroke-width="1" vector-effect="non-scaling-stroke" />
          <line x1="${sp.x}" y1="${sp.y - sCross}" x2="${sp.x}" y2="${sp.y + sCross}" stroke="#38bdf8" stroke-width="1" vector-effect="non-scaling-stroke" />
          <circle cx="${sp.x}" cy="${sp.y}" r="${1.8 / z}" fill="#38bdf8" />
        </g>
      `;
    }

    return html;
  }
}
