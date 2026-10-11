import { ShapeToolHandler } from '../src/webview/tools/ShapeToolHandler.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { QuickHelpInspector } from '../src/webview/ui/inspectors/QuickHelpInspector.js';

export async function runDragModifiersTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Dynamic Drag Modifiers & Quick Help Suite (09.1)');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  const model = new VectorModel();
  const canvasMgr = new CanvasManager();
  let overlayRendered = 0;

  let currentTool = 'rect';
  const mockContext = {
    model,
    canvasMgr,
    selectionTool: { select: () => {} } as any,
    getActiveTool: () => currentTool,
    getOtherVertices: () => [],
    snapPoint: (pt: any) => ({ ...pt }),
    renderOverlay: () => { overlayRendered++; },
    render: () => {},
    syncToHost: () => {},
    pushUndo: () => {},
  } as any;

  const shapeHandler = new ShapeToolHandler(mockContext);

  // -----------------------------------------------------------
  // Test 1: Normal Freehand Drag (Corner-to-Corner)
  // -----------------------------------------------------------
  const b1 = shapeHandler.calculateShapeBounds(
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    false,
    false,
    false
  );
  assert(
    b1.x === 100 && b1.y === 100 && b1.w === 100 && b1.h === 50,
    `Freehand drag from (100,100) to (200,150) yields 100x50 box (got ${b1.w}x${b1.h})`
  );

  // -----------------------------------------------------------
  // Test 2: Shift Modifier (1:1 Square Lock)
  // -----------------------------------------------------------
  const b2 = shapeHandler.calculateShapeBounds(
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    true, // shiftKey
    false,
    false
  );
  assert(
    b2.w === 100 && b2.h === 100 && b2.x === 100 && b2.y === 100,
    `Shift modifier forces 1:1 aspect ratio: 100x100 (got ${b2.w}x${b2.h})`
  );

  // -----------------------------------------------------------
  // Test 3: Alt Modifier (Concentric Projection from Center)
  // -----------------------------------------------------------
  const b3 = shapeHandler.calculateShapeBounds(
    { x: 100, y: 100 },
    { x: 150, y: 130 },
    false,
    false,
    true // altKey
  );
  assert(
    b3.cx === 100 && b3.cy === 100 && b3.w === 100 && b3.h === 60 && b3.x === 50 && b3.y === 70,
    `Alt modifier expands symmetrically from center (100,100): w=100, h=60, x=50, y=70 (got x=${b3.x}, y=${b3.y}, w=${b3.w}, h=${b3.h})`
  );

  // -----------------------------------------------------------
  // Test 4: Shift + Alt Simultaneously (1:1 Centered at Origin)
  // -----------------------------------------------------------
  const b4 = shapeHandler.calculateShapeBounds(
    { x: 100, y: 100 },
    { x: 150, y: 130 },
    true, // shiftKey
    false,
    true // altKey
  );
  assert(
    b4.cx === 100 && b4.cy === 100 && b4.w === 100 && b4.h === 100 && b4.x === 50 && b4.y === 50,
    `Shift+Alt simultaneous locks 1:1 and expands from center: w=100, h=100, x=50, y=50 (got ${b4.w}x${b4.h})`
  );

  // -----------------------------------------------------------
  // Test 5: Dynamic In-Flight Spacebar Repositioning
  // -----------------------------------------------------------
  const fakeDownEvent = { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any;
  shapeHandler.onPointerDown(fakeDownEvent, { x: 100, y: 100 });

  // Drag to (200, 200) -> initial size 100x100
  const fakeMoveEvent1 = { shiftKey: false, ctrlKey: false, altKey: false } as any;
  shapeHandler.onPointerMove(fakeMoveEvent1, { x: 200, y: 200 });

  const initialGhost = shapeHandler.ghostShapeElement;
  assert(initialGhost !== null, 'Ghost shape created during drag');
  const initialBounds = shapeHandler.calculateShapeBounds(
    shapeHandler.shapeStartPt!,
    { x: 200, y: 200 },
    false,
    false,
    false
  );
  assert(initialBounds.w === 100 && initialBounds.h === 100, 'Initial shape size is 100x100');

  // User presses Space in-flight
  shapeHandler.setSpacePressed(true);

  // Mouse moves to (250, 250) while holding Space (translation +50, +50)
  shapeHandler.onPointerMove(fakeMoveEvent1, { x: 250, y: 250 });

  // Shape size MUST still be exactly 100x100!
  const movedBounds = shapeHandler.calculateShapeBounds(
    shapeHandler.shapeStartPt!,
    { x: 250, y: 250 },
    false,
    false,
    false
  );
  assert(
    movedBounds.w === 100 && movedBounds.h === 100,
    `In-flight Space translation preserves exact dimensions: 100x100 (got ${movedBounds.w}x${movedBounds.h})`
  );
  assert(
    shapeHandler.shapeStartPt?.x === 150 && shapeHandler.shapeStartPt?.y === 150,
    `In-flight Space translated start point from (100,100) to (150,150) (got ${shapeHandler.shapeStartPt?.x}, ${shapeHandler.shapeStartPt?.y})`
  );

  // User releases Space and continues dragging to (280, 270)
  shapeHandler.setSpacePressed(false);
  shapeHandler.onPointerMove(fakeMoveEvent1, { x: 280, y: 270 });

  const finalBounds = shapeHandler.calculateShapeBounds(
    shapeHandler.shapeStartPt!,
    { x: 280, y: 270 },
    false,
    false,
    false
  );
  assert(
    finalBounds.w === 130 && finalBounds.h === 120,
    `Sizing smoothly resumed from translated origin (150,150) to (280,270): 130x120 (got ${finalBounds.w}x${finalBounds.h})`
  );

  shapeHandler.cancel();

  // -----------------------------------------------------------
  // Test 6: In-Flight Modifier Key Swapping (updateModifierInFlight)
  // -----------------------------------------------------------
  shapeHandler.onPointerDown(fakeDownEvent, { x: 100, y: 100 });
  shapeHandler.onPointerMove(fakeMoveEvent1, { x: 200, y: 150 }); // w=100, h=50

  // While mouse stays still, user presses Shift in flight
  shapeHandler.updateModifierInFlight(true, false, false);
  const shiftInFlightEl = shapeHandler.ghostShapeElement;
  assert(
    shiftInFlightEl !== null &&
      shapeHandler.calculateShapeBounds(shapeHandler.shapeStartPt!, shapeHandler.lastMovePt!, true, false, false).w === 100 &&
      shapeHandler.calculateShapeBounds(shapeHandler.shapeStartPt!, shapeHandler.lastMovePt!, true, false, false).h === 100,
    'In-flight Shift press dynamically snaps ghost shape to 1:1 without mouse move'
  );

  // User presses Alt in flight
  shapeHandler.updateModifierInFlight(false, true, false);
  const altBoundsInFlight = shapeHandler.calculateShapeBounds(
    shapeHandler.shapeStartPt!,
    shapeHandler.lastMovePt!,
    false,
    false,
    true
  );
  assert(
    altBoundsInFlight.cx === 100 && altBoundsInFlight.cy === 100,
    'In-flight Alt press dynamically centers ghost shape projection without mouse move'
  );

  shapeHandler.cancel();

  // -----------------------------------------------------------
  // Test 7: QuickHelpInspector Tool Help Verification
  // -----------------------------------------------------------
  const rectHelp = (QuickHelpInspector as any).TOOL_HELP_MAP['rect'];
  assert(rectHelp !== undefined, 'QuickHelpInspector contains rect tool help config');

  const hasSpaceShortcut = rectHelp.shortcuts.some((s: any) =>
    s.keys.includes('Espacio') && s.description.toLowerCase().includes('sin perder')
  );
  assert(hasSpaceShortcut, 'QuickHelpInspector documents "Espacio en vuelo" repositioning');

  const hasShiftShortcut = rectHelp.shortcuts.some((s: any) =>
    s.keys.includes('Shift') && s.description.toLowerCase().includes('1:1')
  );
  assert(hasShiftShortcut, 'QuickHelpInspector documents Shift 1:1 proportion lock');

  const hasAltShortcut = rectHelp.shortcuts.some((s: any) =>
    s.keys.includes('Alt') && s.description.toLowerCase().includes('centro')
  );
  assert(hasAltShortcut, 'QuickHelpInspector documents Alt projection from center');

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 Dynamic drag modifiers & quick help passed all tests!\n');
    return true;
  } else {
    console.error('❌ Some tests failed.\n');
    return false;
  }
}

if (process.argv[1]?.endsWith('test-drag-modifiers.ts') || process.argv[1]?.endsWith('test-drag-modifiers.js')) {
  runDragModifiersTests().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
