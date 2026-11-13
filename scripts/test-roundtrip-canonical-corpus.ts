import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { CanonicalXmlComparator } from '../src/webview/engine/serialization/CanonicalXmlComparator.js';
import { DOMParser } from 'linkedom';

if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

export function runRoundtripCanonicalCorpusTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running W3C, Lucide & Heroicons Round-Trip Canonical Suite');
  console.log('======================================================');

  // Helper to run 2-cycle fixed point round-trip
  const testRoundTrip = (svgInput: string, testName: string) => {
    const model1 = new VectorModel();
    model1.loadSvgString(svgInput);
    const svgPass1 = SvgSerializer.toSvgString(model1);

    const model2 = new VectorModel();
    model2.loadSvgString(svgPass1);
    const svgPass2 = SvgSerializer.toSvgString(model2);

    const result = CanonicalXmlComparator.compare(svgPass1, svgPass2, {
      numericTolerance: 0.05,
      ignoredAttributes: ['data-original-fill', 'data-original-stroke'],
    });

    assert(
      result.areEqual,
      `${testName}: Round-trip fixed point verified (pass1 === pass2 canonical XML)` +
        (result.differences.length > 0 ? `\n    Diffs: ${result.differences.join('; ')}` : '')
    );
  };

  // Test 1: W3C Geometric Primitives (rect, circle, ellipse, line, polygon)
  {
    const w3cPrimitivesSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <rect id="rect1" x="20" y="20" width="120" height="80" rx="10" ry="10" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
        <circle id="circ1" cx="250" cy="60" r="40" fill="#10b981" stroke="#047857" stroke-width="3"/>
        <ellipse id="ell1" cx="400" cy="60" rx="60" ry="30" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>
        <line id="line1" x1="20" y1="150" x2="200" y2="150" stroke="#6b7280" stroke-width="4"/>
        <polygon id="poly1" points="250,150 290,220 210,220" fill="#8b5cf6" stroke="#6d28d9" stroke-width="2"/>
      </svg>
    `;
    testRoundTrip(w3cPrimitivesSvg, 'W3C Standard Geometric Primitives');
  }

  // Test 2: Lucide Icon Corpus (Stroke-Centric, Round Caps & Joins, currentColor)
  {
    const lucideCameraSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path id="body" d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
        <circle id="lens" cx="12" cy="13" r="3"/>
      </svg>
    `;
    testRoundTrip(lucideCameraSvg, 'Lucide Camera Icon (stroke-centric)');
  }

  // Test 3: Heroicons Corpus (Outline & Solid Dense Path Vectors)
  {
    const heroiconsCheckCircleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
        <path id="check_ring" stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
      </svg>
    `;
    testRoundTrip(heroiconsCheckCircleSvg, 'Heroicons Check-Circle Icon (dense outline path)');
  }

  // Test 4: Nested Hierarchical Groups with Transforms & Cascaded Attributes
  {
    const nestedGroupsSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <g id="parent_group" transform="translate(40, 50)" fill="#4f46e5">
          <g id="child_group" transform="rotate(45) scale(1.2)">
            <rect id="inner_rect" x="0" y="0" width="80" height="40" rx="4"/>
            <path id="inner_path" d="M 0 0 L 20 20 L 40 0 Z" fill="#ec4899"/>
          </g>
        </g>
      </svg>
    `;
    testRoundTrip(nestedGroupsSvg, 'Nested Hierarchical Groups with Affine Transforms');
  }

  // Test 5: Defs, Linear Gradients and Filter Rehydration Fidelity
  {
    const gradientFilterSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
        <defs>
          <linearGradient id="primary_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" stop-opacity="1"/>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="1"/>
          </linearGradient>
        </defs>
        <rect id="grad_card" x="50" y="50" width="400" height="250" rx="16" fill="url(#primary_gradient)" stroke="#0284c7" stroke-width="2"/>
      </svg>
    `;
    testRoundTrip(gradientFilterSvg, 'Defs, Linear Gradients & Filter References');
  }

  console.log(`\nRound-Trip Canonical Corpus: ${passed}/5 tests passed.`);
  if (failed > 0) {
    throw new Error(`Round-Trip Canonical Corpus tests failed: ${failed} assertions failed.`);
  }
  return true;
}

if (process.argv[1]?.endsWith('test-roundtrip-canonical-corpus.ts')) {
  runRoundtripCanonicalCorpusTests();
}
