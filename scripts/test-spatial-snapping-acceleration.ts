import { strict as assert } from 'assert';
import { SpatialGrid, BoundingBox2D } from '../src/webview/engine/spatial/SpatialGrid.js';
import { SnappingEngine, SnappingContext } from '../src/webview/engine/canvas/SnappingEngine.js';
import { IntersectionSnappingService } from '../src/webview/engine/canvas/IntersectionSnappingService.js';
import { Point, VectorElement } from '../src/webview/engine/VectorModel.js';

export async function runSpatialSnappingAccelerationTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Spatial Snapping & Broad-Phase Acceleration Suite');
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

  await test('SpatialGrid manages insertions, removals, and point queries', () => {
    const grid = new SpatialGrid<{ name: string }>(50);
    grid.insert('item_1', { minX: 10, minY: 10, maxX: 30, maxY: 30 }, { name: 'Box 1' });
    grid.insert('item_2', { minX: 100, minY: 100, maxX: 120, maxY: 120 }, { name: 'Box 2' });
    grid.insertPoint('pt_1', { x: 25, y: 25 }, { name: 'Point 1' });

    assert.strictEqual(grid.size, 3, 'Grid must hold 3 items');

    // Query near (20, 20) with radius 10
    const nearby = grid.queryPoint({ x: 20, y: 20 }, 10);
    const ids = nearby.map((i) => i.id);
    assert.ok(ids.includes('item_1'), 'Must match item_1');
    assert.ok(ids.includes('pt_1'), 'Must match pt_1');
    assert.ok(!ids.includes('item_2'), 'Must not match distant item_2');

    // Remove item_1
    const removed = grid.remove('item_1');
    assert.strictEqual(removed, true, 'Removal must succeed');
    assert.strictEqual(grid.size, 2, 'Grid size must be 2 after removal');

    const afterRemove = grid.queryPoint({ x: 20, y: 20 }, 5);
    assert.ok(!afterRemove.map((i) => i.id).includes('item_1'), 'item_1 must no longer be found');
  });

  await test('SpatialGrid.findOverlappingPairs discovers broad-phase intersection candidates', () => {
    const grid = new SpatialGrid<{ label: string }>(100);
    // Two overlapping boxes
    grid.insert('a', { minX: 0, minY: 0, maxX: 50, maxY: 50 }, { label: 'A' });
    grid.insert('b', { minX: 40, minY: 40, maxX: 90, maxY: 90 }, { label: 'B' });
    // One disjoint distant box
    grid.insert('c', { minX: 500, minY: 500, maxX: 550, maxY: 550 }, { label: 'C' });

    const pairs = grid.findOverlappingPairs();
    assert.strictEqual(pairs.length, 1, 'Only 1 pair of boxes overlap');
    const pairIds = [pairs[0][0].id, pairs[0][1].id].sort();
    assert.deepStrictEqual(pairIds, ['a', 'b'], 'Overlapping pair must be a and b');
  });

  await test('SnappingEngine.snapPoint leverages spatial acceleration for dense vertex clouds', () => {
    // Generate 100 scattered vertices
    const denseVertices: Point[] = [];
    for (let i = 0; i < 100; i++) {
      denseVertices.push({
        x: (i % 10) * 100 + 5,
        y: Math.floor(i / 10) * 100 + 5,
      });
    }

    // Target vertex at (305, 205) corresponds to i = 23 (3 * 100 + 5, 2 * 100 + 5)
    const targetVertex = denseVertices[23];
    assert.strictEqual(targetVertex.x, 305);
    assert.strictEqual(targetVertex.y, 205);

    const ctx: SnappingContext = {
      snapThreshold: 10,
      zoom: 1,
      snapToGrid: false,
      snapToGuides: false,
      snapToVertices: true,
      snapToNodes: true,
      snapToViewBox: false,
      showGuides: false,
      showGrid: false,
      guides: [],
      grids: [],
      rulerConfig: { showRulers: false, unit: 'px', origin: { x: 0, y: 0 } },
    };

    // Query slightly off: (307, 203)
    const snapped = SnappingEngine.snapPoint({ x: 307, y: 203 }, ctx, denseVertices);
    assert.strictEqual(snapped.x, 305, 'Should snap X to exact target vertex 305');
    assert.strictEqual(snapped.y, 205, 'Should snap Y to exact target vertex 205');
    assert.strictEqual(SnappingEngine.lastSnapResult?.kind, 'node', 'Snap kind must be node');
  });

  await test('IntersectionSnappingService finds path-path crossing points with broad-phase acceleration', () => {
    // Construct two intersecting paths: X cross at (50, 50)
    const pathA: VectorElement = {
      id: 'path_a',
      tagName: 'path',
      attributes: { id: 'path_a', d: 'M 0 0 L 100 100' },
      vertices: [
        { id: 'va1', x: 0, y: 0, type: 'corner' },
        { id: 'va2', x: 100, y: 100, type: 'corner' },
      ],
      isClosed: false,
    };
    const pathB: VectorElement = {
      id: 'path_b',
      tagName: 'path',
      attributes: { id: 'path_b', d: 'M 0 100 L 100 0' },
      vertices: [
        { id: 'vb1', x: 0, y: 100, type: 'corner' },
        { id: 'vb2', x: 100, y: 0, type: 'corner' },
      ],
      isClosed: false,
    };

    // Add dummy non-intersecting background paths to exercise segment broad-phase
    const elements: VectorElement[] = [pathA, pathB];
    for (let k = 0; k < 10; k++) {
      elements.push({
        id: `dummy_${k}`,
        tagName: 'path',
        attributes: { id: `dummy_${k}`, d: `M ${300 + k * 20} 300 L ${350 + k * 20} 350` },
        vertices: [
          { id: `vd_${k}_1`, x: 300 + k * 20, y: 300, type: 'corner' },
          { id: `vd_${k}_2`, x: 350 + k * 20, y: 350, type: 'corner' },
        ],
        isClosed: false,
      });
    }

    // Query close to (50, 50)
    const inter = IntersectionSnappingService.findClosestIntersection(
      { x: 52, y: 49 },
      elements,
      [],
      [],
      undefined,
      10
    );

    assert.ok(inter, 'Must find intersection at crossing point');
    assert.strictEqual(Math.round(inter!.x), 50, 'Intersection X must be 50');
    assert.strictEqual(Math.round(inter!.y), 50, 'Intersection Y must be 50');
  });

  await test('SpatialGrid.findNearestPoint returns closest candidate within maxRadius', () => {
    const grid = new SpatialGrid<{ id: string; x: number; y: number }>(32);
    grid.insertPoint('p1', { x: 10, y: 10 }, { id: 'p1', x: 10, y: 10 });
    grid.insertPoint('p2', { x: 20, y: 20 }, { id: 'p2', x: 20, y: 20 });
    grid.insertPoint('p3', { x: 30, y: 30 }, { id: 'p3', x: 30, y: 30 });

    const nearest = grid.findNearestPoint({ x: 18, y: 19 }, 15, (d) => ({ x: d.x, y: d.y }));
    assert.ok(nearest, 'Should find nearest point');
    assert.strictEqual(nearest?.item.id, 'p2', 'Nearest item should be p2');
    assert.ok(nearest!.dist < 3, 'Distance should be under 3px');
  });

  console.log(`\nSpatial Snapping & Broad-Phase Acceleration: ${passed}/5 tests passed.\n`);
  return true;
}
