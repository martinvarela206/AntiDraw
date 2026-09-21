import { ToolContext } from '../IToolHandler.js';
import { VectorElement, Point } from '../../engine/VectorModel.js';
import type { SelectToolCallbacks } from '../SelectToolHandler.js';

/**
 * ARCHITECTURAL RATIONALE: Encapsulated Arbitrary Pivot Manager (SOLID / SRP)
 * Segregates interactive pivot manipulation, affine center lever rendering,
 * magnetic vertex/bounding-box snapping, and companion metadata persistence.
 *
 * Technical Justifications:
 * 1. Single Responsibility: Manages exclusively the life-cycle of custom pivot points:
 *    - Interactive dragging and snapping against canvas elements, artboards, and group bounds.
 *    - Cancellation rollbacks when gestures are aborted via Escape.
 *    - Relative coordinate serialization into companion metadata via SelectionTool.setCustomPivotForElement.
 *    - SVG visual overlay rendering for pivot markers and connection levers.
 * 2. Precision & Snapping: Gathers all element vertices and bounding box centers/corners
 *    to provide instant magnetic snapping when adjusting rotation/scale origins.
 * 3. Preserves Numerical Stability: Clamps and rounds final pivot coordinates to whole integers
 *    to eliminate subpixel jitter during rotational matrix transformations.
 */
export class PivotManager {
  public initialPivot: Point | null = null;

  /**
   * Captures initial pivot state for undo/cancellation during drag gestures.
   */
  public startDrag(currentPivot: Point | null): void {
    this.initialPivot = currentPivot ? { ...currentPivot } : null;
  }

  /**
   * Handles pointer motion when dragging the custom selection pivot marker.
   * Snaps the pivot against all visible element vertices and group bounds.
   */
  public onPointerMove(
    ctx: ToolContext,
    pt: Point,
    callbacks: SelectToolCallbacks
  ): boolean {
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
    /**
     * ARCHITECTURAL RATIONALE: Sub-Pixel Cell-Center Pivot Precision
     * Preserves fractional/subpixel coordinates (such as 0.5 for 1px cell-center or odd spacing baricenters)
     * without destructive Math.round truncation to integer pixels, rounding only to 4 decimal places
     * for numerical stability and preventing coordinate jitter across save-reload cycles.
     */
    ctx.selectionTool.customPivot = {
      x: Math.round(snapped.x * 10000) / 10000,
      y: Math.round(snapped.y * 10000) / 10000,
    };
    ctx.renderOverlay();
    return true;
  }

  /**
   * Commits the custom pivot position on pointer release.
   * For single elements, persists the relative pivot into elementPivots and syncs to host metadata.
   */
  public onPointerUp(
    ctx: ToolContext,
    callbacks: SelectToolCallbacks
  ): boolean {
    const selectedEls = ctx.model.elements.filter((el) => ctx.selectionTool.isSelected(el.id));
    const oldP = this.initialPivot;
    const newP = ctx.selectionTool.customPivot;
    const changed = !oldP || !newP || Math.abs(oldP.x - newP.x) > 0.001 || Math.abs(oldP.y - newP.y) > 0.001;

    /**
     * ARCHITECTURAL RATIONALE: Undo/Redo Integration for Rotation Pivot (ITEM-05)
     * Temporarily restores the pre-drag pivot to record a clean undo transaction snapshot
     * before committing the new pivot position and serializing to metadata.
     */
    if (changed) {
      ctx.selectionTool.customPivot = oldP;
      ctx.pushUndo();
      ctx.selectionTool.customPivot = newP;
    }

    if (selectedEls.length === 1 && ctx.selectionTool.customPivot) {
      ctx.selectionTool.setCustomPivotForElement(selectedEls[0], ctx.selectionTool.customPivot);
      ctx.syncToHost();
    }
    this.initialPivot = null;
    callbacks.onSelectionChanged?.();
    callbacks.syncMetadataToHost?.();
    ctx.renderOverlay();
    return true;
  }

  /**
   * Restores initial pivot on drag cancellation (e.g. Escape key press).
   */
  public cancel(ctx: ToolContext): boolean {
    if (this.initialPivot) {
      ctx.selectionTool.customPivot = this.initialPivot;
      this.initialPivot = null;
      return true;
    }
    return false;
  }

