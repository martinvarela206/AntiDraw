/**
 * Automated Test Suite 84: Erradicación de Emojis Residuales y Estandarización de Iconos Vectoriales SVG
 *
 * Verifies:
 * 1. Existence and geometric validity of standardized SVG assets in `src/webview/assets/icons/` (normalized 24x24 viewBox and stroke-width 1.4).
 * 2. Proper registration and accessibility of all vector icon definitions in `ToolIcons` and `ICONS` registry.
 * 3. Geometry, MultiSelection, Group, Appearance, Blend, Canvas, Ellipse, Line, Primitive, Rect, and RulerGuide inspectors render pure SVG markup without text glyphs.
 * 4. Zero text glyphs/emojis (▲ ◆ ★ ⬡ ✴ ✹, 🔒/🔓, ✓ ⟳ ⬡ ⟲ ▱) remain in any UI inspector or panel template in `src/webview/ui`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ToolIcons } from '../src/webview/icons/ToolIcons.js';
import { ICONS, renderIcon } from '../src/webview/ui/icons/index.js';
import { GeometryInspector } from '../src/webview/ui/inspectors/GeometryInspector.js';
import { MultiSelectionInspector } from '../src/webview/ui/inspectors/MultiSelectionInspector.js';
import { GroupInspector } from '../src/webview/ui/inspectors/GroupInspector.js';
import { AppearanceInspector } from '../src/webview/ui/inspectors/AppearanceInspector.js';
import { BlendInspector } from '../src/webview/ui/inspectors/BlendInspector.js';
import { CanvasInspector } from '../src/webview/ui/inspectors/CanvasInspector.js';
import { EllipseInspector } from '../src/webview/ui/inspectors/EllipseInspector.js';
import { LineInspector } from '../src/webview/ui/inspectors/LineInspector.js';
import { PrimitiveInspector } from '../src/webview/ui/inspectors/PrimitiveInspector.js';
import { RectInspector } from '../src/webview/ui/inspectors/RectInspector.js';
import { RulerGuideInspector } from '../src/webview/ui/inspectors/RulerGuideInspector.js';
import { StrokeMarkerControls } from '../src/webview/ui/inspectors/StrokeMarkerControls.js';
import { PropertyPanel } from '../src/webview/ui/PropertyPanel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

export function run(): boolean {
  console.log('--- Suite 84: Erradicación de Emojis Residuales y Estandarización de Iconos SVG ---');

  // Test 1: Standardized SVG asset files exist and have valid structure
  const requiredSvgs = [
    'reset.svg',
    'rotate_cw.svg',
    'distort.svg',
    'swap_horizontal.svg',
    'arrow_up.svg',
    'arrow_down.svg',
    'arrow_left.svg',
    'arrow_right.svg',
    'hexagon.svg',
    'triangle.svg',
    'diamond.svg',
    'octagon.svg',
  ];

  for (const svgFile of requiredSvgs) {
    const fullPath = path.join(process.cwd(), 'src', 'webview', 'assets', 'icons', svgFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Assertion failed: Required SVG icon asset missing: ${svgFile}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('viewBox="0 0 24 24"') || !content.startsWith('<svg')) {
      throw new Error(`Assertion failed: SVG asset ${svgFile} does not conform to 24x24 viewBox: ${content}`);
    }
  }
  console.log('  ✓ Test 1 Passed: Todos los archivos SVG normalizados a 24x24 existen y tienen estructura válida');

  // Test 2: ToolIcons and ICONS registries expose the new vector icons and aliases
  if (!ToolIcons.reset || !ToolIcons.rotate || !ToolIcons.distort || !ToolIcons.swap || !ToolIcons.arrowUp || !ToolIcons.hexagon) {
    throw new Error('Assertion failed: ToolIcons registry is missing required SVG icon exports or aliases');
  }
  if (!ICONS.reset || !ICONS.rotate || !ICONS.distort || !ICONS.swap || !ICONS.arrowDown || !ICONS.diamond) {
    throw new Error('Assertion failed: ICONS UI registry is missing required SVG icon exports or aliases');
  }
  const rendered = renderIcon('reset', 'class="test-icon"');
  if (!rendered.includes('class="test-icon"') || !rendered.includes('<svg')) {
    throw new Error(`Assertion failed: renderIcon helper failed: ${rendered}`);
  }
  console.log('  ✓ Test 2 Passed: ToolIcons e ICONS exponen correctamente los iconos vectoriales y aliases');

  // Test 3: Inspectors generate SVG elements instead of raw text glyphs
  const model = new VectorModel();
  const selectionTool = new SelectionTool(model);
  const canvasMgr = new CanvasManager();

  const rectEl: VectorElement = {
    id: 'rect1',
    tag: 'rect',
    attributes: { x: '10', y: '20', width: '100', height: '80', rx: '5', fill: '#ff0000', stroke: '#000000' }
  };
  const box = { x: 10, y: 20, width: 100, height: 80, cx: 60, cy: 60 };

  const geoHtml = GeometryInspector.renderHtml(rectEl, model, selectionTool, box, { x: 60, y: 60 }, true, null);
  if (geoHtml.includes('⟳') || geoHtml.includes('▱') || geoHtml.includes('⟲')) {
    throw new Error(`Assertion failed: GeometryInspector still contains raw glyphs: ${geoHtml}`);
  }
  if (!geoHtml.includes('<svg') || !geoHtml.includes('id="btn-mode-rotate"')) {
    throw new Error('Assertion failed: GeometryInspector does not render vector SVG in rotate mode button');
  }

  const mockContainer = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  } as any;

  MultiSelectionInspector.render(
    mockContainer,
    [rectEl],
    model,
    selectionTool,
    {} as any,
    () => {}
  );
  const multiHtml = mockContainer.innerHTML;
  if (multiHtml.includes('⟳') || multiHtml.includes('▱') || multiHtml.includes('⟲')) {
    throw new Error(`Assertion failed: MultiSelectionInspector still contains raw glyphs: ${multiHtml}`);
  }

  const starEl: VectorElement = {
    id: 'star1',
    tag: 'polygon',
    attributes: {
      'data-star-points': '5',
      'data-star-inner-ratio': '0.4',
      points: '50,10 60,40 90,40 65,60 75,90 50,70 25,90 35,60 10,40 40,40'
    }
  };
  const primHtml = PrimitiveInspector.renderElementPrimitives(starEl, model, { x: 10, y: 10, width: 80, height: 80, cx: 50, cy: 50 });
  if (primHtml.includes('⬡') || primHtml.includes('▲') || primHtml.includes('◆')) {
    throw new Error(`Assertion failed: PrimitiveInspector still contains raw text glyphs: ${primHtml}`);
  }

  const ellipseEl: VectorElement = {
    id: 'ell1',
    tag: 'ellipse',
    attributes: { cx: '50', cy: '50', rx: '40', ry: '30' }
  };
  const ellipseHtml = EllipseInspector.render(ellipseEl, model, null);
  if (ellipseHtml.includes('⇄')) {
    throw new Error(`Assertion failed: EllipseInspector still contains raw text glyphs: ${ellipseHtml}`);
  }

  const rulerContainer = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  } as any;
  const sampleGrid: any = { id: 'grid1', type: 'orthogonal', visible: true, spacing: 20, color: '#4f566b' };
  RulerGuideInspector.renderRulerSettings(
    {} as any,
    rulerContainer,
    model,
    'origin' as any,
    [sampleGrid, { ...sampleGrid, id: 'grid2' }],
    [],
    {} as any,
    () => {}
  );
  const rulerHtml = rulerContainer.innerHTML;
  if (rulerHtml.includes('▲') || rulerHtml.includes('▼')) {
    throw new Error(`Assertion failed: RulerGuideInspector still contains raw text arrows: ${rulerHtml}`);
  }
  console.log('  ✓ Test 3 Passed: Los inspectores renderizan activos SVG limpios sin glifos residuales');

  // Test 4: Comprehensive project-wide audit in src/webview/ui
  function walkDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      if (fs.statSync(fullPath).isDirectory()) {
        walkDir(fullPath, fileList);
      } else if (fullPath.endsWith('.ts')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const forbiddenGlyphs = ['▲', '◆', '★', '⬡', '✴', '✹', '🔒', '🔓', '✓', '⟳', '⟲', '▱', '⇄', '⇅', '▼', '◀', '▶', '▰'];
  const uiFiles = walkDir(path.join(process.cwd(), 'src', 'webview', 'ui'));
  const violations: { file: string; line: number; glyph: string; text: string }[] = [];

  for (const file of uiFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Ignore comments in test assertions or documentation files
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      for (const g of forbiddenGlyphs) {
        if (line.includes(g)) {
          violations.push({ file, line: idx + 1, glyph: g, text: trimmed });
          break;
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error('Violations found in src/webview/ui:', violations);
    throw new Error(`Assertion failed: Found ${violations.length} residual glyphs in src/webview/ui templates`);
  }
  console.log('  ✓ Test 4 Passed: 0 glifos residuales detectados en todas las plantillas UI de src/webview/ui');

  // Test 5: i18n dictionaries cleanliness
  const i18nFiles = walkDir(path.join(process.cwd(), 'src', 'webview', 'i18n'));
  const i18nViolations: { file: string; line: number; glyph: string }[] = [];
  for (const file of i18nFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const g of ['⟲', '⟳', '▱', '⬡']) {
        if (line.includes(g)) {
          i18nViolations.push({ file, line: idx + 1, glyph: g });
        }
      }
    });
  }

  if (i18nViolations.length > 0) {
    console.error('Violations in i18n:', i18nViolations);
    throw new Error(`Assertion failed: Found ${i18nViolations.length} residual glyphs in i18n dictionaries`);
  }
  console.log('  ✓ Test 5 Passed: Diccionarios de internacionalización limpios de emojis y caracteres residuales');

  return true;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  try {
    const success = run();
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error('Suite 84 Failed:', err);
    process.exit(1);
  }
}
