import { ImageProcessorService } from '../src/webview/services/ImageProcessorService.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { ImageIngestionService } from '../src/webview/services/ImageIngestionService.js';

export async function runImageOptimizationTests(): Promise<boolean> {
  console.log('\n--- Running Image Optimization, Smart Ingestion & Texture Suite ---');
  let allPassed = true;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      allPassed = false;
    }
  };

  // 1. Smart Ingestion Thresholding
  console.log('\n[1. Smart Ingestion Thresholding Logic]');
  {
    // Below limits: 500 KB, 800x600 -> false (silent pass-through)
    const smallExceeds = ImageProcessorService.isExceedingThreshold(500 * 1024, 800, 600);
    assert(!smallExceeds, 'Small image (500 KB, 800x600) passes through silently');

    // Exceeds bytes: 2.5 MB, 800x600 -> true (triggers modal)
    const heavyExceeds = ImageProcessorService.isExceedingThreshold(2.5 * 1024 * 1024, 800, 600);
    assert(heavyExceeds, 'Heavy image (2.5 MB) exceeds threshold and triggers modal');

    // Exceeds dimension: 800 KB, 3840x2160 -> true (triggers modal)
    const largeDimExceeds = ImageProcessorService.isExceedingThreshold(800 * 1024, 3840, 2160);
    assert(largeDimExceeds, 'Large resolution image (3840x2160) exceeds threshold and triggers modal');
  }

  // 2. Format Detection & Byte Formatting
  console.log('\n[2. Format Detection & Byte Formatting]');
  {
    const pngFmt = ImageProcessorService.detectFormat('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', 'logo.png');
    assert(pngFmt === 'png', 'Detects PNG from data URI and filename');

    const jpgFmt = ImageProcessorService.detectFormat('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD', 'photo.jpg');
    assert(jpgFmt === 'jpeg', 'Detects JPEG from data URI');

    const webpFmt = ImageProcessorService.detectFormat('data:image/webp;base64,UklGRkAAAABXRUJQVlA4ID', 'art.webp');
    assert(webpFmt === 'webp', 'Detects WebP from data URI');

    assert(ImageProcessorService.formatBytes(512) === '512 B', 'Formats bytes: 512 B');
    assert(ImageProcessorService.formatBytes(150 * 1024) === '150.0 KB', 'Formats kilobytes: 150.0 KB');
    assert(ImageProcessorService.formatBytes(3.25 * 1024 * 1024) === '3.25 MB', 'Formats megabytes: 3.25 MB');
  }

  // 3. Standalone <image> Bounding Box & Serialization
  console.log('\n[3. Standalone <image> Bounding Box & Roundtrip Serialization]');
  {
    const model = new VectorModel();
    const svgInput = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <image id="ref_photo" href="./project_ref_img.png" x="100" y="150" width="400" height="300" preserveAspectRatio="xMidYMid meet" />
</svg>`;
    model.loadSvgString(svgInput);

    assert(model.elements.length === 1, 'Loaded 1 SVG element');
    const imgEl = model.elements[0];
    assert(imgEl.tagName === 'image', 'Element tagName is "image"');
    assert(imgEl.attributes.href === './project_ref_img.png', 'Preserved linked asset relative href');
    assert(imgEl.attributes.x === '100', 'Preserved X position 100');
    assert(imgEl.attributes.y === '150', 'Preserved Y position 150');
    assert(imgEl.attributes.width === '400', 'Preserved width 400');
    assert(imgEl.attributes.height === '300', 'Preserved height 300');

    // Bounding Box
    const bbox = BoundingBoxCalculator.getBoundingBox(imgEl);
    assert(bbox !== null, 'Calculated bounding box for <image> element');
    assert(bbox?.x === 100 && bbox?.y === 150, 'Bounding box origin matches (100, 150)');
    assert(bbox?.width === 400 && bbox?.height === 300, 'Bounding box dimensions match (400, 300)');

    // Serialization
    const serialized = SvgSerializer.toSvgString(model);
    assert(serialized.includes('<image'), 'Serialized SVG contains <image tag');
    assert(serialized.includes('href="./project_ref_img.png"'), 'Serialized SVG preserves relative href');
    assert(serialized.includes('x="100"'), 'Serialized SVG preserves x coordinate');
    assert(serialized.includes('y="150"'), 'Serialized SVG preserves y coordinate');
    assert(serialized.includes('width="400"'), 'Serialized SVG preserves width');
    assert(serialized.includes('height="300"'), 'Serialized SVG preserves height');
    assert(!serialized.includes(' d="'), 'Serialized <image> has no path d attribute');
  }

  // 4. Vector Background Pattern Texture
  console.log('\n[4. Vector Background Pattern Texture (<pattern> + <image>)]');
  {
    const model = new VectorModel();
    const svgInput = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <rect id="wood_card" x="50" y="50" width="200" height="150" stroke="#333333" stroke-width="2" />
</svg>`;
    model.loadSvgString(svgInput);

    const rectEl = model.elements[0];
    assert(rectEl !== undefined, 'Target vector rectangle found');

    // Apply pattern texture
    const patId = 'pat_wood_texture_01';
    const textureMarkup = `<pattern id="${patId}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="./wood_texture_img.jpg" x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>`;
    model.customDefs = (model.customDefs || '') + '\n' + textureMarkup;
    rectEl.attributes.fill = `url(#${patId})`;

    // Roundtrip Serialization
    const serialized = SvgSerializer.toSvgString(model);
    assert(serialized.includes('<pattern id="pat_wood_texture_01"'), 'Serialized SVG contains <pattern definition in <defs>');
    assert(serialized.includes('patternContentUnits="objectBoundingBox"'), 'Pattern contains objectBoundingBox attribute');
    assert(serialized.includes('href="./wood_texture_img.jpg"'), 'Pattern image retains relative asset path');
    assert(serialized.includes('fill="url(#pat_wood_texture_01)"'), 'Vector rectangle references pattern in fill attribute');

    // Reload roundtrip into new model
    const reloadModel = new VectorModel();
    reloadModel.loadSvgString(serialized);
    assert(reloadModel.customDefs.includes('pat_wood_texture_01'), 'Reloaded model preserves custom pattern definition in defs');
    const reloadedRect = reloadModel.elements[0];
    assert(reloadedRect.attributes.fill === 'url(#pat_wood_texture_01)', 'Reloaded rect preserves pattern fill URL');
  }

  // 5. Standalone Image Body & Interior Hit-Testing (Solid Bounding Box)
  console.log('\n[5. Standalone Image Body & Interior Hit-Testing]');
  {
    const model = new VectorModel();
    const svgInput = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">
  <image id="ref_img_01" href="./hero_artwork.png" x="100" y="100" width="400" height="300" preserveAspectRatio="none" />
</svg>`;
    model.loadSvgString(svgInput);
    const imgEl = model.elements[0];
    assert(imgEl !== undefined && imgEl.tagName === 'image', 'Parsed <image> element into model');

    // Test A: Click exactly inside the center body of the image (300, 250)
    const centerHit = HitTestService.hitTest(model.elements, { x: 300, y: 250 }, 1.0, 3.0);
    assert(centerHit !== null, 'Hit test succeeded inside center of image');
    assert(centerHit?.element.id === 'ref_img_01', 'Hit element matches image ID');
    assert(centerHit?.hitOnFill === true, 'Hit detected as solid fill body');

    // Test B: Click outside the image (50, 50)
    const outsideHit = HitTestService.hitTest(model.elements, { x: 50, y: 50 }, 1.0, 3.0);
    assert(outsideHit === null, 'Hit test correctly rejects point outside image');

    // Test C: Spatial index query hit
    model.rebuildSpatialIndex();
    const spatialHit = HitTestService.hitTestSpatial(model.spatialIndex, { x: 300, y: 250 }, 1.0, 3.0);
    assert(spatialHit !== null, 'Spatial index hit test succeeded inside center of image');
    assert(spatialHit?.element.id === 'ref_img_01', 'Spatial hit element matches image ID');
  }

  // 6. Live Asset Caching & Resolution
  console.log('\n[6. Live Asset Caching & Resolution]');
  {
    const relativeHref = './drawing_img_42_img.png';
    const fakeWebviewUri = 'vscode-webview://webview-id/drawing_img_42_img.png';

    ImageIngestionService.cacheLiveAsset(relativeHref, fakeWebviewUri);
    const resolved = ImageIngestionService.resolveLiveAssetUri(relativeHref);
    assert(resolved === fakeWebviewUri, 'Resolved live asset URI matches cached webview URI');

    const cleanResolved = ImageIngestionService.resolveLiveAssetUri('drawing_img_42_img.png');
    assert(cleanResolved === fakeWebviewUri, 'Resolved asset without ./ prefix matches cached webview URI');
  }

  console.log(`\nImage Optimization Tests complete: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}.\n`);
  return allPassed;
}
