import { NodeSubgroupTransformController } from '../src/webview/tools/node/NodeSubgroupTransformController.js';
import { AffineMatrix } from '../src/webview/core/geom/TransformMatrix.js';
import { PathVertex, VectorElement } from '../src/webview/engine/VectorModel.js';

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

export async function runNodeSubgroupTransformTests(): Promise<boolean> {
  console.log('\n--- Running Node Subgroup Transform & Micro-Bounding Box Suite ---');

  const controller = new NodeSubgroupTransformController();

  // Test 1: Centroid Calculation C = (1/k) * sum(P_i)
  const verts2 = [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ];
  const c2 = NodeSubgroupTransformController.computeCentroid(verts2);
  assertClose(c2.x, 20, 0.001, 'Centroid of 2 points (10, 20) and (30, 40) is (20, 30) - X');
  assertClose(c2.y, 30, 0.001, 'Centroid of 2 points (10, 20) and (30, 40) is (20, 30) - Y');

  const verts4 = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const c4 = NodeSubgroupTransformController.computeCentroid(verts4);
  assertClose(c4.x, 50, 0.001, 'Centroid of 4 square points is center (50, 50) - X');
  assertClose(c4.y, 50, 0.001, 'Centroid of 4 square points is center (50, 50) - Y');

  // Test 2: Micro-Bounding Box Calculation
  const box = NodeSubgroupTransformController.computeBoundingBox(verts2);
  assert(box !== null, 'Bounding box computed for 2 points');
  if (box) {
    assertClose(box.x, 10, 0.001, 'Bounding box X is 10');
    assertClose(box.y, 20, 0.001, 'Bounding box Y is 20');
    assertClose(box.width, 20, 0.001, 'Bounding box width is 20');
    assertClose(box.height, 20, 0.001, 'Bounding box height is 20');
  }

  // Test 3: Solidary Transformation of Vertices and Tangent Handles
  const pathVerts: PathVertex[] = [
    {
      id: 'v1',
      x: 10,
      y: 0,
      handleIn: { x: 10, y: -5 },
      handleOut: { x: 10, y: 5 },
      nodeType: 'smooth',
    },
    {
      id: 'v2',
      x: 20,
      y: 0,
      handleIn: { x: 20, y: -5 },
      handleOut: { x: 20, y: 5 },
      nodeType: 'smooth',
    },
    {
      id: 'v3',
      x: 50,
      y: 50,
      nodeType: 'sharp',
    },
  ];

  const selectedIds = new Set(['v1', 'v2']); // v3 is unselected

  // Apply 90° rotation around (0, 0)
  const rotMatrix = AffineMatrix.rotation(Math.PI / 2, { x: 0, y: 0 });
  const rotRes = controller.applyAffineToVertices(pathVerts, selectedIds, rotMatrix);

  // v1 was (10, 0) -> rotates 90° to (0, 10)
  assertClose(rotRes[0].x, 0, 0.001, 'v1 rotates solidarily to X=0');
  assertClose(rotRes[0].y, 10, 0.001, 'v1 rotates solidarily to Y=10');
  // v1 handleOut was (10, 5) -> rotates 90° to (-5, 10)
  assert(rotRes[0].handleOut !== undefined, 'v1 handleOut preserved');
  if (rotRes[0].handleOut) {
    assertClose(rotRes[0].handleOut.x, -5, 0.001, 'v1 handleOut rotates solidarily to X=-5');
    assertClose(rotRes[0].handleOut.y, 10, 0.001, 'v1 handleOut rotates solidarily to Y=10');
  }

  // v3 (unselected) must be strictly unchanged at (50, 50)
  assertClose(rotRes[2].x, 50, 0.001, 'Unselected v3 is untouched at X=50');
  assertClose(rotRes[2].y, 50, 0.001, 'Unselected v3 is untouched at Y=50');

  // Test 4: Scaling Subgroup around Centroid C
  const scaleCentroid = NodeSubgroupTransformController.computeCentroid([pathVerts[0], pathVerts[1]]); // (15, 0)
  const scaleMatrix = AffineMatrix.scaling(2, 2, scaleCentroid);
  const scaleRes = controller.applyAffineToVertices(pathVerts, selectedIds, scaleMatrix);

  // v1 was (10, 0), centroid is (15, 0). Vector is (-5, 0) * 2 = (-10, 0) -> (15 - 10, 0) = (5, 0)
  assertClose(scaleRes[0].x, 5, 0.001, 'v1 scaled 2x from centroid lands on X=5');
  assertClose(scaleRes[0].y, 0, 0.001, 'v1 scaled 2x from centroid lands on Y=0');
  // v2 was (20, 0), centroid is (15, 0). Vector is (5, 0) * 2 = (10, 0) -> (15 + 10, 0) = (25, 0)
  assertClose(scaleRes[1].x, 25, 0.001, 'v2 scaled 2x from centroid lands on X=25');

  // Test 5: Hit-testing Mini-HUD and Subgroup Handles
  const dummyEl: VectorElement = {
    id: 'el-1',
    tagName: 'path',
    attributes: {},
    vertices: pathVerts,
  };

  // Test scale handle hit
  const scaleHit = controller.hitTest(dummyEl, selectedIds, { x: 10, y: 0 }, 1);
  assert(scaleHit !== null && scaleHit.type === 'handle', 'Hit-testing handle on scale corner detected');

  // Test Mini-HUD hit
  // HUD is centered at box.cx (15) and box.y - 23/z = -23
  controller.miniHud.setDockedMode(false);
  const hudHit = controller.hitTest(dummyEl, selectedIds, { x: 15, y: -23 }, 1);
  assert(hudHit !== null && hudHit.type === 'hud', 'Hit-testing Mini-HUD above micro-bounding box detected');
  controller.miniHud.setDockedMode(true);
  const hudHitDocked = controller.hitTest(dummyEl, selectedIds, { x: 15, y: -23 }, 1);
  assert(hudHitDocked === null, 'Mini-HUD in docked mode leaves canvas coordinates collision-free');

  // Test 6: Mode Cycling & Keyboard Switches
  controller.setMode('scale');
  assert(controller.mode === 'scale', 'Controller mode initialized to scale');
  assert(controller.cycleMode() === 'rotate', 'cycleMode advances from scale to rotate');
  assert(controller.cycleMode() === 'move', 'cycleMode advances from rotate to move');
  assert(controller.cycleMode() === 'scale', 'cycleMode returns to scale');

  // Test 7: Overlay Generation
  const overlayHtml = controller.renderOverlay(dummyEl, selectedIds, 1);
  assert(overlayHtml.includes('subgroup-centroid-marker'), 'Overlay renders centroid marker');
  assert(overlayHtml.includes('#6366f1'), 'Overlay renders scale bounding box with indigo stroke (#6366f1)');

  controller.setMode('rotate');
  const rotateOverlayHtml = controller.renderOverlay(dummyEl, selectedIds, 1);
  assert(rotateOverlayHtml.includes('#8b5cf6'), 'Overlay renders rotate mode with violet stroke (#8b5cf6)');

  console.log(`\nNode Subgroup Transform Tests complete: ${passed} passed, ${failed} failed.`);
  return failed === 0;
}
