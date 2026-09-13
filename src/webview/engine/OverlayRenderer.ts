import { VectorModel, Point } from './VectorModel.js';
import { SelectionTool } from './SelectionTool.js';
import { CanvasManager } from './CanvasManager.js';
import { NodeEditorTool } from './NodeEditorTool.js';
import { IToolHandler } from '../tools/IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';
import { MarkerHelper, GuideHelper, NodeHelper, GUIDE_ROTATE_LEFT_PATH, GUIDE_ROTATE_RIGHT_PATH } from '../ui/helpers/index.js';

export interface OverlayRenderContext {
  model: VectorModel;
  canvasMgr: CanvasManager;
  selectionTool: SelectionTool;
  nodeEditorTool: NodeEditorTool;
  activeTool: ToolType;
  dragOriginPt: Point | null;
  dragGuideOrientation?: 'horizontal' | 'vertical';
  dragGuideCurrentPt?: Point;
  isDraggingGuideCreate?: boolean;
  isDraggingOrigin?: boolean;
  hasGhostNodeVertices?: boolean;
  tools: IToolHandler[];
}

export { GUIDE_ROTATE_LEFT_PATH, GUIDE_ROTATE_RIGHT_PATH };

/**
 * ARCHITECTURAL RATIONALE: Dedicated Overlay Rendering Engine (OverlayRenderer)
 *
 * 1. Visual Decoupling:
 *    In earlier iterations, `main.ts` owned an enormous 250-line string concatenation routine
 *    for canvas overlays. Mixing artboard frame boundaries, parametric grid patterns, guide lines,
 *    ruler origin crosshairs, and tool-specific ghost vectors in the orchestrator bloated the
 *    entry point and obscured core application flow.
 *
 * 2. Separation of Real Document vs. Ephemeral Overlay Layers:
 *    The real SVG document contains strictly persistent vector graphic elements. The overlay SVG
 *    layer (`#overlay-canvas`) is a transient canvas projected directly over the artboard.
 *    `OverlayRenderer` ensures that all ephemeral UI visuals (such as bounding boxes, Bézier handles,
 *    transformation ghosts, and guide lines) are rendered deterministically with zero DOM pollution
 *    to the underlying SVG document.
 *
 * 3. Modular Tool Delegation:
 *    Instead of monolithic switches, `OverlayRenderer` delegates tool-specific graphics to each
 *    registered `IToolHandler` via `renderOverlay(zoom)`. This keeps individual tool visual logic
 *    strictly colocated within each tool handler.
 */
