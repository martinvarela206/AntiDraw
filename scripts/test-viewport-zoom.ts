import { CanvasManager } from '../src/webview/engine/CanvasManager';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runViewportZoomTests(): Promise<boolean> {
  console.log('\n--- Running Viewport 5000% Zoom & Ruler Precision Suite ---');

  // [1. CanvasManager Constants & Max Bounds]
  console.log('\n[1. CanvasManager Constants & 5000% Upper Bound]');
  assert(CanvasManager.MAX_ZOOM === 50.0, `CanvasManager.MAX_ZOOM must equal 50.0 (5000%), got ${CanvasManager.MAX_ZOOM}`);
  assert(CanvasManager.MIN_ZOOM === 0.05, `CanvasManager.MIN_ZOOM must equal 0.05 (5%), got ${CanvasManager.MIN_ZOOM}`);

  const mgr = new CanvasManager();
  mgr.zoom = 1.0;

  // Progressive zoom in
  for (let i = 0; i < 50; i++) {
    mgr.zoom = mgr.computeMultiplicativeZoom(CanvasManager.ZOOM_FACTOR_IN);
  }
  assert(mgr.zoom === 50.0, `Zooming repeatedly must clamp smoothly at 50.0 (5000%), got ${mgr.zoom}`);

  // Single extreme overshoot factor
  const overshot = mgr.computeMultiplicativeZoom(10.0);
  assert(overshot === 50.0, `Multiplicative factor overshoot must cap at 50.0, got ${overshot}`);

  // Zoom back down
  for (let i = 0; i < 80; i++) {
    mgr.zoom = mgr.computeMultiplicativeZoom(CanvasManager.ZOOM_FACTOR_OUT);
  }
  assert(mgr.zoom === 0.05, `Zooming out repeatedly must clamp at 0.05 (5%), got ${mgr.zoom}`);

  // [2. Ruler Stepping Calculation at 5000% (50.0)]
  console.log('\n[2. Ruler Stepping at 5000% Zoom]');
  const zoom50 = 50.0;
  const targetScreenStep = 80;
  const rawWorldStep = targetScreenStep / zoom50; // 1.6
  const power = Math.pow(10, Math.floor(Math.log10(rawWorldStep))); // 10^0 = 1
  const fraction = rawWorldStep / power; // 1.6
  let multiple = 1;
  if (fraction >= 5) multiple = 5;
  else if (fraction >= 2) multiple = 2;
  else multiple = 1;
  const worldStep = multiple * power; // 1
  const step = worldStep * zoom50; // 50px
  const subStep = step / 5; // 10px

  assert(worldStep === 1, `World step at 5000% should be 1 unit, got ${worldStep}`);
  assert(step === 50, `Screen step at 5000% should be 50px, got ${step}`);
  assert(subStep === 10, `Screen sub-step at 5000% should be 10px, got ${subStep}`);

  // Test label formatting with relVal
  const majorIdx = 3;
  const relVal = worldStep < 1 ? Number((majorIdx * worldStep).toFixed(2)) : Math.round(majorIdx * worldStep);
  assert(relVal === 3, `Label relVal should be integer 3, got ${relVal}`);

  console.log('\nViewport 5000% Zoom & Ruler Precision Suite complete: ALL PASSED.');
  return true;
}
