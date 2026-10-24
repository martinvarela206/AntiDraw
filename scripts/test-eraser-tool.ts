import { EraserEngine } from '../src/webview/engine/boolean/EraserEngine.js';
import { EraserToolHandler } from '../src/webview/tools/EraserToolHandler.js';
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

export async function runEraserToolTests(): Promise<boolean> {
  console.log('\n--- Running Vector Eraser Tool (Subtractions, Partitioning & Alt Preservation) Suite ---');

  // --------------------------------------------------------------------------
  // Suite 1: Eraser Footprint Generation (Circle, Square, Capsule Swath)
  // --------------------------------------------------------------------------
  console.log('\n[1. Eraser Footprint Generation]');
  const circleTip = EraserEngine.generateTipPolygon({ x: 50, y: 50 }, 10, 'circle');
  assert(circleTip.length === 1, `Circle tip must generate 1 polygon, got ${circleTip.length}`);
  assert(circleTip[0][0].length >= 24, `Circle tip ring must have at least 24 vertices, got ${circleTip[0][0].length}`);

  const squareTip = EraserEngine.generateTipPolygon({ x: 50, y: 50 }, 10, 'square');
  assert(squareTip.length === 1, `Square tip must generate 1 polygon, got ${squareTip.length}`);
  assert(squareTip[0][0].length === 5, `Square tip ring must have 5 vertices (4 corners + closing), got ${squareTip[0][0].length}`);

  const swath = EraserEngine.buildSwathFromPoints(
    [
      { x: 10, y: 50 },
      { x: 90, y: 50 },
    ],
    10,
    'circle'
  );
  assert(swath.length >= 1, `Swath must produce at least 1 polygon, got ${swath.length}`);

  // --------------------------------------------------------------------------
  // Suite 2: Partial In-Place Subtraction (Corner Bite)
  // --------------------------------------------------------------------------
  console.log('\n[2. Partial In-Place Subtraction (Corner Bite)]');
  const model1 = new VectorModel();
  const squareEl: VectorElement = {
    id: 'sq_1',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '100', height: '100', fill: '#4f46e5' },
  };
  model1.elements = [squareEl];

  // Erase a circle at top-right corner (100, 0) with radius 15
  const cornerBiteSwath = EraserEngine.generateTipPolygon({ x: 100, y: 0 }, 15, 'circle');
  const resultBite = EraserEngine.applyEraser(model1, cornerBiteSwath, [squareEl], false);

  assert(resultBite.modifiedElementIds.includes('sq_1'), 'Square sq_1 must be modified in place');
  assert(model1.elements.length === 1, `Model should still have 1 element, got ${model1.elements.length}`);
  assert(model1.elements[0].tagName === 'path', 'Square was converted to curve path with corner cut');

  // --------------------------------------------------------------------------
  // Suite 3: Automatic Shape Partitioning (Through-Cut into N >= 2 Pieces)
  // --------------------------------------------------------------------------
  console.log('\n[3. Automatic Shape Partitioning (Through-Cut)]');
  const model2 = new VectorModel();
  const barEl: VectorElement = {
    id: 'bar_1',
    tagName: 'rect',
    attributes: { x: '0', y: '30', width: '100', height: '40', fill: '#10b981' },
  };
  model2.elements = [barEl];

  // Cut vertically across the center from (50, 0) to (50, 100) with diameter 20 (radius 10)
  const cutSwath = EraserEngine.buildSwathFromPoints(
    [
      { x: 50, y: 10 },
      { x: 50, y: 90 },
    ],
    10,
    'square'
  );

  const resultCut = EraserEngine.applyEraser(model2, cutSwath, [barEl], false);
  assert(resultCut.removedElementIds.includes('bar_1'), 'Original bar_1 must be replaced');
  assert(resultCut.addedElements.length === 2, `Through-cut must partition bar into 2 pieces, got ${resultCut.addedElements.length}`);
  assert(model2.elements.length === 2, `Model now has 2 disjoint elements, got ${model2.elements.length}`);

  // Both pieces must retain original styling
  assert(model2.elements[0].attributes.fill === '#10b981', 'First partitioned piece retains fill #10b981');
  assert(model2.elements[1].attributes.fill === '#10b981', 'Second partitioned piece retains fill #10b981');

  // --------------------------------------------------------------------------
  // Suite 4: Alt-Preserved Carving as Independent Vector
  // --------------------------------------------------------------------------
  console.log('\n[4. Alt-Preserved Carving]');
  const model3 = new VectorModel();
  const canvasShape: VectorElement = {
    id: 'poly_1',
    tagName: 'rect',
    attributes: { x: '0', y: '0', width: '200', height: '200', fill: '#f59e0b' },
  };
  model3.elements = [canvasShape];

  const carveSwath = EraserEngine.buildSwathFromPoints(
    [
      { x: 20, y: 100 },
      { x: 180, y: 100 },
    ],
    12,
    'circle'
  );

  const resultPreserve = EraserEngine.applyEraser(model3, carveSwath, [canvasShape], true);
  assert(resultPreserve.preservedSwathElement !== undefined, 'Preserved swath element must be returned');
  assert(model3.elements.some((el) => el.id === resultPreserve.preservedSwathElement?.id), 'Preserved swath is in model elements');

  // --------------------------------------------------------------------------
  // Suite 5: EraserToolHandler Pointer Workflow & Bracket Hotkeys
  // --------------------------------------------------------------------------
  console.log('\n[5. EraserToolHandler Pointer Workflow & Hotkeys]');
  const model4 = new VectorModel();
  model4.elements = [
    {
      id: 'target_rect',
      tagName: 'rect',
      attributes: { x: '10', y: '10', width: '80', height: '80', fill: '#ef4444' },
    },
  ];

  let undoCount = 0;
  let syncCount = 0;
  let overlayCount = 0;

  const mockCtx: any = {
    model: model4,
    selectionTool: new SelectionTool(model4),
    canvasMgr: new CanvasManager(),
    pushUndo: () => { undoCount++; },
    syncToHost: () => { syncCount++; },
    render: () => {},
    renderOverlay: () => { overlayCount++; },
    getActiveTool: () => 'eraser',
  };

  const handler = new EraserToolHandler(mockCtx);
  assert(handler.size === 20, `Default diameter must be 20, got ${handler.size}`);

  // Test bracket hotkeys
  handler.onKeyDown({ key: ']' } as KeyboardEvent);
  assert(handler.size === 25, `Size after ']' must increase to 25, got ${handler.size}`);

  handler.onKeyDown({ key: '[' } as KeyboardEvent);
  assert(handler.size === 20, `Size after '[' must decrease back to 20, got ${handler.size}`);

  // Test pointer sequence
  handler.activate();
  handler.onPointerDown({ button: 0, altKey: false } as PointerEvent, { x: 50, y: 50 });
  assert(handler.isDragging === true, 'Handler is dragging on pointer down');

  handler.onPointerMove({ button: 0, altKey: false } as PointerEvent, { x: 50, y: 60 });
  assert(handler.trajectoryPoints.length >= 2, 'Trajectory points accumulated');

  const overlayHtml = handler.renderOverlay(1);
  assert(overlayHtml.includes('id="eraser-tool-overlay"'), 'Overlay renders eraser tool group');

  handler.onPointerUp({ button: 0, altKey: false } as PointerEvent, { x: 50, y: 70 });
  assert(handler.isDragging === false, 'Drag ends on pointer up');
  assert(undoCount === 1, `Undo must be recorded once, got ${undoCount}`);
  assert(syncCount === 1, `Host sync must be recorded once, got ${syncCount}`);

  console.log('\nVector Eraser Tool Suite complete: ALL PASSED.');
  return true;
}
