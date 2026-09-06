import { CanvasManager } from './CanvasManager.js';
import { VectorModel, Point } from './VectorModel.js';
import { RulerView } from '../ui/RulerView.js';

export interface ViewportControllerOptions {
  canvasScrollArea: HTMLElement;
  canvasWrapper: HTMLElement;
  getSvgCanvas: () => SVGSVGElement;
  getRulerView: () => RulerView | null;
  canvasMgr: CanvasManager;
  model: VectorModel;
  onRender: () => void;
  onApplyCanvasSize: () => void;
  onZoomChanged?: (zoom: number) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Viewport and Camera Controller Decoupling
 *
 * 1. Mathematical Camera 2D Model:
 *    AntiDraw models the canvas workspace using a 2D camera transformation represented by
 *    `cameraOffset` (px) and `canvasMgr.zoom` (multiplicative scale factor). The camera
 *    offset applies directly to `canvasWrapper` via CSS `transform: translate(Xpx, Ypx)`.
 *    Separating this state from `main.ts` ensures mathematical purity, isolating coordinate
 *    transformations from editing tools, selection states, and host IPC.
 *
 * 2. Cursor-Invariant Zoom Geometry:
 *    When the user zooms using Ctrl+Wheel or the Zoom tool, the world coordinate directly
 *    underneath the mouse cursor must remain stationary on screen to prevent disorienting jumps.
 *    Derivation:
 *      worldX = (cursorViewportX - cameraOffset.x) / currentZoom
 *      newCameraOffset.x = cursorViewportX - worldX * newZoom
 *    This closed-form formula provides zero-drift, predictable zoom behavior across arbitrary zoom levels.
 *
 * 3. Screen-to-SVG Coordinate Projection via CTM Inversion:
 *    Pointer events yield client (screen) coordinates. Mapping these directly to SVG world
 *    space using bounding boxes often fails during rapid scrolling, dynamic resizing, or
 *    CSS transform transitions. ViewportController queries the live SVG CTM (`svgCanvas.getScreenCTM()`)
 *    and transforms points using its exact mathematical inverse (`ctm.inverse()`), with a robust
 *    viewBox fallback for headless/test environments where CTM may be null.
 *
 * 4. Middle-Mouse Panning & Pointer Capture:
 *    Middle mouse drag (button 1) pans the workspace. To prevent cursor loss when dragging
 *    outside the viewport boundaries and to suppress default browser auto-scroll icons,
 *    we invoke `setPointerCapture` and explicitly prevent default on `auxclick`.
 */
export class ViewportController {
  private canvasScrollArea: HTMLElement;
  private canvasWrapper: HTMLElement;
  private getSvgCanvas: () => SVGSVGElement;
  private getRulerView: () => RulerView | null;
  private canvasMgr: CanvasManager;
  private model: VectorModel;
  private onRender: () => void;
  private onApplyCanvasSize: () => void;
  private onZoomChanged?: (zoom: number) => void;

  public cameraOffset: Point = { x: 0, y: 0 };
  public isMiddlePanning: boolean = false;
  private panStartClient: { x: number; y: number } = { x: 0, y: 0 };
  private panStartOffset: Point = { x: 0, y: 0 };

  constructor(options: ViewportControllerOptions) {
    this.canvasScrollArea = options.canvasScrollArea;
    this.canvasWrapper = options.canvasWrapper;
    this.getSvgCanvas = options.getSvgCanvas;
    this.getRulerView = options.getRulerView;
    this.canvasMgr = options.canvasMgr;
    this.model = options.model;
    this.onRender = options.onRender;
    this.onApplyCanvasSize = options.onApplyCanvasSize;
    this.onZoomChanged = options.onZoomChanged;

    this.initEvents();
  }

