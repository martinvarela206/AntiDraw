import { BaseHelper } from './BaseHelper.js';
import { extractSvgPathD, ICONS } from '../icons/index.js';

export const GUIDE_ROTATE_LEFT_PATH = extractSvgPathD(ICONS.guideDoubleArrowVerticalLeftRotate);
export const GUIDE_ROTATE_RIGHT_PATH = extractSvgPathD(ICONS.guideDoubleArrowVerticalRightRotate);

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
