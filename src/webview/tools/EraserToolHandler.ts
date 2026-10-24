import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, VectorElement } from '../engine/VectorModel.js';
import { EraserEngine, EraserTipShape, EraserConfig } from '../engine/boolean/EraserEngine.js';

export interface EraserHandlerCallbacks {
  setCursor?: (cursor: string) => void;
  onConfigChanged?: (config: EraserConfig) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Vector Eraser Tool Handler (EraserToolHandler)
 *
 * 1. Interactive Swath Continuous Feedback:
 *    Renders the exact brush tip footprint (circle or square) scaled to document coordinates,
 *    and provides interactive visual feedback during drag strokes.
 *
 * 2. In-Place Vector Replacement & Multi-Polygon Partitioning:
 *    Delegates subtraction and topological shape severing to EraserEngine, maintaining
 *    z-index consistency and auto-selecting or updating affected shapes.
 *
 * 3. Alt-Preserved Carving:
 *    When Alt is held, the erased swath is preserved into the document as a new vector element.
 *
 * 4. Micro-Ergonomics:
 *    Supports bracket hotkeys '[' and ']' to decrease and increase brush diameter in real time.
 */
export class EraserToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['eraser'];
  private ctx: ToolContext;
  private callbacks?: EraserHandlerCallbacks;

  public size: number = 20; // Default diameter in px
  public shape: EraserTipShape = 'circle';
  public currentPoint: Point | null = null;
  public isDragging: boolean = false;
  public trajectoryPoints: Point[] = [];
  public isAltPressed: boolean = false;

