import { IToolHandler, ToolContext } from './IToolHandler.js';
import { ToolType } from './ToolType.js';
import { Point, VectorElement } from '../engine/VectorModel.js';
import { SmartFillEngine, SmartFillOptions, EnclosedRegion } from '../engine/boolean/SmartFillEngine.js';
import { BooleanOperations } from '../engine/BooleanOperations.js';
import { OverlayDescriptor } from '../engine/canvas/OverlayDescriptor.js';

export interface SmartFillHandlerCallbacks {
  setCursor?: (cursor: string) => void;
}

/**
 * ARCHITECTURAL RATIONALE: Smart Fill & Shape Builder Handler (SmartFillToolHandler)
 *
 * Implements 3 distinct, homogeneous interaction modes for planar region construction:
 *
 * 1. Mode 1 (Classic Single Click):
 *    Clicking inside an enclosed region generates a discrete, independent `<path>` element
 *    without mutating or altering existing overlapping boundary curves.
 *
 * 2. Mode 2 (Shift + Click - Incremental Step-by-Step Weld):
 *    Holding <kbd>Shift</kbd> and clicking an enclosed region welds that region directly into
 *    the active/previously created shape via `BooleanOperations.union`. Each step records an
 *    individual undo step (`pushUndo()`), allowing granular rollback (<kbd>Ctrl+Z</kbd>)
 *    without the precision fatigue of continuous dragging.
 *
 * 3. Mode 3 (Continuous Drag Sweep - Illustrator Shape Builder style):
 *    Clicking and dragging across adjacent regions accumulates candidate regions along the
 *    pointer sweep trajectory. Displays a real-time combined multi-region hover preview overlay.
 *    On `pointerup`, all swept regions are welded into a single unified `<path>`, dissolving
 *    all shared internal boundary segments cleanly.
 *
 * 4. Modifier Homogeneity:
 *    <kbd>Shift</kbd> serves as the canonical additive modifier across AntiDraw (multi-selection,
 *    node multi-selection, additive marquee, and additive region fusion).
 */
export class SmartFillToolHandler implements IToolHandler {
  public readonly toolTypes: ToolType[] = ['smartFill'];
  private ctx: ToolContext;
  private callbacks?: SmartFillHandlerCallbacks;

  public lastDownPt: Point | null = null;
  public hoverRegionD: string | null = null;
  public isSweeping: boolean = false;
  public sweptRegions: Map<string, EnclosedRegion> = new Map();
  public lastActiveElementId: string | null = null;

  private cachedRegions: EnclosedRegion[] | null = null;
  private cachedElementCount: number = -1;

  public options: SmartFillOptions = {
    fillColor: '#6366f1',
    strokeColor: '#1e293b',
    strokeWidth: 1,
  };

