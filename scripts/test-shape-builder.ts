import { SegmentTrimEngine } from '../src/webview/engine/boolean/SegmentTrimEngine.js';
import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { ShapeBuilderToolHandler } from '../src/webview/tools/ShapeBuilderToolHandler.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runShapeBuilderTests(): Promise<boolean> {
  console.log('\n--- Running Shape Builder (Segment Trim & Topological Welding) Suite ---');

  const model = new VectorModel();

  // --------------------------------------------------------------------------
  // Suite 1: Canonical Hashtag # Test -> Closed Square Polygon
  // --------------------------------------------------------------------------
  console.log('\n[1. Canonical Hashtag # Test -> 4 Crossing Lines to 1 Closed Square]');
  // 4 lines intersecting at (30,30), (70,30), (70,70), (30,70)
  const l1: VectorElement = {
    id: 'l1',
    tagName: 'line',
    attributes: { x1: '0', y1: '30', x2: '100', y2: '30', stroke: '#ff0000', 'stroke-width': '2' },
  };
  const l2: VectorElement = {
    id: 'l2',
    tagName: 'line',
    attributes: { x1: '0', y1: '70', x2: '100', y2: '70', stroke: '#ff0000', 'stroke-width': '2' },
  };
  const l3: VectorElement = {
    id: 'l3',
    tagName: 'line',
    attributes: { x1: '30', y1: '0', x2: '30', y2: '100', stroke: '#00ff00', 'stroke-width': '2' },
  };
  const l4: VectorElement = {
    id: 'l4',
    tagName: 'line',
    attributes: { x1: '70', y1: '0', x2: '70', y2: '100', stroke: '#00ff00', 'stroke-width': '2' },
  };

  const hashtagElements = [l1, l2, l3, l4];
  const subSegs = SegmentTrimEngine.extractSubSegments(hashtagElements, model);

  assert(subSegs.length === 12, `Hashtag must produce exactly 12 sub-segments (3 per line), got ${subSegs.length}`);

  // Identify inner vs outer subsegments
  // Inner segments are strictly within bounds [30, 70] in both X and Y
  const innerSegs = subSegs.filter((s) => {
    const minX = Math.min(s.p1.x, s.p2.x);
    const maxX = Math.max(s.p1.x, s.p2.x);
    const minY = Math.min(s.p1.y, s.p2.y);
    const maxY = Math.max(s.p1.y, s.p2.y);
    return minX >= 29.9 && maxX <= 70.1 && minY >= 29.9 && maxY <= 70.1;
  });

  const outerSegs = subSegs.filter((s) => !innerSegs.some((inS) => inS.id === s.id));

  assert(innerSegs.length === 4, `There must be exactly 4 inner sub-segments forming the square, got ${innerSegs.length}`);
  assert(outerSegs.length === 8, `There must be exactly 8 outer protruding sub-segments, got ${outerSegs.length}`);

  // Delete all 8 outer subsegments
  const deletedOuterIds = new Set(outerSegs.map((s) => s.id));
  const weldedSquare = SegmentTrimEngine.trimAndWeld(subSegs, deletedOuterIds, hashtagElements);

  assert(weldedSquare.length === 1, `Trimming 8 outer branches must synthesize exactly 1 welded closed polygon, got ${weldedSquare.length}`);

  const square = weldedSquare[0];
  assert(square.tagName === 'path', `Synthesized element must be a <path>, got <${square.tagName}>`);
  assert(square.attributes?.d?.includes('Z'), `Synthesized polygon must be closed with 'Z': ${square.attributes?.d}`);
  assert(square.vertices !== undefined && square.vertices.length === 4, `Synthesized square must have 4 vertices, got ${square.vertices?.length}`);

  // Check the 4 corner coordinates (30,30), (70,30), (70,70), (30,70)
  const pts = square.vertices!.map((v) => `(${Math.round(v.x)},${Math.round(v.y)})`).sort();
  assert(pts.includes('(30,30)'), `Square contains corner (30,30)`);
  assert(pts.includes('(70,30)'), `Square contains corner (70,30)`);
  assert(pts.includes('(70,70)'), `Square contains corner (70,70)`);
  assert(pts.includes('(30,70)'), `Square contains corner (30,70)`);

  // --------------------------------------------------------------------------
  // Suite 2: Junctions with 3 or More Incident Sub-Strokes (k >= 3 Rule)
  // --------------------------------------------------------------------------
  console.log('\n[2. Valence Rule: k >= 3 Junctions must NOT be automatically combined]');
  // T-junction: 1 horizontal line and 1 vertical line meeting at (50, 50)
  // Horizontal: from (0, 50) to (100, 50) -> 2 sub-segments: (0,50)-(50,50) and (50,50)-(100,50)
  // Vertical: from (50, 0) to (50, 50) -> 1 sub-segment: (50,0)-(50,50)
  // At (50, 50), exactly 3 sub-segments meet (k = 3)!
  const tHoriz: VectorElement = {
    id: 'th',
    tagName: 'line',
    attributes: { x1: '0', y1: '50', x2: '100', y2: '50' },
  };
  const tVert: VectorElement = {
    id: 'tv',
    tagName: 'line',
    attributes: { x1: '50', y1: '0', x2: '50', y2: '50' },
  };

  const tElements = [tHoriz, tVert];
  const tSubSegs = SegmentTrimEngine.extractSubSegments(tElements, model);
  assert(tSubSegs.length === 3, `T-junction produces 3 sub-segments meeting at (50,50), got ${tSubSegs.length}`);

  // No sub-segments deleted; all 3 remain. Node (50, 50) has degree k = 3.
  const weldedT = SegmentTrimEngine.trimAndWeld(tSubSegs, new Set(), tElements);

  // According to specification: "Si en algun caso quedaran 3 o mas subtrazos coincidentes en un nodo, estos no debe combinarse de forma automatica."
  // The 3 sub-segments must NOT be combined into a single continuous path; they remain distinct!
  assert(weldedT.length === 3, `3 sub-segments meeting at k=3 junction must NOT be combined automatically (expected 3 elements, got ${weldedT.length})`);

  // --------------------------------------------------------------------------
  // Suite 3: Hit-Testing Sub-Segments Under Cursor
  // --------------------------------------------------------------------------
  console.log('\n[3. Spatial Hit-Testing on Sub-Segments]');
  const hit1 = SegmentTrimEngine.findSubSegmentAtPoint({ x: 15, y: 30 }, subSegs, 5);
  assert(hit1 !== null, `Hit test at (15, 30) detects sub-segment on l1`);
  assert(hit1?.sourceElementId === 'l1', `Hit sub-segment belongs to l1`);

  const hitNone = SegmentTrimEngine.findSubSegmentAtPoint({ x: 50, y: 50 }, subSegs, 5);
  assert(hitNone === null, `Hit test at center (50, 50) where no stroke exists returns null`);

  // --------------------------------------------------------------------------
  // Suite 4: ShapeBuilderToolHandler Interactive Event Delegation
  // --------------------------------------------------------------------------
  console.log('\n[4. ShapeBuilderToolHandler Pointer and Overlay Workflow]');
  const canvasMgr = new CanvasManager();
  const selectionTool = new SelectionTool();
  model.elements = [...hashtagElements];

  let undoPushed = false;
  let hostSynced = false;
  let overlayRendered = false;

  const mockToolCtx = {
    model,
    selectionTool,
    canvasMgr,
    pushUndo: () => { undoPushed = true; },
    syncToHost: () => { hostSynced = true; },
    render: () => {},
    renderOverlay: () => { overlayRendered = true; },
    snapPoint: (pt: any) => pt,
    getOtherVertices: () => [],
    setTool: () => {},
    getActiveTool: () => 'shapeBuilder' as any,
    confirm: async () => true,
  };

  const handler = new ShapeBuilderToolHandler(mockToolCtx as any);
  handler.activate();
  assert(handler.cachedSubSegments.length === 12, `Handler pre-caches 12 sub-segments on activation`);

  // Hover over outer branch
  const fakeMoveEvt = { button: 0 } as any;
  const moveRes = handler.onPointerMove(fakeMoveEvt, { x: 15, y: 30 });
  assert(moveRes === true, `Pointer move over sub-segment returns true`);
  assert(handler.hoveredSubSeg !== null, `hoveredSubSeg is populated`);
  assert(overlayRendered === true, `renderOverlay was invoked on hover`);

  // Overlay HTML check
  const overlayHtml = handler.renderOverlay(1.0);
  assert(overlayHtml.includes('shape-builder-overlay'), `Overlay renders SVG markup with shape-builder-overlay`);
  assert(overlayHtml.includes('#f43f5e') || overlayHtml.includes('#ef4444'), `Overlay renders high-visibility crimson highlight`);

  // Drag over first outer branch and release
  const fakeDownEvt = { button: 0 } as any;
  handler.onPointerDown(fakeDownEvt, { x: 15, y: 30 });
  assert(handler.isDragging === true, `Handler starts drag on down`);
  assert(handler.sweptSubSegIds.size === 1, `Swept segment registered`);

  const fakeUpEvt = { button: 0 } as any;
  handler.onPointerUp(fakeUpEvt, { x: 15, y: 30 });

  assert(undoPushed === true, `pushUndo was called on pointerUp`);
  assert(hostSynced === true, `syncToHost was called on pointerUp`);
  assert(handler.isDragging === false, `Drag ended on pointerUp`);
  assert(model.elements.length > 0, `Model elements updated after trim`);

  console.log('\nShape Builder (Segment Trim & Topological Welding) Suite complete: ALL PASSED.');
  return true;
}
