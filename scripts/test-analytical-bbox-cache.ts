import { strict as assert } from 'assert';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';

export async function runAnalyticalBboxCacheTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Analytical Bounding Box Cache Suite');
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

  const sampleElement: VectorElement = {
    id: 'el_cache_test',
    tagName: 'path',
    attributes: { id: 'el_cache_test', d: 'M 10 20 L 110 20 L 110 120 L 10 120 Z' },
    vertices: [
      { id: 'v1', x: 10, y: 20, nodeType: 'sharp', command: 'M' },
      { id: 'v2', x: 110, y: 20, nodeType: 'sharp', command: 'L' },
      { id: 'v3', x: 110, y: 120, nodeType: 'sharp', command: 'L' },
      { id: 'v4', x: 10, y: 120, nodeType: 'sharp', command: 'L' },
    ],
    isClosed: true,
  };

  await test('First query records a cache miss and calculates analytical L0 box', () => {
    BoundingBoxCalculator.invalidateAll();
    BoundingBoxCalculator.resetStats();

    const box = BoundingBoxCalculator.getBoundingBox(sampleElement);
    assert.ok(box, 'Should return bounding box');
    assert.strictEqual(box?.x, 10);
    assert.strictEqual(box?.y, 20);
    assert.strictEqual(box?.width, 100);
    assert.strictEqual(box?.height, 100);

    const stats = BoundingBoxCalculator.stats;
    assert.strictEqual(stats.misses, 1, 'Should record 1 miss on first lookup');
    assert.strictEqual(stats.hits, 0, 'Should have 0 hits on first lookup');
  });

  await test('Subsequent query returns cached box with zero recalculation (cache hit)', () => {
    const box = BoundingBoxCalculator.getBoundingBox(sampleElement);
    assert.ok(box);
    assert.strictEqual(box?.x, 10);
    assert.strictEqual(box?.y, 20);

    const stats = BoundingBoxCalculator.stats;
    assert.strictEqual(stats.hits, 1, 'Should record 1 hit on second lookup');
    assert.strictEqual(stats.misses, 1, 'Misses count should remain unchanged');
  });

  await test('Geometric mutation automatically invalidates stale cached box', () => {
    // Mutate element in-place by moving a vertex
    sampleElement.vertices![1].x = 210; // width becomes 200

    const box = BoundingBoxCalculator.getBoundingBox(sampleElement);
    assert.ok(box);
    assert.strictEqual(box?.width, 200, 'Width must reflect mutated vertex');

    const stats = BoundingBoxCalculator.stats;
    assert.strictEqual(stats.misses, 2, 'Should record another miss due to signature mismatch');
  });

  await test('BoundingBoxCalculator.invalidate forces eviction of specified element', () => {
    BoundingBoxCalculator.invalidate(sampleElement);
    const box = BoundingBoxCalculator.getBoundingBox(sampleElement);
    assert.ok(box);

    const stats = BoundingBoxCalculator.stats;
    assert.strictEqual(stats.misses, 3, 'Should record a miss after explicit eviction');
  });

  await test('getGroupBoundingBox leverages individual element cache hits', () => {
    const el2: VectorElement = {
      id: 'el_cache_test_2',
      tagName: 'image',
      attributes: { id: 'el_cache_test_2', x: '500', y: '600', width: '200', height: '150' },
    };

    BoundingBoxCalculator.resetStats();
    // Warm up cache for el2
    BoundingBoxCalculator.getBoundingBox(el2);
    assert.strictEqual(BoundingBoxCalculator.stats.misses, 1);

    // Group bounding box containing sampleElement (already cached) and el2 (already cached)
    const groupBox = BoundingBoxCalculator.getGroupBoundingBox([sampleElement, el2]);
    assert.ok(groupBox);
    assert.strictEqual(groupBox?.x, 10);
    assert.strictEqual(groupBox?.y, 20);
    assert.strictEqual(groupBox?.width, 690); // 500 + 200 - 10 = 690
    assert.strictEqual(groupBox?.height, 730); // 600 + 150 - 20 = 730

    // Both elements should have produced cache hits during group calculation
    assert.strictEqual(BoundingBoxCalculator.stats.hits, 2, 'Both elements must hit the cache in group computation');
  });

  console.log(`\nAnalytical Bounding Box Cache: ${passed}/5 tests passed.\n`);
  return true;
}
