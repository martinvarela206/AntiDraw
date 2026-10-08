import { BaseHelper } from './BaseHelper.js';

/**
 * ARCHITECTURAL RATIONALE: Scale-Invariant Marker & Handle Helper (MarkerHelper)
 *
 * Specializes in rendering selection and transformation gizmos:
 * 1. Bounding Box Handles: Corner and edge square handles of constant 8 screen pixels.
 * 2. Rotation Gizmo: Angular rotation knob positioned at a fixed screen-pixel distance.
 * 3. Origin Drag Indicator: Crosshair reticle with coordinate badge.
 * 4. ViewBox Badge: Artboard dimension pill anchored at top-left.
 *
 * Inherits from `BaseHelper` to ensure physical screen-pixel invariance across all zoom factors.
 */
export class MarkerHelper extends BaseHelper {
  constructor(id: string = 'marker_helper') {
    super(id);
  }

  public render(zoom: number, ..._args: unknown[]): string {
    return '';
  }

  /**
   * Renders a scale-invariant transform bounding box resize handle.
   */
  public static renderBoundingHandle(
    x: number,
    y: number,
    zoom: number,
    size: number = 8,
    fill: string = '#00f0ff',
    stroke: string = '#1e1b4b'
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    const half = size / 2;
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})">
        <rect x="${-half}" y="${-half}" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" rx="1" />
      </g>
    `;
  }

  /**
   * Renders a scale-invariant ViewBox dimension badge.
   */
  public static renderViewBoxBadge(
    minX: number,
    minY: number,
    width: number,
    height: number,
    zoom: number
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    const tagW = 160;
    const tagH = 16;
    return `
      <g transform="translate(${minX}, ${minY}) scale(${inv})" opacity="0.95">
        <rect x="0" y="-20" width="${tagW}" height="${tagH}" rx="3" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" />
        <text x="6" y="-8" font-size="10" fill="#c7d2fe" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">ViewBox: ${width} × ${height}</text>
      </g>
    `;
  }

  /**
   * Renders a scale-invariant ruler origin drag preview.
   */
  public static renderOriginPreview(
    ox: number,
    oy: number,
    spanMinX: number,
    spanMaxX: number,
    spanMinY: number,
    spanMaxY: number,
    zoom: number
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g opacity="0.9">
        <line x1="${spanMinX}" y1="${oy}" x2="${spanMaxX}" y2="${oy}" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
        <line x1="${ox}" y1="${spanMinY}" x2="${ox}" y2="${spanMaxY}" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
        <g transform="translate(${ox}, ${oy}) scale(${inv})">
          <circle cx="0" cy="0" r="8" fill="none" stroke="#6366f1" stroke-width="1.5" />
          <circle cx="0" cy="0" r="2" fill="#6366f1" />
          <rect x="10" y="-22" width="72" height="18" rx="3" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" />
          <text x="15" y="-9" font-size="10" fill="#c7d2fe" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600">Origin (0,0)</text>
        </g>
      </g>
    `;
  }

  /**
   * Renders a scale-invariant compound intersection reticle (diamond + crosshairs).
   */
  public static renderIntersectionReticle(x: number, y: number, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})" pointer-events="none">
        <line x1="-9" y1="0" x2="9" y2="0" stroke="#f59e0b" stroke-width="1.5" />
        <line x1="0" y1="-9" x2="0" y2="9" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="-4.5" y="-4.5" width="9" height="9" transform="rotate(45)" fill="none" stroke="#f59e0b" stroke-width="1.5" />
        <circle cx="0" cy="0" r="1.5" fill="#fbbf24" />
      </g>
    `;
  }

  /**
   * Renders a scale-invariant continuous vector edge snapping marker (dashed ring + center).
   */
  public static renderEdgeSnapMarker(x: number, y: number, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})" pointer-events="none">
        <circle cx="0" cy="0" r="5" fill="none" stroke="#8b5cf6" stroke-width="1.5" stroke-dasharray="2 2" />
        <circle cx="0" cy="0" r="1.5" fill="#8b5cf6" />
      </g>
    `;
  }

  /**
   * Renders a scale-invariant node snap halo ring.
   */
  public static renderNodeSnapRing(x: number, y: number, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})" pointer-events="none">
        <circle cx="0" cy="0" r="6.5" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="2 1" />
      </g>
    `;
  }
}