  constructor(ctx: ToolContext, callbacks?: SmartFillHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  public invalidateCache(): void {
    this.cachedRegions = null;
    this.cachedElementCount = -1;
  }

  public activate(): void {
    this.invalidateCache();
    this.callbacks?.setCursor?.('crosshair');
  }

  public deactivate(): void {
    this.lastDownPt = null;
    this.isSweeping = false;
    this.sweptRegions.clear();
    this.hoverRegionD = null;
    this.lastActiveElementId = null;
    this.invalidateCache();
    this.callbacks?.setCursor?.('');
  }

  public cancel(): boolean {
    if (this.lastDownPt || this.hoverRegionD || this.isSweeping || this.sweptRegions.size > 0) {
      this.lastDownPt = null;
      this.isSweeping = false;
      this.sweptRegions.clear();
      this.hoverRegionD = null;
      this.invalidateCache();
      this.ctx.renderOverlay();
      return true;
    }
    return false;
  }

  private getRegionKey(r: EnclosedRegion): string {
    if (r.ring.length === 0) return 'empty';
    const p0 = r.ring[0];
    const mid = r.ring[Math.floor(r.ring.length / 2)];
    return `${Math.round(r.area * 10)}_${r.ring.length}_${Math.round(p0.x * 10)}_${Math.round(p0.y * 10)}_${Math.round(mid.x * 10)}_${Math.round(mid.y * 10)}`;
  }

  private getActiveOrSelectedElement(): VectorElement | null {
    if (this.lastActiveElementId) {
      const el = this.ctx.model.elements.find((e) => e.id === this.lastActiveElementId);
      if (el) return el;
    }
    if (this.ctx.selectionTool.selectedElementIds.size === 1) {
      const selId = Array.from(this.ctx.selectionTool.selectedElementIds)[0];
      const el = this.ctx.model.elements.find((e) => e.id === selId);
      if (el) return el;
    }
    return null;
  }

  private ensureCachedRegions(): EnclosedRegion[] {
    const currentCount = this.ctx.model.elements.length;
    if (this.cachedElementCount !== currentCount || !this.cachedRegions) {
      const candidateElements =
        this.ctx.selectionTool.selectedElementIds.size > 0
          ? this.ctx.model.elements.filter((el) => this.ctx.selectionTool.selectedElementIds.has(el.id))
          : this.ctx.model.elements;

      let detected = SmartFillEngine.detectAllRegions(candidateElements, this.ctx.model);
      if (detected.length === 0 && candidateElements !== this.ctx.model.elements) {
        detected = SmartFillEngine.detectAllRegions(this.ctx.model.elements, this.ctx.model);
      }
      this.cachedRegions = detected;
      this.cachedElementCount = currentCount;
    }
    return this.cachedRegions;
  }

  public onPointerDown(e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill' || e.button !== 0) {
      return false;
    }

    this.lastDownPt = { x: pt.x, y: pt.y };
    this.isSweeping = false;
    this.sweptRegions.clear();

    const regions = this.ensureCachedRegions();
    const initRegion = SmartFillEngine.findRegionAtPoint(pt, regions);
    if (initRegion) {
      this.sweptRegions.set(this.getRegionKey(initRegion), initRegion);
    }

    return true;
  }

  public onPointerMove(e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill') return false;

    const regions = this.ensureCachedRegions();

    // Active sweep drag gesture
    if (this.lastDownPt && (e.buttons & 1) === 1) {
      const dragDist = Math.hypot(pt.x - this.lastDownPt.x, pt.y - this.lastDownPt.y);
      if (dragDist > 5) {
        this.isSweeping = true;
      }

      if (this.isSweeping) {
        const targetRegion = SmartFillEngine.findRegionAtPoint(pt, regions);
        if (targetRegion) {
          const key = this.getRegionKey(targetRegion);
          if (!this.sweptRegions.has(key)) {
            this.sweptRegions.set(key, targetRegion);
          }
        }

        const combinedD = Array.from(this.sweptRegions.values())
          .map((r) => SmartFillEngine.compileRegionD(r, this.ctx.model))
          .join(' ');

        if (this.hoverRegionD !== combinedD) {
          this.hoverRegionD = combinedD;
          this.ctx.renderOverlay();
        }
        return true;
      }
    }

    // Passive hover over candidate region
    const targetRegion = SmartFillEngine.findRegionAtPoint(pt, regions);
    const newD = targetRegion ? SmartFillEngine.compileRegionD(targetRegion, this.ctx.model) : null;

    if (this.hoverRegionD !== newD) {
      this.hoverRegionD = newD;
      this.ctx.renderOverlay();
    }

    return true;
  }

