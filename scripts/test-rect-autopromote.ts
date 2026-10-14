import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { RectPrimitive } from '../src/webview/engine/primitives/RectPrimitive.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { CompanionMetadata } from '../src/webview/bridge/VsCodeBridge.js';

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

export async function runRectAutoPromoteTests(): Promise<boolean> {
  console.log('\n--- Running Parametric Rect Auto-Promotion & Corner Unification Suite ---');

  // Test 1: RectPrimitive.isUniform evaluation
  const uniformCorners1 = { tl: 10, tr: 10, br: 10, bl: 10, mode: 'uniform' as const, unit: 'px' as const };
  const uniformCorners2 = { tl: 15, tr: 15, br: 15, bl: 15, mode: 'independent' as const, unit: 'px' as const };
  const independentCorners1 = { tl: 20, tr: 5, br: 10, bl: 0, mode: 'independent' as const, unit: 'px' as const };
  const pctCorners = { tl: 10, tr: 10, br: 10, bl: 10, mode: 'uniform' as const, unit: '%' as const };

  assert(RectPrimitive.isUniform(uniformCorners1), 'Uniform mode with equal corners in px is uniform');
  assert(RectPrimitive.isUniform(uniformCorners2), 'Independent mode with all 4 corners numerically equal in px is uniform');
  assert(!RectPrimitive.isUniform(independentCorners1), 'Independent mode with different corner radii is NOT uniform');
  assert(!RectPrimitive.isUniform(pctCorners), 'Percentage corner radii are NOT uniform native px rect');

  // Test 2: Serialization of pristine uniform <rect>
  const model = new VectorModel();
  const uniformRect: VectorElement = {
    id: 'rect_uniform_1',
    tagName: 'rect',
    shapeType: 'rect',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'rect_uniform_1',
      x: '10',
      y: '20',
      width: '100',
      height: '80',
      rx: '8',
      ry: '8',
      fill: '#6366f1',
      stroke: '#000000',
      'data-shape': 'rect',
      'data-parametric': 'true',
      'data-corner-mode': 'uniform',
      'data-corner-unit': 'px',
      'data-corner-radius': '8,8,8,8',
      'data-corner-tl': '8',
      'data-corner-tr': '8',
      'data-corner-br': '8',
      'data-corner-bl': '8',
    },
    vertices: model.convertRectToVertices(10, 20, 100, 80, 8, 8, 8, 8),
  };

  model.elements = [uniformRect];
  const svgOutput1 = model.toSvgString();

  assert(svgOutput1.includes('<rect'), 'Uniform rectangle serializes as native <rect>');
  assert(svgOutput1.includes('rx="8"') && svgOutput1.includes('ry="8"'), 'Native <rect> retains rx="8" and ry="8"');
  assert(!svgOutput1.includes('<path'), 'No <path> is emitted for uniform rectangle');
  assert(!svgOutput1.includes('data-shape'), 'Proprietary data-shape is purged from clean SVG markup');

  // Test 3: Auto-promotion to <path> when corner radii are decoupled / independent
  const independentRect: VectorElement = {
    id: 'rect_independent_1',
    tagName: 'path',
    shapeType: 'rect',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'rect_independent_1',
      x: '10',
      y: '20',
      width: '100',
      height: '80',
      fill: '#6366f1',
      stroke: '#000000',
      'data-shape': 'rect',
      'data-parametric': 'true',
      'data-corner-mode': 'independent',
      'data-corner-unit': 'px',
      'data-corner-radius': '25,5,15,0',
      'data-corner-tl': '25',
      'data-corner-tr': '5',
      'data-corner-br': '15',
      'data-corner-bl': '0',
    },
    vertices: model.convertRectToVertices(10, 20, 100, 80, 25, 5, 15, 0),
  };

  model.elements = [independentRect];
  const svgOutput2 = model.toSvgString();

  assert(svgOutput2.includes('<path'), 'Independent rectangle auto-promotes to <path>');
  assert(!svgOutput2.includes('<rect'), 'Native <rect> is NOT emitted for independent corner rectangle');
  assert(svgOutput2.includes(' d="M'), 'Emitted <path> contains compiled Bézier quadrants');
  assert(!svgOutput2.includes('width="100"'), 'Scalar width attribute is stripped from clean <path>');
  assert(!svgOutput2.includes('rx='), 'rx attribute is stripped from clean <path>');
  assert(!svgOutput2.includes('data-shape'), 'data-shape is purged from clean SVG markup');

  // Test 4: Corner Unification reverts <path> back to pure <rect> W3C
  const targetCorners = { tl: 25, tr: 25, br: 25, bl: 25, mode: 'uniform' as const, unit: 'px' as const };
  independentRect.tagName = 'rect';
  independentRect.attributes['data-corner-mode'] = 'uniform';
  independentRect.attributes['data-corner-tl'] = '25';
  independentRect.attributes['data-corner-tr'] = '25';
  independentRect.attributes['data-corner-br'] = '25';
  independentRect.attributes['data-corner-bl'] = '25';
  independentRect.attributes['data-corner-radius'] = '25,25,25,25';
  independentRect.attributes.rx = '25';
  independentRect.attributes.ry = '25';
  delete independentRect.attributes.d;
  independentRect.vertices = model.convertRectToVertices(10, 20, 100, 80, 25, 25, 25, 25);

  model.elements = [independentRect];
  const svgOutput3 = model.toSvgString();

  assert(svgOutput3.includes('<rect'), 'Unifying corners reverts element back to pure W3C <rect>');
  assert(svgOutput3.includes('rx="25"'), 'Reverted <rect> carries unified rx="25"');
  assert(!svgOutput3.includes('<path'), 'No <path> is emitted once corners are unified');

  // Test 5: Deserialization of <path> with companion metadata rehydrates parametric rect
  const svgInput = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <path id="rehydrated_rect" d="M 30 10 L 95 10 C 97.76 10 100 12.24 100 15 L 100 85 C 100 87.76 97.76 90 95 90 L 15 90 C 12.24 90 10 87.76 10 85 L 10 30 C 10 18.95 18.95 10 30 10 Z" fill="#4f46e5" />
  </svg>`;

  const companion: CompanionMetadata = {
    elements: {
      rehydrated_rect: {
        'data-shape': 'rect',
        'data-parametric': 'true',
        'data-corner-mode': 'independent',
        'data-corner-unit': 'px',
        'data-corner-radius': '20,5,5,5',
        'data-corner-tl': '20',
        'data-corner-tr': '5',
        'data-corner-br': '5',
        'data-corner-bl': '5',
        'data-rect-x': '10',
        'data-rect-y': '10',
        'data-rect-w': '90',
        'data-rect-h': '80',
      },
    },
  };

  const rehydratedModel = new VectorModel();
  SvgDeserializer.loadSvgString(svgInput, rehydratedModel, companion);

  assert(rehydratedModel.elements.length === 1, 'Deserialized 1 element');
  const el = rehydratedModel.elements[0];
  assert(rehydratedModel.isRect(el), 'Rehydrated element is identified as a parametric rect');
  assert(el.shapeType === 'rect', 'Element shapeType is rect');
  assert(el.tagName === 'path', 'Independent corners retain tagName="path" for accurate Bézier DOM rendering');
  assert(el.attributes.x === '10', 'Scalar x coordinate rehydrated from companion data-rect-x');
  assert(el.attributes.width === '90', 'Scalar width coordinate rehydrated from companion data-rect-w');

  // Test 6: Re-unifying deserialized element via RectPrimitive
  const c = rehydratedModel.getRectCorners(el, 90, 80);
  assert(c.tl === 20 && c.tr === 5, 'Parsed independent corners TL=20, TR=5');

  // Apply unification
  el.tagName = 'rect';
  el.attributes['data-corner-mode'] = 'uniform';
  el.attributes['data-corner-tl'] = '20';
  el.attributes['data-corner-tr'] = '20';
  el.attributes['data-corner-br'] = '20';
  el.attributes['data-corner-bl'] = '20';
  el.attributes['data-corner-radius'] = '20,20,20,20';
  el.attributes.rx = '20';
  el.attributes.ry = '20';
  delete el.attributes.d;

  const svgOutput4 = rehydratedModel.toSvgString();
  assert(svgOutput4.includes('<rect'), 'Re-unified deserialized element serializes as pure <rect>');
  assert(svgOutput4.includes('rx="20"'), 'Pure <rect> carries rx="20"');
  assert(!svgOutput4.includes('<path'), 'No <path> emitted after unifying rehydrated element');

  console.log(`\nParametric Rect Suite Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
