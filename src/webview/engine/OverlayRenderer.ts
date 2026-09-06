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

    // 1. High-Performance GPU-Accelerated Parametric Grid Overlay (<defs><pattern>)
    if (ctx.canvasMgr.showGrid) {
      const originX = vb.minX + (ctx.canvasMgr.rulerConfig.originX || 0);
      const originY = vb.minY + (ctx.canvasMgr.rulerConfig.originY || 0);
      const gridData = ctx.canvasMgr.generateGridDefsAndLayers(workBounds, originX, originY);
      if (gridData.defsHtml) {
        html += `<defs>${gridData.defsHtml}</defs>`;
      }
      if (gridData.layersHtml) {
        html += `<g id="grid-pattern-layers">${gridData.layersHtml}</g>`;
      }
    }

    // 2. Guide Lines Overlay (Always 1px width, inverted highlight on select, transform controls on double click)
    if (ctx.canvasMgr.showGuides) {
      ctx.canvasMgr.guides.forEach((g) => {
        if (g.visible === false) return;
        const isSelected = g.id === ctx.canvasMgr.selectedGuideId;
        const isTransforming = g.id === ctx.canvasMgr.activeGuideTransformId;

        // Inverted color on selection (default cyan #00f0ff -> bright inverse red #ff1a40)
        const guideColor = isSelected ? '#ff1a40' : (g.color || '#00f0ff');
        const dashArray = isSelected ? 'none' : '4 2';
        const geom = ctx.canvasMgr.getGuideGeometry(g, ctx.model.canvas.width, ctx.model.canvas.height);

        // Render full guide line across visible canvas span
        html += `<line x1="${geom.p1.x}" y1="${geom.p1.y}" x2="${geom.p2.x}" y2="${geom.p2.y}" stroke="${guideColor}" stroke-width="1" stroke-dasharray="${dashArray}" vector-effect="non-scaling-stroke" />`;

        // Render Transform Controls when in active Guide Double-Click Mode
        if (isTransforming) {
          // Center Pivot Node Handle
          html += `
            <circle cx="${geom.pivot.x}" cy="${geom.pivot.y}" r="6" fill="#1e293b" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
            <circle cx="${geom.pivot.x}" cy="${geom.pivot.y}" r="2" fill="${guideColor}" />
            <line x1="${geom.pivot.x - 9}" y1="${geom.pivot.y}" x2="${geom.pivot.x + 9}" y2="${geom.pivot.y}" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
            <line x1="${geom.pivot.x}" y1="${geom.pivot.y - 9}" x2="${geom.pivot.x}" y2="${geom.pivot.y + 9}" stroke="${guideColor}" stroke-width="1" vector-effect="non-scaling-stroke" />
          `;

          // Curved Double-Ended Arrows at both visible limits
          const arrowRot = (g.angle || 0) + 90;

          // Arrow 1
          html += `
            <g transform="translate(${geom.arrow1.x}, ${geom.arrow1.y}) rotate(${arrowRot})">
              <path d="M -8,-5 C -4,-10 4,-10 8,-5 M 8,-5 L 4,-7 M 8,-5 L 8,-1 M -8,-5 L -4,-7 M -8,-5 L -8,-1 M -8,5 C -4,10 4,10 8,5 M 8,5 L 4,7 M 8,5 L 8,1 M -8,5 L -4,7 M -8,5 L -8,1" fill="none" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
              <circle cx="0" cy="0" r="14" fill="transparent" />
            </g>
          `;

          // Arrow 2
          html += `
            <g transform="translate(${geom.arrow2.x}, ${geom.arrow2.y}) rotate(${arrowRot})">
              <path d="M -8,-5 C -4,-10 4,-10 8,-5 M 8,-5 L 4,-7 M 8,-5 L 8,-1 M -8,-5 L -4,-7 M -8,-5 L -8,-1 M -8,5 C -4,10 4,10 8,5 M 8,5 L 4,7 M 8,5 L 8,1 M -8,5 L -4,7 M -8,5 L -8,1" fill="none" stroke="${guideColor}" stroke-width="2" vector-effect="non-scaling-stroke" />
              <circle cx="0" cy="0" r="14" fill="transparent" />
            </g>
          `;
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

          el.vertices.forEach((v) => {
            const isSelectedVertex = isNodeMode && v.id === selectedVertexId;
            const vR = (isSelectedVertex ? 4.5 : 3.5) / z;
            html += `<circle cx="${v.x}" cy="${v.y}" r="${vR}" fill="${isSelectedVertex ? '#38bdf8' : '#ffffff'}" stroke="#0284c7" stroke-width="1.5" vector-effect="non-scaling-stroke" />`;
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