  constructor(ctx: ToolContext, callbacks?: EraserHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  public activate(): void {
    this.callbacks?.setCursor?.('none');
    this.currentPoint = null;
    this.isDragging = false;
    this.trajectoryPoints = [];
    this.ctx.renderOverlay();
  }

  public deactivate(): void {
    this.callbacks?.setCursor?.('');
    this.currentPoint = null;
    this.isDragging = false;
    this.trajectoryPoints = [];
    this.ctx.renderOverlay();
  }

  public cancel(): boolean {
    if (this.isDragging || this.trajectoryPoints.length > 0) {
      this.isDragging = false;
      this.trajectoryPoints = [];
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public setSize(newSize: number): void {
    this.size = Math.max(2, Math.min(150, Math.round(newSize)));
    this.callbacks?.onConfigChanged?.(this.getConfig());
    this.ctx.renderOverlay();
  }

  public setShape(newShape: EraserTipShape): void {
    this.shape = newShape;
    this.callbacks?.onConfigChanged?.(this.getConfig());
    this.ctx.renderOverlay();
  }

  public getConfig(): EraserConfig {
    return {
      size: this.size,
      shape: this.shape,
      preserveSwathOnAlt: this.isAltPressed,
    };
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    if (e.button !== 0) return false;

    this.isDragging = true;
    this.isAltPressed = e.altKey;
    this.currentPoint = pt;
    this.trajectoryPoints = [pt];
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    this.currentPoint = pt;
    this.isAltPressed = e.altKey;

    if (this.isDragging) {
      const lastPt = this.trajectoryPoints[this.trajectoryPoints.length - 1];
      if (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) >= 2) {
        this.trajectoryPoints.push(pt);
      }
    }

    this.ctx.renderOverlay();
    return true;
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (!this.isDragging) return false;

    this.isDragging = false;
    this.currentPoint = pt;
    this.isAltPressed = e.altKey;
    this.trajectoryPoints.push(pt);

    const radius = this.size / 2;
    const swathMp = EraserEngine.buildSwathFromPoints(this.trajectoryPoints, radius, this.shape);

    if (swathMp.length > 0) {
      // Determine candidate elements: selected elements if any, otherwise all candidate vectors
      const selectedIds = this.ctx.selectionTool.selectedElementIds;
      const candidates: VectorElement[] | undefined =
        selectedIds.size > 0
          ? this.ctx.model.elements.filter((el) => selectedIds.has(el.id))
          : undefined;

      const result = EraserEngine.applyEraser(
        this.ctx.model,
        swathMp,
        candidates,
        this.isAltPressed
      );

      const hasChanged =
        result.modifiedElementIds.length > 0 ||
        result.addedElements.length > 0 ||
        result.removedElementIds.length > 0;

      if (hasChanged) {
        this.ctx.pushUndo();
        this.ctx.render();
        this.ctx.syncToHost();
      }
    }

    this.trajectoryPoints = [];
    this.ctx.renderOverlay();
    return true;
  }

  public onKeyDown(e: KeyboardEvent): boolean | void {
    if (e.key === '[') {
      this.setSize(this.size - (this.size > 20 ? 5 : 2));
      return true;
    }
    if (e.key === ']') {
      this.setSize(this.size + (this.size >= 20 ? 5 : 2));
      return true;
    }
    if (e.key === 'Alt') {
      this.isAltPressed = true;
      this.ctx.renderOverlay();
      return true;
    }
  }

  public onKeyUp(e: KeyboardEvent): boolean | void {
    if (e.key === 'Alt') {
      this.isAltPressed = false;
      this.ctx.renderOverlay();
      return true;
    }
  }

  public renderOverlay(zoom: number = 1): string {
    if (!this.currentPoint) return '';

    const pt = this.currentPoint;
    const radius = this.size / 2;
    const strokeW = Math.max(1, 1.5 / zoom);
    const dash = `${3 / zoom} ${3 / zoom}`;

    let html = `<g id="eraser-tool-overlay" pointer-events="none">`;

    // 1. In-progress drag swath preview
    if (this.isDragging && this.trajectoryPoints.length > 1) {
      let d = `M ${this.trajectoryPoints[0].x} ${this.trajectoryPoints[0].y}`;
      for (let i = 1; i < this.trajectoryPoints.length; i++) {
        d += ` L ${this.trajectoryPoints[i].x} ${this.trajectoryPoints[i].y}`;
      }
      const swathCap = this.shape === 'square' ? 'square' : 'round';
      const swathJoin = this.shape === 'square' ? 'miter' : 'round';
      html += `<path d="${d}" fill="none" stroke="${this.isAltPressed ? '#ec4899' : '#ef4444'}" stroke-width="${this.size}" stroke-linecap="${swathCap}" stroke-linejoin="${swathJoin}" opacity="0.3" />`;
      html += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${this.size}" stroke-linecap="${swathCap}" stroke-linejoin="${swathJoin}" stroke-dasharray="${dash}" opacity="0.6" />`;
    }

    // 2. Brush tip footprint at current pointer
    const fillColor = this.isAltPressed ? 'rgba(236, 72, 153, 0.25)' : 'rgba(239, 68, 68, 0.25)';
    const strokeColor = this.isAltPressed ? '#ec4899' : '#ef4444';

    if (this.shape === 'square') {
      const minX = pt.x - radius;
      const minY = pt.y - radius;
      // White shadow/contrast outline
      html += `<rect x="${minX}" y="${minY}" width="${this.size}" height="${this.size}" fill="none" stroke="#ffffff" stroke-width="${strokeW + 1 / zoom}" opacity="0.8" />`;
      // Main dashed footprint
      html += `<rect x="${minX}" y="${minY}" width="${this.size}" height="${this.size}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-dasharray="${dash}" />`;
    } else {
      // White shadow/contrast outline
      html += `<circle cx="${pt.x}" cy="${pt.y}" r="${radius}" fill="none" stroke="#ffffff" stroke-width="${strokeW + 1 / zoom}" opacity="0.8" />`;
      // Main dashed footprint
      html += `<circle cx="${pt.x}" cy="${pt.y}" r="${radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-dasharray="${dash}" />`;
    }

    // Small center dot for pinpoint accuracy
    html += `<circle cx="${pt.x}" cy="${pt.y}" r="${1.5 / zoom}" fill="${strokeColor}" />`;

    html += `</g>`;
    return html;
  }
}
