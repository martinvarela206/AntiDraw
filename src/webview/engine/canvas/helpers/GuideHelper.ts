import { BaseHelper } from './BaseHelper.js';

export const GUIDE_ROTATE_LEFT_PATH =
  'M 17 24.83 C 16.02 22.57 14.98 19.61 14.87 17.06 C 14.76 14.21 16.08 10.22 17.23 7.29 L 18.75 8.03 L 19.46 0 L 13.48 5.45 L 15.33 6.36 C 14.05 9.53 12.55 14 12.68 17.15 C 12.79 20.05 14.03 23.4 15.17 25.9 L 13.31 26.99 L 19.67 32 L 18.39 24.03 Z';

export const GUIDE_ROTATE_RIGHT_PATH =
  'M 15.34 7.17 C 16.32 9.43 17.36 12.39 17.47 14.94 C 17.58 17.79 16.26 21.78 15.11 24.71 L 13.59 23.97 L 12.88 32 L 18.86 26.55 L 17.01 25.64 C 18.29 22.47 19.79 18 19.66 14.85 C 19.55 11.95 18.31 8.6 17.17 6.1 L 19.03 5.01 L 12.67 0 L 13.95 7.97 Z';

/**
 * ARCHITECTURAL RATIONALE: Scale-Invariant Guide Line Control Helper (GuideHelper)
 *
 * Specializes in rendering guideline manipulation affordances:
 * 1. Center Translation Handle: Reticle with concentric circles and crosshairs anchored at `pivot`.
 * 2. Rotation Arrow Indicators: Dual curved arrow markers at 1/4 and 3/4 of the visible line span.
 *
 * All gizmos inherit from `BaseHelper`, applying `scale(1 / z)` to ensure exact screen-pixel dimensions
 * and constant pointer hit-detection radii across all zoom levels (5% to 3000%).
 */
export class GuideHelper extends BaseHelper {
  constructor(id: string = 'guide_helper') {
    super(id);
  }

  public render(zoom: number, ..._args: unknown[]): string {
    return '';
  }

  /**
   * Renders the scale-invariant center translation handle.
   */
  public static renderCenterHandle(x: number, y: number, color: string, zoom: number): string {
    const inv = BaseHelper.getInverseScale(zoom);
    return `
      <g transform="translate(${x}, ${y}) scale(${inv})">
        <circle cx="0" cy="0" r="6" fill="#1e293b" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
        <circle cx="0" cy="0" r="2" fill="${color}" />
        <line x1="-9" y1="0" x2="9" y2="0" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="-9" x2="0" y2="9" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke" />
      </g>
    `;
  }

  /**
   * Renders a scale-invariant rotation arrow indicator aligned with the guideline's angle.
   */
  public static renderRotationArrow(
    x: number,
    y: number,
    angle: number,
    isRight: boolean,
    color: string,
    zoom: number
  ): string {
    const inv = BaseHelper.getInverseScale(zoom);
    const pathD = isRight ? GUIDE_ROTATE_RIGHT_PATH : GUIDE_ROTATE_LEFT_PATH;
    return `
      <g transform="translate(${x}, ${y}) rotate(${angle}) scale(${inv})">
        <g transform="translate(-16, -16)">
          <path d="${pathD}" fill="${color}" stroke="#1e293b" stroke-width="0.8" vector-effect="non-scaling-stroke" fill-rule="evenodd" />
        </g>
        <circle cx="0" cy="0" r="16" fill="transparent" />
      </g>
    `;
  }
}
