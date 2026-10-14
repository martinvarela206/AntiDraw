import { SnappingEngine, SnappingContext } from '../src/webview/engine/canvas/SnappingEngine.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runPixelPerfectTests(): Promise<boolean> {
  console.log('\n--- Running Pixel-Perfect Snapping Suite ---');

  const defaultCtx: SnappingContext = {
    snapThreshold: 8,
    zoom: 1,
    snapToPixelGrid: true,
    snapToGrid: false,
    snapToGuides: false,
    snapToVertices: false,
    snapToNodes: false,
    snapToEdges: false,
    snapToViewBox: false,
    snapAngular: false,
    showGuides: false,
    showGrid: false,
    guides: [],
    grids: [],
    rulerConfig: {
      unit: 'px',
      zoom: 1,
      subdivisions: 5,
      step: 20,
      majorStep: 100,
      rulerThickness: 24,
      originX: 0,
      originY: 0,
      scale: 1,
    },
  };

  // Test 1: CanvasManager default state
  const cm = new CanvasManager();
  assert(cm.snapToPixelGrid === true, 'CanvasManager initializes with snapToPixelGrid = true by default');

  // Test 2: Integer rounding on subpixel coordinates
  const res1 = SnappingEngine.snapPoint({ x: 10.23, y: 45.78 }, defaultCtx);
  assert(res1.x === 10 && res1.y === 46, `Subpixel (10.23, 45.78) rounds to nearest integer (10, 46) -> got (${res1.x}, ${res1.y})`);

  const res2 = SnappingEngine.snapPoint({ x: 10.49, y: 20.5 }, defaultCtx);
  assert(res2.x === 10 && res2.y === 21, `Subpixel (10.49, 20.5) rounds to (10, 21) -> got (${res2.x}, ${res2.y})`);

  const resNeg = SnappingEngine.snapPoint({ x: -5.3, y: -10.8 }, defaultCtx);
  assert(resNeg.x === -5 && resNeg.y === -11, `Negative subpixel (-5.3, -10.8) rounds to (-5, -11) -> got (${resNeg.x}, ${resNeg.y})`);

  // Test 3: Half-pixel awareness with odd stroke width (1px)
  const ctxOddStroke: SnappingContext = { ...defaultCtx, strokeWidth: 1 };
  const resOdd = SnappingEngine.snapPoint({ x: 10.2, y: 20.8 }, ctxOddStroke);
  assert(resOdd.x === 10.5 && resOdd.y === 20.5, `Odd stroke 1px snaps to half-pixel coordinates (10.5, 20.5) -> got (${resOdd.x}, ${resOdd.y})`);

  const ctxHalfPixel: SnappingContext = { ...defaultCtx, halfPixel: true };
  const resHalf = SnappingEngine.snapPoint({ x: 30.1, y: 40.9 }, ctxHalfPixel);
  assert(resHalf.x === 30.5 && resHalf.y === 40.5, `halfPixel flag explicitly snaps to (30.5, 40.5) -> got (${resHalf.x}, ${resHalf.y})`);

  // Test 4: Even stroke width (2px) preserves integer pixels
  const ctxEvenStroke: SnappingContext = { ...defaultCtx, strokeWidth: 2 };
  const resEven = SnappingEngine.snapPoint({ x: 10.2, y: 20.8 }, ctxEvenStroke);
  assert(resEven.x === 10 && resEven.y === 21, `Even stroke 2px preserves integer pixel snapping (10, 21) -> got (${resEven.x}, ${resEven.y})`);

  // Test 5: Subpixel continuous mode when snapToPixelGrid is false
  const ctxContinuous: SnappingContext = { ...defaultCtx, snapToPixelGrid: false };
  const resCont = SnappingEngine.snapPoint({ x: 12.37, y: 45.89 }, ctxContinuous);
  assert(resCont.x === 12.37 && resCont.y === 45.89, `snapToPixelGrid = false allows continuous subpixel R^2 space (12.37, 45.89) -> got (${resCont.x}, ${resCont.y})`);

  // Test 6: Higher priority magnetic landmarks take precedence over pixel grid
  const ctxWithNodes: SnappingContext = {
    ...defaultCtx,
    snapToNodes: true,
    snapToVertices: true,
  };
  const targetNode = { x: 25.33, y: 80.67 };
  const resNode = SnappingEngine.snapPoint({ x: 26.0, y: 81.0 }, ctxWithNodes, [targetNode]);
  assert(resNode.x === 25.33 && resNode.y === 80.67, `Vector node anchor (25.33, 80.67) takes precedence over integer pixel grid -> got (${resNode.x}, ${resNode.y})`);
  assert(SnappingEngine.lastSnapResult?.kind === 'node', `Snapping kind recorded as 'node' -> got ${SnappingEngine.lastSnapResult?.kind}`);

  // Test 7: Guide line priority with pixel grid on other axis
  const ctxWithGuide: SnappingContext = {
    ...defaultCtx,
    snapToGuides: true,
    showGuides: true,
    guides: [{ id: 'g1', orientation: 'vertical', position: 50.4, locked: false, visible: true }],
  };
  const resGuide = SnappingEngine.snapPoint({ x: 51.0, y: 20.8 }, ctxWithGuide);
  assert(resGuide.x === 50.4, `Vertical guide at 50.4 takes precedence on X -> got ${resGuide.x}`);
  assert(resGuide.y === 21, `Unsnapped Y snaps to integer pixel grid 21 -> got ${resGuide.y}`);

  console.log('--- Pixel-Perfect Snapping Suite Complete ---\n');
  return true;
}
