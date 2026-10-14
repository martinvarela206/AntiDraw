import { TranslateInteraction } from '../src/webview/tools/interactions/TranslateInteraction.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runTemporalEdgeAnchorTests(): Promise<boolean> {
  console.log('\n--- Running Temporal Contour Anchor Snapping Suite ---');

  const interaction = new TranslateInteraction();

  // Create mock ToolContext
  const mockCtx = {
    canvasMgr: {
      zoom: 1,
      rulerConfig: { originX: 0, originY: 0 },
      snapPoint: (pt: any) => pt,
    },
    selectionTool: {
      getPivot: (box: any) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
      selectedElementIds: new Set<string>(['rect1']),
    },
    model: {
      elements: [],
      getViewBoxBounds: () => ({ minX: 0, minY: 0, width: 800, height: 600 }),
    },
    getOtherVertices: () => [],
  } as unknown as ToolContext;

  // 1. Rectangle 200x200 from (100, 100) to (300, 300)
  const rectEl: VectorElement = {
    id: 'rect1',
    tagName: 'rect',
    attributes: { x: '100', y: '100', width: '200', height: '200' },
    isClosed: true,
    vertices: [
      { id: 'v1', x: 100, y: 100, nodeType: 'sharp', command: 'M' },
      { id: 'v2', x: 300, y: 100, nodeType: 'sharp', command: 'L' },
      { id: 'v3', x: 300, y: 300, nodeType: 'sharp', command: 'L' },
      { id: 'v4', x: 100, y: 300, nodeType: 'sharp', command: 'L' },
    ],
  };
  const groupBox = { x: 100, y: 100, width: 200, height: 200 };

  // Test 1: Click directly near top-left vertex (102, 103) -> within 24px threshold
  const nearVertex = interaction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 102, y: 103 }, groupBox, 1);
  assert(nearVertex.isPickedNode === true, 'Click near vertex detects picked node');
  assert(nearVertex.isEdgeAnchor === false, 'Click near vertex is NOT classified as edge anchor');
  assert(nearVertex.point.x === 100 && nearVertex.point.y === 100, `Snaps to exact vertex (100, 100) -> got (${nearVertex.point.x}, ${nearVertex.point.y})`);

  // Test 2: Click on horizontal top edge at x = 160 (far from vertices at 100, 300 and midpoint at 200, dist > 24px)
  // Mouse at (160, 104) -> within 14px edge threshold of line y = 100
  const onEdge = interaction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 160, y: 104 }, groupBox, 1);
  assert(onEdge.isPickedNode === true, 'Click on edge > 24px from vertices activates picked anchor');
  assert(onEdge.isEdgeAnchor === true, 'Click on edge is classified as temporal edge anchor');
  assert(onEdge.point.x === 160 && onEdge.point.y === 100, `Analytically projects onto edge at (160, 100) -> got (${onEdge.point.x}, ${onEdge.point.y})`);

  // Test 3: Click on vertical right edge at y = 160 (far from corners at 100, 300 and midpoint at 200)
  // Mouse at (297, 160) -> within edge threshold of vertical line x = 300
  const onRightEdge = interaction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 297, y: 160 }, groupBox, 1);
  assert(onRightEdge.isEdgeAnchor === true, 'Click on vertical edge classified as edge anchor');
  assert(onRightEdge.point.x === 300 && onRightEdge.point.y === 160, `Projects onto vertical edge at (300, 160) -> got (${onRightEdge.point.x}, ${onRightEdge.point.y})`);

  // Test 4: Click in deep interior/center of rectangle at (200, 200)
  // Distance to any edge is 100px > 14px threshold
  const inCenter = interaction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 200, y: 200 }, groupBox, 1);
  assert(inCenter.isEdgeAnchor === false, 'Click in deep center is NOT an edge anchor');
  assert(inCenter.point.x === 200 && inCenter.point.y === 200, 'Falls back to center/pivot point');

  // Test 5: Cubic Bézier Curve Projection
  // Curve from (0, 0) to (400, 0) with control handles up to y = 200
  const bezierEl: VectorElement = {
    id: 'curve1',
    tagName: 'path',
    attributes: {},
    isClosed: false,
    vertices: [
      { id: 'c1', x: 0, y: 0, handleOut: { x: 0, y: 200 }, nodeType: 'smooth', command: 'M' },
      { id: 'c2', x: 400, y: 0, handleIn: { x: 400, y: 200 }, nodeType: 'smooth', command: 'C' },
    ],
  };
  const curveBox = { x: 0, y: 0, width: 400, height: 200 };

  // Query at x = 62.5, y = 114 (near curve point ~ (62.5, 112.5), dist ~ 1.5px, > 60px from any landmark)
  const onCurve = interaction.findClosestMoveAnchor(mockCtx, [bezierEl], { x: 62.5, y: 114 }, curveBox, 1);
  assert(onCurve.isEdgeAnchor === true, 'Click on Bézier curve activates temporal edge anchor');
  assert(Math.abs(onCurve.point.x - 62.5) < 5, `Bézier projection X is close to 62.5 -> got ${onCurve.point.x}`);
  assert(Math.abs(onCurve.point.y - 112.5) < 5, `Bézier projection Y is close to 112.5 -> got ${onCurve.point.y}`);

  // Test 6: isNearSelectionAnchor detects edge click
  const isNearEdge = interaction.isNearSelectionAnchor(mockCtx, [rectEl], { x: 160, y: 103 }, groupBox, 1);
  assert(isNearEdge === true, 'isNearSelectionAnchor returns true for click on contour');

  // Test 7: Interaction start initializes dragAnchorPt and isEdgeAnchor
  interaction.start(mockCtx, { x: 160, y: 104 }, [rectEl], groupBox);
  assert(interaction.dragAnchorPt.x === 160 && interaction.dragAnchorPt.y === 100, `dragAnchorPt set to projected contour anchor (160, 100) -> got (${interaction.dragAnchorPt.x}, ${interaction.dragAnchorPt.y})`);
  assert(interaction.isEdgeAnchor === true, 'interaction.isEdgeAnchor flag set to true');

  console.log('--- Temporal Contour Anchor Snapping Suite Complete ---\n');
  return true;
}
