import assert from 'assert';
import { AdrwProjectService, AdrwContainer } from '../src/webview/engine/project/AdrwContainer.js';

console.log('--- Test Suite 44: AntiDraw Native Container (.adrw) & Multi-Artboard W3C Extraction ---');

function runTests() {
  // Test 1: Container creation from simple SVG
  console.log('Test 1: Container creation from standard W3C SVG...');
  const simpleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="1024" height="768">
    <rect x="10" y="10" width="100" height="100" fill="#ff0000" />
  </svg>`;

  const container1 = AdrwProjectService.createFromSvg(simpleSvg, 'my_illustration.svg', { zoom: 1.5 });
  assert.strictEqual(container1.format, 'antidraw', 'Container format must be antidraw');
  assert.strictEqual(container1.version, '1.0', 'Container version must be 1.0');
  assert.strictEqual(container1.metadata.name, 'my_illustration', 'Metadata name should match file base name');
  assert.strictEqual(container1.canvas.width, 1024, 'Canvas width should be 1024');
  assert.strictEqual(container1.canvas.height, 768, 'Canvas height should be 768');
  assert.strictEqual(container1.artboards.length, 1, 'Should have exactly 1 default artboard');
  assert.strictEqual(container1.artboards[0].width, 1024, 'Artboard width should match canvas');
  assert.strictEqual(container1.companionMetadata.zoom, 1.5, 'Companion metadata should be preserved');
  console.log('✓ Test 1 passed.');

  // Test 2: Ingestion of Inkscape multi-page tags
  console.log('Test 2: Ingestion of Inkscape multi-page markup (<inkscape:page>)...');
  const inkscapeSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 2000 1200" width="2000" height="1200">
    <inkscape:page x="0" y="0" width="800" height="600" inkscape:label="Portada" id="page_cover" />
    <inkscape:page x="900" y="0" width="800" height="600" inkscape:label="Contenido" id="page_content" />
    <circle cx="400" cy="300" r="100" fill="#0000ff" />
    <rect x="1000" y="100" width="200" height="200" fill="#00ff00" />
  </svg>`;

  const container2 = AdrwProjectService.createFromSvg(inkscapeSvg, 'catalog.svg');
  assert.strictEqual(container2.artboards.length, 2, 'Should extract 2 Inkscape pages into artboards');
  assert.strictEqual(container2.artboards[0].name, 'Portada', 'First artboard label should be Portada');
  assert.strictEqual(container2.artboards[0].x, 0, 'First artboard x should be 0');
  assert.strictEqual(container2.artboards[0].width, 800, 'First artboard width should be 800');
  assert.strictEqual(container2.artboards[1].name, 'Contenido', 'Second artboard label should be Contenido');
  assert.strictEqual(container2.artboards[1].x, 900, 'Second artboard x should be 900');
  console.log('✓ Test 2 passed.');

  // Test 3: Serialization & Deserialization with Auto-healing
  console.log('Test 3: Serialization and Deserialization auto-healing...');
  const jsonStr = AdrwProjectService.serializeContainer(container2);
  assert(jsonStr.startsWith('{') && jsonStr.includes('"format": "antidraw"'), 'JSON should be formatted antidraw bundle');

  const deserialized = AdrwProjectService.parseContainer(jsonStr, 'recovered.adrw');
  assert.strictEqual(deserialized.artboards.length, 2, 'Deserialized container should retain both artboards');
  assert.strictEqual(deserialized.metadata.name, 'catalog', 'Deserialized metadata should be retained');

  // Auto-heal raw SVG passed to parseContainer
  const healed = AdrwProjectService.parseContainer(simpleSvg, 'healed.svg');
  assert.strictEqual(healed.format, 'antidraw', 'Raw SVG should auto-heal into valid container');
  assert.strictEqual(healed.artboards.length, 1, 'Auto-healed container should have 1 artboard');
  console.log('✓ Test 3 passed.');

  // Test 4: Pure W3C SVG Extraction & Proprietary Attribute Scrubbing
  console.log('Test 4: Pure W3C SVG Extraction for individual and batch artboards...');
  const dirtySvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 2000 1200" width="2000" height="1200" data-antidraw-custom="test" data-layer-id="layer_1">
    <inkscape:page x="0" y="0" width="800" height="600" inkscape:label="Page1" id="p1" />
    <inkscape:page x="1000" y="100" width="400" height="300" inkscape:label="Page2" id="p2" />
    <rect x="50" y="50" width="100" height="100" data-element-guid="abc-123" />
  </svg>`;

  const container4 = AdrwProjectService.createFromSvg(dirtySvg, 'project_test.svg');
  const extractedPage2 = AdrwProjectService.extractArtboardSvg(container4, 'p2');

  assert(extractedPage2.includes('viewBox="1000 100 400 300"'), 'Extracted SVG viewBox must match target artboard');
  assert(extractedPage2.includes('width="400"'), 'Extracted SVG width must match target artboard');
  assert(extractedPage2.includes('height="300"'), 'Extracted SVG height must match target artboard');
  assert(!extractedPage2.includes('data-antidraw-custom'), 'Must scrub data-* proprietary attributes');
  assert(!extractedPage2.includes('<inkscape:page'), 'Must scrub inkscape:page tags from exported SVG');

  const allExports = AdrwProjectService.extractAllArtboards(container4);
  assert.strictEqual(allExports.length, 2, 'Batch extraction must yield 2 files');
  assert(allExports[0].filename.includes('page1'), 'First filename must reflect artboard label');
  assert(allExports[1].filename.includes('page2'), 'Second filename must reflect artboard label');
  console.log('✓ Test 4 passed.');

  console.log('All tests in Suite 44 passed successfully!');
  return true;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests as runAdrwContainerTests };
