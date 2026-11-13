import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
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

function createMockContext(): IVectorModelSerializerContext {
  const elements: VectorElement[] = [];
  return {
    canvas: {
      width: 800,
      height: 600,
      viewBox: '0 0 800 600',
      backgroundColor: '#ffffff',
    },
    elements,
    customDefs: '',
    swatches: [],
    createDefaultCanvas: () => {},
    parsePathD: (d: string) => {
      if (!d) return [];
      return [
        { id: 'v0', x: 0, y: 0, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 10, y: 10, nodeType: 'sharp', command: 'L' },
      ];
    },
    convertShapeToVertices: () => [
      { id: 'v0', x: 0, y: 0, nodeType: 'sharp', command: 'M' },
      { id: 'v1', x: 50, y: 50, nodeType: 'sharp', command: 'L' },
    ],
    compilePathD: () => 'M 0 0 L 10 10',
    compileRectD: () => 'M 0 0 L 100 0 L 100 50 L 0 50 Z',
    compileEllipseD: () => 'M 0 0',
    getRectCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' }),
    calculateEffectiveCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0 }),
    isParametricElement: (el: VectorElement) => !!el.isParametric,
  };
}

export function runCssTransformsVariablesCurrentColorTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running CSS Transforms, Variables & currentColor Suite');
  console.log('======================================================');

  // Test 1: Internal <style> with class selector and transform normalisation
  {
    const ctx = createMockContext();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <style>
          .rotated-box {
            transform: rotate(45deg) translate(10px, 20px);
            fill: #3b82f6;
          }
        </style>
        <rect id="rect1" class="rotated-box" x="10" y="10" width="100" height="50"/>
      </svg>
    `;
    SvgDeserializer.loadSvgString(svg, ctx);
    const rect = ctx.elements.find((e) => e.id === 'rect1');
    assert(
      !!rect && rect.attributes.transform === 'rotate(45) translate(10, 20)' && rect.attributes.fill === '#3b82f6',
      `Internal <style> class selector applies normalized transform and fill (got: ${rect?.attributes.transform}, fill: ${rect?.attributes.fill})`
    );
  }

  // Test 2: CSS Custom Properties (Variables var(...)) in attributes and transforms
  {
    const ctx = createMockContext();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <style>
          :root {
            --shift-x: 35px;
            --accent-color: #ef4444;
          }
          .themed-path {
            transform: translate(var(--shift-x), 50px);
            fill: var(--accent-color);
            stroke-width: 2px;
          }
        </style>
        <path id="path1" class="themed-path" d="M 0 0 L 10 10"/>
      </svg>
    `;
    SvgDeserializer.loadSvgString(svg, ctx);
    const path = ctx.elements.find((e) => e.id === 'path1');
    assert(
      !!path && path.attributes.transform === 'translate(35, 50)' && path.attributes.fill === '#ef4444',
      `CSS variables var(--shift-x) and var(--accent-color) resolved in transform and fill (got transform: ${path?.attributes.transform}, fill: ${path?.attributes.fill})`
    );
  }

  // Test 3: Nested CSS variables and fallback resolution
  {
    const ctx = createMockContext();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <style>
          :root {
            --fallback-scale: 2.5;
          }
        </style>
        <rect id="rect2" style="transform: scale(var(--missing-scale, var(--fallback-scale, 1))); fill: var(--undefined-color, #10b981);" x="0" y="0" width="40" height="40"/>
      </svg>
    `;
    SvgDeserializer.loadSvgString(svg, ctx);
    const rect = ctx.elements.find((e) => e.id === 'rect2');
    assert(
      !!rect && rect.attributes.transform === 'scale(2.5)' && rect.attributes.fill === '#10b981',
      `Nested CSS variable fallback resolved correctly (got transform: ${rect?.attributes.transform}, fill: ${rect?.attributes.fill})`
    );
  }

  // Test 4: currentColor cascading & inheritance across root and <g> containers
  {
    const ctx = createMockContext();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" color="#6366f1" width="800" height="600">
        <g id="group1" style="color: #8b5cf6">
          <path id="p1" stroke="currentColor" fill="none" d="M 0 0 L 50 50"/>
        </g>
        <path id="p2" fill="currentColor" stroke="none" d="M 0 0 L 20 20"/>
      </svg>
    `;
    SvgDeserializer.loadSvgString(svg, ctx);
    const g = ctx.elements.find((e) => e.id === 'group1');
    const p1 = g?.children?.find((e) => e.id === 'p1');
    const p2 = ctx.elements.find((e) => e.id === 'p2');
    assert(
      !!p1 && p1.attributes.stroke === '#8b5cf6' && p1.attributes['data-original-stroke'] === 'currentColor' &&
      !!p2 && p2.attributes.fill === '#6366f1' && p2.attributes['data-original-fill'] === 'currentColor',
      `currentColor cascades through <g> and root: p1 stroke = ${p1?.attributes.stroke}, p2 fill = ${p2?.attributes.fill}`
    );
  }

  // Test 5: Compound specificity & concatenation of class transform and inline transform
  {
    const ctx = createMockContext();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <style>
          .translated {
            transform: translate(25px, 15px);
          }
        </style>
        <rect id="rect3" class="translated" transform="rotate(90deg)" x="0" y="0" width="30" height="30"/>
      </svg>
    `;
    SvgDeserializer.loadSvgString(svg, ctx);
    const rect = ctx.elements.find((e) => e.id === 'rect3');
    assert(
      !!rect && rect.attributes.transform === 'translate(25, 15) rotate(90)',
      `Class transform and inline transform composed properly (got: ${rect?.attributes.transform})`
    );
  }

  console.log(`\nCSS Transforms, Variables & currentColor: ${passed}/5 tests passed.`);
  if (failed > 0) {
    throw new Error(`CSS Transforms, Variables & currentColor tests failed: ${failed} assertions failed.`);
  }
  return true;
}

if (process.argv[1]?.endsWith('test-css-transforms-variables-currentcolor.ts')) {
  runCssTransformsVariablesCurrentColorTests();
}
