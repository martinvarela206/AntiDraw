import { BaseHelper } from './BaseHelper.js';
import { GizmoRenderer } from './GizmoRenderer.js';

export interface VertexRenderOptions {
  x: number;
  y: number;
  isSelected?: boolean;
  isParametric?: boolean;
  nodeType?: string;
  zoom: number;
}

/**
 * ARCHITECTURAL RATIONALE: Scale-Invariant Vector Node Helper (NodeHelper)
 * Delegates node and handle rendering to the canonical GizmoRenderer for complete visual parity.
 */
export class NodeHelper extends BaseHelper {
  constructor(id: string = 'node_helper') {
    super(id);
  }

  public render(zoom: number, options?: VertexRenderOptions): string {
    if (!options) return '';
    return NodeHelper.renderVertex(options);
  }

  /**
   * Renders a single scale-invariant vertex indicator using GizmoRenderer.
   */
  public static renderVertex(options: VertexRenderOptions): string {
    const { x, y, isSelected = false, isParametric = false, zoom } = options;
    return GizmoRenderer.renderAnchorHtml(
      { x, y },
      {
        kind: isParametric ? 'parametric' : 'standard',
        state: isSelected ? 'selected' : 'idle',
      },
      zoom
    );
  }

  /**
   * ARCHITECTURAL RATIONALE: Canonical Fixed Quadrant Reference Node (FIX-08)
   */
  public static renderQuadrantReferenceNode(x: number, y: number, zoom: number): string {
    return GizmoRenderer.renderAnchorHtml({ x, y }, { kind: 'standard', state: 'idle' }, zoom);
  }

  /**
   * Renders a scale-invariant Bézier control handle with connecting arm using GizmoRenderer.
   */
  public static renderHandleArm(
    vx: number,
    vy: number,
    hx: number,
    hy: number,
    zoom: number,
    color?: string
  ): string {
    return GizmoRenderer.renderHandleHtml(vx, vy, hx, hy, zoom, color);
  }
}
