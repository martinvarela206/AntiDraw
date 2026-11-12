import { strict as assert } from 'assert';
import { SvgSerializer, IVectorModelSerializerContext } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import {
  CompanionMetadata,
  ElementMetadata,
  DropShadowConfig,
  InnerShadowConfig,
  ElementBlendConfig,
  PatternLockConfig,
  ElementMarkerConfig,
  CanvasGridConfig,
  CanvasGuideConfig,
} from '../src/shared/ipc/IpcContracts.js';

export function runExpandedCompanionSchemaTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Expanded Companion Schema & Inspector Fidelity Suite');
  console.log('======================================================');

  let passed = 0;
  function it(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}:`, err);
      throw err;
    }
  }

  function createMockSerializerContext(elements: VectorElement[]): IVectorModelSerializerContext {
    return {
      canvas: {
        width: 600,
        height: 400,
        viewBox: '0 0 600 400',
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
      isParametricElement: () => false,
      syncParametricAttributes: () => {},
      isRect: () => false,
      isEllipse: () => false,
      isElementClosed: () => true,
    };
  }

  it('Supports structured ElementMetadata including blend, shadow, pattern locks and markers', () => {
    const dropShadow: DropShadowConfig = {
      enabled: true,
      dx: 40,
      dy: 60,
      blur: 25,
      color: '#000000',
      opacity: 0.75,
      filterRegionPadding: 150,
    };

    const innerShadow: InnerShadowConfig = {
      enabled: true,
      dx: -5,
      dy: -5,
      blur: 10,
      color: '#ffffff',
      opacity: 0.5,
    };

    const blendConfig: ElementBlendConfig = {
      mode: 'specified-steps',
      steps: 8,
      alignToPath: true,
      reverseA: false,
      reverseB: true,
      startElementId: 'star_1',
      endElementId: 'circle_1',
    };

    const patternLocks: PatternLockConfig = {
      lockScale: true,
      lockPosition: false,
      lockRotation: true,
      patternId: 'pat_checker_1',
    };

    const markerConfig: ElementMarkerConfig = {
      startMarkerId: 'ad-marker-arrow',
      endMarkerId: 'ad-marker-dot',
      size: 14,
      offset: 4,
      units: 'strokeWidth',
      align: 'auto-start-reverse',
    };

    const elMeta: ElementMetadata = {
      attributes: { 'data-shape': 'rect' },
      dropShadow,
      innerShadow,
      blendConfig,
      patternLocks,
      markerConfig,
      customPivot: { x: 150, y: 120 },
    };

    const companion: CompanionMetadata = {
      elements: {
        elem_hero: elMeta,
      },
    };

    assert.equal(companion.elements!['elem_hero'].dropShadow?.blur, 25);
    assert.equal(companion.elements!['elem_hero'].blendConfig?.steps, 8);
    assert.equal(companion.elements!['elem_hero'].patternLocks?.lockScale, true);
    assert.equal(companion.elements!['elem_hero'].markerConfig?.size, 14);
    assert.deepEqual(companion.elements!['elem_hero'].customPivot, { x: 150, y: 120 });
  });

  it('SvgDeserializer rehydrates structured ElementMetadata into element attributes', () => {
    const svgInput = `<svg width="400" height="400"><rect id="card_1" width="100" height="100"/></svg>`;

    const companion: CompanionMetadata = {
      elements: {
        card_1: {
          dropShadow: { enabled: true, dx: 10, dy: 10, blur: 15, color: '#111', opacity: 0.8 },
          blendConfig: { mode: 'smooth-color', steps: 20 },
          patternLocks: { lockScale: true, lockRotation: true },
          markerConfig: { size: 16, units: 'userSpaceOnUse' },
        },
      },
    };

    const ctx = createMockSerializerContext([]);
    SvgDeserializer.loadSvgString(svgInput, ctx, companion);

    assert.equal(ctx.elements.length, 1);
    const el = ctx.elements[0];

    assert(el.attributes['data-drop-shadow'], 'Rehydrates data-drop-shadow');
    const parsedDs = JSON.parse(el.attributes['data-drop-shadow']);
    assert.equal(parsedDs.blur, 15);

    assert(el.attributes['data-blend'], 'Rehydrates data-blend');
    const parsedBlend = JSON.parse(el.attributes['data-blend']);
    assert.equal(parsedBlend.steps, 20);

    assert.equal(el.attributes['data-pattern-lock-scale'], 'true');
    assert.equal(el.attributes['data-pattern-lock-rotation'], 'true');
    assert.equal(el.attributes['data-marker-size'], '16');
    assert.equal(el.attributes['data-marker-units'], 'userSpaceOnUse');
  });

  it('SvgSerializer compiles dynamically expanded filter regions for large shadow blurs', () => {
    const elLargeShadow: VectorElement = {
      id: 'box_blurred',
      tagName: 'rect',
      attributes: {
        id: 'box_blurred',
        width: '50',
        height: '50',
        'data-drop-shadow': JSON.stringify({
          enabled: true,
          dx: 80,
          dy: 80,
          blur: 40,
          color: '#000',
          opacity: 0.5,
        }),
      },
    };

    const filters = SvgSerializer.compileElementFilters([elLargeShadow]);
    assert(filters.includes('<filter id="ad-filter-shadow-box_blurred"'), 'Compiled shadow filter');

    // Expected padding: max(50, ceil(80 + 3*40)*2) = max(50, 400) = 400%
    assert(filters.includes('x="-400%"') || filters.includes('width="900%"'), 'Calculated dynamic filter region expands to prevent clipping');
  });

  it('Supports multi-grid and multi-guide persistent configurations in CompanionMetadata', () => {
    const grids: CanvasGridConfig[] = [
      { id: 'grid_ortho', type: 'orthogonal', spacing: 10, color: '#cbd5e1', visible: true, alignmentMode: 'origin' },
      { id: 'grid_iso', type: 'isometric', spacing: 25, color: '#94a3b8', visible: false, alignmentMode: 'cell-center' },
    ];

    const guides: CanvasGuideConfig[] = [
      { id: 'guide_v1', orientation: 'vertical', position: 100, color: '#06b6d4', locked: true },
      { id: 'guide_h1', orientation: 'horizontal', position: 200, color: '#3b82f6', locked: false },
      { id: 'guide_a1', orientation: 'angled', position: 0, angle: 45, pivotX: 200, pivotY: 200 },
    ];

    const companion: CompanionMetadata = {
      grids,
      guides,
      showGrid: true,
      showGuides: true,
      lockGuides: true,
    };

    assert.equal(companion.grids?.length, 2);
    assert.equal(companion.grids?.[0].type, 'orthogonal');
    assert.equal(companion.grids?.[1].type, 'isometric');
    assert.equal(companion.guides?.length, 3);
    assert.equal(companion.guides?.[2].angle, 45);
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-expanded-companion-schema.ts')) {
  runExpandedCompanionSchemaTests();
}
