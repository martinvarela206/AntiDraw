import { ContextualVectorGridService } from '../src/webview/engine/scene/ContextualVectorGridService.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { SnappingEngine, SnappingContext } from '../src/webview/engine/canvas/SnappingEngine.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

export function runContextualVectorGridTests(): boolean {
  console.log('\n--- Running Contextual Vector Grid & Discrete Snapping Suite ---\n');

  // =========================================================================
  // 1. Conversion to Contextual Vector Grid
  // =========================================================================
  console.log('[1. Conversion to Contextual Vector Grid]');
  const lineA: VectorElement = {
    id: 'grid_line_a',
    tagName: 'line',
    attributes: {
      id: 'grid_line_a',
      x1: '100',
      y1: '200',
      x2: '500',
      y2: '200',
      stroke: '#ff0055',
      'stroke-width': '2',
      fill: 'none',
    },
    vertices: [
      { id: 'v1', x: 100, y: 200, command: 'M', nodeType: 'sharp' },
      { id: 'v2', x: 500, y: 200, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: false,
    isParametric: true,
    shapeType: 'line',
  };

  const lineB: VectorElement = {
    id: 'grid_line_b',
    tagName: 'line',
    attributes: {
      id: 'grid_line_b',
      x1: '300',
      y1: '50',
      x2: '300',
      y2: '450',
      stroke: '#333333',
      'stroke-width': '1.5',
      fill: 'none',
    },
    vertices: [
      { id: 'v3', x: 300, y: 50, command: 'M', nodeType: 'sharp' },
      { id: 'v4', x: 300, y: 450, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: false,
    isParametric: true,
    shapeType: 'line',
  };

  const gridGroup: VectorElement = {
    id: 'construction_grid',
    tagName: 'g',
    attributes: { id: 'construction_grid' },
    children: [lineA, lineB],
  };

  assert(!ContextualVectorGridService.isContextualGrid(gridGroup), 'Grid is initially not contextual');
  ContextualVectorGridService.convertToContextualGrid(gridGroup);

  assert(ContextualVectorGridService.isContextualGrid(gridGroup), 'Grid is marked as contextual grid');
  assert(ContextualVectorGridService.isContextualGrid(lineA), 'Child line A marked as contextual grid');
  assert(ContextualVectorGridService.isContextualGrid(lineB), 'Child line B marked as contextual grid');
  assert(lineA.attributes.stroke === '#00f0ff', 'Line A adopted contextual cyan stroke #00f0ff');
  assert(lineA.attributes['stroke-dasharray'] === '2 2', 'Line A adopted grid dasharray 2 2');
  assert(lineA.attributes['vector-effect'] === 'non-scaling-stroke', 'Line A has non-scaling-stroke');
  assert(lineA.attributes['data-orig-stroke'] === '#ff0055', 'Line A preserved original stroke');
  assert(lineA.attributes['data-orig-stroke-width'] === '2', 'Line A preserved original stroke-width');

  // =========================================================================
  // 2. 100% Finite Geometry Preservation (No ViewBox Clipping)
  // =========================================================================
  console.log('\n[2. 100% Finite Geometry Preservation]');
  // Desconvertir a vector ordinario
  ContextualVectorGridService.convertToOrdinaryVector(gridGroup);

  assert(!ContextualVectorGridService.isContextualGrid(gridGroup), 'Grid is no longer contextual');
  assert(!ContextualVectorGridService.isContextualGrid(lineA), 'Child line A is no longer contextual');
  assert(lineA.attributes.stroke === '#ff0055', 'Line A restored original stroke #ff0055');
  assert(lineA.attributes['stroke-width'] === '2', 'Line A restored original stroke-width 2');

  // Verify coordinates: absolutely identical to initial coordinates, ZERO clipping!
  assert(lineA.attributes.x1 === '100' && lineA.attributes.x2 === '500', 'Line A preserved 100% finite X coordinates (100 -> 500)');
  assert(lineA.attributes.y1 === '200' && lineA.attributes.y2 === '200', 'Line A preserved 100% finite Y coordinates (200 -> 200)');
  assert(lineB.attributes.x1 === '300' && lineB.attributes.x2 === '300', 'Line B preserved 100% finite X coordinates (300 -> 300)');
  assert(lineB.attributes.y1 === '50' && lineB.attributes.y2 === '450', 'Line B preserved 100% finite Y coordinates (50 -> 450)');
  assert(lineA.vertices![0].x === 100 && lineA.vertices![1].x === 500, 'Vertices preserved exact original finite coordinates');

  // =========================================================================
  // 3. Pre-computation and Caching of Discrete Snap Points
  // =========================================================================
  console.log('\n[3. Pre-computation and Caching of Discrete Snap Points]');
  ContextualVectorGridService.convertToContextualGrid(gridGroup);

  // Add a rectangular shape to also test geometric centroids
  const boxEl: VectorElement = {
    id: 'grid_rect',
    tagName: 'rect',
    attributes: {
      id: 'grid_rect',
      x: '200',
      y: '100',
      width: '200',
      height: '200',
      stroke: '#00f0ff',
      fill: 'none',
    },
    vertices: [
      { id: 'b1', x: 200, y: 100, command: 'M', nodeType: 'sharp' },
      { id: 'b2', x: 400, y: 100, command: 'L', nodeType: 'sharp' },
      { id: 'b3', x: 400, y: 300, command: 'L', nodeType: 'sharp' },
      { id: 'b4', x: 200, y: 300, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: true,
  };

  const gridElements = [lineA, lineB, boxEl];
  const cache = ContextualVectorGridService.precomputeSnapPoints(gridElements);

  assert(cache.points.length > 0, `Pre-computed ${cache.points.length} discrete snap points`);
  assert(cache.nodeCount >= 8, `Extracted structural nodes (got ${cache.nodeCount})`);
  assert(cache.centroidCount >= 3, `Calculated geometric centroids (got ${cache.centroidCount})`);
  assert(cache.intersectionCount >= 1, `Computed analytical intersections (got ${cache.intersectionCount})`);
  assert(cache.computationTimeMs < 50, `Computation executed within ${cache.computationTimeMs}ms (< 50ms)`);
  assert(!cache.fpsRisk, 'Non-dense grid has no FPS risk');

  // Query intersection snap point at (300, 200) - crossing of lineA and lineB!
  const snapNearIntersection = ContextualVectorGridService.querySnap({ x: 303, y: 198 }, 8);
  assert(snapNearIntersection !== null, 'Spatial grid found intersection point within proximity');
  assert(snapNearIntersection?.point.x === 300 && snapNearIntersection?.point.y === 200, 'Snapped exactly to (300, 200) crossing');
  assert(snapNearIntersection?.point.kind === 'intersection' || snapNearIntersection?.point.kind === 'centroid', 'Detected kind is intersection or centroid');

  // Query centroid snap point for boxEl at (300, 200)
  const snapNearNode = ContextualVectorGridService.querySnap({ x: 102, y: 201 }, 8);
  assert(snapNearNode !== null, 'Spatial grid found node endpoint within proximity');
  assert(snapNearNode?.point.x === 100 && snapNearNode?.point.y === 200, 'Snapped to node endpoint (100, 200)');
  assert(snapNearNode?.point.kind === 'node', 'Detected kind is node');

  // =========================================================================
  // 4. Performance Safeguard Protocol & Profiling
  // =========================================================================
  console.log('\n[4. Performance Safeguard Protocol & Profiling]');
  // Create a synthetic dense mesh to trigger safeguard profiling
  const denseElements: VectorElement[] = [];
  // 50 horizontal lines and 50 vertical lines -> 2,500 intersections!
  for (let i = 0; i < 45; i++) {
    denseElements.push({
      id: `h_${i}`,
      tagName: 'line',
      attributes: { x1: '0', y1: `${i * 10}`, x2: '1000', y2: `${i * 10}` },
      vertices: [{ id: `vh1_${i}`, x: 0, y: i * 10, command: 'M', nodeType: 'sharp' }, { id: `vh2_${i}`, x: 1000, y: i * 10, command: 'L', nodeType: 'sharp' }],
    });
    denseElements.push({
      id: `v_${i}`,
      tagName: 'line',
      attributes: { x1: `${i * 10}`, y1: '0', x2: `${i * 10}`, y2: '1000' },
      vertices: [{ id: `vv1_${i}`, x: i * 10, y: 0, command: 'M', nodeType: 'sharp' }, { id: `vv2_${i}`, x: i * 10, y: 1000, command: 'L', nodeType: 'sharp' }],
    });
  }

  const denseCache = ContextualVectorGridService.precomputeSnapPoints(denseElements, { maxIntersections: 2000 });
  assert(denseCache.fpsRisk === true, 'Dense mesh successfully triggered fpsRisk === true (> 1500 points)');

  // Test "Continuar como referencia visual sin snap"
  assert(denseCache.snappingEnabled === true, 'Snapping initially enabled on dense grid');
  ContextualVectorGridService.enableVisualOnlyReference();
  assert(denseCache.snappingEnabled === false, 'Visual-only reference safely disabled magnetic snapping calculation');
  const queryUnderVisualOnly = ContextualVectorGridService.querySnap({ x: 100, y: 100 }, 8);
  assert(queryUnderVisualOnly === null, 'querySnap returns null in visual-only mode (60 FPS fully protected)');

  // Clear cache
  ContextualVectorGridService.clearCache();
  assert(ContextualVectorGridService.activeCache === null, 'Active cache cleared cleanly');

  // =========================================================================
  // 5. SnappingEngine Integration
  // =========================================================================
  console.log('\n[5. SnappingEngine Integration]');
  // Recompute snap points for lineA and lineB
  ContextualVectorGridService.precomputeSnapPoints([lineA, lineB]);

  const snapCtx: SnappingContext = {
    snapThreshold: 10,
    zoom: 1,
    snapToGrid: true,
    snapToGuides: true,
    snapToVertices: true,
    snapToNodes: true,
    snapToViewBox: false,
    showGuides: true,
    showGrid: true,
    guides: [],
    grids: [],
    rulerConfig: { visible: false, originX: 0, originY: 0, unit: 'px', scale: 1, step: 100 },
  };

  const snappedPoint = SnappingEngine.snapPoint({ x: 298, y: 202 }, snapCtx);
  assert(snappedPoint.x === 300 && snappedPoint.y === 200, `SnappingEngine magnetic snap to grid intersection (300, 200) (got ${snappedPoint.x}, ${snappedPoint.y})`);

  console.log(`\nContextual Vector Grid Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}

