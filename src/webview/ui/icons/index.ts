import DoubleArrowLeftRotateSvg from '../../assets/icons/double_arrow_vertical_left_rotate.svg';
import DoubleArrowRightRotateSvg from '../../assets/icons/double_arrow_vertical_right_rotate.svg';

/**
 * ARCHITECTURAL RATIONALE: Centralized UI Icon Registry & SVG Asset Pipeline
 *
 * All icons stored in `src/webview/assets/icons/*.svg` are imported directly as raw SVG markup
 * via the esbuild text loader (`loader: { '.svg': 'text' }`).
 *
 * Benefits:
 * 1. Single Source of Truth: Editing, replacing, or adding any .svg file automatically updates the application
 *    bundle on compilation (`pnpm run build` / `pnpm run package`).
 * 2. Zero-Reflow / Zero-Latency: Injected synchronously into the DOM without async I/O or HTTP fetch.
 * 3. Geometry Extraction: Provides helper utilities to extract vector path data (`d="..."`) for canvas
 *    or inline overlay composition.
 */
export const ICONS = {
  doubleArrowLeftRotate: DoubleArrowLeftRotateSvg,
  doubleArrowRightRotate: DoubleArrowRightRotateSvg,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Extracts the `d` attribute from an SVG path element in raw SVG text.
 */
export function extractSvgPathD(svgContent: string): string {
  const match = svgContent.match(/\bd=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

/**
 * Renders an SVG icon with customizable attributes (e.g. classes, dimensions, colors).
 */
export function renderIcon(name: IconName, extraAttributes: string = ''): string {
  const raw = ICONS[name];
  if (!raw) return '';
  if (!extraAttributes) return raw;
  return raw.replace('<svg', `<svg ${extraAttributes}`);
}
