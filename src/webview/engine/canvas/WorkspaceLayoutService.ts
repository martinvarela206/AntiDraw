import { VectorModel, PathVertex } from '../VectorModel.js';
import { CanvasManager } from '../CanvasManager.js';
import { SelectionTool } from '../SelectionTool.js';
import { NodeEditorTool } from '../NodeEditorTool.js';
import { OverlayRenderer } from '../OverlayRenderer.js';
import { SvgDomRenderer } from './SvgDomRenderer.js';
import { GridCanvasRenderer } from '../../ui/GridCanvasRenderer.js';
import { ViewportController } from '../ViewportController.js';
import { RulerView } from '../../ui/RulerView.js';
import { PropertyPanel } from '../../ui/PropertyPanel.js';
import { Toolbar } from '../../ui/Toolbar.js';
import { Session } from '../session/Session.js';
import { PenToolHandler } from '../../tools/PenToolHandler.js';
import { PolylineToolHandler } from '../../tools/PolylineToolHandler.js';
import { VectorExplorerPanel } from '../../ui/VectorExplorerPanel.js';
import { ColorPickerPopover } from '../../ui/ColorPickerPopover.js';

export interface WorkspaceLayoutContext {
  model: VectorModel;
  canvasMgr: CanvasManager;
  selectionTool: SelectionTool;
  nodeEditorTool: NodeEditorTool;
  overlayRenderer: OverlayRenderer;
  svgDomRenderer: SvgDomRenderer;
  gridCanvasRenderer: () => GridCanvasRenderer | undefined;
  getCanvasWrapper: () => HTMLElement | undefined;
  getCanvasScrollArea: () => HTMLElement | undefined;
  getSvgCanvas: () => SVGSVGElement | undefined;
  getOverlaySvg: () => SVGSVGElement | undefined;
  getViewportCtrl: () => ViewportController | undefined;
  getRulerView: () => RulerView | undefined;
  getPropertyPanel: () => PropertyPanel | undefined;
  getToolbar: () => Toolbar | undefined;
  getSession: () => Session | undefined;
  getPenHandler: () => PenToolHandler | undefined;
  getPolylineHandler: () => PolylineToolHandler | undefined;
  getVectorExplorerPanel?: () => VectorExplorerPanel | undefined;
}

/**
 * ARCHITECTURAL RATIONALE: Dedicated Workspace Layout & Render Orchestrator (WorkspaceLayoutService - L1/L4)
 *
 * 1. Single Responsibility Principle (SRP):
 *    Encapsulates dynamic workspace sizing, hardware-accelerated grid rendering,
 *    DOM projection of SVG elements via `SvgDomRenderer`, and overlay compilation via `OverlayRenderer`.
 *
 * 2. Zero-Reflow Dynamic Workspace Sizing:
 *    Mutates pixel dimensions on canvas wrappers only when integer values shift,
 *    bypassing redundant SVG viewBox rebuilds during smooth zooming and panning.
 */
export class WorkspaceLayoutService {
  private lastAppliedVb: string = '';
  private lastAppliedDisplayW: number = -1;
  private lastAppliedDisplayH: number = -1;
  private overlayRafId: number | null = null;
  private pendingOverlayRender: boolean = false;

  constructor(private ctx: WorkspaceLayoutContext) {}

  public syncRulerScroll(): void {
    this.ctx.getViewportCtrl()?.syncRulerScroll();
  }

  public applyCanvasSize(): void {
    const canvasWrapper = this.ctx.getCanvasWrapper();
    const svgCanvas = this.ctx.getSvgCanvas();
    const overlaySvg = this.ctx.getOverlaySvg();
    if (!canvasWrapper || !svgCanvas || !overlaySvg) return;

    const zoom = this.ctx.canvasMgr.zoom || 1.0;
    const workBounds = this.ctx.model.getWorkingCanvasBounds(16);
    const displayW = Math.round(workBounds.width * zoom);
    const displayH = Math.round(workBounds.height * zoom);
    const vb = `${workBounds.minX} ${workBounds.minY} ${workBounds.width} ${workBounds.height}`;
    let layoutChanged = false;

    if (this.lastAppliedDisplayW !== displayW || this.lastAppliedDisplayH !== displayH) {
      this.lastAppliedDisplayW = displayW;
      this.lastAppliedDisplayH = displayH;
      canvasWrapper.style.width = `${displayW}px`;
      canvasWrapper.style.height = `${displayH}px`;
      svgCanvas.style.width = `${displayW}px`;
      svgCanvas.style.height = `${displayH}px`;
      overlaySvg.style.width = `${displayW}px`;
      overlaySvg.style.height = `${displayH}px`;
      layoutChanged = true;
    }

    if (this.lastAppliedVb !== vb) {
      this.lastAppliedVb = vb;
      const wStr = workBounds.width.toString();
      const hStr = workBounds.height.toString();
      [svgCanvas, overlaySvg].forEach((svg) => {
        svg.setAttribute('width', wStr);
        svg.setAttribute('height', hStr);
        svg.setAttribute('viewBox', vb);
      });
      this.ctx.getRulerView()?.updateSize(workBounds.width, workBounds.height);
      layoutChanged = true;
    }

    if (layoutChanged) {
      this.updateGridLayer();
    }
  }

