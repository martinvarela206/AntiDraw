import { ShapeToolHandler } from '../src/webview/tools/ShapeToolHandler.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

export async function runStarInnerRatioCtrlTests(): Promise<boolean> {
  console.log('\n--- Running Star Interactive Inner Ratio Modulation with Ctrl Suite ---');

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
  let activeTool: any = 'star';

  const mockContext = {
    model,
    canvasMgr,
    selectionTool: { select: () => {} } as any,
    getActiveTool: () => activeTool,
    getOtherVertices: () => [],
    snapPoint: (pt: any) => ({ ...pt }),
    renderOverlay: () => {
      overlayRendered++;
    },
    render: () => {},
    syncToHost: () => {},
    pushUndo: () => {},
  } as any;

  const shapeHandler = new ShapeToolHandler(mockContext);

  function createKeyEvent(key: string, props: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key,
      code: key,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      ...props,
    } as any;
  }

  // -----------------------------------------------------------
  // Test 1: Star drag creation without Ctrl adjusts outer bounds
  // -----------------------------------------------------------
  canvasMgr.shapeConfig.starPoints = 5;
  canvasMgr.shapeConfig.starInnerRatio = 0.4;

  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 100, y: 100 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 200, y: 200 }
  );

  assert(shapeHandler.frozenStarBounds === null, 'frozenStarBounds is null during standard freehand drag');
  assert(shapeHandler.ghostShapeElement !== null, 'Ghost shape created');
  assert(
    shapeHandler.ghostShapeElement?.attributes['cx'] === '150' &&
      shapeHandler.ghostShapeElement?.attributes['cy'] === '150',
    `Initial star center is (150, 150) (got cx=${shapeHandler.ghostShapeElement?.attributes['cx']}, cy=${shapeHandler.ghostShapeElement?.attributes['cy']})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['rx'] === '50' &&
      shapeHandler.ghostShapeElement?.attributes['ry'] === '50',
    `Initial star outer radii rx=50, ry=50 (got rx=${shapeHandler.ghostShapeElement?.attributes['rx']}, ry=${shapeHandler.ghostShapeElement?.attributes['ry']})`
  );

  // -----------------------------------------------------------
  // Test 2: Pressing Ctrl in-flight freezes outer radius & centers
  // -----------------------------------------------------------
  shapeHandler.onKeyDown(createKeyEvent('Control', { ctrlKey: true }));
  assert(shapeHandler.frozenStarBounds !== null, 'frozenStarBounds captured on Ctrl down');
  assert(
    shapeHandler.frozenStarBounds?.rx === 50 && shapeHandler.frozenStarBounds?.ry === 50,
    `Frozen outer radii locked to rx=50, ry=50 (got rx=${shapeHandler.frozenStarBounds?.rx})`
  );
  assert(
    shapeHandler.frozenStarBounds?.cx === 150 && shapeHandler.frozenStarBounds?.cy === 150,
    `Frozen center locked to (150, 150) (got cx=${shapeHandler.frozenStarBounds?.cx})`
  );

  // -----------------------------------------------------------
  // Test 3: Moving cursor with Ctrl adjusts innerRatio interactively
  // Moving pointer to (160, 150) -> distance from center (150, 150) is 10px -> ratio = 10 / 50 = 0.20
  // -----------------------------------------------------------
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: true, altKey: false } as any,
    { x: 160, y: 150 }
  );

  assert(
    canvasMgr.shapeConfig.starInnerRatio === 0.2,
    `starInnerRatio dynamically updated to 0.20 (got ${canvasMgr.shapeConfig.starInnerRatio})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['data-star-inner-ratio'] === '0.2',
    `Ghost shape data-star-inner-ratio attribute updated to 0.2 (got ${shapeHandler.ghostShapeElement?.attributes['data-star-inner-ratio']})`
  );
  // Outer radius must remain strictly unchanged at 50
  assert(
    shapeHandler.ghostShapeElement?.attributes['rx'] === '50' &&
      shapeHandler.ghostShapeElement?.attributes['ry'] === '50',
    `Outer radius rx and ry remain frozen at 50 while adjusting inner depth (got rx=${shapeHandler.ghostShapeElement?.attributes['rx']})`
  );

  // -----------------------------------------------------------
  // Test 4: Moving pointer farther outward to (185, 150) -> dist = 35px -> ratio = 35 / 50 = 0.70
  // -----------------------------------------------------------
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: true, altKey: false } as any,
    { x: 185, y: 150 }
  );

  assert(
    canvasMgr.shapeConfig.starInnerRatio === 0.7,
    `starInnerRatio updated to 0.70 (got ${canvasMgr.shapeConfig.starInnerRatio})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['data-star-inner-ratio'] === '0.7',
    `Ghost shape data-star-inner-ratio updated to 0.7 (got ${shapeHandler.ghostShapeElement?.attributes['data-star-inner-ratio']})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['rx'] === '50',
    'Outer radius rx remains frozen at 50'
  );

  // -----------------------------------------------------------
  // Test 5: Ratio Boundary Clamping (Min = 0.05, Max = 0.95)
  // -----------------------------------------------------------
  // Move directly to center (150, 150) -> dist = 0 -> clamped to 0.05
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: true, altKey: false } as any,
    { x: 150, y: 150 }
  );
  assert(
    canvasMgr.shapeConfig.starInnerRatio === 0.05,
    `Inner ratio safely clamped to minimum 0.05 at center (got ${canvasMgr.shapeConfig.starInnerRatio})`
  );

  // Move far past outer radius (250, 150) -> dist = 100 > 50 -> clamped to 0.95
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: true, altKey: false } as any,
    { x: 250, y: 150 }
  );
  assert(
    canvasMgr.shapeConfig.starInnerRatio === 0.95,
    `Inner ratio safely clamped to maximum 0.95 outside perimeter (got ${canvasMgr.shapeConfig.starInnerRatio})`
  );

  // Set to a pleasant 0.35 and commit
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: true, altKey: false } as any,
    { x: 150, y: 167.5 } // dy = 17.5 / 50 = 0.35
  );
  assert(
    canvasMgr.shapeConfig.starInnerRatio === 0.35,
    `Inner ratio adjusted to 0.35 (got ${canvasMgr.shapeConfig.starInnerRatio})`
  );

  // -----------------------------------------------------------
  // Test 6: Commit Star via PointerUp with active Ctrl
  // -----------------------------------------------------------
  shapeHandler.onPointerUp(
    { button: 0 } as any,
    { x: 150, y: 167.5 }
  );

  const committedStar = model.elements[model.elements.length - 1];
  assert(committedStar !== undefined, 'Committed star added to model');
  assert(
    committedStar.attributes['data-star-inner-ratio'] === '0.35',
    `Committed star preserved interactive innerRatio 0.35 (got ${committedStar.attributes['data-star-inner-ratio']})`
  );
  assert(
    committedStar.attributes['rx'] === '50' && committedStar.attributes['ry'] === '50',
    `Committed star preserved frozen outer radius of 50 (got rx=${committedStar.attributes['rx']})`
  );
  assert(shapeHandler.frozenStarBounds === null, 'frozenStarBounds cleared on pointerUp');

  // -----------------------------------------------------------
  // Test 7: Releasing Ctrl unfreezes outer radius
  // -----------------------------------------------------------
  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 0, y: 0 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 100, y: 100 }
  );
  // Press Ctrl
  shapeHandler.onKeyDown(createKeyEvent('Control', { ctrlKey: true }));
  assert(shapeHandler.frozenStarBounds !== null, 'Frozen bounds set when Ctrl pressed');

  // Release Ctrl
  shapeHandler.onKeyUp(createKeyEvent('Control', { ctrlKey: false }));
  assert(shapeHandler.frozenStarBounds === null, 'Frozen bounds released when Ctrl released');

  // Move without Ctrl -> scales outer bounds normally to 200
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 200, y: 200 }
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['rx'] === '100',
    `Outer radius rx scaled up to 100 after Ctrl was released (got ${shapeHandler.ghostShapeElement?.attributes['rx']})`
  );
  shapeHandler.cancel();

  console.log(`\nStar Inner Ratio Ctrl Tests complete: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
