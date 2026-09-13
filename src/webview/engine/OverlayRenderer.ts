import { VectorModel, Point } from './VectorModel.js';
import { SelectionTool } from './SelectionTool.js';
import { CanvasManager } from './CanvasManager.js';
import { NodeEditorTool } from './NodeEditorTool.js';
import { IToolHandler } from '../tools/IToolHandler.js';
import { ToolType } from '../ui/Toolbar.js';

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

/**
 * Exact rotation indicator path data from user-created SVGs:
 * - GUIDE_ROTATE_LEFT_PATH from double_arrow_vertical_left_rotate.svg
 * - GUIDE_ROTATE_RIGHT_PATH from double_arrow_vertical_right_rotate.svg
 */
export const GUIDE_ROTATE_LEFT_PATH =
  'M 17 24.83 C 16.02 22.57 14.98 19.61 14.87 17.06 C 14.76 14.21 16.08 10.22 17.23 7.29 L 18.75 8.03 L 19.46 0 L 13.48 5.45 L 15.33 6.36 C 14.05 9.53 12.55 14 12.68 17.15 C 12.79 20.05 14.03 23.4 15.17 25.9 L 13.31 26.99 L 19.67 32 L 18.39 24.03 Z';

export const GUIDE_ROTATE_RIGHT_PATH =
  'M 15.34 7.17 C 16.32 9.43 17.36 12.39 17.47 14.94 C 17.58 17.79 16.26 21.78 15.11 24.71 L 13.59 23.97 L 12.88 32 L 18.86 26.55 L 17.01 25.64 C 18.29 22.47 19.79 18 19.66 14.85 C 19.55 11.95 18.31 8.6 17.17 6.1 L 19.03 5.01 L 12.67 0 L 13.95 7.97 Z';

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
    const workBounds = ctx.model.getWorkingCanvasBounds(80);

    // 0. Artboard (ViewBox Guide Frame - transparent fill so vectors underneath are visible)
    html += `<rect x="${vb.minX}" y="${vb.minY}" width="${vb.width}" height="${vb.height}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.85" vector-effect="non-scaling-stroke" />`;

    // Artboard Badge Tag at top-left
    const tagW = 160;
    const tagH = 16;
    html += `
      <g opacity="0.95">
        <rect x="${vb.minX}" y="${vb.minY - 20}" width="${tagW}" height="${tagH}" rx="3" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" vector-effect="non-scaling-stroke" />
        <text x="${vb.minX + 6}" y="${vb.minY - 8}" font-size="10" fill="#c7d2fe" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">ViewBox: ${vb.width} × ${vb.height}</text>
      </g>
    `;

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
        const geom = ctx.canvasMgr.getGuideGeometry(g, ctx.model.canvas.width, ctx.model.canvas.height);

        // Render full guide line across visible canvas span
        html += `<line x1="${geom.p1.x}" y1="${geom.p1.y}" x2="${geom.p2.x}" y2="${geom.p2.y}" stroke="${guideColor}" stroke-width="1" stroke-dasharray="${dashArray}" vector-effect="non-scaling-stroke" />`;

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

          // Center Handle (Zoom-Invariant)
          html += `
            <g transform="translate(${centerPt.x}, ${centerPt.y}) scale(${1 / z})">
              <circle cx="0" cy="0" r="6" fill="#1e293b" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
              <circle cx="0" cy="0" r="2" fill="${guideColor}" />
              <line x1="-9" y1="0" x2="9" y2="0" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
              <line x1="0" y1="-9" x2="0" y2="9" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
            </g>
          `;

          // Rotation indicators only appear in Rotate Mode
          if (isRotateMode) {
            const arrowRot = g.angle || 0;

            // Arrow 1 (Negative offset along guideline axis - 1/4 visible span, zoom-invariant)
            html += `
              <g transform="translate(${geom.arrow1.x}, ${geom.arrow1.y}) rotate(${arrowRot}) scale(${1 / z})">
                <g transform="translate(-16, -16)">
                  <path d="${GUIDE_ROTATE_LEFT_PATH}" fill="${guideColor}" stroke="#1e293b" stroke-width="0.8" vector-effect="non-scaling-stroke" fill-rule="evenodd" />
                </g>
                <circle cx="0" cy="0" r="16" fill="transparent" />
              </g>
            `;

            // Arrow 2 (Positive offset along guideline axis - 3/4 visible span, zoom-invariant)
            html += `
              <g transform="translate(${geom.arrow2.x}, ${geom.arrow2.y}) rotate(${arrowRot}) scale(${1 / z})">
                <g transform="translate(-16, -16)">
                  <path d="${GUIDE_ROTATE_RIGHT_PATH}" fill="${guideColor}" stroke="#1e293b" stroke-width="0.8" vector-effect="non-scaling-stroke" fill-rule="evenodd" />
                </g>
                <circle cx="0" cy="0" r="16" fill="transparent" />
              </g>
            `;
          }
        }
      });
    }

    // 3. Dynamic Origin Drag Preview
    if (ctx.isDraggingOrigin && ctx.dragOriginPt) {
      const ox = ctx.dragOriginPt.x;
      const oy = ctx.dragOriginPt.y;
      html += `
        <g opacity="0.9">
          <line x1="${workBounds.minX - 500}" y1="${oy}" x2="${workBounds.maxX + 500}" y2="${oy}" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
          <line x1="${ox}" y1="${workBounds.minY - 500}" x2="${ox}" y2="${workBounds.maxY + 500}" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
          <circle cx="${ox}" cy="${oy}" r="8" fill="none" stroke="#6366f1" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <circle cx="${ox}" cy="${oy}" r="2" fill="#6366f1" />
          <rect x="${ox + 10}" y="${oy - 22}" width="72" height="18" rx="3" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" vector-effect="non-scaling-stroke" />
          <text x="${ox + 15}" y="${oy - 9}" font-size="10" fill="#c7d2fe" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">Origin (0,0)</text>
        </g>
      `;
    }

    // 4. Dynamic Guide Drag Creation Preview
    if (ctx.isDraggingGuideCreate && ctx.dragGuideCurrentPt) {
      const isHoriz = ctx.dragGuideOrientation === 'horizontal';
      if (isHoriz) {
        html += `<line x1="${workBounds.minX - 500}" y1="${ctx.dragGuideCurrentPt.y}" x2="${workBounds.maxX + 500}" y2="${ctx.dragGuideCurrentPt.y}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
      } else {
        html += `<line x1="${ctx.dragGuideCurrentPt.x}" y1="${workBounds.minY - 500}" x2="${ctx.dragGuideCurrentPt.x}" y2="${workBounds.maxY + 500}" stroke="#00f0ff" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />`;
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
            const vR = (isSelectedVertex ? 4.5 : 3.5) / z;
            if (isNodeMode && isParametric) {
              // Distinctive square node handles for parametric primitives
              const side = (isSelectedVertex ? 8 : 6) / z;
              html += `<rect x="${v.x - side / 2}" y="${v.y - side / 2}" width="${side}" height="${side}" rx="1" fill="${isSelectedVertex ? '#6366f1' : '#ffffff'}" stroke="#4338ca" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
            } else {
              html += `<circle cx="${v.x}" cy="${v.y}" r="${vR}" fill="${isSelectedVertex ? '#38bdf8' : '#ffffff'}" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
            }
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
