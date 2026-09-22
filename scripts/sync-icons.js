const fs = require('fs');
const path = require('path');

const iconsDir = path.resolve(__dirname, '../src/webview/assets/icons');
const toolIconsPath = path.resolve(__dirname, '../src/webview/icons/ToolIcons.ts');
const registryPath = path.resolve(__dirname, '../src/webview/ui/icons/index.ts');

function syncIcons() {
  if (!fs.existsSync(iconsDir)) return;

  const files = fs.readdirSync(iconsDir).filter((f) => f.endsWith('.svg')).sort();

  function toCamelCase(filename) {
    const base = filename.replace(/\.svg$/, '');
    if (base === 'snap_view_box') return 'snapViewBox';
    if (base === 'guide_double_arrow_vertical_left_rotate') return 'guideDoubleArrowVerticalLeftRotate';
    if (base === 'guide_double_arrow_vertical_right_rotate') return 'guideDoubleArrowVerticalRightRotate';
    return base.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  }

  // Generate ToolIcons.ts
  let toolImports = '';
  let toolProps = '';

  files.forEach((file) => {
    const key = toCamelCase(file);
    const varName = key + 'Svg';
    toolImports += `import ${varName} from '../assets/icons/${file}';\n`;
    toolProps += `  ${key}: ${varName},\n`;
  });

  // Aliases for backward compatibility
  const legacyAliases = [
    ['select', 'selectToolSvg'],
    ['stroke', 'strokeToolSvg'],
    ['node', 'nodeToolSvg'],
    ['pen', 'penToolSvg'],
    ['line', 'lineToolSvg'],
    ['polyline', 'polylineToolSvg'],
    ['rect', 'rectToolSvg'],
    ['circle', 'circleToolSvg'],
    ['ellipse', 'ellipseToolSvg'],
    ['polygon', 'polygonToolSvg'],
    ['star', 'starToolSvg'],
    ['addVertex', 'addVertexToolSvg'],
    ['canvas', 'canvasToolSvg'],
    ['zoom', 'zoomToolSvg'],
    ['ruler', 'rulersVisibilitySvg'],
    ['grid', 'gridVisibilitySvg'],
    ['guide', 'guidesVisibilitySvg'],
    ['doubleArrowLeftRotate', 'guideDoubleArrowVerticalLeftRotateSvg'],
    ['doubleArrowRightRotate', 'guideDoubleArrowVerticalRightRotateSvg'],
  ];

  legacyAliases.forEach(([aliasKey, varName]) => {
    toolProps += `  ${aliasKey}: ${varName},\n`;
  });

  const toolIconsContent = `/**
 * ARCHITECTURAL RATIONALE: Centralized SVG Vector Asset Import Pipeline
 *
 * Why this architecture was chosen:
 * 1. Independent Vector Asset Files: All vector icons are decoupled from TypeScript strings
 *    and stored as pure, editable W3C SVG files in \`src/webview/assets/icons/\`.
 *    This allows direct editing, previewing, and asset maintenance in vector editors without modifying code.
 * 2. Zero-Runtime-Latency Bundling: Powered by esbuild text loader (\`loader: { '.svg': 'text' }\`),
 *    each SVG file is imported and inlined directly at build time into \`dist/webview.js\`.
 *    This eliminates asynchronous network fetch delays, cross-origin restrictions in VS Code webviews,
 *    and layout reflows during toolbar rendering.
 * 3. Strict Parity & Non-Regression Invariant: Retains 100% API compatibility across all UI panels,
 *    toolbars, inspectors, and quick-help components.
 */
${toolImports}
export const ToolIcons = {
${toolProps}} as const;

export type ToolIconName = keyof typeof ToolIcons;
`;

  fs.writeFileSync(toolIconsPath, toolIconsContent, 'utf8');

  // Generate src/webview/ui/icons/index.ts
  let regImports = '';
  let regProps = '';

  files.forEach((file) => {
    const key = toCamelCase(file);
    const varName = key.charAt(0).toUpperCase() + key.slice(1) + 'Svg';
    regImports += `import ${varName} from '../../assets/icons/${file}';\n`;
    regProps += `  ${key}: ${varName},\n`;
  });

  const regLegacyAliases = [
    ['select', 'SelectToolSvg'],
    ['stroke', 'StrokeToolSvg'],
    ['node', 'NodeToolSvg'],
    ['pen', 'PenToolSvg'],
    ['line', 'LineToolSvg'],
    ['polyline', 'PolylineToolSvg'],
    ['rect', 'RectToolSvg'],
    ['circle', 'CircleToolSvg'],
    ['ellipse', 'EllipseToolSvg'],
    ['polygon', 'PolygonToolSvg'],
    ['star', 'StarToolSvg'],
    ['addVertex', 'AddVertexToolSvg'],
    ['canvas', 'CanvasToolSvg'],
    ['zoom', 'ZoomToolSvg'],
    ['ruler', 'RulersVisibilitySvg'],
    ['grid', 'GridVisibilitySvg'],
    ['guide', 'GuidesVisibilitySvg'],
    ['doubleArrowLeftRotate', 'GuideDoubleArrowVerticalLeftRotateSvg'],
    ['doubleArrowRightRotate', 'GuideDoubleArrowVerticalRightRotateSvg'],
  ];

  regLegacyAliases.forEach(([aliasKey, varName]) => {
    regProps += `  ${aliasKey}: ${varName},\n`;
  });

  const registryContent = `/**
 * ARCHITECTURAL RATIONALE: Centralized UI Icon Registry & SVG Asset Pipeline
 *
 * All icons stored in \`src/webview/assets/icons/*.svg\` are imported directly as raw SVG markup
 * via the esbuild text loader (\`loader: { '.svg': 'text' }\`).
 *
 * Benefits:
 * 1. Single Source of Truth: Editing, replacing, or adding any .svg file automatically updates the application
 *    bundle on compilation (\`pnpm run build\` / \`pnpm run package\`).
 * 2. Zero-Reflow / Zero-Latency: Injected synchronously into the DOM without async I/O or HTTP fetch.
 * 3. Geometry Extraction: Provides helper utilities to extract vector path data (\`d="..."\`) for canvas
 *    or inline overlay composition.
 */
${regImports}
export const ICONS = {
${regProps}} as const;

export type IconName = keyof typeof ICONS;

/**
 * Extracts the \`d\` attribute from an SVG path element in raw SVG text.
 */
export function extractSvgPathD(svgContent: string): string {
  const match = svgContent.match(/\\bd=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

/**
 * Renders an SVG icon with customizable attributes (e.g. classes, dimensions, colors).
 */
export function renderIcon(name: IconName, extraAttributes: string = ''): string {
  const raw = ICONS[name];
  if (!raw) return '';
  if (!extraAttributes) return raw;
  return raw.replace('<svg', \`<svg \${extraAttributes}\`);
}
`;

  fs.writeFileSync(registryPath, registryContent, 'utf8');
}

if (require.main === module) {
  syncIcons();
}

module.exports = { syncIcons };
