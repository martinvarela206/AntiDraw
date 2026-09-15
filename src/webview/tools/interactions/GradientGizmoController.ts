import { ToolContext } from '../IToolHandler.js';
import { VectorElement, Point, GradientConfig } from '../../engine/VectorModel.js';
import { SvgSerializer } from '../../engine/serialization/SvgSerializer.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * ARCHITECTURAL RATIONALE: Encapsulated Gradient Gizmo Controller (SOLID / SRP)
 * Segregates canvas-space interactive manipulation of linear and radial gradient handles,
 * real-time SVG defs DOM mutation, and gizmo overlays.
 *
 * Technical Justifications:
 * 1. Single Responsibility: Manages exclusively the interactive control handles of vector gradients:
 *    - Radial gradient center (cx, cy), focus (fx, fy), horizontal radius (rx/r), and vertical radius (ry).
 *    - Linear gradient direction lines, origin points, and termination vectors.
 *    - Fast DOM-level attribute mutation (`#ad-grad-{id}`) for smooth 60fps rendering during live drag.
 * 2. Non-Destructive Undo Commit: Defers undo stack recording until pointer release (`onPointerUp`),
 *    storing the initial gradient JSON state and executing a single transactional pushUndo.
 * 3. Numerical Stability: Normalizes coordinates relative to element bounding boxes and rounds to
 *    3 decimal places to prevent SVG serialization bloat and floating-point drift.
 */
export class GradientGizmoController {
  public activeGradientElementId: string | null = null;
  public initialGradientJson: string | null = null;

  /**
   * Initializes interactive drag for a specific element's gradient.
   */
  public start(elementId: string, initialJson: string): void {
    this.activeGradientElementId = elementId;
    this.initialGradientJson = initialJson;
  }

  /**
   * Determines hover cursor over interactive radial gradient gizmo handles.
   */
  public getHoverCursor(ctx: ToolContext, pt: Point, selectedEls: VectorElement[]): string | null {
    if (selectedEls.length !== 1 || !selectedEls[0].attributes['data-gradient']) {
      return null;
    }

    const el = selectedEls[0];
    const z = ctx.canvasMgr.zoom || 1;

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

    return null;
  }

  /**
   * Handles real-time drag gestures on radial gradient center, radius, and focus handles.
   */
  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    activeHandle: string,
    e: PointerEvent,
    callbacks: SelectToolCallbacks
  ): boolean {
    if (
      !(
        activeHandle === 'grad-radial-center' ||
        activeHandle === 'grad-radial-radius' ||
        activeHandle === 'grad-radial-radius-y' ||
        activeHandle === 'grad-radial-focus'
      ) ||
      !this.activeGradientElementId
    ) {
      return false;
    }

    const el = ctx.model.elements.find((elItem) => elItem.id === this.activeGradientElementId);
    if (!el || !el.attributes['data-gradient']) {
      return false;
    }

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

    return false;
  }

  /**
   * Commits the modified gradient attribute to model and undo stack on pointer release.
   */
  public onPointerUp(
    ctx: ToolContext,
    activeHandle: string,
    callbacks: SelectToolCallbacks
  ): boolean {
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
    return false;
  }

  /**
   * Reverts live gradient modifications if interaction is cancelled via Escape.
   */
  public cancel(ctx: ToolContext): boolean {
    if (this.activeGradientElementId && this.initialGradientJson) {
      const el = ctx.model.elements.find((e) => e.id === this.activeGradientElementId);
      if (el) {
        el.attributes['data-gradient'] = this.initialGradientJson;
        ctx.render();
      }
      this.activeGradientElementId = null;
      this.initialGradientJson = null;
      return true;
    }
    return false;
  }

  /**
   * Generates SVG overlay markup for linear and radial gradient controls on selected element.
   */
  public renderOverlay(
    ctx: ToolContext,
    selectedEls: VectorElement[],
    z: number
  ): string {
    if (selectedEls.length !== 1 || !selectedEls[0].attributes['data-gradient']) {
      return '';
    }

    const el = selectedEls[0];
    let html = '';

    try {
      const grad: GradientConfig = JSON.parse(el.attributes['data-gradient']);
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

    return html;
  }
}
