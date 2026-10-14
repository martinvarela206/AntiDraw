import { NodeEditorTool } from '../src/webview/engine/NodeEditorTool.js';
import { CommandRegistry } from '../src/webview/commands/CommandRegistry.js';
import { registerNodeCommands } from '../src/webview/commands/NodeCommands.js';
import { PathVertex } from '../src/webview/engine/VectorModel.js';

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

function assertClose(actual: number, expected: number, tolerance: number = 0.001, message: string = '') {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✅ [PASS] ${message} (got ${actual}, expected ${expected})`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message} (got ${actual}, expected ${expected}, diff ${diff})`);
    failed++;
  }
}

export async function runNodeJoinFusionTests(): Promise<boolean> {
  console.log('\n--- Running Node Join (Ctrl+J) & Coincident Vertex Fusion Suite ---');

  const nodeEditor = new NodeEditorTool();

  // Test 1: Welding consecutive coincident vertices and eliminating zero-length segments
  const pathWithDuplicate: PathVertex[] = [
    { id: 'v0', x: 0, y: 0, nodeType: 'sharp' },
    { id: 'v1', x: 100, y: 0, nodeType: 'sharp' },
    { id: 'v2', x: 100, y: 0.4, nodeType: 'sharp' }, // Coincident with v1 (distance = 0.4px)
    { id: 'v3', x: 100, y: 100, nodeType: 'sharp' },
  ];

  const sel1 = new Set(['v1', 'v2']);
  const res1 = nodeEditor.fuseCoincidentVertices(pathWithDuplicate, sel1, 2.0, false);

  assert(res1.fusedCount === 1, 'Exactly 1 coincident node pair was welded');
  assert(res1.updatedVertices.length === 3, 'Vertices length reduced from 4 to 3 (degenerate segment eliminated)');
  assertClose(res1.updatedVertices[1].x, 100, 0.001, 'Welded vertex X is midpoint 100');
  assertClose(res1.updatedVertices[1].y, 0.2, 0.001, 'Welded vertex Y is midpoint 0.2');
  assert(res1.updatedVertices[0].id === 'v0', 'Preceding vertex v0 preserved');
  assert(res1.updatedVertices[2].id === 'v3', 'Succeeding vertex v3 preserved');

  // Test 2: Solidary Bézier tangent preservation upon welding
  const curvedPath: PathVertex[] = [
    { id: 'c0', x: 0, y: 0, nodeType: 'sharp' },
    {
      id: 'c1',
      x: 100,
      y: 0,
      handleIn: { x: 80, y: -10 },
      handleOut: { x: 100, y: 0 }, // Degenerate internal handle
      nodeType: 'smooth',
    },
    {
      id: 'c2',
      x: 100,
      y: 0.5,
      handleIn: { x: 100, y: 0.5 }, // Degenerate internal handle
      handleOut: { x: 110, y: 30 },
      nodeType: 'smooth',
    },
    { id: 'c3', x: 100, y: 100, nodeType: 'sharp' },
  ];

  const sel2 = new Set(['c1', 'c2']);
  const res2 = nodeEditor.fuseCoincidentVertices(curvedPath, sel2, 2.0, false);

  assert(res2.fusedCount === 1, 'Curved coincident pair fused');
  const weldedV = res2.updatedVertices[1];
  assert(weldedV.handleIn !== undefined, 'Welded vertex retains incoming handleIn from c1');
  if (weldedV.handleIn) {
    assertClose(weldedV.handleIn.x, 80, 0.001, 'handleIn X offset properly maintained');
    assertClose(weldedV.handleIn.y, -9.75, 0.001, 'handleIn Y offset properly maintained');
  }
  assert(weldedV.handleOut !== undefined, 'Welded vertex retains outgoing handleOut from c2');
  if (weldedV.handleOut) {
    assertClose(weldedV.handleOut.x, 110, 0.001, 'handleOut X offset properly maintained');
    assertClose(weldedV.handleOut.y, 29.75, 0.001, 'handleOut Y offset properly maintained');
  }

  // Test 3: Welding coincident open endpoints into a clean closed path seam
  const openContour: PathVertex[] = [
    {
      id: 'e0',
      x: 50,
      y: 50,
      handleOut: { x: 70, y: 40 },
      nodeType: 'smooth',
    },
    { id: 'e1', x: 150, y: 50, nodeType: 'sharp' },
    { id: 'e2', x: 150, y: 150, nodeType: 'sharp' },
    {
      id: 'e3',
      x: 50.3,
      y: 50.1, // Coincident with e0 (distance = ~0.316px)
      handleIn: { x: 50, y: 70 },
      nodeType: 'smooth',
    },
  ];

  const sel3 = new Set(['e0', 'e3']);
  const res3 = nodeEditor.fuseCoincidentVertices(openContour, sel3, 2.0, false);

  assert(res3.fusedCount === 1, 'Terminal endpoints welded');
  assert(res3.isClosed === true, 'Path promoted to closed contour (isClosed = true)');
  assert(res3.updatedVertices.length === 3, 'Terminal vertex duplicate pruned (length 4 -> 3)');
  assertClose(res3.updatedVertices[0].x, 50.15, 0.001, 'Seam anchor X is midpoint 50.15');
  assertClose(res3.updatedVertices[0].y, 50.05, 0.001, 'Seam anchor Y is midpoint 50.05');
  assert(res3.updatedVertices[0].handleIn !== undefined, 'Seam anchor inherited handleIn from e3');
  assert(res3.updatedVertices[0].handleOut !== undefined, 'Seam anchor inherited handleOut from e0');

  // Test 4: Open endpoints join when distance > epsilon
  const openLine: PathVertex[] = [
    { id: 'p0', x: 0, y: 0, nodeType: 'sharp' },
    { id: 'p1', x: 100, y: 0, nodeType: 'sharp' },
    { id: 'p2', x: 100, y: 100, nodeType: 'sharp' },
  ];
  const sel4 = new Set(['p0', 'p2']);
  const res4 = nodeEditor.fuseCoincidentVertices(openLine, sel4, 2.0, false);
  assert(res4.isClosed === true, 'Non-coincident endpoints joined by closing contour');
  assert(res4.updatedVertices.length === 3, 'No nodes removed when endpoints are not coincident');

  // Test 5: Multiple coincident pairs welded in complex geometry
  const multiCoincident: PathVertex[] = [
    { id: 'm0', x: 0, y: 0, nodeType: 'sharp' },
    { id: 'm1', x: 0.1, y: 0.1, nodeType: 'sharp' }, // Pair 1
    { id: 'm2', x: 50, y: 50, nodeType: 'sharp' },
    { id: 'm3', x: 50.2, y: 49.9, nodeType: 'sharp' }, // Pair 2
    { id: 'm4', x: 100, y: 100, nodeType: 'sharp' },
  ];
  const sel5 = new Set(['m0', 'm1', 'm2', 'm3']);
  const res5 = nodeEditor.fuseCoincidentVertices(multiCoincident, sel5, 2.0, false);
  assert(res5.fusedCount === 2, 'Both distinct coincident pairs were welded');
  assert(res5.updatedVertices.length === 3, 'Vertices length reduced from 5 to 3');

  // Test 6: Command Registry validation for node.join
  const registry = CommandRegistry.getInstance();
  registerNodeCommands(registry);
  assert(registry.has('node.join'), 'CommandRegistry contains registered "node.join"');
  const joinCmd = registry.get('node.join');
  assert(joinCmd?.shortcut === 'Ctrl+J', 'Command "node.join" assigned shortcut Ctrl+J');
  assert(joinCmd?.category === 'node', 'Command "node.join" in category "node"');

  console.log(`\nNode Join Fusion Tests complete: ${passed} passed, ${failed} failed.`);
  return failed === 0;
}
