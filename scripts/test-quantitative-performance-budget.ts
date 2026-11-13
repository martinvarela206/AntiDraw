import { strict as assert } from 'assert';
import { VectorModel, VectorElement, PathVertex } from '../src/webview/engine/VectorModel.js';
import { SpatialIndex } from '../src/webview/engine/spatial/SpatialIndex.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SvgDomRenderer } from '../src/webview/engine/canvas/SvgDomRenderer.js';

export async function runQuantitativePerformanceBudgetTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Quantitative Performance Budget Suite');
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

  function generateDocument(elementCount: number): VectorModel {
    const model = new VectorModel();
    model.canvas = {
      width: 4000,
      height: 4000,
      viewBox: '0 0 4000 4000',
      backgroundColor: '#ffffff',
    };

    const elements: VectorElement[] = [];
    for (let i = 0; i < elementCount; i++) {
      const col = i % 50;
      const row = Math.floor(i / 50);
      const x = col * 75 + 10;
      const y = row * 75 + 10;
      const size = 30 + (i % 20);

      const vertices: PathVertex[] = [
        { id: `v-${i}-0`, x, y, command: 'M', nodeType: 'sharp' },
        { id: `v-${i}-1`, x: x + size, y, command: 'L', nodeType: 'sharp' },
        { id: `v-${i}-2`, x: x + size, y: y + size, command: 'L', nodeType: 'sharp' },
        { id: `v-${i}-3`, x: y + size, y: y + size, command: 'L', nodeType: 'sharp' },
      ];

      elements.push({
        id: `perf_elem_${i}`,
        tagName: 'path',
        attributes: {
          id: `perf_elem_${i}`,
          fill: i % 2 === 0 ? '#3b82f6' : '#10b981',
          stroke: '#0f172a',
          'stroke-width': '2',
          d: `M ${x} ${y} L ${x + size} ${y} L ${x + size} ${y + size} Z`,
        },
        vertices,
        isClosed: true,
      });
    }

    model.elements = elements;
    return model;
  }

  // 1. 5,000 vector nodes document (1,250 elements * 4 vertices = 5,000 nodes)
  const model5000 = generateDocument(1250);
  const spatialIndex = new SpatialIndex(256);

  await test('Spatial index construction for 5,000 vector nodes meets budget (< 30ms)', () => {
    const t0 = performance.now();
    spatialIndex.build(model5000.elements);
    const elapsed = performance.now() - t0;

    assert.ok(
      elapsed < 30,
      `Spatial index build must take < 30ms (actual: ${elapsed.toFixed(2)}ms)`
    );
  });

  await test('Interactive pointer frame with 5,000 vector nodes maintains 60 FPS (< 16.6ms)', () => {
    // Perform hit test, bounding box evaluation, and marquee query
    const iterations = 50;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      HitTestService.hitTestSpatial(spatialIndex, { x: 1200, y: 800 }, 2.0);
      spatialIndex.queryRect({ x: 1150, y: 750, width: 100, height: 100 }, true);
      spatialIndex.queryViewport({ minX: 1000, minY: 600, maxX: 1500, maxY: 1100 });
    }
    const avgFrameTime = (performance.now() - t0) / iterations;

    assert.ok(
      avgFrameTime < 16.6,
      `Interactive frame time must be under 16.6ms for 60 FPS (actual: ${avgFrameTime.toFixed(3)}ms)`
    );
  });

  await test('Deserialization and rehydration of 1 MB SVG document meets budget (< 300ms)', () => {
    // Generate ~1 MB SVG document (8,000 elements)
    const largeDoc = generateDocument(8000);
    const svgText = SvgSerializer.toSvgString(largeDoc);
    const byteSize = Buffer.byteLength(svgText, 'utf8');
    assert.ok(byteSize >= 1000000, `SVG document should be >= 1 MB (got ${(byteSize / 1024 / 1024).toFixed(2)} MB)`);

    const t0 = performance.now();
    const importedModel = new VectorModel();
    importedModel.loadSvgString(svgText);
    const loadTime = performance.now() - t0;

    assert.ok(
      loadTime < 300,
      `1 MB SVG parsing and model rehydration must take < 300ms (actual: ${loadTime.toFixed(2)}ms)`
    );
    assert.strictEqual(importedModel.elements.length, 8000, 'All 8,000 elements must be loaded');
  });

  await test('Incremental DOM diffing on 1,000 vector elements executes in < 5ms', () => {
    class MockElement {
      public attributes: Record<string, string> = {};
      public children: MockElement[] = [];
      public style: Record<string, string> = {};
      public parentNode: MockElement | null = null;
      public tagName: string;
      constructor(tag: string) { this.tagName = tag; }
      public setAttribute(k: string, v: string) { this.attributes[k] = v; }
      public getAttribute(k: string) { return this.attributes[k] ?? null; }
      public setAttributeNS(_ns: string, k: string, v: string) { this.attributes[k] = v; }
      public appendChild(c: MockElement) { c.parentNode = this; this.children.push(c); return c; }
      public removeChild(c: MockElement) {
        const i = this.children.indexOf(c);
        if (i !== -1) { this.children.splice(i, 1); c.parentNode = null; }
        return c;
      }
      public querySelector(sel: string) {
        if (sel.startsWith('#')) {
          const id = sel.substring(1);
          return this.children.find((c) => c.getAttribute('id') === id) || null;
        }
        return null;
      }
    }

    (globalThis as any).document = {
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
    };

    const mockCanvas = new MockElement('svg') as unknown as SVGSVGElement;
    const renderer = new SvgDomRenderer();
    const model = generateDocument(1000);

    // Initial full mount
    renderer.render(mockCanvas, model, true);

    // Measure incremental diffing pass where 10 elements are dirty
    for (let k = 0; k < 10; k++) {
      model.elements[k * 50].attributes.fill = '#abcdef';
      model.elements[k * 50].dirty = true;
    }

    const t0 = performance.now();
    renderer.render(mockCanvas, model, false);
    const diffTime = performance.now() - t0;

    assert.ok(
      diffTime < 5.0,
      `Incremental DOM diffing must execute in < 5.0ms (actual: ${diffTime.toFixed(3)}ms)`
    );
  });

  console.log(`\nQuantitative Performance Budget: ${passed}/4 tests passed.\n`);
  return true;
}
