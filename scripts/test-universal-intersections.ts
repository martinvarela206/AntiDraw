import { SnappingEngine } from '../src/webview/engine/canvas/SnappingEngine.js';
import { IntersectionSnappingService } from '../src/webview/engine/canvas/IntersectionSnappingService.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runUniversalIntersectionsTests(): Promise<boolean> {
  console.log('\n--- Running Universal Intersection Snapping Suite ---');

  // Test 1: Analytical Line Segment × Line Segment (Path × Path)
  const lineA = { p1: { x: 0, y: 50 }, p2: { x: 100, y: 50 } };
  const lineB = { p1: { x: 50, y: 0 }, p2: { x: 50, y: 100 } };
  const inter1 = IntersectionSnappingService.intersectSegments(lineA.p1, lineA.p2, lineB.p1, lineB.p2);
  assert(inter1 !== null, 'Line × Line intersection exists');
  assert(inter1?.x === 50 && inter1?.y === 50, `Line × Line intersects at (50, 50) -> got (${inter1?.x}, ${inter1?.y})`);

  // Parallel segments do not intersect
  const lineC = { p1: { x: 0, y: 60 }, p2: { x: 100, y: 60 } };
  const parallelInter = IntersectionSnappingService.intersectSegments(lineA.p1, lineA.p2, lineC.p1, lineC.p2);
  assert(parallelInter === null, 'Parallel horizontal segments do not intersect');

  // Test 2: Guide × Guide Intersection
  const gHoriz = { id: 'gh1', orientation: 'horizontal' as const, position: 200, visible: true };
  const gVert = { id: 'gv1', orientation: 'vertical' as const, position: 300, visible: true };
  const interGuides = IntersectionSnappingService.intersectGuides(gHoriz, gVert);
  assert(interGuides !== null, 'Guide × Guide intersection exists');
  assert(interGuides?.x === 300 && interGuides?.y === 200, `Guide × Guide intersects at (300, 200) -> got (${interGuides?.x}, ${interGuides?.y})`);

  // Angled guide 45° through (0, 0) with horizontal guide y = 100
  const gAngled = { id: 'ga1', orientation: 'angled' as const, angle: 45, pivotX: 0, pivotY: 0, visible: true };
  const gH100 = { id: 'gh100', orientation: 'horizontal' as const, position: 100, visible: true };
  const interAngled = IntersectionSnappingService.intersectGuides(gAngled, gH100);
  assert(interAngled !== null, 'Angled 45° guide × Horizontal guide intersection exists');
  assert(Math.abs(interAngled!.x - 100) < 0.01 && Math.abs(interAngled!.y - 100) < 0.01, `Angled 45° guide intersects at (100, 100) -> got (${interAngled?.x}, ${interAngled?.y})`);

  // Test 3: Guide × Linear Segment
  const segDiag1 = { p1: { x: 0, y: 0 }, p2: { x: 200, y: 200 } };
  const interGuideSeg = IntersectionSnappingService.intersectGuideAndSegment(gH100, segDiag1.p1, segDiag1.p2);
  assert(interGuideSeg !== null, 'Guide × Segment intersection exists');
  assert(Math.abs(interGuideSeg!.x - 100) < 0.01 && Math.abs(interGuideSeg!.y - 100) < 0.01, `Guide × Segment intersects at (100, 100) -> got (${interGuideSeg?.x}, ${interGuideSeg?.y})`);

  // Test 4: Cubic Bézier × Cubic Bézier via Fixed-Point Meeting Algorithm
  // Curve 1: from (0, 0) to (200, 200), curving upwards
  const c1_p0 = { x: 0, y: 0 };
  const c1_p1 = { x: 0, y: 150 };
  const c1_p2 = { x: 100, y: 200 };
  const c1_p3 = { x: 200, y: 200 };

  // Curve 2: from (0, 200) to (200, 0), curving downwards
  const c2_p0 = { x: 0, y: 200 };
  const c2_p1 = { x: 0, y: 50 };
  const c2_p2 = { x: 100, y: 0 };
  const c2_p3 = { x: 200, y: 0 };

  // Query near the actual crossing at (19.615, 100)
  const meetingInter = IntersectionSnappingService.intersectBezierMeeting(
    c1_p0, c1_p1, c1_p2, c1_p3,
    c2_p0, c2_p1, c2_p2, c2_p3,
    { x: 22, y: 101 },
    15
  );
  assert(meetingInter !== null, 'Bézier × Bézier meeting algorithm finds intersection');
  assert(Math.abs(meetingInter!.x - 19.615) < 1, `Meeting intersection X near 19.62 -> got ${meetingInter?.x}`);
  assert(Math.abs(meetingInter!.y - 100) < 1, `Meeting intersection Y near 100 -> got ${meetingInter?.y}`);

  // Test 5: SnappingEngine full integration with canonical hierarchy
  const elPathA: VectorElement = {
    id: 'pathA',
    tagName: 'path',
    attributes: {},
    isClosed: false,
    vertices: [
      { id: 'pa1', x: 0, y: 100, nodeType: 'sharp', command: 'M' },
      { id: 'pa2', x: 200, y: 100, nodeType: 'sharp', command: 'L' },
    ],
  };

  const elPathB: VectorElement = {
    id: 'pathB',
    tagName: 'path',
    attributes: {},
    isClosed: false,
    vertices: [
      { id: 'pb1', x: 100, y: 0, nodeType: 'sharp', command: 'M' },
      { id: 'pb2', x: 100, y: 200, nodeType: 'sharp', command: 'L' },
    ],
  };

  const snapCtx = {
    snapThreshold: 14,
    zoom: 1,
    snapToPixelGrid: true,
    snapToGrid: false,
    snapToGuides: true,
    snapToVertices: true,
    snapToNodes: true,
    snapToEdges: true,
    snapToIntersections: true,
    snapToViewBox: false,
    showGuides: true,
    showGrid: false,
    guides: [gHoriz, gVert],
    grids: [],
    rulerConfig: { originX: 0, originY: 0, step: 20 },
    elements: [elPathA, elPathB],
  };

  // Test 5.1: Path × Path intersection snapping in SnappingEngine
  // Query at (102, 98), near crossing of pathA and pathB at (100, 100)
  const snappedInter = SnappingEngine.snapPoint({ x: 102, y: 98 }, snapCtx);
  assert(snappedInter.x === 100 && snappedInter.y === 100, `SnappingEngine snaps to Path × Path intersection (100, 100) -> got (${snappedInter.x}, ${snappedInter.y})`);
  assert(SnappingEngine.lastSnapResult?.kind === 'intersection', `SnapResult recorded kind 'intersection' -> got ${SnappingEngine.lastSnapResult?.kind}`);

  // Test 5.2: Canonical Hierarchy: Node/Vertex > Intersection
  // Vertex of pathA is at (0, 100). If query is near (0, 100), it must snap as 'node'
  const snappedNode = SnappingEngine.snapPoint(
    { x: 3, y: 101 },
    snapCtx,
    [{ x: 0, y: 100 }]
  );
  assert(snappedNode.x === 0 && snappedNode.y === 100, 'Snaps to node vertex (0, 100)');
  assert(SnappingEngine.lastSnapResult?.kind === 'node', `Node takes precedence over intersection -> got kind ${SnappingEngine.lastSnapResult?.kind}`);

  // Test 5.3: Canonical Hierarchy: Intersection > Edge
  // Along line y = 100, query at (103, 101) is close to both the intersection (100, 100) and the edge y = 100.
  // Must snap to intersection (100, 100) rather than merely snapping y to 100 with free x.
  const snappedInterOverEdge = SnappingEngine.snapPoint({ x: 103, y: 101 }, snapCtx);
  assert(snappedInterOverEdge.x === 100 && snappedInterOverEdge.y === 100, 'Intersection takes precedence over 1D edge');
  assert(SnappingEngine.lastSnapResult?.kind === 'intersection', 'Recorded kind is intersection');

  console.log('--- Universal Intersection Snapping Suite Complete ---\n');
  return true;
}
