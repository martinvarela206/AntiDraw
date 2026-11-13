import { strict as assert } from 'assert';
import { BezierProjection } from '../src/webview/engine/geometry/BezierProjection.js';
import { EdgeSnappingService } from '../src/webview/engine/canvas/EdgeSnappingService.js';
import { Point } from '../src/webview/engine/VectorModel.js';

export async function runRobustBezierProjectionTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Robust Bézier Projection Suite');
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

  await test('Evaluates exact analytical derivatives and points along cubic curve', () => {
    const p0: Point = { x: 0, y: 0 };
    const p1: Point = { x: 0, y: 100 };
    const p2: Point = { x: 100, y: 100 };
    const p3: Point = { x: 100, y: 0 };

    // At t=0
    const startPt = BezierProjection.eval(0, p0, p1, p2, p3);
    assert.strictEqual(startPt.x, 0);
    assert.strictEqual(startPt.y, 0);

    const startDeriv = BezierProjection.evalDerivative(0, p0, p1, p2, p3);
    assert.strictEqual(startDeriv.x, 0);
    assert.strictEqual(startDeriv.y, 300); // 3 * (p1.y - p0.y) = 300

    // At t=1
    const endPt = BezierProjection.eval(1, p0, p1, p2, p3);
    assert.strictEqual(endPt.x, 100);
    assert.strictEqual(endPt.y, 0);

    const endDeriv = BezierProjection.evalDerivative(1, p0, p1, p2, p3);
    assert.strictEqual(endDeriv.x, 0);
    assert.strictEqual(endDeriv.y, -300); // 3 * (p3.y - p2.y) = -300
  });

  await test('Projects accurately onto flat cubic curve (linear degenerate)', () => {
    // Collinear points forming horizontal line from (0, 0) to (300, 0)
    const p0: Point = { x: 0, y: 0 };
    const p1: Point = { x: 100, y: 0 };
    const p2: Point = { x: 200, y: 0 };
    const p3: Point = { x: 300, y: 0 };

    const queryPt: Point = { x: 150, y: 75 };
    const res = BezierProjection.projectPoint(queryPt, p0, p1, p2, p3);

    assert.ok(Math.abs(res.point.x - 150) < 1e-3, `Projected X must be ~150 (got ${res.point.x})`);
    assert.ok(Math.abs(res.point.y - 0) < 1e-3, `Projected Y must be ~0 (got ${res.point.y})`);
    assert.ok(Math.abs(res.t - 0.5) < 1e-3, `Parameter t must be ~0.5 (got ${res.t})`);
    assert.ok(Math.abs(res.distance - 75) < 1e-3, `Distance must be ~75 (got ${res.distance})`);
  });

  await test('Projects onto symmetric arch curve with second-order Newton-Raphson convergence', () => {
    // Arch from (0, 0) to (200, 0) with peak near (100, 75)
    const p0: Point = { x: 0, y: 0 };
    const p1: Point = { x: 0, y: 100 };
    const p2: Point = { x: 200, y: 100 };
    const p3: Point = { x: 200, y: 0 };

    // Point directly above the center
    const queryPt: Point = { x: 100, y: 150 };
    const res = BezierProjection.projectPoint(queryPt, p0, p1, p2, p3);

    assert.ok(Math.abs(res.point.x - 100) < 1e-3, `Apex X should be 100 (got ${res.point.x})`);
    assert.ok(Math.abs(res.point.y - 75) < 1e-3, `Apex Y should be 75 (got ${res.point.y})`);
    assert.ok(Math.abs(res.t - 0.5) < 1e-3, `Parameter t must be 0.5 (got ${res.t})`);
    assert.ok(res.converged, 'Algorithm must report converged status');
  });

  await test('Guarantees boundary clamping for points closest to endpoints', () => {
    const p0: Point = { x: 50, y: 50 };
    const p1: Point = { x: 100, y: 150 };
    const p2: Point = { x: 200, y: 150 };
    const p3: Point = { x: 250, y: 50 };

    // Far to the left of p0
    const queryLeft: Point = { x: -100, y: 0 };
    const resLeft = BezierProjection.projectPoint(queryLeft, p0, p1, p2, p3);
    assert.strictEqual(resLeft.t, 0, 'Left point must clamp strictly to t=0');
    assert.strictEqual(resLeft.point.x, p0.x);
    assert.strictEqual(resLeft.point.y, p0.y);

    // Far to the right of p3
    const queryRight: Point = { x: 500, y: 0 };
    const resRight = BezierProjection.projectPoint(queryRight, p0, p1, p2, p3);
    assert.strictEqual(resRight.t, 1, 'Right point must clamp strictly to t=1');
    assert.strictEqual(resRight.point.x, p3.x);
    assert.strictEqual(resRight.point.y, p3.y);
  });

  await test('EdgeSnappingService.projectPointToCubicBezier delegates to robust projection', () => {
    const p0: Point = { x: 0, y: 0 };
    const p1: Point = { x: 50, y: 100 };
    const p2: Point = { x: 150, y: 100 };
    const p3: Point = { x: 200, y: 0 };

    const query: Point = { x: 100, y: 120 };
    const projected = EdgeSnappingService.projectPointToCubicBezier(query, p0, p1, p2, p3);

    assert.ok(Math.abs(projected.x - 100) < 1e-2, `Expected projected X ~100 (got ${projected.x})`);
    assert.ok(projected.y > 0 && projected.y <= 75, `Expected projected Y within curve bounds (got ${projected.y})`);
    assert.ok(!isNaN(projected.x) && !isNaN(projected.y), 'Coordinates must be valid numbers');
  });

  console.log(`\nRobust Bézier Projection: ${passed}/5 tests passed.\n`);
  return true;
}
