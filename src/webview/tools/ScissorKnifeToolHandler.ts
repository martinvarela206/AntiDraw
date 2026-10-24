import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, VectorElement } from '../engine/VectorModel.js';
import { ScissorKnifeEngine, ScissorMode, ScissorKnifeConfig } from '../engine/boolean/ScissorKnifeEngine.js';

export interface ScissorKnifeHandlerCallbacks {
  setCursor?: (cursor: string) => void;
  onConfigChanged?: (config: ScissorKnifeConfig) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Vector Scissors & Knife Tool Handler (ScissorKnifeToolHandler)
 *
 * 1. Dual-Mode Unified Ergonomics:
 *    - Seamless Mode Switching: Provides automatic detection between 2-click straight bisecting
 *      cuts (Mode 1 / Scissors) and continuous freehand carving (Mode 2 / Knife).
 *    - Explicit Mode Override: Allows users to lock the tool to 'two_clicks' or 'freehand' via the inspector.
 *
 * 2. Visual Guidance & Elastic Rubber-Banding:
 *    When the initial cut anchor is placed, an elastic guideline projects towards the cursor,
 *    rendering snap indicators on candidate vector borders and angle/distance feedback.
 *
 * 3. Non-Destructive Cancellation & History Synchronization:
 *    Pressing Escape aborts any active cut gesture instantly. Successful cuts push atomic undo
 *    records, trigger canvas re-render, and broadcast updates to the extension host.
 */
export class ScissorKnifeToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['scissors'];
  private ctx: ToolContext;
  private callbacks?: ScissorKnifeHandlerCallbacks;

  public mode: ScissorMode = 'auto';
  public smoothing: number = 30; // 0 to 100 percentage

  public firstClickPoint: Point | null = null;
  public currentPoint: Point | null = null;
  public hoverSnapPoint: Point | null = null;
  public isDragging: boolean = false;
  public trajectoryPoints: Point[] = [];