  public updateGridLayer(_force: boolean = false): void {
    const gridRenderer = this.ctx.gridCanvasRenderer();
    const scrollArea = this.ctx.getCanvasScrollArea();
    if (!gridRenderer || !scrollArea) return;

    const vb = this.ctx.model.getViewBoxBounds();
    const workBounds = this.ctx.model.getWorkingCanvasBounds(16);
    const originX = vb.minX + (this.ctx.canvasMgr.rulerConfig.originX || 0);
    const originY = vb.minY + (this.ctx.canvasMgr.rulerConfig.originY || 0);
    const zoom = this.ctx.canvasMgr.zoom || 1.0;

    gridRenderer.render({
      scrollArea,
      canvasMgr: this.ctx.canvasMgr,
      workBounds,
      cameraOffset: this.ctx.getViewportCtrl()?.cameraOffset || { x: 0, y: 0 },
      zoom,
      originX,
      originY,
    });
  }

  public render(autoResize: boolean = true): void {
    const session = this.ctx.getSession();
    const isDragging = session?.isDragging ?? false;

    if (autoResize && !isDragging) {
      this.applyCanvasSize();
      this.syncRulerScroll();
    }

    const svgCanvas = this.ctx.getSvgCanvas();
    if (svgCanvas) {
      this.ctx.svgDomRenderer.render(svgCanvas, this.ctx.model);
    }

    this.renderOverlayImmediate();

    const selectedEl = this.ctx.model.elements.find(
      (el) => el.id === this.ctx.selectionTool.selectedElementId
    );
    let selectedV: PathVertex | null = null;
    if (selectedEl && selectedEl.vertices && this.ctx.nodeEditorTool.selectedVertexId) {
      selectedV = selectedEl.vertices.find(
        (v) => v.id === this.ctx.nodeEditorTool.selectedVertexId
      ) || null;
    }

    const selectedGuide = this.ctx.canvasMgr.selectedGuideId
      ? this.ctx.canvasMgr.getGuide(this.ctx.canvasMgr.selectedGuideId) || null
      : null;

    const propertyPanel = this.ctx.getPropertyPanel();
    const rulerView = this.ctx.getRulerView();
    const toolbar = this.ctx.getToolbar();
    const penHandler = this.ctx.getPenHandler();
    const polylineHandler = this.ctx.getPolylineHandler();

    const hasSelectedElements = this.ctx.selectionTool.selectedElementIds.size > 0;
    if (hasSelectedElements || selectedGuide || propertyPanel?.currentPanelMode !== 'ruler') {
      rulerView?.setCornerActive(false);
    }

    const selNodeCount = Math.max(1, this.ctx.nodeEditorTool.selectedVertexIds?.size || 1);
    if (!ColorPickerPopover.isOpen()) {
      propertyPanel?.update(
        selectedV,
        toolbar?.activeTool || 'select',
        penHandler?.penNodeType || 'smooth',
        penHandler?.vertexCount || 0,
        selectedGuide,
        polylineHandler?.vertexCount || 0,
        this.ctx.canvasMgr.gridAlignmentMode,
        this.ctx.canvasMgr.grids,
        this.ctx.canvasMgr.guides,
        selNodeCount
      );
    }

    this.ctx.getVectorExplorerPanel?.()?.update();
  }

  /**
   * Coalesces high-frequency cursor and interaction overlays to browser VSync (60/120 FPS).
   * Prevents layout thrashing and DOM saturation during intense pointer movements.
   * If immediate is true, executes synchronously.
   */
  public renderOverlay(immediate: boolean = false): void {
    if (immediate) {
      this.renderOverlayImmediate();
      return;
    }

    if (this.pendingOverlayRender) return;
    this.pendingOverlayRender = true;

    if (typeof requestAnimationFrame === 'function') {
      this.overlayRafId = requestAnimationFrame(() => {
        this.pendingOverlayRender = false;
        this.overlayRafId = null;
        this.renderOverlayImmediate();
      });
    } else {
      this.pendingOverlayRender = false;
      this.renderOverlayImmediate();
    }
  }

  /**
   * Immediate synchronous rendering of ephemeral UI marks (gizmos, bounds, guides, nodes).
   * Notice: updateGridLayer is strictly decoupled here to maintain 120 FPS without canvas recalculation.
   */
  public renderOverlayImmediate(): void {
    if (this.overlayRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.overlayRafId);
      this.overlayRafId = null;
    }
    this.pendingOverlayRender = false;

    const overlaySvg = this.ctx.getOverlaySvg();
    if (!overlaySvg) return;

    const z = this.ctx.canvasMgr.zoom || 1;
    const session = this.ctx.getSession();
    const toolbar = this.ctx.getToolbar();

    overlaySvg.innerHTML = this.ctx.overlayRenderer.render(
      {
        model: this.ctx.model,
        canvasMgr: this.ctx.canvasMgr,
        selectionTool: this.ctx.selectionTool,
        nodeEditorTool: this.ctx.nodeEditorTool,
        activeTool: toolbar?.activeTool || 'select',
        dragOriginPt: session?.dragOriginPt ?? null,
        dragGuideOrientation: session?.dragGuideOrientation ?? 'horizontal',
        dragGuideCurrentPt: session?.dragGuideCurrentPt ?? { x: 0, y: 0 },
        isDraggingGuideCreate: session?.activeHandle === 'guide-create',
        isDraggingOrigin: session?.activeHandle === 'origin-drag',
        tools: session ? session.getAllHandlers() : [],
      },
      z
    );
  }
}
