import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { EllipsePrimitive } from '../src/webview/engine/primitives/EllipsePrimitive.js';
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

export async function runEllipseAutoPromoteTests(): Promise<boolean> {
  console.log('\n--- Running Parametric Ellipse Auto-Promotion & Arc/Rosca Suite ---');

  // Test 1: EllipsePrimitive.isFullSolid helper
  const solidEllipse: VectorElement = {
    id: 'el_solid',
    tagName: 'ellipse',
    shapeType: 'ellipse',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'el_solid',
      cx: '100',
      cy: '100',
      rx: '80',
      ry: '50',
      'data-shape': 'ellipse',
      'data-ellipse-type': 'ellipse',
      'data-start-angle': '0',
      'data-end-angle': '360',
      'data-inner-ratio': '0',
    },
  };

  const pieSector: VectorElement = {
    id: 'el_pie',
    tagName: 'path',
    shapeType: 'ellipse',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'el_pie',
      cx: '100',
      cy: '100',
      rx: '80',
      ry: '50',
      'data-shape': 'ellipse',
      'data-ellipse-type': 'pie',
      'data-start-angle': '45',
      'data-end-angle': '180',
      'data-inner-ratio': '0',
    },
  };

  const donutRing: VectorElement = {
    id: 'el_donut',
    tagName: 'path',
    shapeType: 'ellipse',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'el_donut',
      cx: '100',
      cy: '100',
      rx: '80',
      ry: '50',
      'data-shape': 'ellipse',
      'data-ellipse-type': 'ellipse',
      'data-start-angle': '0',
      'data-end-angle': '360',
      'data-inner-ratio': '0.5',
    },
  };

  assert(EllipsePrimitive.isFullSolid(solidEllipse), '360° unpierced ellipse is evaluated as full solid');
  assert(!EllipsePrimitive.isFullSolid(pieSector), 'Pie sector (< 360°) is NOT evaluated as full solid');
  assert(!EllipsePrimitive.isFullSolid(donutRing), 'Donut ring with inner-ratio > 0 is NOT evaluated as full solid');

  // Test 2: Serialization of pristine 0°-360° W3C <ellipse>
  const model = new VectorModel();
  model.elements = [solidEllipse];
  const svgOutput1 = model.toSvgString();

  assert(svgOutput1.includes('<ellipse'), 'Full 0°-360° solid ellipse serializes as native <ellipse>');
  assert(svgOutput1.includes('rx="80"') && svgOutput1.includes('ry="50"'), 'Native <ellipse> retains rx and ry');
  assert(!svgOutput1.includes('<path'), 'No <path> is emitted for full solid ellipse');
  assert(!svgOutput1.includes('data-shape'), 'Proprietary data-shape is purged from clean SVG markup');

  // Test 3: Serialization of 1:1 circle as native <circle>
  const circleEl: VectorElement = {
    id: 'circle_1',
    tagName: 'circle',
    shapeType: 'circle',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'circle_1',
      cx: '50',
      cy: '50',
      r: '40',
      'data-shape': 'circle',
      'data-ellipse-type': 'ellipse',
      'data-start-angle': '0',
      'data-end-angle': '360',
      'data-inner-ratio': '0',
      fill: '#10b981',
    },
  };

  model.elements = [circleEl];
  const svgOutput2 = model.toSvgString();
  assert(svgOutput2.includes('<circle'), '1:1 solid circle serializes as native <circle>');
  assert(svgOutput2.includes('r="40"'), 'Native <circle> retains r="40"');
  assert(!svgOutput2.includes('data-shape'), 'data-shape is purged from clean <circle>');

  // Test 4: Auto-promoción to <path> when opening pie sector or arc
  const partialPie: VectorElement = {
    id: 'pie_1',
    tagName: 'path',
    shapeType: 'ellipse',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'pie_1',
      cx: '100',
      cy: '100',
      rx: '60',
      ry: '60',
      fill: '#f59e0b',
      'data-shape': 'ellipse',
      'data-parametric': 'true',
      'data-ellipse-type': 'pie',
      'data-start-angle': '0',
      'data-end-angle': '270',
      'data-inner-ratio': '0',
    },
    vertices: model.convertEllipseToVertices(100, 100, 60, 60, 'pie', 0, 270, 0),
  };

  model.elements = [partialPie];
  const svgOutput3 = model.toSvgString();

  assert(svgOutput3.includes('<path'), 'Pie wedge auto-promotes to <path>');
  assert(!svgOutput3.includes('<ellipse') && !svgOutput3.includes('<circle'), 'Neither <ellipse> nor <circle> emitted for pie wedge');
  assert(svgOutput3.includes(' d="M'), 'Emitted <path> contains SVG arc commands');
  assert(!svgOutput3.includes('cx='), 'cx coordinate stripped from clean <path> tag');
  assert(!svgOutput3.includes('rx='), 'rx radius stripped from clean <path> tag');
  assert(!svgOutput3.includes('data-shape'), 'data-shape purged from clean SVG markup');

  // Test 5: Auto-promoción to <path> when adding inner donut hole (innerRatio > 0)
  const donutEl: VectorElement = {
    id: 'donut_1',
    tagName: 'path',
    shapeType: 'ellipse',
    isParametric: true,
    isClosed: true,
    attributes: {
      id: 'donut_1',
      cx: '150',
      cy: '150',
      rx: '80',
      ry: '80',
      fill: '#ec4899',
      'data-shape': 'ellipse',
      'data-parametric': 'true',
      'data-ellipse-type': 'ellipse',
      'data-start-angle': '0',
      'data-end-angle': '360',
      'data-inner-ratio': '0.4',
    },
    vertices: model.convertEllipseToVertices(150, 150, 80, 80, 'ellipse', 0, 360, 0.4),
  };

  model.elements = [donutEl];
  const svgOutput4 = model.toSvgString();

  assert(svgOutput4.includes('<path'), 'Donut ring auto-promotes to <path>');
  assert(svgOutput4.includes('fill-rule="evenodd"'), 'Donut ring carries fill-rule="evenodd"');
  assert(!svgOutput4.includes('data-inner-ratio'), 'data-inner-ratio purged from clean SVG markup');

  // Test 6: Reverting back to full 0°-360° solid ellipse without rosca emits native <ellipse>
  donutEl.tagName = 'ellipse';
  donutEl.attributes['data-inner-ratio'] = '0';
  delete donutEl.attributes['fill-rule'];
  delete donutEl.attributes.d;
  donutEl.vertices = model.convertEllipseToVertices(150, 150, 80, 80, 'ellipse', 0, 360, 0);

  model.elements = [donutEl];
  const svgOutput5 = model.toSvgString();

  assert(svgOutput5.includes('<ellipse') || svgOutput5.includes('<circle'), 'Resetting inner ratio to 0 reverts back to native <ellipse>/<circle>');
  assert(!svgOutput5.includes('<path'), 'No <path> emitted once donut hole is reset');
  assert(!svgOutput5.includes('fill-rule'), 'fill-rule purged once donut hole is reset');

  // Test 7: Deserialization of <path> with companion metadata rehydrates parametric ellipse
  const svgInput = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <path id="rehydrated_pie" d="M 100 100 L 160 100 A 60 60 0 1 1 100 40 Z" fill="#6366f1" />
  </svg>`;

  const companion: CompanionMetadata = {
    elements: {
      rehydrated_pie: {
        'data-shape': 'ellipse',
        'data-parametric': 'true',
        'data-ellipse-type': 'pie',
        'data-start-angle': '0',
        'data-end-angle': '270',
        'data-inner-ratio': '0',
        'data-ellipse-cx': '100',
        'data-ellipse-cy': '100',
        'data-ellipse-rx': '60',
        'data-ellipse-ry': '60',
      },
    },
  };

  const rehydratedModel = new VectorModel();
  SvgDeserializer.loadSvgString(svgInput, rehydratedModel, companion);

  assert(rehydratedModel.elements.length === 1, 'Deserialized 1 element');
  const rehydratedEl = rehydratedModel.elements[0];
  assert(rehydratedModel.isEllipse(rehydratedEl), 'Rehydrated pie is identified as a parametric ellipse');
  assert(rehydratedEl.shapeType === 'ellipse', 'Element shapeType is ellipse');
  assert(rehydratedEl.tagName === 'path', 'Pie wedge retains tagName="path"');
  assert(rehydratedEl.attributes.cx === '100', 'Rehydrated center cx=100');
  assert(rehydratedEl.attributes.rx === '60', 'Rehydrated radius rx=60');

  // Test 8: Closing pie wedge back to 360° on deserialized element restores pure <ellipse>
  rehydratedEl.tagName = 'ellipse';
  rehydratedEl.attributes['data-ellipse-type'] = 'ellipse';
  rehydratedEl.attributes['data-start-angle'] = '0';
  rehydratedEl.attributes['data-end-angle'] = '360';
  rehydratedEl.attributes['data-inner-ratio'] = '0';
  delete rehydratedEl.attributes.d;

  const svgOutput6 = rehydratedModel.toSvgString();
  assert(svgOutput6.includes('<ellipse') || svgOutput6.includes('<circle'), 'Restoring pie to 360° serializes as pure <ellipse>/<circle>');
  assert(!svgOutput6.includes('<path'), 'No <path> emitted for closed 360° ellipse');

  console.log(`\nParametric Ellipse Suite Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