  constructor(ctx: ToolContext, callbacks?: ScissorKnifeHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  public activate(): void {
    this.callbacks?.setCursor?.('crosshair');
    this.resetState();
    this.ctx.renderOverlay();
  }

  public deactivate(): void {
    this.callbacks?.setCursor?.('');
    this.resetState();
    this.ctx.renderOverlay();
  }

  public cancel(): boolean {
    if (this.firstClickPoint !== null || this.isDragging || this.trajectoryPoints.length > 0) {
      this.resetState();
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  public resetState(): void {
    this.firstClickPoint = null;
    this.currentPoint = null;
    this.hoverSnapPoint = null;
    this.isDragging = false;
    this.trajectoryPoints = [];
  }

  public setMode(newMode: ScissorMode): void {
    this.mode = newMode;
    this.resetState();
    this.callbacks?.onConfigChanged?.(this.getConfig());
    this.ctx.renderOverlay();
  }

  public setSmoothing(newSmoothing: number): void {
    this.smoothing = Math.max(0, Math.min(100, Math.round(newSmoothing)));
    this.callbacks?.onConfigChanged?.(this.getConfig());
    this.ctx.renderOverlay();
  }

  public getConfig(): ScissorKnifeConfig {
    return {
      mode: this.mode,
      smoothing: this.smoothing,
    };
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    if (e.button !== 0) return false;

    const otherVerts: Point[] = [];
    this.ctx.model.elements.forEach((el) => {
      if (el.vertices) {
        el.vertices.forEach((v) => otherVerts.push({ x: v.x, y: v.y }));
      }
    });

    const snappedPt = this.ctx.snapPoint ? this.ctx.snapPoint(pt, otherVerts) : pt;
    this.currentPoint = snappedPt;

    // Mode 1 (Explicit two_clicks):
    if (this.mode === 'two_clicks') {
      if (!this.firstClickPoint) {
        this.firstClickPoint = snappedPt;
        this.ctx.renderOverlay();
        return true;
      } else {
        // Second click completes cut
        this.executeCut([this.firstClickPoint, snappedPt]);
        this.firstClickPoint = null;
        this.ctx.renderOverlay();
        return true;
      }
    }

    // Mode 2 (Explicit freehand) or Auto:
    this.isDragging = true;
    this.trajectoryPoints = [snappedPt];
    this.ctx.renderOverlay();
    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    const otherVerts: Point[] = [];
    this.ctx.model.elements.forEach((el) => {
      if (el.vertices) {
        el.vertices.forEach((v) => otherVerts.push({ x: v.x, y: v.y }));
      }
    });

    const snappedPt = this.ctx.snapPoint ? this.ctx.snapPoint(pt, otherVerts) : pt;
    this.currentPoint = snappedPt;
    this.hoverSnapPoint = Math.hypot(snappedPt.x - pt.x, snappedPt.y - pt.y) > 0.5 ? snappedPt : null;

    if (this.isDragging) {
      const lastPt = this.trajectoryPoints[this.trajectoryPoints.length - 1];
      if (!lastPt || Math.hypot(snappedPt.x - lastPt.x, snappedPt.y - lastPt.y) >= 2) {
        this.trajectoryPoints.push(snappedPt);
      }
    }

    this.ctx.renderOverlay();
    return true;
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (!this.isDragging) return false;
    this.isDragging = false;

    const otherVerts: Point[] = [];
    this.ctx.model.elements.forEach((el) => {
      if (el.vertices) {
        el.vertices.forEach((v) => otherVerts.push({ x: v.x, y: v.y }));
      }
    });

    const snappedPt = this.ctx.snapPoint ? this.ctx.snapPoint(pt, otherVerts) : pt;
    this.trajectoryPoints.push(snappedPt);

    const startPt = this.trajectoryPoints[0];
    const dragDistance = startPt ? Math.hypot(snappedPt.x - startPt.x, snappedPt.y - startPt.y) : 0;
    const isDragGesture = this.trajectoryPoints.length > 2 && dragDistance >= 6;

    if (isDragGesture || this.mode === 'freehand') {
      // Freehand Cut (Mode 2)
      this.executeCut(this.trajectoryPoints);
      this.resetState();
    } else {
      // Click without drag in Auto or Two-Clicks:
      if (!this.firstClickPoint) {
        // Register first click of two-click scissors
        this.firstClickPoint = snappedPt;
      } else {
        // Second click: execute bisecting straight cut
        this.executeCut([this.firstClickPoint, snappedPt]);
        this.firstClickPoint = null;
      }
      this.trajectoryPoints = [];
    }

    this.ctx.renderOverlay();
    return true;
  }

  public onKeyDown(e: KeyboardEvent): boolean | void {
    if (e.key === 'Escape') {
      return this.cancel();
    }
  }

  public onKeyUp(e: KeyboardEvent): boolean | void {
    // No-op for now
  }

  private executeCut(cutPoints: Point[]): void {
    if (cutPoints.length < 2) return;

    // Filter candidate elements: selected elements if any, otherwise all unlocked vectors
    const selectedIds = this.ctx.selectionTool.selectedElementIds;
    const candidates: VectorElement[] | undefined =
      selectedIds.size > 0
        ? this.ctx.model.elements.filter((el) => selectedIds.has(el.id))
        : undefined;

    const result = ScissorKnifeEngine.applyCut(
      this.ctx.model,
      cutPoints,
      candidates,
      this.getConfig()
    );

    const hasChanged =
      result.modifiedElementIds.length > 0 ||
      result.addedElements.length > 0 ||
      result.removedElementIds.length > 0;

    if (hasChanged) {
      // Auto-select newly created parts
      if (result.addedElements.length > 0) {
        this.ctx.selectionTool.selectedElementIds.clear();
        result.addedElements.forEach((el) => this.ctx.selectionTool.selectedElementIds.add(el.id));
      }

      this.ctx.pushUndo();
      this.ctx.render();
      this.ctx.syncToHost();
    }
  }

  public renderOverlay(zoom: number = 1): string {
    const strokeW = Math.max(1, 1.5 / zoom);
    const dash = `${4 / zoom} ${4 / zoom}`;
    const dotR = 3.5 / zoom;

    let html = `<g id="scissor-knife-tool-overlay" pointer-events="none">`;

    // 1. In-progress freehand drag stroke preview
    if (this.isDragging && this.trajectoryPoints.length > 1) {
      let d = `M ${this.trajectoryPoints[0].x} ${this.trajectoryPoints[0].y}`;
      for (let i = 1; i < this.trajectoryPoints.length; i++) {
        d += ` L ${this.trajectoryPoints[i].x} ${this.trajectoryPoints[i].y}`;
      }

      // White outline shadow for contrast
      html += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${strokeW + 2 / zoom}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />`;
      // Cyan-blue laser cutting line
      html += `<path d="${d}" fill="none" stroke="#06b6d4" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" />`;

      // Start & Current endpoint handles
      const start = this.trajectoryPoints[0];
      const end = this.trajectoryPoints[this.trajectoryPoints.length - 1];
      html += `<circle cx="${start.x}" cy="${start.y}" r="${dotR}" fill="#06b6d4" stroke="#ffffff" stroke-width="${1 / zoom}" />`;
      html += `<circle cx="${end.x}" cy="${end.y}" r="${dotR}" fill="#06b6d4" stroke="#ffffff" stroke-width="${1 / zoom}" />`;
    }

    // 2. Mode 1 (Two-Clicks): Elastic Guideline Projection
    if (this.firstClickPoint && this.currentPoint) {
      const p1 = this.firstClickPoint;
      const p2 = this.currentPoint;

      // Elastic line shadow
      html += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#ffffff" stroke-width="${strokeW + 2 / zoom}" stroke-linecap="round" opacity="0.8" />`;
      // Main elastic guideline (amber/cyan)
      html += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#f59e0b" stroke-width="${strokeW}" stroke-linecap="round" stroke-dasharray="${dash}" />`;

      // Initial anchor point marker (double ring)
      html += `<circle cx="${p1.x}" cy="${p1.y}" r="${dotR + 2 / zoom}" fill="none" stroke="#f59e0b" stroke-width="${1.5 / zoom}" />`;
      html += `<circle cx="${p1.x}" cy="${p1.y}" r="${dotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="${1 / zoom}" />`;

      // Moving target indicator
      html += `<circle cx="${p2.x}" cy="${p2.y}" r="${dotR}" fill="#f59e0b" stroke="#ffffff" stroke-width="${1 / zoom}" />`;
    }

    // 3. Hover snap marker
    if (this.hoverSnapPoint && !this.isDragging) {
      html += `<circle cx="${this.hoverSnapPoint.x}" cy="${this.hoverSnapPoint.y}" r="${dotR + 3 / zoom}" fill="none" stroke="#06b6d4" stroke-width="${1.5 / zoom}" stroke-dasharray="${dash}" />`;
    }

    html += `</g>`;
    return html;
  }
}