export class OverlayRenderer {
  public render(ctx: OverlayRenderContext, zoom: number): string {
    let html = '';
    const z = zoom || 1;
    const vb = ctx.model.getViewBoxBounds();
    const workBounds = ctx.model.getWorkingCanvasBounds(16);
    const visibleBounds = ctx.canvasMgr.visibleBoundsProvider?.() || {
      minX: workBounds.minX,
      minY: workBounds.minY,
      maxX: workBounds.maxX,
      maxY: workBounds.maxY,
    };

    // 0. Artboard (ViewBox Guide Frame - transparent fill so vectors underneath are visible)
    /**
     * ARCHITECTURAL RATIONALE: Viewport-Clipped Artboard Guide Frame
     *
     * Problem:
     * Previously, a full `<rect>` of dimensions `vb.width x vb.height` with `vector-effect="non-scaling-stroke"`
     * and `stroke-dasharray="6 3"` was output unconditionally. At zoom > 500% (up to 3000%), the screen perimeter
     * reaches 120,000 physical pixels, forcing Skia to tessellate over 13,000 individual dash segments on every frame,
     * even when the artboard boundaries are 95% or 100% offscreen.
     *
     * Solution:
     * Segment the artboard rectangle into 4 discrete borders (top, bottom, left, right) and analytically clip each
     * to `visibleBounds`. Only visible segments are rendered, eliminating 98%+ of dash allocations and preserving 60 FPS.
     */
    const vbMaxX = vb.minX + vb.width;
    const vbMaxY = vb.minY + vb.height;
    const isVbPotentiallyVisible = !(
      vbMaxX < visibleBounds.minX ||
      vb.minX > visibleBounds.maxX ||
      vbMaxY < visibleBounds.minY ||
      vb.minY > visibleBounds.maxY
    );

    if (isVbPotentiallyVisible) {
      // Top edge
      if (vb.minY >= visibleBounds.minY && vb.minY <= visibleBounds.maxY) {
        const x1 = Math.max(vb.minX, visibleBounds.minX);
        const x2 = Math.min(vbMaxX, visibleBounds.maxX);
        if (x1 < x2) {
          html += `<line x1="${x1}" y1="${vb.minY}" x2="${x2}" y2="${vb.minY}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;
        }
      }
      // Bottom edge
      if (vbMaxY >= visibleBounds.minY && vbMaxY <= visibleBounds.maxY) {
        const x1 = Math.max(vb.minX, visibleBounds.minX);
        const x2 = Math.min(vbMaxX, visibleBounds.maxX);
        if (x1 < x2) {
          html += `<line x1="${x1}" y1="${vbMaxY}" x2="${x2}" y2="${vbMaxY}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;
        }
      }
      // Left edge
      if (vb.minX >= visibleBounds.minX && vb.minX <= visibleBounds.maxX) {
        const y1 = Math.max(vb.minY, visibleBounds.minY);
        const y2 = Math.min(vbMaxY, visibleBounds.maxY);
        if (y1 < y2) {
          html += `<line x1="${vb.minX}" y1="${y1}" x2="${vb.minX}" y2="${y2}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;
        }
      }
      // Right edge
      if (vbMaxX >= visibleBounds.minX && vbMaxX <= visibleBounds.maxX) {
        const y1 = Math.max(vb.minY, visibleBounds.minY);
        const y2 = Math.min(vbMaxY, visibleBounds.maxY);
        if (y1 < y2) {
          html += `<line x1="${vbMaxX}" y1="${y1}" x2="${vbMaxX}" y2="${y2}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;
        }
      }

      // Artboard Badge Tag at top-left (Scale-invariant via MarkerHelper) only if top-left corner is near visible viewport
      const badgeMargin = 100 / z;
      if (
        vb.minX >= visibleBounds.minX - badgeMargin &&
        vb.minX <= visibleBounds.maxX + badgeMargin &&
        vb.minY >= visibleBounds.minY - badgeMargin &&
        vb.minY <= visibleBounds.maxY + badgeMargin
      ) {
        html += MarkerHelper.renderViewBoxBadge(vb.minX, vb.minY, vb.width, vb.height, z);
      }
    }

    /**
     * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
     * Grid Layer Decoupling from Ephemeral Overlay.
     *
     * Previous Implementation:
     * The parametric SVG grid (<defs><pattern> and <rect fill="url(#pattern)">) was concatenated
     * directly into `OverlayRenderer.render()`.
     *
     * Root Cause:
     * During pointer movements, node dragging, and handle hovers, `renderOverlay()` was invoked
     * frequently (up to 120 times/sec). Serializing and wiping `overlaySvg.innerHTML` forced the
     * browser graphics engine to recompile SVG pattern definitions and destroy GPU texture caches.
     * At zoom levels > 200%, the grid rect spans tens of megapixels, resulting in crippling GPU/CPU
     * rasterization overhead and severe frame drops.
     *
     * Technical Solution:
     * The grid overlay is isolated into a dedicated `#grid-svg` element managed by `main.ts`.
     * It is updated exclusively when grid properties (spacing, colors, type, alignment), ruler origin,
     * working canvas bounds, or zoom factors change.
     * `OverlayRenderer.render()` is now strictly dedicated to fast ephemeral UI elements (artboard,
     * guides, transform handles, selection boxes, node vertices).
     */

    // 2. Guide Lines Overlay (Always 1px width, inverted highlight on select, transform controls on double click)
    if (ctx.canvasMgr.showGuides) {
      ctx.canvasMgr.guides.forEach((g) => {
        if (g.visible === false) return;
        const isSelected = g.id === ctx.canvasMgr.selectedGuideId;
        const mode = g.mode || 'move';
        const isRotateMode = isSelected && mode === 'rotate';

        // Inverted color on selection (default cyan #00f0ff -> bright inverse red #ff1a40)
        const guideColor = isSelected ? '#ff1a40' : (g.color || '#00f0ff');
        const dashArray = isSelected ? 'none' : '4 2';
        const geom = ctx.canvasMgr.getGuideGeometry(g, ctx.model.canvas.width, ctx.model.canvas.height, visibleBounds);

        // Render guide line across visible canvas span only if not degenerate (offscreen)
        if (geom.p1.x !== geom.p2.x || geom.p1.y !== geom.p2.y) {
          html += `<line x1="${geom.p1.x}" y1="${geom.p1.y}" x2="${geom.p2.x}" y2="${geom.p2.y}" stroke="${guideColor}" stroke-width="1" stroke-dasharray="${dashArray}" vector-effect="non-scaling-stroke" />`;
        }

        // ARCHITECTURAL RATIONALE: Independent Guide Line Move & Rotate Modes
        // Guide lines possess two discrete interaction modes analogous to vector objects:
        // 1. Move mode (default on select): Displays the center handle at geom.pivot (free 2D translation).
        // 2. Rotate mode (toggled via double-click): Displays both the pivot handle and the 1/4 & 3/4 rotation markers.
        if (isSelected) {
          const centerPt = geom.pivot;

          // ARCHITECTURAL RATIONALE: Zoom-Invariant Guide Line Control Indicators
          // UI control handles, pivot markers, and rotation vector indicators must maintain a constant
          // visual physical pixel size on screen across all canvas zoom levels (5% to 3000%).
          // By applying `transform="translate(...) scale(${1 / z})"`, the geometric dimensions remain fixed in screen space
          // without magnifying or shrinking as the user zooms in or out.

          // Center Handle (Zoom-Invariant via GuideHelper)
          html += GuideHelper.renderCenterHandle(centerPt.x, centerPt.y, guideColor, z);

          // Rotation indicators only appear in Rotate Mode (Zoom-Invariant via GuideHelper)
          if (isRotateMode) {
            const arrowRot = g.angle || 0;
            html += GuideHelper.renderRotationArrow(geom.arrow1.x, geom.arrow1.y, arrowRot, false, guideColor, z);
            html += GuideHelper.renderRotationArrow(geom.arrow2.x, geom.arrow2.y, arrowRot, true, guideColor, z);
          }
        }
      });
    }

    // 3. Dynamic Origin Drag Preview (Zoom-Invariant via MarkerHelper)
    if (ctx.isDraggingOrigin && ctx.dragOriginPt) {
      const ox = ctx.dragOriginPt.x;
      const oy = ctx.dragOriginPt.y;
      html += MarkerHelper.renderOriginPreview(ox, oy, visibleBounds.minX, visibleBounds.maxX, visibleBounds.minY, visibleBounds.maxY, z);
    }

    // 4. Dynamic Guide Drag Creation Preview
    if (ctx.isDraggingGuideCreate && ctx.dragGuideCurrentPt) {
      const isHoriz = ctx.dragGuideOrientation === 'horizontal';
      if (isHoriz) {
        html += `<line x1="${visibleBounds.minX}" y1="${ctx.dragGuideCurrentPt.y}" x2="${visibleBounds.maxX}" y2="${ctx.dragGuideCurrentPt.y}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      } else {
        html += `<line x1="${ctx.dragGuideCurrentPt.x}" y1="${visibleBounds.minY}" x2="${ctx.dragGuideCurrentPt.x}" y2="${visibleBounds.maxY}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      }
    }

    // 5. Always visible vertices for all selected elements (Selection mode & Node mode)
    const selectedEls = ctx.model.elements.filter((e) => ctx.selectionTool.isSelected(e.id));
    if (selectedEls.length > 0 && !ctx.hasGhostNodeVertices) {
      selectedEls.forEach((el) => {
        if (el.vertices) {
          const isNodeMode = ctx.activeTool === 'node' && selectedEls.length === 1;
          const selectedVertexId = ctx.nodeEditorTool.selectedVertexId;
          const isParametric = ctx.model.isParametricElement(el);

          el.vertices.forEach((v) => {
            const isSelectedVertex = isNodeMode && v.id === selectedVertexId;
            html += NodeHelper.renderVertex({
              x: v.x,
              y: v.y,
              isSelected: isSelectedVertex,
              isParametric: isNodeMode && isParametric,
              zoom: z,
            });
          });
        }
      });
    }

    // 6. Delegate Tool Overlays
    for (const tool of ctx.tools) {
      if (tool.renderOverlay) {
        html += tool.renderOverlay(z);
      }
    }

    return html;
  }
}
