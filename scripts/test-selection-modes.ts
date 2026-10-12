import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { TransformInteraction } from '../src/webview/tools/interactions/TransformInteraction.js';
import { PivotManager } from '../src/webview/tools/interactions/PivotManager.js';
import { TranslateInteraction } from '../src/webview/tools/interactions/TranslateInteraction.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

export async function runSelectionModesTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running 3 Modal Selection States Suite (10.1)');
  console.log('======================================================');

  // Setup sample model with a rectangle
  const model = new VectorModel();
  const rectEl: VectorElement = {
    id: 'rect-1',
    type: 'path',
    vertices: [
      { id: 'v1', x: 100, y: 100 },
      { id: 'v2', x: 200, y: 100 },
      { id: 'v3', x: 200, y: 200 },
      { id: 'v4', x: 100, y: 200 },
    ],
    attributes: { fill: '#3b82f6', stroke: '#1d4ed8' },
  };
  model.elements.push(rectEl);

  const selectionTool = new SelectionTool();
  selectionTool.select(rectEl.id, rectEl);

  const transformInteraction = new TransformInteraction();
  const pivotManager = new PivotManager();
  const translateInteraction = new TranslateInteraction();

  const mockCanvasMgr: any = { zoom: 1.0, panX: 0, panY: 0 };
  const mockCtx: ToolContext = {
    model,
    canvasMgr: mockCanvasMgr,
    selectionTool,
    activeTool: 'select',
    snapMgr: { snapPoint: (p: any) => ({ point: p, didSnap: false }) } as any,
    render: () => {},
    renderOverlay: () => {},
    syncToHost: () => {},
    pushUndo: () => {},
    confirm: async () => true,
  } as any;

  const box = selectionTool.getGroupSelectionBoundingBox([rectEl], 0)!;
  assert(box !== null && box.width === 100 && box.height === 100, 'Calculated bounding box for rect-1 correctly (100x100)');

  // -----------------------------------------------------------------------------------
  // 1. MODO MOVER PURO ('move')
  // -----------------------------------------------------------------------------------
  selectionTool.selectionMode = 'move';

  // 1.1 Hit Testing: Should return null for scale handles (no grab target collision)
  const nwHitMove = HitTestService.hitTestHandle(box, { x: 100, y: 100 }, 12, 18, 'move');
  const seHitMove = HitTestService.hitTestHandle(box, { x: 200, y: 200 }, 12, 18, 'move');
  const eHitMove = HitTestService.hitTestHandle(box, { x: 200, y: 150 }, 12, 18, 'move');
  assert(nwHitMove === null, 'Move Mode: Hit testing NW corner returns null (no scale handles)');
  assert(seHitMove === null, 'Move Mode: Hit testing SE corner returns null');
  assert(eHitMove === null, 'Move Mode: Hit testing E midpoint returns null');

  // 1.2 Hover cursor: no scale cursors
  const hoverCursorMove = transformInteraction.getHoverCursor(mockCtx, { x: 100, y: 100 }, [rectEl]);
  assert(hoverCursorMove === null, 'Move Mode: Hovering corner does not trigger scale resize cursor');

  // 1.3 Magnetic Snapping Anchor Detection
  const anchorResult = translateInteraction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 102, y: 101 }, box, 1.0);
  assert(anchorResult.isPickedNode === true, 'Move Mode: Snapping detects closest vertex v1 as magnetic anchor');
  assert(anchorResult.point.x === 100 && anchorResult.point.y === 100, 'Move Mode: Magnetic anchor coordinates snap exactly to (100, 100)');

  // 1.4 Center Landmark Snap Detection
  const centerResult = translateInteraction.findClosestMoveAnchor(mockCtx, [rectEl], { x: 151, y: 149 }, box, 1.0);
  assert(centerResult.isPickedNode === true, 'Move Mode: Clicking near center detects geometric center landmark');
  assert(centerResult.point.x === 150 && centerResult.point.y === 150, 'Move Mode: Center landmark snaps exactly to (150, 150)');

  // 1.5 Overlay Rendering
  const moveOverlay = transformInteraction.renderOverlay(mockCtx, 1.0, null, null);
  assert(moveOverlay.includes('stroke="#10b981"'), 'Move Mode: Bounding box rendered with emerald hue (#10b981)');
  assert(moveOverlay.includes('move-anchor-snap-target'), 'Move Mode: Anchor vertices rendered with magnetic snap targets');
  assert(moveOverlay.includes('move-center-snap-reticle'), 'Move Mode: Center geometric reticle rendered with emerald crosshairs');
  assert(!moveOverlay.includes('rotate-corner-handle'), 'Move Mode: Does not render rotate handles');
  assert(!moveOverlay.includes('selection-pivot-marker'), 'Move Mode: Does not render movable rotation pivot');

  // -----------------------------------------------------------------------------------
  // 2. MODO ESCALA ('scale')
  // -----------------------------------------------------------------------------------
  selectionTool.selectionMode = 'scale';

  // 2.1 Hit Testing: 8 classic scale handles active
  const nwHitScale = HitTestService.hitTestHandle(box, { x: 100, y: 100 }, 12, 18, 'scale');
  const seHitScale = HitTestService.hitTestHandle(box, { x: 200, y: 200 }, 12, 18, 'scale');
  const nHitScale = HitTestService.hitTestHandle(box, { x: 150, y: 100 }, 12, 18, 'scale');
  const eHitScale = HitTestService.hitTestHandle(box, { x: 200, y: 150 }, 12, 18, 'scale');
  assert(nwHitScale === 'nw', 'Scale Mode: Hit testing NW corner detects nw scale handle');
  assert(seHitScale === 'se', 'Scale Mode: Hit testing SE corner detects se scale handle');
  assert(nHitScale === 'n', 'Scale Mode: Hit testing N midpoint detects n scale handle');
  assert(eHitScale === 'e', 'Scale Mode: Hit testing E midpoint detects e scale handle');

  // 2.2 Hover cursor
  const hoverCursorScaleNW = transformInteraction.getHoverCursor(mockCtx, { x: 100, y: 100 }, [rectEl]);
  const hoverCursorScaleE = transformInteraction.getHoverCursor(mockCtx, { x: 200, y: 150 }, [rectEl]);
  assert(hoverCursorScaleNW === 'nwse-resize', 'Scale Mode: Hovering NW corner returns nwse-resize cursor');
  assert(hoverCursorScaleE === 'ew-resize', 'Scale Mode: Hovering E midpoint returns ew-resize cursor');

  // 2.3 Overlay Rendering
  const scaleOverlay = transformInteraction.renderOverlay(mockCtx, 1.0, null, null);
  assert(scaleOverlay.includes('stroke="#6366f1"'), 'Scale Mode: Bounding box and handles rendered with indigo hue (#6366f1)');
  assert(scaleOverlay.includes('width="7" height="7"'), 'Scale Mode: Renders 8 classic 7px square scale handles');
  assert(!scaleOverlay.includes('move-anchor-snap-target'), 'Scale Mode: Does not render move magnetic targets');
  assert(!scaleOverlay.includes('rotate-corner-handle'), 'Scale Mode: Does not render rotate handles');
  assert(!scaleOverlay.includes('selection-pivot-marker'), 'Scale Mode: Does not render movable rotation pivot');

  // -----------------------------------------------------------------------------------
  // 3. MODO ROTACIÓN Y SESGO ('rotate')
  // -----------------------------------------------------------------------------------
  selectionTool.selectionMode = 'rotate';

  // 3.1 Hit Testing: 4 rotation corners + 4 midpoint skew handles + pivot
  const nwHitRotate = HitTestService.hitTestHandle(box, { x: 100, y: 100 }, 12, 18, 'rotate');
  const seHitRotate = HitTestService.hitTestHandle(box, { x: 200, y: 200 }, 12, 18, 'rotate');
  const nHitSkew = HitTestService.hitTestHandle(box, { x: 150, y: 100 }, 12, 18, 'rotate');
  const wHitSkew = HitTestService.hitTestHandle(box, { x: 100, y: 150 }, 12, 18, 'rotate');
  const pivotHit = selectionTool.hitTestPivot(box, { x: 150, y: 150 }, 8);

  assert(nwHitRotate === 'rotate', 'Rotate Mode: Hit testing NW corner detects rotate handle');
  assert(seHitRotate === 'rotate', 'Rotate Mode: Hit testing SE corner detects rotate handle');
  assert(nHitSkew === 'skew-n', 'Rotate Mode: Hit testing N midpoint detects skew-n handle');
  assert(wHitSkew === 'skew-w', 'Rotate Mode: Hit testing W midpoint detects skew-w handle');
  assert(pivotHit === true, 'Rotate Mode: Hit testing pivot detects center rotation axis');

  // 3.2 Hover cursor
  const hoverCursorRot = transformInteraction.getHoverCursor(mockCtx, { x: 100, y: 100 }, [rectEl]);
  const hoverCursorPivot = transformInteraction.getHoverCursor(mockCtx, { x: 150, y: 150 }, [rectEl]);
  assert(hoverCursorRot === 'grab', 'Rotate Mode: Hovering corner handle returns grab cursor');
  assert(hoverCursorPivot === 'move', 'Rotate Mode: Hovering rotation pivot returns move cursor');

  // 3.3 Overlay Rendering
  const rotateOverlay = transformInteraction.renderOverlay(mockCtx, 1.0, null, null);
  assert(rotateOverlay.includes('stroke="#8b5cf6"'), 'Rotate Mode: Bounding box rendered with purple hue (#8b5cf6)');
  assert(rotateOverlay.includes('rotate-corner-handle'), 'Rotate Mode: Renders 4 curved circular rotation handles');
  assert(rotateOverlay.includes('rotate-skew-handle'), 'Rotate Mode: Renders 4 bidirectional midpoint skew handles');
  assert(rotateOverlay.includes('selection-pivot-marker'), 'Rotate Mode: Renders movable rotation pivot optical reticle');
  assert(!rotateOverlay.includes('move-anchor-snap-target'), 'Rotate Mode: Does not render move magnetic targets');

  // -----------------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------------
  console.log('------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed of ${passed + failed} assertions.`);

  if (failed === 0) {
    console.log('🎉 3 Modal Selection States passed all tests!\n');
    return true;
  } else {
    console.error('💥 3 Modal Selection States failed test assertions!\n');
    return false;
  }
}
