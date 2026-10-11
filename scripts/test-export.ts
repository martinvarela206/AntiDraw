import { AssetExporter, ExportConfig } from '../src/webview/engine/export/AssetExporter.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SvgValidator } from '../src/webview/engine/export/SvgValidator.js';

export async function runExportTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Multi-Scale Asset Export Test Suite (07.4)');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  // 1. Setup Model with Artboard and Elements
  const model = new VectorModel();
  model.canvas = {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    backgroundColor: '#ffffff',
    currentColor: '#000000',
    preserveAspectRatio: 'xMidYMid meet',
  };

  const elem1: VectorElement = {
    id: 'icon_badge',
    tagName: 'rect',
    isParametric: true,
    shapeType: 'rect',
    vertices: [
      { id: 'v0', x: 200, y: 150, command: 'M', nodeType: 'sharp' },
      { id: 'v1', x: 300, y: 150, command: 'L', nodeType: 'sharp' },
      { id: 'v2', x: 300, y: 250, command: 'L', nodeType: 'sharp' },
      { id: 'v3', x: 200, y: 250, command: 'L', nodeType: 'sharp' },
    ],
    attributes: {
      id: 'icon_badge',
      x: '200',
      y: '150',
      width: '100',
      height: '100',
      fill: '#f59e0b',
    },
  };

  model.elements.push(elem1);

  // 2. Test Artboard SVG Preparation
  const artboardPrep = AssetExporter.prepareSvg(model, 'artboard');
  assert(
    artboardPrep.width === 800 && artboardPrep.height === 600,
    `Artboard prep matches canvas dimensions 800x600 (got ${artboardPrep.width}x${artboardPrep.height})`
  );
  assert(
    SvgValidator.validate(artboardPrep.svgString).isValid,
    'Artboard prepared SVG is valid W3C XML'
  );

  // 3. Test Selection SVG Preparation (Tight Bounding Box)
  const selectionPrep = AssetExporter.prepareSvg(model, 'selection', new Set(['icon_badge']));
  assert(
    selectionPrep.width === 108 && selectionPrep.height === 108,
    `Selection prep calculates tight box with 4px padding: 108x108 (got ${selectionPrep.width}x${selectionPrep.height})`
  );
  assert(
    selectionPrep.svgString.includes('viewBox="196 146 108 108"'),
    'Selection SVG contains tightly offset viewBox'
  );
  assert(
    selectionPrep.defaultName === 'icon_badge',
    'Single selected item generates defaultName based on element ID'
  );

  // 4. Test Export Config: SVG Format
  const svgConfig: ExportConfig = {
    target: 'selection',
    format: 'svg',
    scale: 1,
    filename: 'custom_badge',
  };
  const svgResult = await AssetExporter.exportAsset(model, svgConfig, new Set(['icon_badge']));
  assert(
    svgResult.filename === 'custom_badge.svg',
    `SVG export formats filename without scale suffix: ${svgResult.filename}`
  );
  assert(
    svgResult.format === 'svg' && svgResult.scale === 1,
    'SVG export sets format=svg and scale=1'
  );

  // 5. Test Export Config: PNG @2x Resolution Scaling
  (globalThis as any).Blob = class MockBlob {
    constructor(public parts: any[], public options: any) {}
  };

  const pngConfig: ExportConfig = {
    target: 'selection',
    format: 'png',
    scale: 2,
    filename: 'badge',
  };
  const pngResult = await AssetExporter.exportAsset(model, pngConfig, new Set(['icon_badge']));
  assert(
    pngResult.filename === 'badge@2x.png',
    `PNG @2x formats filename as badge@2x.png (got ${pngResult.filename})`
  );
  assert(
    pngResult.width === 216 && pngResult.height === 216,
    `PNG @2x scales dimensions from 108 to 216x216 (got ${pngResult.width}x${pngResult.height})`
  );

  // 6. Test Export Config: WebP @3x Resolution Scaling
  const webpConfig: ExportConfig = {
    target: 'artboard',
    format: 'webp',
    scale: 3,
    filename: 'wallpaper',
  };
  const webpResult = await AssetExporter.exportAsset(model, webpConfig);
  assert(
    webpResult.filename === 'wallpaper@3x.webp',
    `WebP @3x formats filename as wallpaper@3x.webp (got ${webpResult.filename})`
  );
  assert(
    webpResult.width === 2400 && webpResult.height === 1800,
    `WebP @3x scales artboard from 800x600 to 2400x1800 (got ${webpResult.width}x${webpResult.height})`
  );

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 Multi-scale asset export passed all tests!\n');
    return true;
  } else {
    console.error('❌ One or more asset export tests failed.\n');
    return false;
  }
}