  public onPointerUp(e: PointerEvent, pt: Point): boolean {
    if (this.ctx.getActiveTool() !== 'smartFill' || !this.lastDownPt) {
      return false;
    }

    const wasSweeping = this.isSweeping;
    const sweptCount = this.sweptRegions.size;
    const downPt = this.lastDownPt;
    this.lastDownPt = null;
    this.isSweeping = false;

    // =========================================================================
    // MODE 3: Continuous Drag Sweep across multiple regions
    // =========================================================================
    if (wasSweeping && sweptCount >= 2) {
      const regionElements: VectorElement[] = Array.from(this.sweptRegions.values()).map((r, idx) => ({
        id: `smart_fill_${Date.now().toString(36)}_${idx}`,
        tagName: 'path',
        shapeType: 'path',
        isParametric: false,
        attributes: {
          id: `smart_fill_${Date.now().toString(36)}_${idx}`,
          d: SmartFillEngine.compileRegionD(r, this.ctx.model),
          fill: this.options.fillColor || '#6366f1',
          stroke: this.options.strokeColor || '#1e293b',
          'stroke-width': String(this.options.strokeWidth ?? 1),
          'fill-rule': 'evenodd',
        },
        vertices: r.ring.map((p, vIdx) => ({
          id: `v_${vIdx}`,
          x: p.x,
          y: p.y,
          command: vIdx === 0 ? 'M' : 'L',
          nodeType: 'sharp',
        })),
        isClosed: true,
      }));

      let elementsToUnion = regionElements;
      let activeBaseEl: VectorElement | null = null;

      if (e.shiftKey) {
        activeBaseEl = this.getActiveOrSelectedElement();
        if (activeBaseEl) {
          elementsToUnion = [activeBaseEl, ...regionElements];
        }
      }

      const united = BooleanOperations.union(elementsToUnion, this.ctx.model);
      if (united) {
        this.ctx.pushUndo();
        if (activeBaseEl) {
          const idx = this.ctx.model.elements.findIndex((el) => el.id === activeBaseEl!.id);
          if (idx !== -1) {
            this.ctx.model.elements[idx] = united;
          } else {
            this.ctx.model.elements.push(united);
          }
        } else {
          this.ctx.model.elements.push(united);
        }

        this.ctx.selectionTool.select(united.id);
        this.lastActiveElementId = united.id;
        this.sweptRegions.clear();
        this.hoverRegionD = null;
        this.invalidateCache();
        this.ctx.render();
        this.ctx.renderOverlay();
        this.ctx.syncToHost();
        return true;
      }
    }

    // =========================================================================
    // MODES 1 & 2: Discrete Click (Single fragment or Shift+Click step-by-step)
    // =========================================================================
    const dist = Math.hypot(pt.x - downPt.x, pt.y - downPt.y);
    if (dist > 6) {
      this.sweptRegions.clear();
      this.hoverRegionD = null;
      this.ctx.renderOverlay();
      return false;
    }

    const candidateElements =
      this.ctx.selectionTool.selectedElementIds.size > 0
        ? this.ctx.model.elements.filter((el) => this.ctx.selectionTool.selectedElementIds.has(el.id))
        : this.ctx.model.elements;

    let newElement = SmartFillEngine.fillRegionAtPoint(
      pt,
      candidateElements,
      this.ctx.model,
      this.options,
      this.cachedRegions || undefined
    );

    if (!newElement && candidateElements !== this.ctx.model.elements) {
      newElement = SmartFillEngine.fillRegionAtPoint(
        pt,
        this.ctx.model.elements,
        this.ctx.model,
        this.options
      );
    }

    if (newElement) {
      // MODE 2: Shift + Click incremental fusion
      if (e.shiftKey) {
        const activeBaseEl = this.getActiveOrSelectedElement();
        if (activeBaseEl) {
          const united = BooleanOperations.union([activeBaseEl, newElement], this.ctx.model);
          if (united) {
            this.ctx.pushUndo();
            const idx = this.ctx.model.elements.findIndex((el) => el.id === activeBaseEl.id);
            if (idx !== -1) {
              this.ctx.model.elements[idx] = united;
            } else {
              this.ctx.model.elements.push(united);
            }

            this.ctx.selectionTool.select(united.id);
            this.lastActiveElementId = united.id;
            this.sweptRegions.clear();
            this.hoverRegionD = null;
            this.invalidateCache();
            this.ctx.render();
            this.ctx.renderOverlay();
            this.ctx.syncToHost();
            return true;
          }
        }
      }

      // MODE 1: Standard isolated fragment synthesis
      this.ctx.pushUndo();
      this.ctx.model.elements.push(newElement);
      this.ctx.selectionTool.select(newElement.id);
      this.lastActiveElementId = newElement.id;
      this.sweptRegions.clear();
      this.hoverRegionD = null;
      this.invalidateCache();
      this.ctx.render();
      this.ctx.renderOverlay();
      this.ctx.syncToHost();
      return true;
    }

    return false;
  }

  public renderOverlay(_zoom: number): OverlayDescriptor[] {
    if (!this.hoverRegionD) return [];

    return [
      {
        type: 'path',
        id: 'smart-fill-preview',
        d: this.hoverRegionD,
        fill: 'rgba(99, 102, 241, 0.25)',
        stroke: '#6366f1',
        strokeWidth: 1.5,
        strokeDasharray: '4,4',
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'none',
      },
    ];
  }
}
