import { VectorModel, VectorElement, PathVertex } from '../src/webview/engine/VectorModel.js';
import { SpatialIndex } from '../src/webview/engine/spatial/SpatialIndex.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';

interface BenchmarkResult {
  name: string;
  durationMs: number;
  budgetMs: number;
  passed: boolean;
  entities: number;
  opsPerSec: number;
}

const results: BenchmarkResult[] = [];

function generateSyntheticDocument(count: number): VectorModel {
  const model = new VectorModel();
  model.canvas = {
    width: 4000,
    height: 4000,
    viewBox: '0 0 4000 4000',
    backgroundColor: '#ffffff',
  };

  const elements: VectorElement[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % 50;
    const row = Math.floor(i / 50);
    const x = col * 75 + 10;
    const y = row * 75 + 10;
    const size = 30 + (i % 20);

    const isCurve = i % 3 === 0;

    let vertices: PathVertex[];
    if (isCurve) {
      // Curved shape with Bézier handles
      vertices = [
        { id: `v-${i}-0`, x, y: y + size / 2, command: 'M', nodeType: 'smooth', handleOut: { x, y: y + size * 0.2 } },
        { id: `v-${i}-1`, x: x + size / 2, y, command: 'C', nodeType: 'smooth', handleIn: { x: x + size * 0.2, y }, handleOut: { x: x + size * 0.8, y } },
        { id: `v-${i}-2`, x: x + size, y: y + size / 2, command: 'C', nodeType: 'smooth', handleIn: { x: x + size, y: y + size * 0.2 }, handleOut: { x: x + size, y: y + size * 0.8 } },
        { id: `v-${i}-3`, x: x + size / 2, y: y + size, command: 'C', nodeType: 'smooth', handleIn: { x: x + size * 0.8, y: y + size }, handleOut: { x: x + size * 0.2, y: y + size } },
      ];
    } else {
      // Polygon / Rectangle
      vertices = [
        { id: `v-${i}-0`, x, y, command: 'M', nodeType: 'sharp' },
        { id: `v-${i}-1`, x: x + size, y, command: 'L', nodeType: 'sharp' },
        { id: `v-${i}-2`, x: x + size, y: y + size, command: 'L', nodeType: 'sharp' },
        { id: `v-${i}-3`, x, y: y + size, command: 'L', nodeType: 'sharp' },
      ];
    }

    elements.push({
      id: `elem-${i}`,
      tagName: 'path',
      attributes: {
        fill: i % 2 === 0 ? '#3b82f6' : '#10b981',
        stroke: '#0f172a',
        'stroke-width': '2',
      },
      vertices,
      isClosed: true,
    });
  }

  model.elements = elements;
  return model;
}

function runBenchmark(
  name: string,
  entities: number,
  budgetMs: number,
  iterations: number,
  fn: () => void
): void {
  // Warmup run
  fn();

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - t0;
  const avgMs = totalMs / iterations;
  const opsPerSec = Math.round(1000 / (avgMs || 0.0001));
  const passed = avgMs <= budgetMs;

  results.push({
    name,
    durationMs: avgMs,
    budgetMs,
    passed,
    entities,
    opsPerSec,
  });
}

export function runAllBenchmarks(): boolean {
  console.log('\n========================================================================');
  console.log('🚀 AntiDraw Performance Budget Benchmark Suite (VectorCraft Standards)');
  console.log('========================================================================\n');

  const model1000 = generateSyntheticDocument(1000);
  const spatialIndex = new SpatialIndex(256);

  // Bench 1: Spatial Index Construction (1,000 entities)
  runBenchmark(
    'Spatial Index Build',
    1000,
    15.0, // Budget: < 15ms
    10,
    () => {
      spatialIndex.build(model1000.elements);
    }
  );

  // Bench 2: Spatial Hit Test (Point under entity in 1,000 entities)
  runBenchmark(
    'Point Hit-Test (Spatial)',
    1000,
    2.0, // Budget: < 2.0ms (VectorCraft Target)
    100,
    () => {
      HitTestService.hitTestSpatial(spatialIndex, { x: 1850, y: 720 }, 1.0);
    }
  );

  // Bench 3: Marquee Query (Touching mode across 1,000 entities)
  runBenchmark(
    'Marquee Touching Query',
    1000,
    2.0, // Budget: < 2.0ms
    50,
    () => {
      spatialIndex.queryRect({ x: 500, y: 500, width: 600, height: 600 }, true);
    }
  );

  // Bench 4: Viewport Culling Query (Zoom window across 1,000 entities)
  runBenchmark(
    'Viewport Culling Query',
    1000,
    2.0, // Budget: < 2.0ms
    50,
    () => {
      spatialIndex.queryViewport({ minX: 200, minY: 200, maxX: 1200, maxY: 1200 });
    }
  );

  // Bench 5: Bounding Box Calculation (1,000 mixed Bézier shapes)
  runBenchmark(
    'Bounding Box Evaluation',
    1000,
    5.0, // Budget: < 5.0ms
    20,
    () => {
      for (let i = 0; i < model1000.elements.length; i++) {
        BoundingBoxCalculator.getBoundingBox(model1000.elements[i]);
      }
    }
  );

  // Bench 6: Full SVG Document Serialization (1,000 entities to XML string)
  runBenchmark(
    'Clean SVG Serialization',
    1000,
    25.0, // Budget: < 25.0ms
    5,
    () => {
      SvgSerializer.toSvgString(model1000);
    }
  );

  // Print Formatted Report Table
  console.log('| Metric / Operation              | Entities | Latency    | Budget     | Ops/sec    | Status |');
  console.log('|:--------------------------------|:--------:|:----------:|:----------:|:----------:|:------:|');

  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
    const namePadded = r.name.padEnd(31, ' ');
    const entitiesStr = r.entities.toString().padStart(8, ' ');
    const latencyStr = `${r.durationMs.toFixed(3)} ms`.padStart(10, ' ');
    const budgetStr = `< ${r.budgetMs.toFixed(1)} ms`.padStart(10, ' ');
    const opsStr = `${r.opsPerSec.toLocaleString()}`.padStart(10, ' ');
    console.log(`| ${namePadded} | ${entitiesStr} | ${latencyStr} | ${budgetStr} | ${opsStr} | ${statusIcon} |`);
  }

  console.log('------------------------------------------------------------------------\n');

  if (allPassed) {
    console.log('🎉 All VectorCraft performance budgets satisfied!\n');
    return true;
  } else {
    console.error('❌ One or more performance budgets failed to meet target latency.\n');
    return false;
  }
}
