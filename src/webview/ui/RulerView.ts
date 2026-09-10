import { CanvasManager, RulerConfig } from '../engine/CanvasManager.js';
import { VectorModel } from '../engine/VectorModel.js';

export interface RulerViewCallbacks {
  onCornerClick: () => void;
  onResetOrigin?: () => void;
  onStartDragGuide: (orientation: 'horizontal' | 'vertical', clientPos: { x: number; y: number }) => void;
  onStartDragOrigin?: (clientPos: { x: number; y: number }) => void;
}

export class RulerView {
  private container: HTMLElement;
  private canvasMgr: CanvasManager;
  private model: VectorModel;
  private callbacks: RulerViewCallbacks;

  private cornerBtn!: HTMLElement;
  private topRulerCanvas!: HTMLCanvasElement;
  private leftRulerCanvas!: HTMLCanvasElement;
  private topCtx!: CanvasRenderingContext2D;
  private leftCtx!: CanvasRenderingContext2D;

  /**
   * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
   * Dedicated hardware-accelerated DOM cursor markers.
   * Moving these markers via CSS transform (translateX / translateY) operates directly in the
   * compositor thread at 120+ FPS, completely eliminating the previous expensive full 2D canvas
   * clearing and tick/font re-rasterization on every pointermove.
   */
  private topCursorMarker!: HTMLElement;
  private leftCursorMarker!: HTMLElement;

  private currentCursorX: number | null = null;
  private currentCursorY: number | null = null;
  private currentOffsetX: number = 0;
  private currentOffsetY: number = 0;
  private canvasW: number = 800;
  private canvasH: number = 600;

  constructor(
    container: HTMLElement,
    canvasMgr: CanvasManager,
    model: VectorModel,
    callbacks: RulerViewCallbacks
  ) {
    this.container = container;
    this.canvasMgr = canvasMgr;
    this.model = model;
    this.callbacks = callbacks;
    this.initDOM();
    this.initEvents();
  }

  private initDOM(): void {
    this.cornerBtn = this.container.querySelector('#ruler-corner')!;
    this.topRulerCanvas = this.container.querySelector('#ruler-top-canvas')!;
    this.leftRulerCanvas = this.container.querySelector('#ruler-left-canvas')!;
    this.topCtx = this.topRulerCanvas.getContext('2d')!;
    this.leftCtx = this.leftRulerCanvas.getContext('2d')!;

    // Create or bind hardware-accelerated 1px DOM indicator markers
    let topMarker = this.container.querySelector<HTMLElement>('#ruler-top-cursor');
    if (!topMarker) {
      topMarker = document.createElement('div');
      topMarker.id = 'ruler-top-cursor';
      topMarker.className = 'ruler-cursor-marker';
      this.topRulerCanvas.parentElement?.appendChild(topMarker);
    }
    this.topCursorMarker = topMarker;

    let leftMarker = this.container.querySelector<HTMLElement>('#ruler-left-cursor');
    if (!leftMarker) {
      leftMarker = document.createElement('div');
      leftMarker.id = 'ruler-left-cursor';
      leftMarker.className = 'ruler-cursor-marker';
      this.leftRulerCanvas.parentElement?.appendChild(leftMarker);
    }
    this.leftCursorMarker = leftMarker;
  }

  public setCornerActive(active: boolean): void {
    if (this.cornerBtn) {
      this.cornerBtn.classList.toggle('active', active);
    }
  }

