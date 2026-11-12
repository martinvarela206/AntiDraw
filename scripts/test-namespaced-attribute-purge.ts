import { strict as assert } from 'assert';
import { SvgSerializer, IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';

export function runNamespacedAttributePurgeTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Namespaced Attribute Purge Test Suite');
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

  function createMockSerializerContext(elements: VectorElement[]): IVectorModelSerializerContext {
    return {
      canvas: {
        width: 500,
        height: 500,
        viewBox: '0 0 500 500',
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

  it('Purges proprietary data-antidraw-* and internal editor attributes', () => {
    const el: VectorElement = {
      id: 'el_1',
      tagName: 'rect',
      attributes: {
        id: 'el_1',
        x: '10',
        y: '10',
        width: '100',
        height: '80',
        fill: '#ff0000',
        'data-antidraw-custom': 'secret_metadata',
        'data-antidraw-uuid': '12345',
        'data-shape': 'rect',
        'data-parametric': 'true',
        'data-node-types': 'sharp,sharp',
        'data-locked': 'true',
      },
      isClosed: true,
    };

    const ctx = createMockSerializerContext([el]);
    const serialized = SvgSerializer.toSvgString(ctx);

    assert(!serialized.includes('data-antidraw-custom'));
    assert(!serialized.includes('data-antidraw-uuid'));
    assert(!serialized.includes('data-shape'));
    assert(!serialized.includes('data-parametric'));
    assert(!serialized.includes('data-node-types'));
    assert(!serialized.includes('data-locked'));
    assert(serialized.includes('fill="#ff0000"'));
  });

  it('Preserves legitimate third-party and SVG 2 data-* attributes verbatim', () => {
    const el: VectorElement = {
      id: 'el_2',
      tagName: 'rect',
      attributes: {
        id: 'el_2',
        x: '20',
        y: '20',
        width: '50',
        height: '50',
        'data-name': 'MainHeaderIcon',
        'data-testid': 'icon-dashboard-nav',
        'data-framework-binding': 'v-bind:style',
        'data-lucide': 'check-circle',
      },
      isClosed: true,
    };

    const ctx = createMockSerializerContext([el]);
    const serialized = SvgSerializer.toSvgString(ctx);

    assert(serialized.includes('data-name="MainHeaderIcon"'));
    assert(serialized.includes('data-testid="icon-dashboard-nav"'));
    assert(serialized.includes('data-framework-binding="v-bind:style"'));
    assert(serialized.includes('data-lucide="check-circle"'));
  });

  it('Round-trips third-party data-* attributes through deserializer and serializer without loss', () => {
    const inputSvg = `<svg width="500" height="500" viewBox="0 0 500 500">
  <rect id="custom_icon" x="30" y="30" width="40" height="40" data-semantic="primary-action" data-cy="btn-export" />
</svg>`;

    const ctx = createMockSerializerContext([]);
    SvgDeserializer.loadSvgString(inputSvg, ctx);

    assert.equal(ctx.elements.length, 1);
    assert.equal(ctx.elements[0].attributes['data-semantic'], 'primary-action');
    assert.equal(ctx.elements[0].attributes['data-cy'], 'btn-export');

    const outputSvg = SvgSerializer.toSvgString(ctx);
    assert(outputSvg.includes('data-semantic="primary-action"'));
    assert(outputSvg.includes('data-cy="btn-export"'));
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-namespaced-attribute-purge.ts')) {
  runNamespacedAttributePurgeTests();
}
