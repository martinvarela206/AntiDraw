import { Point, PathVertex } from '../../engine/VectorModel.js';
import { OverlayDescriptor } from '../../engine/canvas/OverlayDescriptor.js';

/**
 * ARCHITECTURAL RATIONALE: Encapsulated Node Marquee Selector (SOLID / SRP)
 * Segregates rubber-band box selection of multiple vertices and control points
 * away from the main NodeToolHandler.
 *
 * Technical Justifications:
 * 1. Single Responsibility Principle (SRP):
 *    Managing 2D marquee geometry, containment tests against path vertices,
 *    and multi-node selection state (additive Shift/Ctrl, subtractive Alt)
 *    is an independent spatial query responsibility.
 * 2. Visual Feedback Consistency:
 *    Renders standard dashed rubber-band rectangle matching the visual style
 *    of BoxSelectInteraction in SelectToolHandler.
 * 3. Non-Destructive Node Selection:
 *    Allows selecting multiple nodes across complex Bézier paths without
 *    triggering spurious transforms or element deselections.
 */
export class NodeMarqueeSelector {
  public marqueeStartPt: Point | null = null;
  public marqueeRect: { x: number; y: number; width: number; height: number } | null = null;
  public isDeselect: boolean = false;
  public isAdditive: boolean = false;
  public selectedVertexIds: Set<string> = new Set();

  /**
   * Returns whether a rubber-band marquee selection is actively in progress.
   */
  public isMarqueeActive(): boolean {
    return this.marqueeStartPt !== null;
  }

  /**
   * Begins a marquee selection on the canvas.
   */
  public startMarquee(pt: Point, isAdditive: boolean = false, isDeselect: boolean = false): void {
    this.marqueeStartPt = pt;
    this.marqueeRect = null;
    this.isAdditive = isAdditive;
    this.isDeselect = isDeselect;
    if (!isAdditive && !isDeselect) {
      this.selectedVertexIds.clear();
    }
  }

  /**
   * Updates the rubber-band selection dimensions as the pointer moves.
   */
  public updateMarquee(pt: Point): boolean {
    if (!this.marqueeStartPt) return false;
    const minX = Math.min(this.marqueeStartPt.x, pt.x);
    const minY = Math.min(this.marqueeStartPt.y, pt.y);
    const w = Math.abs(pt.x - this.marqueeStartPt.x);
    const h = Math.abs(pt.y - this.marqueeStartPt.y);
    this.marqueeRect = { x: minX, y: minY, width: w, height: h };
    return true;
  }

  /**
   * Completes marquee selection, testing which vertices fall strictly inside the rectangle.
   */
  public finishMarquee(vertices: PathVertex[]): string[] {
    if (!this.marqueeRect || this.marqueeRect.width < 2 || this.marqueeRect.height < 2) {
      this.cancelMarquee();
      return Array.from(this.selectedVertexIds);
    }

    const m = this.marqueeRect;
    const left = m.x;
    const right = m.x + m.width;
    const top = m.y;
    const bottom = m.y + m.height;

    const hitIds: string[] = [];
    for (const v of vertices) {
      if (v.x >= left && v.x <= right && v.y >= top && v.y <= bottom) {
        hitIds.push(v.id);
      }
    }

    if (this.isDeselect) {
      hitIds.forEach((id) => this.selectedVertexIds.delete(id));
    } else if (this.isAdditive) {
      hitIds.forEach((id) => this.selectedVertexIds.add(id));
    } else {
      this.selectedVertexIds.clear();
      hitIds.forEach((id) => this.selectedVertexIds.add(id));
    }

    this.marqueeStartPt = null;
    this.marqueeRect = null;
    return Array.from(this.selectedVertexIds);
  }

  /**
   * Cancels active rubber-band marquee drag without modifying existing selection.
   */
  public cancelMarquee(): void {
    this.marqueeStartPt = null;
    this.marqueeRect = null;
  }

  /**
   * Directly sets, adds, or toggles a vertex in the selection set.
   */
  public selectVertex(id: string, additive: boolean = false, toggle: boolean = false): void {
    if (!additive) {
      this.selectedVertexIds.clear();
      this.selectedVertexIds.add(id);
      return;
    }
    if (toggle && this.selectedVertexIds.has(id)) {
      this.selectedVertexIds.delete(id);
    } else {
      this.selectedVertexIds.add(id);
    }
  }

  /**
   * Deselects a specific vertex.
   */
  public deselectVertex(id: string): void {
    this.selectedVertexIds.delete(id);
  }

  /**
   * Clears all selected vertex IDs and cancels any marquee in progress.
   */
  public clearSelection(): void {
    this.selectedVertexIds.clear();
    this.cancelMarquee();
  }

  /**
   * Tests whether a specific vertex ID is currently selected.
   */
  public isVertexSelected(id: string): boolean {
    return this.selectedVertexIds.has(id);
  }

  public renderOverlay(z: number): OverlayDescriptor[] {
    if (!this.marqueeRect) return [];
    const m = this.marqueeRect;
    const stroke = this.isDeselect ? '#ef4444' : '#38bdf8';
    const fill = this.isDeselect ? 'rgba(239, 68, 68, 0.12)' : 'rgba(56, 189, 248, 0.12)';
    return [
      {
        type: 'rect',
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        fill,
        stroke,
        strokeWidth: 1.5 / z,
        strokeDasharray: `${4 / z} ${3 / z}`,
        vectorEffect: 'non-scaling-stroke',
      },
    ];
  }
}
