import { ShapeToolHandler } from '../src/webview/tools/ShapeToolHandler.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

export async function runShapeKeyboardSidesTests(): Promise<boolean> {
  console.log('\n--- Running Shape Keyboard Sides & Points (↑ / ↓) Suite ---');

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
  let activeTool: any = 'polygon';

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
  // Test 1: Inactive state (no drag in progress) ignores Arrow keys
  // -----------------------------------------------------------
  const ignoredUp = shapeHandler.onKeyDown(createKeyEvent('ArrowUp'));
  const ignoredDown = shapeHandler.onKeyDown(createKeyEvent('ArrowDown'));
  assert(!ignoredUp, 'ArrowUp ignored when no drag is active');
  assert(!ignoredDown, 'ArrowDown ignored when no drag is active');

  // -----------------------------------------------------------
  // Test 2: Polygon Creation - ArrowUp increments sides
  // -----------------------------------------------------------
  canvasMgr.shapeConfig.polygonSides = 5;
  activeTool = 'polygon';

  // Pointer down at (50, 50)
  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 50, y: 50 }
  );
  // Pointer move to (150, 150)
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 150, y: 150 }
  );

  assert(
    shapeHandler.ghostShapeElement !== null,
    'Ghost shape element generated during polygon drag'
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['data-polygon-sides'] === '5',
    `Initial ghost polygon has 5 sides (got ${shapeHandler.ghostShapeElement?.attributes['data-polygon-sides']})`
  );

  const prevRenderCount = overlayRendered;
  const handledUp = shapeHandler.onKeyDown(createKeyEvent('ArrowUp'));
  assert(handledUp, 'ArrowUp event is consumed (returns true) during polygon drag');
  assert(
    canvasMgr.shapeConfig.polygonSides === 6,
    `Polygon sides incremented from 5 to 6 in shapeConfig (got ${canvasMgr.shapeConfig.polygonSides})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['data-polygon-sides'] === '6',
    `Ghost polygon data-polygon-sides updated to 6 (got ${shapeHandler.ghostShapeElement?.attributes['data-polygon-sides']})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['points'] === '6',
    `Ghost polygon points attribute updated to 6 (got ${shapeHandler.ghostShapeElement?.attributes['points']})`
  );
  assert(
    shapeHandler.ghostShapeElement?.vertices?.length === 12,
    `Ghost polygon vertices array updated to 12 points (6 outer + 6 regular colinear inner) (got ${shapeHandler.ghostShapeElement?.vertices?.length})`
  );
  assert(overlayRendered > prevRenderCount, 'Overlay re-rendered after ArrowUp');

  // ArrowUp again -> 7 sides
  shapeHandler.onKeyDown(createKeyEvent('ArrowUp'));
  assert(
    canvasMgr.shapeConfig.polygonSides === 7 &&
      shapeHandler.ghostShapeElement?.attributes['data-polygon-sides'] === '7',
    'Second ArrowUp increases polygon sides to 7'
  );

  // ArrowDown -> decrements sides back to 6
  const handledDown = shapeHandler.onKeyDown(createKeyEvent('ArrowDown'));
  assert(handledDown, 'ArrowDown event is consumed during polygon drag');
  assert(
    canvasMgr.shapeConfig.polygonSides === 6 &&
      shapeHandler.ghostShapeElement?.attributes['data-polygon-sides'] === '6',
    `ArrowDown decrements polygon sides back to 6 (got ${canvasMgr.shapeConfig.polygonSides})`
  );

  // Commit polygon via PointerUp
  shapeHandler.onPointerUp(
    { button: 0 } as any,
    { x: 150, y: 150 }
  );
  const committedPolygon = model.elements[model.elements.length - 1];
  assert(committedPolygon !== undefined, 'Committed polygon element added to model');
  assert(
    committedPolygon.attributes['data-polygon-sides'] === '6',
    `Committed polygon element preserved interactive 6 sides (got ${committedPolygon?.attributes['data-polygon-sides']})`
  );
  assert(
    committedPolygon.vertices?.length === 12,
    `Committed polygon has 12 vertices (6 outer + 6 colinear inner) (got ${committedPolygon?.vertices?.length})`
  );

  // -----------------------------------------------------------
  // Test 3: Polygon Minimum Boundary Clamping (Min = 3 sides)
  // -----------------------------------------------------------
  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 10, y: 10 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 80, y: 80 }
  );

  // Decrement repeatedly below 3
  for (let i = 0; i < 10; i++) {
    shapeHandler.onKeyDown(createKeyEvent('ArrowDown'));
  }
  assert(
    canvasMgr.shapeConfig.polygonSides === 3,
    `Polygon sides clamped to minimum of 3 sides (got ${canvasMgr.shapeConfig.polygonSides})`
  );
  assert(
    shapeHandler.ghostShapeElement?.vertices?.length === 6,
    `Ghost polygon correctly rendered with 3-gon geometry (3 outer + 3 inner = 6 vertices) (got ${shapeHandler.ghostShapeElement?.vertices?.length})`
  );
  shapeHandler.cancel();

  // -----------------------------------------------------------
  // Test 4: Star Creation - ArrowUp / ArrowDown alters points in-flight
  // -----------------------------------------------------------
  activeTool = 'star';
  canvasMgr.shapeConfig.starPoints = 5;

  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 200, y: 200 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 300, y: 300 }
  );

  assert(
    shapeHandler.ghostShapeElement?.attributes['data-star-points'] === '5',
    'Initial star ghost has 5 points'
  );

  shapeHandler.onKeyDown(createKeyEvent('ArrowUp'));
  assert(
    canvasMgr.shapeConfig.starPoints === 6,
    `Star points incremented to 6 in shapeConfig (got ${canvasMgr.shapeConfig.starPoints})`
  );
  assert(
    shapeHandler.ghostShapeElement?.attributes['data-star-points'] === '6',
    `Ghost star data-star-points updated to 6 (got ${shapeHandler.ghostShapeElement?.attributes['data-star-points']})`
  );
  // A regular star with N points has 2*N vertices (outer + inner alternating)
  assert(
    shapeHandler.ghostShapeElement?.vertices?.length === 12,
    `Ghost 6-pointed star has 12 vertices (got ${shapeHandler.ghostShapeElement?.vertices?.length})`
  );

  // Commit star via PointerUp
  shapeHandler.onPointerUp(
    { button: 0 } as any,
    { x: 300, y: 300 }
  );
  const committedStar = model.elements[model.elements.length - 1];
  assert(
    committedStar.attributes['data-star-points'] === '6',
    `Committed star element preserved interactive 6 points (got ${committedStar?.attributes['data-star-points']})`
  );
  assert(
    committedStar.vertices?.length === 12,
    `Committed star has exactly 12 vertices (got ${committedStar?.vertices?.length})`
  );

  // -----------------------------------------------------------
  // Test 5: Star Minimum Boundary Clamping (Min = 3 points)
  // -----------------------------------------------------------
  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 10, y: 10 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 50, y: 50 }
  );
  for (let i = 0; i < 10; i++) {
    shapeHandler.onKeyDown(createKeyEvent('ArrowDown'));
  }
  assert(
    canvasMgr.shapeConfig.starPoints === 3,
    `Star points clamped to minimum of 3 points (got ${canvasMgr.shapeConfig.starPoints})`
  );
  assert(
    shapeHandler.ghostShapeElement?.vertices?.length === 6,
    `3-pointed star has 6 vertices (got ${shapeHandler.ghostShapeElement?.vertices?.length})`
  );
  shapeHandler.cancel();

  // -----------------------------------------------------------
  // Test 6: Non-polygon / non-star tools ignore Arrow keys
  // -----------------------------------------------------------
  activeTool = 'rect';
  shapeHandler.onPointerDown(
    { button: 0, shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 10, y: 10 }
  );
  shapeHandler.onPointerMove(
    { shiftKey: false, ctrlKey: false, altKey: false } as any,
    { x: 50, y: 50 }
  );
  const rectIgnored = shapeHandler.onKeyDown(createKeyEvent('ArrowUp'));
  assert(!rectIgnored, 'ArrowUp ignored when creating a rectangle');
  shapeHandler.cancel();

  console.log(`\nShape Keyboard Sides Tests complete: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
