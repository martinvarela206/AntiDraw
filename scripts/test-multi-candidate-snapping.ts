import { TranslateInteraction } from '../src/webview/tools/interactions/TranslateInteraction.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';
import { SnappingEngine } from '../src/webview/engine/canvas/SnappingEngine.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runMultiCandidateSnappingTests(): Promise<boolean> {
  console.log('\n--- Running Dynamic Multi-Candidate Snapping Suite ---');

  const interaction = new TranslateInteraction();

  // Rectangular vector element 200x200 from (100, 100) to (300, 300)
  // Centroid is at (200, 200). Corners at (100,100), (300,100), (100,300), (300,300).
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

  // Guide cross: Vertical guide at X = 500, Horizontal guide at Y = 500
  const guides = [
    { id: 'g_v', orientation: 'vertical' as const, position: 500, visible: true },
    { id: 'g_h', orientation: 'horizontal' as const, position: 500, visible: true },
  ];

  const snapCtx = {
    snapThreshold: 12,
    zoom: 1,
    snapToPixelGrid: true,
    snapToGrid: false,
    snapToGuides: true,
    snapToVertices: true,
    snapToNodes: true,
    snapToEdges: false,
    snapToViewBox: false,
    showGuides: true,
    showGrid: false,
    guides: guides,
    grids: [],
    rulerConfig: { originX: 0, originY: 0, step: 20 },
  };

  const mockCtx = {
    canvasMgr: {
      zoom: 1,
      rulerConfig: { originX: 0, originY: 0 },
      snapToPixelGrid: true,
    },
    snapPoint: (pt: any, otherVerts?: any, origin?: any, strokeW?: any) => {
      return SnappingEngine.snapPoint(pt, snapCtx, otherVerts, origin);
    },
    selectionTool: {
      getPivot: (box: any) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
      selectedElementIds: new Set<string>(['rect1']),
    },
    model: {
      elements: [rectEl],
      isElementClosed: () => true,
      compilePathD: () => 'M 100 100 L 300 100 L 300 300 L 100 300 Z',
      getViewBoxBounds: () => ({ minX: 0, minY: 0, width: 1000, height: 1000 }),
    },
    getOtherVertices: () => [],
    renderOverlay: () => {},
  } as unknown as ToolContext;

  // Test 1: Start dragging from fill at (150, 150) (far from centroid at 200,200 and edges at 100,300) -> should initialize isMultiCandidate = true
  interaction.start(mockCtx, { x: 150, y: 150 }, [rectEl], groupBox);
  assert(interaction.isAnchorPicked === false, 'Click in interior body sets isAnchorPicked = false');
  assert(interaction.isMultiCandidate === true, 'Click in interior body sets isMultiCandidate = true');
  assert(interaction.candidateLandmarks.length >= 9, `Collected candidate landmarks (box corners, midpoints, center) -> got ${interaction.candidateLandmarks.length}`);

  // Test 2: Free displacement when far from guides
  // Drag by dx = 30, dy = 40 (box moves from (100,100) to (130,140), far from 500)
  interaction.onPointerMove(mockCtx, { x: 180, y: 190 }, { x: 150, y: 150 });
  assert(interaction.ghostDragOffset !== null, 'ghostDragOffset is calculated');
  assert(interaction.ghostDragOffset?.x === 30, `Free movement on X: expected 30 -> got ${interaction.ghostDragOffset?.x}`);
  assert(interaction.ghostDragOffset?.y === 40, `Free movement on Y: expected 40 -> got ${interaction.ghostDragOffset?.y}`);
  assert(interaction.activeSnapLandmark === null, 'No landmark actively snapped during free movement');

  // Test 3: Reactive Centroid Snapping to Guide Cross at (500, 500)
  // Centroid starts at (200, 200). Moving centroid near (500, 500) requires delta ~ (+300, +300).
  // Mouse moves with delta (+303, +297) -> raw target centroid is (503, 497), within 12px threshold of (500, 500)
  interaction.onPointerMove(mockCtx, { x: 150 + 303, y: 150 + 297 }, { x: 150, y: 150 });
  assert(interaction.ghostDragOffset?.x === 300, `Centroid snaps to cross X: expected offset 300 -> got ${interaction.ghostDragOffset?.x}`);
  assert(interaction.ghostDragOffset?.y === 300, `Centroid snaps to cross Y: expected offset 300 -> got ${interaction.ghostDragOffset?.y}`);
  assert(interaction.activeSnapLandmark !== null, 'Active snap landmark is set');
  assert(interaction.activeSnapLandmark?.x === 200 && interaction.activeSnapLandmark?.y === 200, 'Winning candidate is exactly the centroid (200, 200)');

  // Test 4: Reactive Top-Left Corner Snapping to the Same Guide Cross at (500, 500)
  // Top-left corner starts at (100, 100). Moving top-left near (500, 500) requires delta ~ (+400, +400).
  // Mouse moves with delta (+402, +398) -> raw target top-left is (502, 498)
  interaction.onPointerMove(mockCtx, { x: 150 + 402, y: 150 + 398 }, { x: 150, y: 150 });
  assert(interaction.ghostDragOffset?.x === 400, `Top-left corner snaps to cross X: expected offset 400 -> got ${interaction.ghostDragOffset?.x}`);
  assert(interaction.ghostDragOffset?.y === 400, `Top-left corner snaps to cross Y: expected offset 400 -> got ${interaction.ghostDragOffset?.y}`);
  assert(interaction.activeSnapLandmark?.x === 100 && interaction.activeSnapLandmark?.y === 100, 'Winning candidate is Top-Left corner (100, 100)');

  // Test 5: Reactive Bottom-Right Corner Snapping to the Same Guide Cross at (500, 500)
  // Bottom-right corner starts at (300, 300). Moving bottom-right near (500, 500) requires delta ~ (+200, +200).
  // Mouse moves with delta (+197, +203) -> raw target bottom-right is (497, 503)
  interaction.onPointerMove(mockCtx, { x: 150 + 197, y: 150 + 203 }, { x: 150, y: 150 });
  assert(interaction.ghostDragOffset?.x === 200, `Bottom-right corner snaps to cross X: expected offset 200 -> got ${interaction.ghostDragOffset?.x}`);
  assert(interaction.ghostDragOffset?.y === 200, `Bottom-right corner snaps to cross Y: expected offset 200 -> got ${interaction.ghostDragOffset?.y}`);
  assert(interaction.activeSnapLandmark?.x === 300 && interaction.activeSnapLandmark?.y === 300, 'Winning candidate is Bottom-Right corner (300, 300)');

  // Test 6: Direct Node Click vs Multi-Candidate
  // Click directly at corner (100, 100)
  interaction.start(mockCtx, { x: 102, y: 102 }, [rectEl], groupBox);
  assert(interaction.isAnchorPicked === true, 'Click near vertex sets isAnchorPicked = true');
  assert(interaction.isMultiCandidate === false, 'Direct vertex click disables multi-candidate mode');
  assert(interaction.dragAnchorPt.x === 100 && interaction.dragAnchorPt.y === 100, 'Locked to clicked vertex (100, 100)');

  // Test 7: Ghost Overlay shows halo only when snapped or anchor picked
  // When snapped on Bottom-Right:
  interaction.start(mockCtx, { x: 150, y: 150 }, [rectEl], groupBox);
  interaction.onPointerMove(mockCtx, { x: 150 + 197, y: 150 + 203 }, { x: 150, y: 150 });
  const snappedOverlay = interaction.renderGhostOverlay(mockCtx);
  assert(snappedOverlay.includes('translate(500, 500)'), `Overlay renders halo at snapped landmark (500, 500) -> got ${snappedOverlay.slice(0, 300)}...`);

  // When unsnapped (free drag):
  interaction.onPointerMove(mockCtx, { x: 180, y: 190 }, { x: 150, y: 150 });
  const freeOverlay = interaction.renderGhostOverlay(mockCtx);
  assert(!freeOverlay.includes('<g transform="translate('), 'Overlay omits anchor halo during free unsnapped drag');

  console.log('--- Dynamic Multi-Candidate Snapping Suite Complete ---\n');
  return true;
}
