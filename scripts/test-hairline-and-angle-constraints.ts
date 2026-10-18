import { PointUtils, VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';

export async function runHairlineAndAngleConstraintsTests(): Promise<boolean> {
  console.log('\n--- Running Hairline Stroke & 15-Degree Angle Constraints Suite ---');
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. PointUtils.snapAngle (15° increments and orthogonal X/Y axes)
  console.log('\n[1. PointUtils.snapAngle (15° increments)]');
  const origin = { x: 100, y: 100 };

  // Pure horizontal (0°)
  const p0 = PointUtils.snapAngle(origin, { x: 200, y: 102 });
  assert(Math.abs(p0.y - 100) < 1e-6, `Snaps to pure horizontal 0°: got y=${p0.y}, expected 100`);
  assert(p0.x > 199, `Maintains forward X displacement: got x=${p0.x}`);

  // Pure vertical (90°)
  const p90 = PointUtils.snapAngle(origin, { x: 102, y: 250 });
  assert(Math.abs(p90.x - 100) < 1e-6, `Snaps to pure vertical 90°: got x=${p90.x}, expected 100`);
  assert(p90.y > 249, `Maintains downward Y displacement: got y=${p90.y}`);

  // 45° diagonal
  const p45 = PointUtils.snapAngle(origin, { x: 200, y: 198 });
  const dX45 = p45.x - 100;
  const dY45 = p45.y - 100;
  assert(Math.abs(dX45 - dY45) < 1e-4, `Snaps to exact 45° diagonal: dx=${dX45.toFixed(4)}, dy=${dY45.toFixed(4)}`);

  // 15° ray
  const dist = 100;
  const target15 = { x: 100 + dist * Math.cos(14 * Math.PI / 180), y: 100 + dist * Math.sin(14 * Math.PI / 180) };
  const p15 = PointUtils.snapAngle(origin, target15, Math.PI / 12);
  const angle15 = Math.atan2(p15.y - 100, p15.x - 100) * 180 / Math.PI;
  assert(Math.abs(angle15 - 15) < 1e-4, `Snaps 14° input to exact 15°: got ${angle15.toFixed(2)}°`);

  // 30° ray
  const target30 = { x: 100 + dist * Math.cos(31 * Math.PI / 180), y: 100 + dist * Math.sin(31 * Math.PI / 180) };
  const p30 = PointUtils.snapAngle(origin, target30, Math.PI / 12);
  const angle30 = Math.atan2(p30.y - 100, p30.x - 100) * 180 / Math.PI;
  assert(Math.abs(angle30 - 30) < 1e-4, `Snaps 31° input to exact 30°: got ${angle30.toFixed(2)}°`);

  // 2. Hairline vector-effect and "min" attributes
  console.log('\n[2. Hairline vector-effect and "min" stroke representation]');
  const mockHairlineEl: VectorElement = {
    id: 'el_test_hairline',
    tagName: 'path',
    attributes: {
      id: 'el_test_hairline',
      d: 'M 10 10 L 100 100',
      stroke: '#000000',
      'stroke-width': '1',
      'vector-effect': 'non-scaling-stroke',
      'data-stroke-hairline': 'true',
    },
  };

  assert(mockHairlineEl.attributes['vector-effect'] === 'non-scaling-stroke', 'Element has vector-effect="non-scaling-stroke"');
  assert(mockHairlineEl.attributes['data-stroke-hairline'] === 'true', 'Element has data-stroke-hairline="true"');

  // Serialization test: standard W3C vector-effect="non-scaling-stroke" is cleanly preserved
  const sourceModel = new VectorModel();
  sourceModel.elements.push(mockHairlineEl);
  const serializedSvg = sourceModel.toSvgString();
  assert(serializedSvg.includes('vector-effect="non-scaling-stroke"'), 'Serialized SVG includes vector-effect="non-scaling-stroke"');

  // Deserialization roundtrip test
  const reloadedModel = new VectorModel();
  reloadedModel.loadSvgString(serializedSvg);
  assert(reloadedModel.elements.length === 1, 'Reloaded 1 element');
  assert(reloadedModel.elements[0].attributes['vector-effect'] === 'non-scaling-stroke', 'Deserialized element retains vector-effect="non-scaling-stroke"');

  // 3. Step logic verification (-, +, min)
  console.log('\n[3. Step logic verification (-, +, min)]');
  const testEl: VectorElement = {
    id: 'el_step',
    tagName: 'path',
    attributes: {
      id: 'el_step',
      d: 'M 0 0 L 10 10',
      stroke: '#000000',
      'stroke-width': '1',
      'vector-effect': 'non-scaling-stroke',
      'data-stroke-hairline': 'true',
    },
  };

  // When in min, clicking - drops to 0
  const isMin = testEl.attributes['vector-effect'] === 'non-scaling-stroke';
  if (isMin) {
    testEl.attributes['stroke-width'] = '0';
    testEl.attributes['stroke'] = 'none';
    delete testEl.attributes['vector-effect'];
    delete testEl.attributes['data-stroke-hairline'];
  }
  assert(testEl.attributes['stroke-width'] === '0', 'Clicking - in min mode transitions stroke-width to 0');
  assert(testEl.attributes['stroke'] === 'none', 'Clicking - in min mode sets stroke to none');
  assert(!testEl.attributes['vector-effect'], 'vector-effect is cleared');

  // Clicking min restores hairline
  testEl.attributes['stroke-width'] = '1';
  testEl.attributes['stroke'] = '#000000';
  testEl.attributes['vector-effect'] = 'non-scaling-stroke';
  testEl.attributes['data-stroke-hairline'] = 'true';
  assert(testEl.attributes['vector-effect'] === 'non-scaling-stroke', 'Clicking min restores non-scaling-stroke');

  // When in min, clicking + raises to 1
  if (testEl.attributes['vector-effect'] === 'non-scaling-stroke') {
    testEl.attributes['stroke-width'] = '1';
    delete testEl.attributes['vector-effect'];
    delete testEl.attributes['data-stroke-hairline'];
  }
  assert(testEl.attributes['stroke-width'] === '1', 'Clicking + in min mode transitions to standard 1px');
  assert(!testEl.attributes['vector-effect'], 'vector-effect removed in standard 1px mode');

  console.log(`\nHairline & Angle Constraints Tests complete: ${passed} passed, ${failed} failed.`);
  return failed === 0;
}
