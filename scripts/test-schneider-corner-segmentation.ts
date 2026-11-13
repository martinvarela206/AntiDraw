import { strict as assert } from 'assert';
import { SchneiderFit } from '../src/webview/engine/operations/booleans/SchneiderFit.js';
import { Point } from '../src/core/geom/Point.js';

export async function runSchneiderCornerSegmentationTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Schneider Corner Segmentation Suite');
  console.log('======================================================');

  let passed = 0;
  async function test(desc: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}:`, err);
      throw err;
    }
  }

  // Create an L-shaped path: horizontal segment (0,0) -> (100,0), sharp 90 deg turn to (100,100)
  const lPoints: Point[] = [
    { x: 0, y: 0 },
    { x: 25, y: 0 },
    { x: 50, y: 0 },
    { x: 75, y: 0 },
    { x: 100, y: 0 }, // Corner at index 4
    { x: 100, y: 25 },
    { x: 100, y: 50 },
    { x: 100, y: 75 },
    { x: 100, y: 100 },
  ];

  await test('detectCornerIndices detects sharp 90-degree corner at index 4', () => {
    const corners = SchneiderFit.detectCornerIndices(lPoints, 60);
    assert.strictEqual(corners.length, 1, 'Should detect exactly 1 sharp corner');
    assert.strictEqual(corners[0], 4, 'Corner index must be 4 (100, 0)');
  });

  await test('fitCurve with corner detection partitions path without rounding the corner', () => {
    const curves = SchneiderFit.fitCurve(lPoints, { detectCorners: true, cornerAngle: 60 });
    assert.ok(curves.length >= 2, 'Should produce at least 2 partitioned cubic segments');

    // The boundary between partitions must land exactly on the corner (100, 0)
    const midPoint = curves[0].p3;
    assert.strictEqual(midPoint.x, 100, 'Segment 0 must end at corner X: 100');
    assert.strictEqual(midPoint.y, 0, 'Segment 0 must end at corner Y: 0');

    const nextStart = curves[1].p0;
    assert.strictEqual(nextStart.x, 100, 'Segment 1 must start at corner X: 100');
    assert.strictEqual(nextStart.y, 0, 'Segment 1 must start at corner Y: 0');
  });

  await test('fitPointsToVertices assigns sharp nodeType to corner anchors', () => {
    const vertices = SchneiderFit.fitPointsToVertices(lPoints, { detectCorners: true, cornerAngle: 60 });
    assert.ok(vertices.length >= 3, 'Should produce vertices for start, corner, and end');

    // Find vertex at (100, 0)
    const cornerVert = vertices.find((v) => Math.round(v.x) === 100 && Math.round(v.y) === 0);
    assert.ok(cornerVert, 'Corner vertex must exist at (100, 0)');
    assert.strictEqual(cornerVert?.nodeType, 'sharp', 'Corner nodeType must be sharp');
  });

  await test('resolveAdaptiveTolerance scales with zoom and document scale', () => {
    // Zoom 1.0, scale 1.0 -> tolerance 2.0
    const tol1 = SchneiderFit.resolveAdaptiveTolerance(2.0, 1.0, 1.0);
    assert.strictEqual(tol1, 2.0);

    // Zoom 400% (4.0) -> tolerance tightens to 0.5px
    const tolZoom = SchneiderFit.resolveAdaptiveTolerance(2.0, 4.0, 1.0);
    assert.strictEqual(tolZoom, 0.5);

    // Zoom 25% (0.25) -> tolerance loosens to 8.0px
    const tolZoomOut = SchneiderFit.resolveAdaptiveTolerance(2.0, 0.25, 1.0);
    assert.strictEqual(tolZoomOut, 8.0);
  });

  await test('fitCurve maintains backward compatibility with numeric errorTolerance', () => {
    // Smooth semicircle points
    const smoothPoints: Point[] = [];
    for (let a = 0; a <= Math.PI; a += Math.PI / 10) {
      smoothPoints.push({ x: 100 + 50 * Math.cos(a), y: 100 + 50 * Math.sin(a) });
    }

    const curves = SchneiderFit.fitCurve(smoothPoints, 1.5);
    assert.ok(curves.length > 0, 'Should fit curves successfully with numeric tolerance');
    assert.ok(curves[0].p0 && curves[0].p3, 'Curve segments must be valid');
  });

  console.log(`\nSchneider Corner Segmentation: ${passed}/5 tests passed.\n`);
  return true;
}