  /**
   * Evaluates double-click on pivot marker to reset custom pivot back to geometric center.
   */
  public resetPivotOnDoubleClick(
    ctx: ToolContext,
    pt: Point,
    groupBox: any,
    selectedEls: VectorElement[],
    callbacks: SelectToolCallbacks
  ): boolean {
    const z = ctx.canvasMgr.zoom || 1;
    const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
    if (groupBox && ctx.selectionTool.hitTestPivot(groupBox, pt, 10 / z, singleEl)) {
      ctx.pushUndo();
      ctx.selectionTool.resetPivot(singleEl);
      callbacks.onSelectionChanged?.();
      callbacks.syncMetadataToHost?.();
      ctx.syncToHost();
      ctx.renderOverlay();
      return true;
    }
    return false;
  }

  /**
   * Renders SVG overlay for custom pivot lever and interactive crosshair marker.
   */
  public renderOverlay(
    ctx: ToolContext,
    groupBox: any,
    selectedEls: VectorElement[],
    mode: string,
    activeHandle: string | null,
    ghostDragOffset: Point | null,
    z: number
  ): string {
    const singleEl = selectedEls.length === 1 ? selectedEls[0] : undefined;
    if (singleEl && !ctx.selectionTool.customPivot && ctx.selectionTool.elementPivots.has(singleEl.id)) {
      ctx.selectionTool.restorePivotForElement(singleEl);
    }

    let pivot = ctx.selectionTool.getPivot(groupBox, singleEl);
    if (activeHandle === 'move' && ghostDragOffset) {
      pivot = { x: pivot.x + ghostDragOffset.x, y: pivot.y + ghostDragOffset.y };
    }
    const isCustomPivot = ctx.selectionTool.customPivot !== null;

    let html = '';
    if (isCustomPivot) {
      const leverColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
      html += `<line x1="${groupBox.cx}" y1="${groupBox.cy}" x2="${pivot.x}" y2="${pivot.y}" stroke="${leverColor}" stroke-width="1" stroke-dasharray="2 2" opacity="0.75" vector-effect="non-scaling-stroke" />`;
    }

    if (mode !== 'scale') {
      /**
       * ARCHITECTURAL RATIONALE: High-Fidelity Optical Crosshair Reticle (Mira con Centro en Pivote - ITEM-07)
       *
       * 1. Universal Readability (Dual-Stroke Contrast):
       *    Renders dual-pass crosshairs with a dark backing stroke (#0f172a at 2.4px) under a vibrant
       *    foreground stroke (#f59e0b / #0284c7 at 1.2px), guaranteeing razor-sharp visibility on
       *    dark themes, white backgrounds, and noisy vector drawings.
       *
       * 2. CorelDraw Optical Target Benchmark:
       *    Features an outer optical target ring, an inner dashed concentric ring, and a white bullseye
       *    center dot, precisely pinpointing the sub-pixel axis of rotation.
       */
      const pR = 6.5 / z;
      const tick = 10.5 / z;
      const pColor = mode === 'rotate' ? '#f59e0b' : '#0284c7';
      const pCursor = 'move';
      const pPointerEvents = 'auto';
      const pOpacity = '1.0';

      html += `
        <g class="selection-pivot-marker" style="cursor: ${pCursor}; pointer-events: ${pPointerEvents};" opacity="${pOpacity}">
          <!-- Dark high-contrast backing crosshairs -->
          <line x1="${pivot.x - tick}" y1="${pivot.y}" x2="${pivot.x + tick}" y2="${pivot.y}" stroke="#0f172a" stroke-width="2.4" vector-effect="non-scaling-stroke" />
          <line x1="${pivot.x}" y1="${pivot.y - tick}" x2="${pivot.x}" y2="${pivot.y + tick}" stroke="#0f172a" stroke-width="2.4" vector-effect="non-scaling-stroke" />

          <!-- Outer optical reticle ring -->
          <circle cx="${pivot.x}" cy="${pivot.y}" r="${pR}" fill="#0f172a" fill-opacity="0.7" stroke="${pColor}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <!-- Inner concentric reticle ring -->
          <circle cx="${pivot.x}" cy="${pivot.y}" r="${pR * 0.52}" fill="none" stroke="${pColor}" stroke-width="0.8" stroke-dasharray="1.5 1.5" vector-effect="non-scaling-stroke" />

          <!-- Foreground precision crosshairs -->
          <line x1="${pivot.x - tick}" y1="${pivot.y}" x2="${pivot.x + tick}" y2="${pivot.y}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />
          <line x1="${pivot.x}" y1="${pivot.y - tick}" x2="${pivot.x}" y2="${pivot.y + tick}" stroke="${pColor}" stroke-width="1.2" vector-effect="non-scaling-stroke" />

          <!-- Precision center bullseye dot -->
          <circle cx="${pivot.x}" cy="${pivot.y}" r="${1.8 / z}" fill="#ffffff" stroke="${pColor}" stroke-width="1" />
        </g>
      `;
    }

    return html;
  }
}
