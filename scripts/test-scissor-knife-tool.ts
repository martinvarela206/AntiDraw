import { ScissorKnifeEngine } from '../src/webview/engine/boolean/ScissorKnifeEngine.js';
import { ScissorKnifeToolHandler } from '../src/webview/tools/ScissorKnifeToolHandler.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runScissorKnifeToolTests(): Promise<boolean> {
  console.log('\n--- Running Vector Scissors & Knife Tool (Straight Bisect, Freehand Carve & Open Path) Suite ---');

  // --------------------------------------------------------------------------
  // Suite 1: Douglas-Peucker & Curve Smoothing
  // --------------------------------------------------------------------------
  console.log('\n[1. Douglas-Peucker & Trajectory Smoothing]');
  const lineWithNoise = [
    { x: 0, y: 0 },
    { x: 25, y: 0.1 },
    { x: 50, y: -0.1 },
    { x: 75, y: 0.2 },
    { x: 100, y: 0 },
  ];
  const simplified = ScissorKnifeEngine.douglasPeucker(lineWithNoise, 1.0);
  assert(simplified.length === 2, `Douglas-Peucker must simplify colinear noise to 2 endpoints, got ${simplified.length}`);
  assert(simplified[0].x === 0 && simplified[1].x === 100, 'Endpoints preserved');

  const rawTrajectory = [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 15 },
    { x: 30, y: 30 },
    { x: 40, y: 50 },
  ];
  const smoothed0 = ScissorKnifeEngine.smoothTrajectory(rawTrajectory, 0);
  assert(smoothed0.length === rawTrajectory.length, 'Smoothing=0 preserves all raw points');

  const smoothed50 = ScissorKnifeEngine.smoothTrajectory(rawTrajectory, 50);
  assert(smoothed50.length >= 2, `Smoothing=50 produces valid interpolated curve, got ${smoothed50.length} pts`);

  // --------------------------------------------------------------------------
  // Suite 2: Mode 1 (Scissors / 2 Clicks): Planar Straight Bisect on Closed Shape
  // --------------------------------------------------------------------------
  console.log('\n[2. Mode 1: Planar Straight Bisecting Cut (Zero-Gap Slicing)]');
  const model1 = new VectorModel();
  const rectEl: VectorElement = {
    id: 'rect_1',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '100', height: '100', fill: '#3b82f6', stroke: '#1d4ed8' },
  };
  model1.elements = [rectEl];

  // Cut vertically across the center from (50, -10) to (50, 110)
  const cutStraight = [
    { x: 50, y: -10 },
    { x: 50, y: 110 },
  ];
  const resultBisect = ScissorKnifeEngine.applyCut(model1, cutStraight, [rectEl], { mode: 'two_clicks', smoothing: 0 });

  assert(resultBisect.removedElementIds.includes('rect_1'), 'Original rect_1 must be replaced');
  assert(resultBisect.addedElements.length === 2, `Straight cut must partition rectangle into exactly 2 pieces, got ${resultBisect.addedElements.length}`);
  assert(model1.elements.length === 2, `Model contains 2 partitioned elements, got ${model1.elements.length}`);

  // Both pieces must retain original styling
  assert(model1.elements[0].attributes.fill === '#3b82f6', 'Piece 1 inherits fill #3b82f6');
  assert(model1.elements[1].attributes.fill === '#3b82f6', 'Piece 2 inherits fill #3b82f6');

  // Verify bounding boxes of both halves
  const selTool = new SelectionTool(model1);
  const bbox1 = selTool.getBoundingBox(model1.elements[0]);
  const bbox2 = selTool.getBoundingBox(model1.elements[1]);
  assert(bbox1 !== null && bbox2 !== null, 'Both pieces have valid bounding boxes');

  // --------------------------------------------------------------------------
  // Suite 3: Mode 2 (Knife / Freehand Drag): Curved Slicing across a Shape
  // --------------------------------------------------------------------------
  console.log('\n[3. Mode 2: Curved Freehand Slicing]');
  const model2 = new VectorModel();
  const squareEl: VectorElement = {
    id: 'sq_2',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '100', height: '100', fill: '#ec4899' },
  };
  model2.elements = [squareEl];

  // S-curved cut stroke from left to right
  const sCurveCut = [
    { x: -10, y: 50 },
    { x: 25, y: 30 },
    { x: 75, y: 70 },
    { x: 110, y: 50 },
  ];

  const resultCurve = ScissorKnifeEngine.applyCut(model2, sCurveCut, [squareEl], { mode: 'freehand', smoothing: 30 });
  assert(resultCurve.removedElementIds.includes('sq_2'), 'Original square sq_2 was severed');
  assert(resultCurve.addedElements.length === 2, `S-curve cut partitions shape into 2 pieces, got ${resultCurve.addedElements.length}`);
  assert(model2.elements.length === 2, 'Model now contains 2 elements');

  // --------------------------------------------------------------------------
  // Suite 4: Open Path Severing
  // --------------------------------------------------------------------------
  console.log('\n[4. Open Path Severing]');
  const model3 = new VectorModel();
  const openLineEl: VectorElement = {
    id: 'line_1',
    tagName: 'path',
    shapeType: 'path',
    isParametric: false,
    isClosed: false,
    attributes: { d: 'M 0 50 L 100 50', stroke: '#10b981', 'stroke-width': '2', fill: 'none' },
    vertices: [
      { id: 'v1', x: 0, y: 50, command: 'M', nodeType: 'sharp' },
      { id: 'v2', x: 100, y: 50, command: 'L', nodeType: 'sharp' },
    ],
  };
  model3.elements = [openLineEl];

  // Cut across vertically at x = 40
  const cutLine = [
    { x: 40, y: 10 },
    { x: 40, y: 90 },
  ];

  const resultOpen = ScissorKnifeEngine.applyCut(model3, cutLine, [openLineEl]);
  assert(resultOpen.removedElementIds.includes('line_1'), 'Original line_1 was severed');
  assert(resultOpen.addedElements.length === 2, `Line was split into 2 sub-paths, got ${resultOpen.addedElements.length}`);
  assert(model3.elements.length === 2, 'Model now contains 2 open sub-paths');
  assert(!model3.elements[0].isClosed && !model3.elements[1].isClosed, 'Both parts are open paths');

  // --------------------------------------------------------------------------
  // Suite 5: Closed-Loop Cookie-Cutter Carving
  // --------------------------------------------------------------------------
  console.log('\n[5. Closed-Loop Cookie-Cutter Carving]');
  const model4 = new VectorModel();
  const baseEl: VectorElement = {
    id: 'base_1',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '200', height: '200', fill: '#f59e0b' },
  };
  model4.elements = [baseEl];

  // Closed rectangular carve loop inside the base: [50, 50] to [150, 150]
  const carveLoop = [
    { x: 50, y: 50 },
    { x: 150, y: 50 },
    { x: 150, y: 150 },
    { x: 50, y: 150 },
    { x: 50, y: 50 },
  ];

  const resultCarve = ScissorKnifeEngine.applyCut(model4, carveLoop, [baseEl]);
  assert(resultCarve.addedElements.length === 2, `Cookie-cutter carve must produce 2 pieces (inside cutout + frame), got ${resultCarve.addedElements.length}`);
  assert(model4.elements.length === 2, 'Model contains inside piece and outer frame');

  // --------------------------------------------------------------------------
  // Suite 6: ScissorKnifeToolHandler Interactive Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n[6. ScissorKnifeToolHandler Interactive Lifecycle]');
  const model5 = new VectorModel();
  const testBox: VectorElement = {
    id: 'box_5',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '100', height: '100', fill: '#8b5cf6' },
  };
  model5.elements = [testBox];

  const selTool5 = new SelectionTool(model5);
  const canvasMgr5 = new CanvasManager(model5);

  let undoPushed = false;
  let renderCalled = false;

  const mockToolCtx = {
    model: model5,
    selectionTool: selTool5,
    canvasMgr: canvasMgr5,
    pushUndo: () => { undoPushed = true; },
    render: () => { renderCalled = true; },
    renderOverlay: () => {},
    syncToHost: () => {},
    snapPoint: (pt: any) => pt,
  };

  const handler = new ScissorKnifeToolHandler(mockToolCtx as any);

  // Initial state
  assert(handler.mode === 'auto', 'Default mode is auto');
  assert(handler.smoothing === 30, 'Default smoothing is 30');

  // Set mode & smoothing
  handler.setMode('two_clicks');
  assert(handler.mode === 'two_clicks', 'Mode switched to two_clicks');
  handler.setSmoothing(50);
  assert(handler.smoothing === 50, 'Smoothing updated to 50');

  // Test Mode 1 (Two-Clicks):
  // Click 1:
  handler.onPointerDown({ button: 0 } as any, { x: 50, y: -10 });
  assert(handler.firstClickPoint !== null, 'First click point registered');
  assert(handler.firstClickPoint?.x === 50 && handler.firstClickPoint?.y === -10, 'First click coordinates match');

  // Move:
  handler.onPointerMove({} as any, { x: 50, y: 50 });
  assert(handler.currentPoint?.x === 50 && handler.currentPoint?.y === 50, 'Current point tracked');

  // Overlay contains elastic line
  const overlaySvg = handler.renderOverlay(1);
  assert(overlaySvg.includes('id="scissor-knife-tool-overlay"'), 'Overlay SVG renders scissor-knife group');
  assert(overlaySvg.includes('<line'), 'Elastic guideline line rendered');

  // Click 2 (completes cut):
  handler.onPointerDown({ button: 0 } as any, { x: 50, y: 110 });
  assert(undoPushed, 'Undo pushed on completed cut');
  assert(renderCalled, 'Canvas rendered on completed cut');
  assert(model5.elements.length === 2, 'Two-click cut split testBox into 2 pieces');
  assert(handler.firstClickPoint === null, 'First click point cleared after completion');

  // Test Cancel via Escape
  handler.onPointerDown({ button: 0 } as any, { x: 20, y: 20 });
  assert(handler.firstClickPoint !== null, 'Click 1 set before cancel');
  handler.onKeyDown({ key: 'Escape' } as any);
  assert(handler.firstClickPoint === null, 'Escape successfully cancels cut');

  console.log('\n🌟 ALL 6 VECTOR SCISSORS & KNIFE TOOL SUITES PASSED! 🌟');
  return true;
}
