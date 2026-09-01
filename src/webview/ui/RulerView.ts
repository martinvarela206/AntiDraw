import { CanvasManager, RulerConfig } from '../engine/CanvasManager.js';
import { VectorModel } from '../engine/VectorModel.js';

export interface RulerViewCallbacks {
  onCornerClick: () => void;
  onStartDragGuide: (orientation: 'horizontal' | 'vertical', clientPos: { x: number; y: number }) => void;
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
  }

  public setCornerActive(active: boolean): void {
    if (this.cornerBtn) {
      this.cornerBtn.classList.toggle('active', active);
    }
  }

  private initEvents(): void {
    // Corner click opens Ruler configuration in PropertyPanel
    this.cornerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onCornerClick();
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

  public updateSize(canvasWidth: number, canvasHeight: number, scrollLeft: number = 0, scrollTop: number = 0): void {
    this.canvasW = canvasWidth;
    this.canvasH = canvasHeight;

    const dpr = window.devicePixelRatio || 1;
    const topWidth = Math.max(canvasWidth + 200, 3000);
    const leftHeight = Math.max(canvasHeight + 200, 3000);

    if (this.topRulerCanvas.width !== topWidth * dpr || this.topRulerCanvas.height !== 20 * dpr) {
      this.topRulerCanvas.width = topWidth * dpr;
      this.topRulerCanvas.height = 20 * dpr;
      this.topRulerCanvas.style.width = `${topWidth}px`;
      this.topRulerCanvas.style.height = `20px`;
    }

    if (this.leftRulerCanvas.width !== 20 * dpr || this.leftRulerCanvas.height !== leftHeight * dpr) {
      this.leftRulerCanvas.width = 20 * dpr;
      this.leftRulerCanvas.height = leftHeight * dpr;
      this.leftRulerCanvas.style.width = `20px`;
      this.leftRulerCanvas.style.height = `${leftHeight}px`;
    }

    this.renderRulers(scrollLeft, scrollTop);
  }

  public setCursorPos(canvasX: number | null, canvasY: number | null): void {
    this.currentCursorX = canvasX;
    this.currentCursorY = canvasY;
    this.renderRulers();
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

    const minScreenX = offsetCanvasXVal - 500;
    const maxScreenX = offsetCanvasXVal + workBounds.width * zoom + 500;
    const firstTickX = startX - Math.ceil((startX - minScreenX) / subStep) * subStep;

    for (let x = firstTickX; x < maxScreenX; x += subStep) {
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

    // Cursor indicator on top ruler
    if (this.currentCursorX !== null) {
      const curScreenX = offsetCanvasXVal + (this.currentCursorX - workBounds.minX) * zoom;
      tCtx.strokeStyle = '#00f0ff';
      tCtx.lineWidth = 1;
      tCtx.beginPath();
      tCtx.moveTo(curScreenX, 0);
      tCtx.lineTo(curScreenX, 20);
      tCtx.stroke();
    }
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

    const minScreenY = offsetCanvasYVal - 500;
    const maxScreenY = offsetCanvasYVal + workBounds.height * zoom + 500;
    const firstTickY = startY - Math.ceil((startY - minScreenY) / subStep) * subStep;

    for (let y = firstTickY; y < maxScreenY; y += subStep) {
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

    // Cursor indicator on left ruler
    if (this.currentCursorY !== null) {
      const curScreenY = offsetCanvasYVal + (this.currentCursorY - workBounds.minY) * zoom;
      lCtx.strokeStyle = '#00f0ff';
      lCtx.lineWidth = 1;
      lCtx.beginPath();
      lCtx.moveTo(0, curScreenY);
      lCtx.lineTo(20, curScreenY);
      lCtx.stroke();
    }
    lCtx.restore();
  }
}