  private initEvents(): void {
    // Middle mouse button panning (camera 2D pan)
    const startMiddlePan = (e: PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        this.isMiddlePanning = true;
        this.panStartClient = { x: e.clientX, y: e.clientY };
        this.panStartOffset = { x: this.cameraOffset.x, y: this.cameraOffset.y };
        this.canvasScrollArea.style.cursor = 'grabbing';
        this.canvasWrapper.style.cursor = 'grabbing';
        try {
          this.canvasScrollArea.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    this.canvasScrollArea.addEventListener('pointerdown', startMiddlePan);
    this.canvasWrapper.addEventListener('pointerdown', startMiddlePan);

    const onMiddlePanMove = (e: PointerEvent) => {
      if (this.isMiddlePanning) {
        e.preventDefault();
        const dx = e.clientX - this.panStartClient.x;
        const dy = e.clientY - this.panStartClient.y;
        this.cameraOffset.x = Math.round(this.panStartOffset.x + dx);
        this.cameraOffset.y = Math.round(this.panStartOffset.y + dy);
        this.applyCameraTransform();
        this.syncRulerScroll();
      }
    };

    this.canvasScrollArea.addEventListener('pointermove', onMiddlePanMove);
    window.addEventListener('pointermove', onMiddlePanMove);

    const stopMiddlePan = (e: PointerEvent) => {
      if (this.isMiddlePanning) {
        this.isMiddlePanning = false;
        this.canvasScrollArea.style.cursor = '';
        this.canvasWrapper.style.cursor = '';
        try {
          this.canvasScrollArea.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    this.canvasScrollArea.addEventListener('pointerup', stopMiddlePan);
    this.canvasScrollArea.addEventListener('pointercancel', stopMiddlePan);
    window.addEventListener('pointerup', stopMiddlePan);

    // Prevent default browser auto-scroll icon on middle click
    this.canvasScrollArea.addEventListener('auxclick', (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    });

    // Mouse Wheel: Ctrl + Wheel for Zoom, Alt + Wheel for Horizontal Pan, Wheel for Vertical Pan
    this.canvasScrollArea.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const factor = e.deltaY < 0 ? CanvasManager.ZOOM_FACTOR_IN : CanvasManager.ZOOM_FACTOR_OUT;
          this.zoomAtClientPointByFactor(e.clientX, e.clientY, factor);
        } else if (e.altKey) {
          // Alt + Scroll -> Horizontal camera pan
          e.preventDefault();
          const delta = e.deltaY || e.deltaX;
          this.cameraOffset.x -= delta;
          this.applyCameraTransform();
          this.syncRulerScroll();
        } else if (!e.shiftKey) {
          // Regular Wheel -> Vertical camera pan
          e.preventDefault();
          this.cameraOffset.y -= e.deltaY;
          this.applyCameraTransform();
          this.syncRulerScroll();
        }
      },
      { passive: false }
    );

    // Status bar zoom indicator: click to reset to 100%
    const zoomResetBtn = document.getElementById('status-zoom');
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        this.setZoom(1.0);
      });
    }

