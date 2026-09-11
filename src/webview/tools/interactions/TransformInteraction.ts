import { ToolContext } from '../IToolHandler.js';
import { VectorElement, PathVertex, Point, GradientConfig } from '../../engine/VectorModel.js';
import { HandleType } from '../../engine/SelectionTool.js';
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

  public initialElementsMap: Map<string, PathVertex[]> = new Map();
  public initialBox: any = null;
  public ghostTransformMap: Map<string, PathVertex[]> = new Map();

  public getHoverCursor(ctx: ToolContext, pt: Point, selectedEls: VectorElement[]): string | null {
    if (selectedEls.length === 0) return null;
    const z = ctx.canvasMgr.zoom || 1;
    const box = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
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
            const rx = (grad.rx ?? grad.r ?? 0.5) * elBox.width;
            const ry = (grad.ry ?? grad.r ?? 0.5) * elBox.height;
            const rotRad = ((grad.rotation ?? 0) * Math.PI) / 180;
            const hx1 = cx + rx * Math.cos(rotRad);
            const hy1 = cy + rx * Math.sin(rotRad);
            const hx2 = cx - ry * Math.sin(rotRad);
            const hy2 = cy + ry * Math.cos(rotRad);
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
    selectedEls: VectorElement[]
  ): void {
    this.initialBox = { ...groupBox };
    this.initialElementsMap.clear();
    selectedEls.forEach((el) => {
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.ghostTransformMap.clear();
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
    selectedEls.forEach((el) => {
      if (el.vertices) {
        this.initialElementsMap.set(
          el.id,
          el.vertices.map((v) => ({ ...v, handleIn: v.handleIn ? { ...v.handleIn } : undefined, handleOut: v.handleOut ? { ...v.handleOut } : undefined }))
        );
      }
    });
    this.ghostTransformMap.clear();
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
        const z = ctx.canvasMgr.zoom || 1;
        const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
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
              const gdx = pt.x - cx;
              const gdy = pt.y - cy;
              const projX = gdx * Math.cos(rotRad) + gdy * Math.sin(rotRad);
              const newRx = Math.max(0.01, Math.abs(projX) / box.width);
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
              const gdx = pt.x - cx;
              const gdy = pt.y - cy;
              const projY = -gdx * Math.sin(rotRad) + gdy * Math.cos(rotRad);
              const newRy = Math.max(0.01, Math.abs(projY) / box.height);
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
              const cx = grad.cx ?? 0.5;
              const cy = grad.cy ?? 0.5;
              const rx = grad.rx ?? grad.r ?? 0.5;
              const ry = grad.ry ?? grad.r ?? 0.5;
              const rotation = grad.rotation ?? 0;
              const sy = rx > 0.0001 ? Math.round((ry / rx) * 1000) / 1000 : 1;
              gradDom.setAttribute('cx', cx.toString());
              gradDom.setAttribute('cy', cy.toString());
              gradDom.setAttribute('r', rx.toString());
              gradDom.setAttribute('fx', (grad.fx ?? cx).toString());
              gradDom.setAttribute('fy', (grad.fy ?? cy).toString());
              if (Math.abs(sy - 1) > 0.001 || Math.abs(rotation) > 0.1) {
                gradDom.setAttribute('gradientTransform', `translate(${cx}, ${cy}) rotate(${rotation}) scale(1, ${sy}) translate(-${cx}, -${cy})`);
              } else {
                gradDom.removeAttribute('gradientTransform');
              }
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

    // Scaling
    if (this.initialBox && activeHandle !== 'move' && this.initialElementsMap.size > 0) {
      this.ghostTransformMap.clear();
      this.initialElementsMap.forEach((origVerts, id) => {
        const transformed = ctx.selectionTool.transformVertices(
          origVerts,
          this.initialBox,
          activeHandle as HandleType,
          dx,
          dy
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
        const z = ctx.canvasMgr.zoom || 1;
        const newBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
        if (newBox) {
          ctx.selectionTool.updatePivotOnScale(this.initialBox, newBox, selectedEls);
        }
      }

      this.ghostTransformMap.clear();
      this.initialElementsMap.clear();
      this.initialBox = null;
      this.rotationPivot = null;
      this.currentRotationSnappedPt = null;
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

  public onDoubleClick(ctx: ToolContext, pt: Point, callbacks: SelectToolCallbacks): boolean {
    const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
    const z = ctx.canvasMgr.zoom || 1;

    if (selectedEls.length > 0) {
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
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
        ctx.selectionTool.selectionMode =
          ctx.selectionTool.selectionMode === 'transform' ? 'rotate' : 'transform';
        callbacks.onSelectionChanged?.();
        ctx.renderOverlay();
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
      const groupBox = ctx.selectionTool.getGroupSelectionBoundingBox(selectedEls, 6 / z);
      if (groupBox) {
        const mode = ctx.selectionTool.selectionMode;
        const boxStroke = mode === 'rotate' ? '#f59e0b' : '#38bdf8';
        html += `<rect x="${groupBox.x}" y="${groupBox.y}" width="${groupBox.width}" height="${groupBox.height}" fill="none" stroke="${boxStroke}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />`;

        const rotOffset = 18 / z;

        if (mode === 'transform') {
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
        } else {
          const rotR = 4 / z;
          html += `<line x1="${groupBox.cx}" y1="${groupBox.y}" x2="${groupBox.cx}" y2="${groupBox.y - rotOffset}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
          html += `<circle cx="${groupBox.cx}" cy="${groupBox.y - rotOffset}" r="${rotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke" style="cursor: grab;" />`;

          const rotCorners = [
            { x: groupBox.x, y: groupBox.y },
            { x: groupBox.x + groupBox.width, y: groupBox.y },
            { x: groupBox.x, y: groupBox.y + groupBox.height },
            { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height },
          ];
          rotCorners.forEach((c) => {
            html += `<circle cx="${c.x}" cy="${c.y}" r="${rotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke" style="cursor: grab;" />`;
          });
        }

        if (selectedEls.length === 1 && !ctx.selectionTool.customPivot && selectedEls[0].attributes['data-pivot']) {
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

        const pR = 5.5 / z;
        const tick = 8.5 / z;
        const pColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
        const pCursor = mode === 'rotate' ? 'move' : 'default';
        const pPointerEvents = mode === 'rotate' ? 'auto' : 'none';
        const pOpacity = mode === 'rotate' ? '1.0' : '0.65';

        html += `
          <g class="selection-pivot-marker" style="cursor: ${pCursor}; pointer-events: ${pPointerEvents};" opacity="${pOpacity}">
            <circle cx="${pivot.x}" cy="${pivot.y}" r="${pR}" fill="#ffffff" stroke="${pColor}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <line x1="${pivot.x - tick}" y1="${pivot.y}" x2="${pivot.x + tick}" y2="${pivot.y}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <line x1="${pivot.x}" y1="${pivot.y - tick}" x2="${pivot.x}" y2="${pivot.y + tick}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            <circle cx="${pivot.x}" cy="${pivot.y}" r="${1.6 / z}" fill="${pColor}" />
          </g>
        `;

        if (activeHandle === 'rotate' && this.rotationPivot) {
          html += `<line x1="${pivot.x}" y1="${pivot.y}" x2="${groupBox.cx}" y2="${groupBox.y - rotOffset}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3 2" opacity="0.8" vector-effect="non-scaling-stroke" />`;
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
              const rx = (grad.rx ?? grad.r ?? 0.5) * box.width;
              const ry = (grad.ry ?? grad.r ?? 0.5) * box.height;
              const rot = grad.rotation ?? 0;
              const rotRad = (rot * Math.PI) / 180;
              const fx = box.x + (grad.fx ?? grad.cx ?? 0.5) * box.width;
              const fy = box.y + (grad.fy ?? grad.cy ?? 0.5) * box.height;
              const hSize = 7 / z;
              const isCoincident = Math.hypot(fx - cx, fy - cy) < 4 / z;

              const hx1 = cx + rx * Math.cos(rotRad);
              const hy1 = cy + rx * Math.sin(rotRad);
              const hx2 = cx - ry * Math.sin(rotRad);
              const hy2 = cy + ry * Math.cos(rotRad);

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
          const elBox = ctx.selectionTool.getSelectionBoundingBox(el, 6 / z);
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
          html += `<path d="${d}" fill="rgba(99, 102, 241, 0.25)" stroke="#818cf8" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" />`;
          gVerts.forEach((gv) => {
            html += `<circle cx="${gv.x}" cy="${gv.y}" r="${3.5 / z}" fill="#a5b4fc" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
          });
        }
      });
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

    return html;
  }
}
