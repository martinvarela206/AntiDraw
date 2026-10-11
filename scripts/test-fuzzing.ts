import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { DOMParser } from 'linkedom';

export async function runFuzzingTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running SVG Defensive Parsing & Fuzzing Suite (08.2)');
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

  // Ensure DOMParser is present in Node.js test environment
  if (typeof (globalThis as any).DOMParser === 'undefined') {
    (globalThis as any).DOMParser = DOMParser;
  }

  // Helper context adapter for VectorModel
  function createTestContext(model: VectorModel) {
    return {
      canvas: model.canvas,
      swatches: model.swatches,
      customDefs: model.customDefs,
      elements: model.elements,
      createDefaultCanvas: () => {
        model.canvas = {
          width: 800,
          height: 600,
          viewBox: '0 0 800 600',
          backgroundColor: '#ffffff',
          currentColor: '#000000',
          preserveAspectRatio: 'xMidYMid meet',
        };
        model.elements = [];
      },
      parsePathD: (d: string, nodeTypes?: string) => model.parsePathD(d, nodeTypes),
      convertShapeToVertices: (tag: string, attrs: Record<string, string>) =>
        model.convertShapeToVertices(tag, attrs),
    };
  }

  // -----------------------------------------------------------
  // Test 1: Garbage & Binary Corrupt Inputs Fuzzing
  // -----------------------------------------------------------
  const garbageInputs = [
    '',
    '   ',
    '<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>',
    '<html><body><div>Not an SVG</div></body></html>',
    '<?xml version="1.0"?><root><not-svg/></root>',
    '\x00\x01\x02\xFF\xFE<svg><polygon/></svg>',
    '<<<svg>>>><<<///svg>>>',
    '<svg><unclosed-tag><another><nested>',
    '{"json": "not svg"}',
  ];

  let garbageCrashed = false;
  for (const hostile of garbageInputs) {
    try {
      const model = new VectorModel();
      SvgDeserializer.loadSvgString(hostile, createTestContext(model));
      if (!Number.isFinite(model.canvas.width) || !Number.isFinite(model.canvas.height)) {
        garbageCrashed = true;
      }
    } catch (_err) {
      garbageCrashed = true;
    }
  }
  assert(!garbageCrashed, 'Garbage and binary malformed inputs parsed without panics or crashes');

  // -----------------------------------------------------------
  // Test 2: Infinite and NaN Canvas Dimension Sanitization
  // -----------------------------------------------------------
  const hostileCanvasSvg = `
    <svg width="Infinity" height="-Infinity" viewBox="0 0 NaN Infinity" style="background-color: transparent">
      <rect x="10" y="10" width="50" height="50" fill="#ff0000" />
    </svg>
  `;

  const model2 = new VectorModel();
  SvgDeserializer.loadSvgString(hostileCanvasSvg, createTestContext(model2));

  assert(
    Number.isFinite(model2.canvas.width) && model2.canvas.width === 800,
    `Width Infinity sanitized to fallback 800 (got ${model2.canvas.width})`
  );
  assert(
    Number.isFinite(model2.canvas.height) && model2.canvas.height === 600,
    `Height -Infinity sanitized to fallback 600 (got ${model2.canvas.height})`
  );
  assert(
    model2.canvas.viewBox === '0 0 800 600',
    `ViewBox with NaN and Infinity sanitized to '0 0 800 600' (got '${model2.canvas.viewBox}')`
  );

  // -----------------------------------------------------------
  // Test 3: Hostile Primitives with NaN, Infinity & Negative Radii
  // -----------------------------------------------------------
  const hostilePrimitivesSvg = `
    <svg width="800" height="600" viewBox="0 0 800 600">
      <rect x="NaN" y="Infinity" width="-100" height="NaN" />
      <circle cx="Infinity" cy="NaN" r="-999" />
      <ellipse cx="NaN" cy="Infinity" rx="NaN" ry="-50" />
      <line x1="1e999" y1="NaN" x2="-1e999" y2="Infinity" />
      <polygon points="NaN,Infinity 100,200 foo,bar Infinity,-Infinity 300,400" />
    </svg>
  `;

  const model3 = new VectorModel();
  SvgDeserializer.loadSvgString(hostilePrimitivesSvg, createTestContext(model3));

  assert(model3.elements.length >= 4, `Elements parsed and recovered (found ${model3.elements.length})`);

  let allPrimitiveVerticesFinite = true;
  for (const elem of model3.elements) {
    if (elem.vertices) {
      for (const v of elem.vertices) {
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
          allPrimitiveVerticesFinite = false;
        }
        if (v.handleIn && (!Number.isFinite(v.handleIn.x) || !Number.isFinite(v.handleIn.y))) {
          allPrimitiveVerticesFinite = false;
        }
        if (v.handleOut && (!Number.isFinite(v.handleOut.x) || !Number.isFinite(v.handleOut.y))) {
          allPrimitiveVerticesFinite = false;
        }
      }
    }
  }
  assert(allPrimitiveVerticesFinite, 'All hostile primitive vertices are strictly finite numbers');

  // -----------------------------------------------------------
  // Test 4: Hostile Bézier Path Geometry Fuzzing
  // -----------------------------------------------------------
  const hostilePathSvg = `
    <svg width="800" height="600">
      <path d="M NaN Infinity C foo bar 1e999 1e-999 NaN NaN Z" />
      <path d="M 10 10 L L L H NaN V Infinity C 1 2" />
      <path d="M 0 0 A -50 -50 0 0 0 NaN Infinity S foo bar 100 200" />
      <path d="Z Z Z M 10" />
    </svg>
  `;

  const model4 = new VectorModel();
  SvgDeserializer.loadSvgString(hostilePathSvg, createTestContext(model4));

  let allPathVerticesFinite = true;
  for (const elem of model4.elements) {
    if (elem.vertices) {
      for (const v of elem.vertices) {
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
          allPathVerticesFinite = false;
        }
      }
    }
  }
  assert(allPathVerticesFinite, 'Hostile Bézier path curves parsed safely with 100% finite vertices');

  // -----------------------------------------------------------
  // Test 5: Degenerate Gradients & Filters Fuzzing
  // -----------------------------------------------------------
  const hostileGradientsSvg = `
    <svg width="800" height="600">
      <defs>
        <filter id="f1">
          <feDropShadow dx="NaN" dy="Infinity" stdDeviation="-50" flood-opacity="999" />
        </filter>
        <radialGradient id="g1" cx="NaN" cy="Infinity" r="-10" gradientTransform="matrix(NaN, Infinity, 0, 0, 0, 0)">
          <stop offset="NaN%" stop-color="#000" stop-opacity="Infinity" />
          <stop offset="Infinity" stop-color="#fff" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" filter="url(#f1)" fill="url(#g1)" />
    </svg>
  `;

  const model5 = new VectorModel();
  SvgDeserializer.loadSvgString(hostileGradientsSvg, createTestContext(model5));

  const rectEl = model5.elements[0];
  assert(rectEl !== undefined, 'Element with hostile filters and gradients imported successfully');

  if (rectEl && rectEl.attributes['data-drop-shadow']) {
    const ds = JSON.parse(rectEl.attributes['data-drop-shadow']);
    assert(
      Number.isFinite(ds.dx) && Number.isFinite(ds.dy) && Number.isFinite(ds.blur) && ds.opacity <= 1,
      'Drop-shadow parsed and clamped to finite values'
    );
  }

  if (rectEl && rectEl.attributes['data-gradient']) {
    const grad = JSON.parse(rectEl.attributes['data-gradient']);
    assert(
      Number.isFinite(grad.cx) && Number.isFinite(grad.cy) && Number.isFinite(grad.r),
      'Radial gradient coordinates sanitized to finite numbers'
    );
  }

  // -----------------------------------------------------------
  // Test 6: 100-Iteration Random Mutation Property Fuzzing
  // -----------------------------------------------------------
  const alphabet = ' <>/="\'abcdefghijklmnopqrstuvwxyz0123456789.-+NaNInfinity\n\t,;:()';
  let fuzzPassed = true;

  for (let i = 0; i < 100; i++) {
    // Generate pseudo-random SVG-like mutated string
    let randomStr = '<svg ';
    const len = Math.floor(Math.random() * 80) + 20;
    for (let j = 0; j < len; j++) {
      randomStr += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    randomStr += '></svg>';

    try {
      const fuzzModel = new VectorModel();
      SvgDeserializer.loadSvgString(randomStr, createTestContext(fuzzModel));
      if (!Number.isFinite(fuzzModel.canvas.width) || !Number.isFinite(fuzzModel.canvas.height)) {
        fuzzPassed = false;
        break;
      }
    } catch (_err) {
      fuzzPassed = false;
      break;
    }
  }

  assert(fuzzPassed, '100-iteration random mutation fuzzing completed with zero panics or crashes');

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 SVG defensive parser passed all fuzzing and robustness tests!\n');
    return true;
  } else {
    console.error('❌ Some tests failed.\n');
    return false;
  }
}

if (process.argv[1]?.endsWith('test-fuzzing.ts') || process.argv[1]?.endsWith('test-fuzzing.js')) {
  runFuzzingTests().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