    // Status bar recenter viewBox button
    const recenterBtn = document.getElementById('btn-recenter-viewbox');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => {
        this.recenterViewBox();
      });
    }

    // Window resize handler to update rulers
    window.addEventListener('resize', () => {
      const ruler = this.getRulerView();
      if (ruler) {
        ruler.updateSize(this.model.canvas.width, this.model.canvas.height);
      }
      this.syncRulerScroll();
    });
  }

  /**
   * Recenter the document's SVG ViewBox / Artboard directly in the center of the scroll area.
   */
  public recenterViewBox(): void {
    const areaW = this.canvasScrollArea.clientWidth;
    const areaH = this.canvasScrollArea.clientHeight;
    if (areaW <= 0 || areaH <= 0) return;

    const zoom = this.canvasMgr.zoom || 1.0;
    const vb = this.model.getViewBoxBounds();
    const workBounds = this.model.getWorkingCanvasBounds(80);

    const vbCenterX = (vb.minX + vb.width / 2 - workBounds.minX) * zoom;
    const vbCenterY = (vb.minY + vb.height / 2 - workBounds.minY) * zoom;

    this.cameraOffset.x = Math.round(areaW / 2 - vbCenterX);
    this.cameraOffset.y = Math.round(areaH / 2 - vbCenterY);

    this.applyCameraTransform();
    this.syncRulerScroll();
  }

  /**
   * Zoom at a specific screen coordinate by a multiplicative factor.
   * Maintains the world coordinate beneath the cursor fixed on screen.
   */
  public zoomAtClientPointByFactor(clientX: number, clientY: number, factor: number): void {
    const currentZoom = this.canvasMgr.zoom || 1.0;
    const newZoom = this.canvasMgr.computeMultiplicativeZoom(factor);
    if (newZoom !== currentZoom) {
      const scrollRect = this.canvasScrollArea.getBoundingClientRect();
      const cursorViewportX = clientX - scrollRect.left;
      const cursorViewportY = clientY - scrollRect.top;

      const worldX = (cursorViewportX - this.cameraOffset.x) / currentZoom;
      const worldY = (cursorViewportY - this.cameraOffset.y) / currentZoom;

      this.cameraOffset.x = Math.round(cursorViewportX - worldX * newZoom);
      this.cameraOffset.y = Math.round(cursorViewportY - worldY * newZoom);

      this.canvasMgr.zoom = newZoom;
      this.onApplyCanvasSize();
      this.applyCameraTransform();
      this.syncRulerScroll();
      this.onRender();
      this.updateStatusZoom();

      if (this.onZoomChanged) {
        this.onZoomChanged(newZoom);
      }
    }
  }

  public zoomAtClientPoint(clientX: number, clientY: number, delta: number): void {
    const factor = delta > 0 ? CanvasManager.ZOOM_FACTOR_IN : CanvasManager.ZOOM_FACTOR_OUT;
    this.zoomAtClientPointByFactor(clientX, clientY, factor);
  }

  public setZoom(zoom: number): void {
    const oldZoom = this.canvasMgr.zoom || 1.0;
    const newZoom = Math.round(Math.max(0.1, Math.min(10.0, zoom)) * 10) / 10;
    if (newZoom !== oldZoom) {
      const areaW = this.canvasScrollArea.clientWidth;
      const areaH = this.canvasScrollArea.clientHeight;
      const centerViewportX = areaW / 2;
      const centerViewportY = areaH / 2;

      const worldX = (centerViewportX - this.cameraOffset.x) / oldZoom;
      const worldY = (centerViewportY - this.cameraOffset.y) / oldZoom;

      this.cameraOffset.x = Math.round(centerViewportX - worldX * newZoom);
      this.cameraOffset.y = Math.round(centerViewportY - worldY * newZoom);

      this.canvasMgr.zoom = newZoom;
      this.onApplyCanvasSize();
      this.applyCameraTransform();
      this.syncRulerScroll();
      this.onRender();
      this.updateStatusZoom();

      if (this.onZoomChanged) {
        this.onZoomChanged(newZoom);
      }
    }
  }

  public applyCameraTransform(): void {
    if (this.canvasWrapper) {
      this.canvasWrapper.style.transform = `translate(${this.cameraOffset.x}px, ${this.cameraOffset.y}px)`;
    }
  }

  public syncRulerScroll(): void {
    const ruler = this.getRulerView();
    if (!ruler || !this.canvasWrapper || !this.canvasScrollArea) return;
    const wrapRect = this.canvasWrapper.getBoundingClientRect();
    const scrollRect = this.canvasScrollArea.getBoundingClientRect();
    const offsetX = wrapRect.left - scrollRect.left;
    const offsetY = wrapRect.top - scrollRect.top;
    ruler.renderRulers(offsetX, offsetY);
  }

  public updateStatusZoom(): void {
    const zoomEl = document.getElementById('status-zoom');
    if (zoomEl) {
      zoomEl.innerText = `${Math.round(this.canvasMgr.zoom * 100)}%`;
    }
  }

  /**
   * Convert client (screen) coordinates to world SVG coordinates.
   * Utilizes the SVG CTM inverse for sub-pixel accuracy, with viewBox fallback.
   */
  public getCanvasPointFromClient(clientX: number, clientY: number): Point {
    const svg = this.getSvgCanvas();
    if (svg) {
      try {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const transformed = pt.matrixTransform(ctm.inverse());
          return { x: transformed.x, y: transformed.y };
        }
      } catch (_err) {}

      // Fallback: read directly from active SVG viewBox baseVal
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const vbX = vb ? vb.x : 0;
      const vbY = vb ? vb.y : 0;
      const vbW = vb && vb.width ? vb.width : rect.width;
      const vbH = vb && vb.height ? vb.height : rect.height;
      return {
        x: vbX + (clientX - rect.left) * (vbW / (rect.width || 1)),
        y: vbY + (clientY - rect.top) * (vbH / (rect.height || 1)),
      };
    }

    return { x: clientX, y: clientY };
  }
}
