import { BaseHelper } from './BaseHelper.js';

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
 *
 * 1. Visual Invariance across Zoom Extremes:
 *    Vector vertices must maintain an exact, clickable physical size (6px to 9px) on screen
 *    whether viewed at 5% zoom or 3000% zoom.
 *    By wrapping node geometry in `transform="translate(x, y) scale(1 / z)"`, all node primitives
 *    (circles, diamonds, squares) are rendered in constant screen pixels.
 *
 * 2. Specialized Node Geometry:
 *    - Standard Bézier Node: Crisp circular handle with cyan stroke and white/cyan fill.
 *    - Parametric Node (Primitives): Distinctive rounded square handle with indigo accent.
 *    - Control Point Handle: Circular remate with dashed arm connecting to the parent vertex.
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
   * Renders a single scale-invariant vertex indicator.
   */
  public static renderVertex(options: VertexRenderOptions): string {
    const { x, y, isSelected = false, isParametric = false, zoom } = options;
    const inv = BaseHelper.getInverseScale(zoom);

    if (isParametric) {
      const side = isSelected ? 8 : 6;
      const half = side / 2;
      const fill = isSelected ? '#6366f1' : '#ffffff';
      const stroke = '#4338ca';
      return `
        <g transform="translate(${x}, ${y}) scale(${inv})">
          <rect x="${-half}" y="${-half}" width="${side}" height="${side}" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
        </g>
      `;
    }

    const r = isSelected ? 4.5 : 3.5;
    const fill = isSelected ? '#38bdf8' : '#ffffff';
    const stroke = '#0284c7';
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})">
        <circle cx="0" cy="0" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
      </g>
    `;
  }

  /**
   * ARCHITECTURAL RATIONALE: Canonical Fixed Quadrant Reference Node (FIX-08)
   * Renders a fixed, non-interactive referential quadrant indicator for parametric ellipses/circles/donuts.
   * Remains locked to cardinal angles (0°, 90°, 180°, 270°) and does not intercept mouse events (`pointer-events="none"`).
   */
  public static renderQuadrantReferenceNode(x: number, y: number, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})" pointer-events="none">
        <circle cx="0" cy="0" r="3.5" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
      </g>
    `;
  }

  /**
   * Renders a scale-invariant Bézier control handle with connecting arm.
   */
  public static renderHandleArm(
    vx: number,
    vy: number,
    hx: number,
    hy: number,
    zoom: number,
    color: string = '#a855f7'
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <line x1="${vx}" y1="${vy}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
      <g transform="translate(${hx}, ${hy}) scale(${inv})">
        <circle cx="0" cy="0" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1" />
      </g>
    `;
  }
}
