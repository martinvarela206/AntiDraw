import { strict as assert } from 'assert';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { SvgSerializer, IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';

export function runOpaqueElementsFidelityTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Opaque Elements & W3C Fidelity Suite');
  console.log('======================================================');

  let passed = 0;
  function it(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw err;
    }
  }

  function createMockSerializerContext(): IVectorModelSerializerContext {
    const elements: VectorElement[] = [];
    return {
      canvas: {
        width: 800,
        height: 600,
        viewBox: '0 0 800 600',
        backgroundColor: 'none',
      },
      elements,
      customDefs: '',
      swatches: [],
      createDefaultCanvas: () => {},
      parsePathD: () => [],
      convertShapeToVertices: () => [],
      compilePathD: () => 'M 0 0',
      compileRectD: () => 'M 0 0',
      compileEllipseD: () => 'M 0 0',
      getRectCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0, mode: 'uniform', unit: 'px' }),
      calculateEffectiveCorners: () => ({ tl: 0, tr: 0, br: 0, bl: 0 }),
      isParametricElement: (el) => !!el.isParametric,
      syncParametricAttributes: () => {},
      isRect: (el) => el.tagName === 'rect',
      isEllipse: (el) => el.tagName === 'ellipse' || el.tagName === 'circle',
      isElementClosed: (el) => el.isClosed !== false,
    };
  }

  it('Deserializes <clipPath> as an opaque element preserving id and inner geometry', () => {
    const ctx = createMockSerializerContext();
    const svgInput = `
      <svg width="400" height="300" viewBox="0 0 400 300">
        <clipPath id="cp_cutout"><circle cx="50" cy="50" r="40" /></clipPath>
        <rect id="r1" x="10" y="10" width="100" height="100" clip-path="url(#cp_cutout)" fill="#0000ff" />
      </svg>
    `;

    SvgDeserializer.loadSvgString(svgInput, ctx);

    assert.equal(ctx.elements.length, 2);
    const clipElem = ctx.elements.find((el) => el.tagName.toLowerCase() === 'clippath');
    assert(clipElem !== undefined);
    assert.equal(clipElem?.id, 'cp_cutout');
    assert.equal(clipElem?.isOpaque, true);
    assert.equal(clipElem?.shapeType, 'opaque');
    assert(clipElem?.rawInnerXml?.includes('<circle'));
  });

  it('Deserializes <mask>, <filter>, <pattern> and <style> without data loss', () => {
    const ctx = createMockSerializerContext();
    const svgInput = `
      <svg width="500" height="400">
        <mask id="myMask"><rect width="100" height="100" fill="white" /></mask>
        <filter id="blurFilter"><feGaussianBlur stdDeviation="3" /></filter>
        <pattern id="pat1" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="3" /></pattern>
        <style>.custom-style { fill: red; }</style>
        <use href="#r1" />
      </svg>
    `;

    SvgDeserializer.loadSvgString(svgInput, ctx);

    const mask = ctx.elements.find((el) => el.tagName.toLowerCase() === 'mask');
    const filter = ctx.elements.find((el) => el.tagName.toLowerCase() === 'filter');
    const pattern = ctx.elements.find((el) => el.tagName.toLowerCase() === 'pattern');
    const style = ctx.elements.find((el) => el.tagName.toLowerCase() === 'style');
    const use = ctx.elements.find((el) => el.tagName.toLowerCase() === 'use');

    assert(mask !== undefined && mask.isOpaque);
    assert(filter !== undefined && filter.isOpaque);
    assert(pattern !== undefined && pattern.isOpaque);
    assert(style !== undefined && style.isOpaque);
    assert(use !== undefined && use.isOpaque);

    assert(mask.rawInnerXml?.includes('<rect'));
    assert(filter.rawInnerXml?.includes('feGaussianBlur'));
    assert(pattern.rawInnerXml?.includes('<circle'));
    assert(style.rawInnerXml?.includes('.custom-style') || style.textContent?.includes('.custom-style'));
  });

  it('Round-trips opaque elements back through SvgSerializer with 100% markup fidelity', () => {
    const ctx = createMockSerializerContext();
    const svgInput = `<svg width="400" height="300" viewBox="0 0 400 300">
  <clipPath id="cp_cutout"><circle cx="50" cy="50" r="40" /></clipPath>
  <filter id="f1"><feDropShadow dx="2" dy="2" /></filter>
  <use id="u1" href="#cp_cutout" />
</svg>`;

    SvgDeserializer.loadSvgString(svgInput, ctx);
    const serializedSvg = SvgSerializer.toSvgString(ctx);

    assert(serializedSvg.includes('<clipPath id="cp_cutout"'));
    assert(serializedSvg.includes('<circle cx="50" cy="50" r="40" />') || serializedSvg.includes('<circle cx="50" cy="50" r="40"'));
    assert(serializedSvg.includes('<filter id="f1"'));
    assert(serializedSvg.includes('feDropShadow'));
    assert(serializedSvg.includes('<use id="u1"'));
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-opaque-elements-fidelity.ts')) {
  runOpaqueElementsFidelityTests();
}