  private initEvents(): void {
    let cornerPointerDownPos: { x: number; y: number } | null = null;
    let isCornerDragging = false;

    // Pointer down on Corner -> drag to position (0,0) Origin
    this.cornerBtn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      cornerPointerDownPos = { x: e.clientX, y: e.clientY };
      isCornerDragging = false;

      const onPointerMove = (moveEv: PointerEvent) => {
        if (!cornerPointerDownPos) return;
        const dist = Math.hypot(moveEv.clientX - cornerPointerDownPos.x, moveEv.clientY - cornerPointerDownPos.y);
        if (dist > 3 && !isCornerDragging) {
          isCornerDragging = true;
          if (this.callbacks.onStartDragOrigin) {
            this.callbacks.onStartDragOrigin({ x: moveEv.clientX, y: moveEv.clientY });
          }
          cleanup();
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        cornerPointerDownPos = null;
      };

      const onPointerUp = () => {
        cleanup();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    // Corner click opens Ruler configuration in PropertyPanel
    this.cornerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isCornerDragging) {
        this.callbacks.onCornerClick();
      }
    });

    // Corner double-click resets (0,0) origin to ViewBox top-left
    this.cornerBtn.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (this.callbacks.onResetOrigin) {
        this.callbacks.onResetOrigin();
      }
    });

    // Pointer down on Top ruler -> start dragging horizontal guide
    this.topRulerCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onStartDragGuide('horizontal', { x: e.clientX, y: e.clientY });
    });

    // Pointer down on Left ruler -> start dragging vertical guide
    this.leftRulerCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onStartDragGuide('vertical', { x: e.clientX, y: e.clientY });
    });
  }

  /**
   * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
   * Viewport-bounded canvas allocation.
   *
   * Previous Implementation:
   * `const topWidth = Math.max(container.clientWidth, canvasWidth + 500, 3000);`
   * At zoom > 200% or on large vector documents, canvasWidth could reach 5000-10000px,
   * creating enormous canvas backing stores (up to 20000px wide with Retina DPR 2.0).
   *
   * Root Cause:
   * The ruler container (.ruler-top-container and .ruler-left-container) is fixed to the
   * viewport edges and has `overflow: hidden`. Pixels beyond the visible container width
   * are never displayed on screen, wasting megabytes of GPU texture memory and forcing
   * clearRect and tick loops to iterate over thousands of offscreen coordinates.
   *
   * Solution:
   * Size the 2D canvas strictly to the visible container dimensions (topContainerW / leftContainerH).
   * As the user pans, the camera offset maps the world coordinates into the visible viewport window.
   */
  public updateSize(canvasWidth: number, canvasHeight: number, scrollLeft: number = 0, scrollTop: number = 0): void {
    this.canvasW = canvasWidth;
    this.canvasH = canvasHeight;

    const dpr = window.devicePixelRatio || 1;
    const topContainerW = this.topRulerCanvas.parentElement?.clientWidth || this.container.clientWidth || window.innerWidth;
    const leftContainerH = this.leftRulerCanvas.parentElement?.clientHeight || this.container.clientHeight || window.innerHeight;

    const topWidth = Math.max(topContainerW, 100);
    const leftHeight = Math.max(leftContainerH, 100);

    if (this.topRulerCanvas.width !== Math.round(topWidth * dpr) || this.topRulerCanvas.height !== Math.round(20 * dpr)) {
      this.topRulerCanvas.width = Math.round(topWidth * dpr);
      this.topRulerCanvas.height = Math.round(20 * dpr);
      this.topRulerCanvas.style.width = `${topWidth}px`;
      this.topRulerCanvas.style.height = `20px`;
    }

    if (this.leftRulerCanvas.width !== Math.round(20 * dpr) || this.leftRulerCanvas.height !== Math.round(leftHeight * dpr)) {
      this.leftRulerCanvas.width = Math.round(20 * dpr);
      this.leftRulerCanvas.height = Math.round(leftHeight * dpr);
      this.leftRulerCanvas.style.width = `20px`;
      this.leftRulerCanvas.style.height = `${leftHeight}px`;
    }

    this.renderRulers(scrollLeft, scrollTop);
  }

  /**
   * HISTORICAL PERFORMANCE ARCHITECTURE (FIX-12):
   * Zero-Canvas-Overhead Cursor Tracking.
   *
   * Previous Implementation:
   * `setCursorPos(x, y)` called `this.renderRulers()` on every single pointermove event.
   * On modern gaming mice (500Hz-1000Hz polling rate), this triggered hundreds of full
   * clearRect(), stroke(), and fillText() operations per second on 3000px+ canvases.
   * At zoom > 200%, the browser dropped frames severely, causing noticeable input lag.
   *
   * Technical Solution:
   * Separate the static ruler scale (which only changes when the viewport moves, zooms, or resizes)
   * from the dynamic cursor indicators. Cursor position is updated via hardware-accelerated CSS
   * transforms on dedicated 1px DOM marker elements (`topCursorMarker` and `leftCursorMarker`).
   * This costs ~0ms CPU time and 0 canvas draw calls during pointer movements.
   */
  public setCursorPos(canvasX: number | null, canvasY: number | null): void {
    this.currentCursorX = canvasX;
    this.currentCursorY = canvasY;
    this.updateCursorMarkers();
  }

  private updateCursorMarkers(): void {
    const zoom = this.canvasMgr.zoom;
    const workBounds = this.model.getWorkingCanvasBounds(80);

    if (this.currentCursorX !== null && this.topCursorMarker) {
      const curScreenX = Math.round(this.currentOffsetX + (this.currentCursorX - workBounds.minX) * zoom);
      this.topCursorMarker.style.display = 'block';
      this.topCursorMarker.style.transform = `translateX(${curScreenX}px)`;
    } else if (this.topCursorMarker) {
      this.topCursorMarker.style.display = 'none';
    }

    if (this.currentCursorY !== null && this.leftCursorMarker) {
      const curScreenY = Math.round(this.currentOffsetY + (this.currentCursorY - workBounds.minY) * zoom);
      this.leftCursorMarker.style.display = 'block';
      this.leftCursorMarker.style.transform = `translateY(${curScreenY}px)`;
    } else if (this.leftCursorMarker) {
      this.leftCursorMarker.style.display = 'none';
    }
  }

  public renderRulers(offsetCanvasX?: number, offsetCanvasY?: number): void {
    if (offsetCanvasX !== undefined) this.currentOffsetX = offsetCanvasX;
    if (offsetCanvasY !== undefined) this.currentOffsetY = offsetCanvasY;

    const offsetCanvasXVal = this.currentOffsetX;
    const offsetCanvasYVal = this.currentOffsetY;

    const dpr = window.devicePixelRatio || 1;
    const cfg = this.canvasMgr.rulerConfig;
    const zoom = this.canvasMgr.zoom;
    const vb = this.model.getViewBoxBounds();
    const workBounds = this.model.getWorkingCanvasBounds(80);

    // Calculate ruler zero origin relative to ViewBox (default at top-left of ViewBox)
    const originCanvasX = vb.minX + (cfg.originX || 0);
    const originCanvasY = vb.minY + (cfg.originY || 0);

    const startX = offsetCanvasXVal + (originCanvasX - workBounds.minX) * zoom;
    const startY = offsetCanvasYVal + (originCanvasY - workBounds.minY) * zoom;

    const vbScreenStartX = offsetCanvasXVal + (vb.minX - workBounds.minX) * zoom;
    const vbScreenStartY = offsetCanvasYVal + (vb.minY - workBounds.minY) * zoom;

    // --- RENDER TOP RULER ---
    const tCtx = this.topCtx;
    const tW = this.topRulerCanvas.width / dpr;
    const tH = 20;

    tCtx.save();
    tCtx.scale(dpr, dpr);
    tCtx.clearRect(0, 0, tW, tH);

    // Background
    tCtx.fillStyle = '#1a1b23';
    tCtx.fillRect(0, 0, tW, tH);

    // ViewBox artboard highlight region on ruler
    tCtx.fillStyle = '#222533';
    tCtx.fillRect(vbScreenStartX, 0, vb.width * zoom, tH);

    // Draw ticks
    tCtx.strokeStyle = '#475569';
    tCtx.fillStyle = '#94a3b8';
    tCtx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    tCtx.textAlign = 'left';
    tCtx.textBaseline = 'top';

    const step = (cfg.step || 50) * zoom;
    const subStep = step / 5;

    const minScreenX = 0;
    const maxScreenX = tW;
    const firstTickX = startX - Math.ceil((startX - minScreenX) / subStep) * subStep;

    for (let x = firstTickX; x <= maxScreenX + 0.1; x += subStep) {
      const relVal = Math.round((x - startX) / zoom / cfg.scale);
      const isMajor = Math.abs((x - startX) % step) < 0.5 || Math.abs((x - startX) % step - step) < 0.5;
      const isMedium = Math.abs((x - startX) % (step / 2)) < 0.5;

      tCtx.beginPath();
      if (isMajor) {
        tCtx.moveTo(x, 0);
        tCtx.lineTo(x, 20);
        tCtx.stroke();
        if (x >= 0 && x < tW - 20) {
          tCtx.fillText(`${relVal}`, x + 3, 2);
        }
      } else if (isMedium) {
        tCtx.moveTo(x, 10);
        tCtx.lineTo(x, 20);
        tCtx.stroke();
      } else {
        tCtx.moveTo(x, 14);
        tCtx.lineTo(x, 20);
        tCtx.stroke();
      }
    }

    // Ruler bottom border
    tCtx.strokeStyle = '#2b2d3d';
    tCtx.beginPath();
    tCtx.moveTo(0, 19.5);
    tCtx.lineTo(tW, 19.5);
    tCtx.stroke();
    tCtx.restore();

    // --- RENDER LEFT RULER ---
    const lCtx = this.leftCtx;
    const lW = 20;
    const lH = this.leftRulerCanvas.height / dpr;

    lCtx.save();
    lCtx.scale(dpr, dpr);
    lCtx.clearRect(0, 0, lW, lH);

    // Background
    lCtx.fillStyle = '#1a1b23';
    lCtx.fillRect(0, 0, lW, lH);

    // ViewBox artboard highlight region on ruler
    lCtx.fillStyle = '#222533';
    lCtx.fillRect(0, vbScreenStartY, lW, vb.height * zoom);

    // Draw ticks
    lCtx.strokeStyle = '#475569';
    lCtx.fillStyle = '#94a3b8';
    lCtx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const minScreenY = 0;
    const maxScreenY = lH;
    const firstTickY = startY - Math.ceil((startY - minScreenY) / subStep) * subStep;

    for (let y = firstTickY; y <= maxScreenY + 0.1; y += subStep) {
      const relVal = Math.round((y - startY) / zoom / cfg.scale);
      const isMajor = Math.abs((y - startY) % step) < 0.5 || Math.abs((y - startY) % step - step) < 0.5;
      const isMedium = Math.abs((y - startY) % (step / 2)) < 0.5;

      lCtx.beginPath();
      if (isMajor) {
        lCtx.moveTo(0, y);
        lCtx.lineTo(20, y);
        lCtx.stroke();

        if (y >= 0 && y < lH - 10) {
          lCtx.save();
          lCtx.translate(2, y + 10);
          lCtx.rotate(-Math.PI / 2);
          lCtx.textAlign = 'left';
          lCtx.textBaseline = 'top';
          lCtx.fillText(`${relVal}`, 0, 0);
          lCtx.restore();
        }
      } else if (isMedium) {
        lCtx.moveTo(10, y);
        lCtx.lineTo(20, y);
        lCtx.stroke();
      } else {
        lCtx.moveTo(14, y);
        lCtx.lineTo(20, y);
        lCtx.stroke();
      }
    }

    // Ruler right border
    lCtx.strokeStyle = '#2b2d3d';
    lCtx.beginPath();
    lCtx.moveTo(19.5, 0);
    lCtx.lineTo(19.5, lH);
    lCtx.stroke();
    lCtx.restore();

    // Synchronize DOM markers with updated camera offset/zoom
    this.updateCursorMarkers();
  }
}


