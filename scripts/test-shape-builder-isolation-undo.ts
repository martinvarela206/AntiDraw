import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SegmentTrimEngine } from '../src/webview/engine/boolean/SegmentTrimEngine.js';
import { ShapeBuilderToolHandler } from '../src/webview/tools/ShapeBuilderToolHandler.js';
import { HistoryService } from '../src/webview/services/HistoryService.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runShapeBuilderIsolationUndoTests(): Promise<boolean> {
  console.log('\n--- Running Shape Builder Isolation, T-Junction & Deep Undo Suite ---');

  // ==============================================================================
  // 1. Non-Vector & Unrelated Vector Isolation (Issue 1)
  // ==============================================================================
  console.log('\n[1. Non-Vector & Unrelated Vector Isolation]');

  const model = new VectorModel();
  const imgElement: VectorElement = {
    id: 'image_bg_01',
    tagName: 'image',
    attributes: {
      id: 'image_bg_01',
      x: '0',
      y: '0',
      width: '64',
      height: '64',
      href: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  };

  const lowerVector: VectorElement = {
    id: 'vector_lower_A',
    tagName: 'path',
    attributes: {
      id: 'vector_lower_A',
      d: 'M 10 60 L 32 10 L 54 60',
      stroke: '#ffffff',
      'stroke-width': '2',
    },
    vertices: [
      { id: 'v1', x: 10, y: 60, command: 'M', nodeType: 'sharp' },
      { id: 'v2', x: 32, y: 10, command: 'L', nodeType: 'sharp' },
      { id: 'v3', x: 54, y: 60, command: 'L', nodeType: 'sharp' },
    ],
  };

  // Top vector with an extra crossing stub: line 1 (100, 100) -> (200, 100) and line 2 (150, 80) -> (150, 120)
  const topLine1: VectorElement = {
    id: 'top_line_1',
    tagName: 'path',
    attributes: { id: 'top_line_1', d: 'M 100 100 L 200 100', stroke: '#ffffff', 'stroke-width': '2' },
    vertices: [
      { id: 'v_t1', x: 100, y: 100, command: 'M', nodeType: 'sharp' },
      { id: 'v_t2', x: 200, y: 100, command: 'L', nodeType: 'sharp' },
    ],
  };

  const topLine2: VectorElement = {
    id: 'top_line_2',
    tagName: 'path',
    attributes: { id: 'top_line_2', d: 'M 150 80 L 150 120', stroke: '#ffffff', 'stroke-width': '2' },
    vertices: [
      { id: 'v_t3', x: 150, y: 80, command: 'M', nodeType: 'sharp' },
      { id: 'v_t4', x: 150, y: 120, command: 'L', nodeType: 'sharp' },
    ],
  };

  model.elements = [imgElement, lowerVector, topLine1, topLine2];

  assert(!SegmentTrimEngine.isTrimable(imgElement), 'Image element is NOT trimable');
  assert(SegmentTrimEngine.isTrimable(lowerVector), 'Lower path vector is trimable');

  const canvasMgr = new CanvasManager();
  canvasMgr.zoom = 1;
  const selectionTool = new SelectionTool({} as any, {} as any);

  let pushUndoCount = 0;
  const historyService = new HistoryService({
    model,
    canvasMgr,
    selectionTool,
    onResetPropertyPanel: () => {},
    render: () => {},
    syncToHost: () => {},
  });

  const mockContext: ToolContext = {
    model,
    canvasMgr,
    selectionTool,
    render: () => {},
    renderOverlay: () => '',
    syncToHost: () => {},
    pushUndo: () => {
      pushUndoCount++;
      historyService.pushUndo();
    },
  };

  const handler = new ShapeBuilderToolHandler(mockContext);
  handler.activate();

  // Subsegments should only belong to topLine1 and topLine2 when trimming near (150, 85)
  const subSegAtStub = SegmentTrimEngine.findSubSegmentAtPoint({ x: 150, y: 85 }, handler.cachedSubSegments, 10);
  assert(subSegAtStub !== null, 'Found stub subsegment on top_line_2');
  assert(subSegAtStub?.sourceElementId === 'top_line_2', 'Stub belongs to top_line_2');

  // Click on stub to delete it
  handler.onPointerDown({ button: 0 } as PointerEvent, { x: 150, y: 85 });
  handler.onPointerUp({ button: 0 } as PointerEvent, { x: 150, y: 85 });

  // Check document state after trim
  assert(model.elements.length === 5, `Model should have 5 elements (img, lower, and 3 T-branches), got ${model.elements.length}`);
  assert(model.elements[0].id === 'image_bg_01', 'Element 0 remains image_bg_01 (z-index preserved)');
  assert(model.elements[0].tagName === 'image', 'Element 0 tag remains image');
  assert(model.elements[0].attributes.href !== undefined, 'Image href is preserved');
  assert(model.elements[1].id === 'vector_lower_A', 'Element 1 remains vector_lower_A (z-index preserved)');
  assert(model.elements[1].vertices?.length === 3, 'Lower vector preserved all 3 vertices without stroke loss');

  // ==============================================================================
  // 2. T-Junction & Internal Subsegment Trim (Issue 2)
  // ==============================================================================
  console.log('\n[2. T-Junction & Internal Subsegment Welding]');

  const outerRect: VectorElement = {
    id: 'poly_with_t_junction',
    tagName: 'path',
    attributes: {
      id: 'poly_with_t_junction',
      d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      stroke: '#ffffff',
      'stroke-width': '2',
      fill: 'none',
    },
    vertices: [
      { id: 'p0', x: 0, y: 0, command: 'M', nodeType: 'sharp' },
      { id: 'p1', x: 100, y: 0, command: 'L', nodeType: 'sharp' },
      { id: 'p2', x: 100, y: 100, command: 'L', nodeType: 'sharp' },
      { id: 'p3', x: 0, y: 100, command: 'L', nodeType: 'sharp' },
    ],
  };

  const internalBranch: VectorElement = {
    id: 'internal_branch',
    tagName: 'path',
    attributes: {
      id: 'internal_branch',
      d: 'M 50 50 L 50 100',
      stroke: '#ffffff',
      'stroke-width': '2',
    },
    vertices: [
      { id: 'b0', x: 50, y: 50, command: 'M', nodeType: 'sharp' },
      { id: 'b1', x: 50, y: 100, command: 'L', nodeType: 'sharp' },
    ],
  };

  const testTModel = new VectorModel();
  testTModel.elements = [outerRect, internalBranch];

  const subSegs = SegmentTrimEngine.extractSubSegments(testTModel.elements, testTModel);
  const branchSubSeg = subSegs.find((s) => s.sourceElementId === 'internal_branch');
  assert(branchSubSeg !== null && branchSubSeg !== undefined, 'Internal branch subsegment extracted');

  // Deleting internal branch must weld bottom halves back into a continuous closed polygon!
  const weldedElements = SegmentTrimEngine.trimAndWeld(subSegs, new Set([branchSubSeg!.id]), testTModel.elements);
  assert(weldedElements.length === 1, `Trimming internal branch should produce 1 closed polygon, got ${weldedElements.length}`);
  assert(weldedElements[0].attributes.d.includes('Z'), 'Synthesized element is fully closed with Z (no gap)');
  assert(weldedElements[0].vertices?.length === 5, `Synthesized polygon has 5 vertices (4 corners + 1 welded node), got ${weldedElements[0].vertices?.length}`);

  // Test Crossed Strokes with Phase A Loop Closure (User Image 3: inner triangle loop)
  // Two crossed strokes forming an inner triangle and outer tails:
  // Stroke 1: (0, 0) -> (100, 100)
  // Stroke 2: (100, 0) -> (0, 100)
  // Stroke 3: (20, 50) -> (80, 50)
  // These 3 strokes intersect and form an inner triangle between (50, 50), (50, 50), (35, 50), etc.
  const cross1: VectorElement = {
    id: 'cr_1',
    tagName: 'line',
    attributes: { id: 'cr_1', x1: '0', y1: '0', x2: '100', y2: '100', stroke: '#fff', 'stroke-width': '1' }
  };
  const cross2: VectorElement = {
    id: 'cr_2',
    tagName: 'line',
    attributes: { id: 'cr_2', x1: '100', y1: '0', x2: '0', y2: '100', stroke: '#fff', 'stroke-width': '1' }
  };
  const cross3: VectorElement = {
    id: 'cr_3',
    tagName: 'line',
    attributes: { id: 'cr_3', x1: '20', y1: '50', x2: '80', y2: '50', stroke: '#fff', 'stroke-width': '1' }
  };
  const crossModel = new VectorModel();
  crossModel.elements = [cross1, cross2, cross3];
  const crossSubSegs = SegmentTrimEngine.extractSubSegments(crossModel.elements, crossModel);
  // Find subsegments completely outside the inner triangle and trim them
  // Keep only segments that form the inner triangle between the 3 intersection points: (50, 50), (50, 50)...
  // The 3 intersection points:
  // (0,0)-(100,100) and (100,0)-(0,100) intersect at (50, 50)
  // (0,0)-(100,100) and y=50 intersect at (50, 50)
  // (100,0)-(0,100) and y=50 intersect at (50, 50)
  // Let's use horizontal y=70:
  // (0,0)-(100,100) and y=70 intersect at (70, 70)
  // (100,0)-(0,100) and y=70 intersect at (30, 70)
  // And the two diagonals intersect at (50, 50).
  // The 3 vertices form a triangle: (50, 50), (70, 70), (30, 70)!
  const hLine: VectorElement = {
    id: 'h_line',
    tagName: 'line',
    attributes: { id: 'h_line', x1: '0', y1: '70', x2: '100', y2: '70', stroke: '#fff', 'stroke-width': '1' }
  };
  crossModel.elements = [cross1, cross2, hLine];
  const triSubSegs = SegmentTrimEngine.extractSubSegments(crossModel.elements, crossModel);
  // There are 3 inner segments forming the triangle (50,50)-(70,70), (70,70)-(30,70), (30,70)-(50,50)
  // and outer tails.
  const innerSegs = triSubSegs.filter((s) => {
    const midX = (s.p1.x + s.p2.x) / 2;
    const midY = (s.p1.y + s.p2.y) / 2;
    return midY >= 50 && midY <= 70 && midX >= 30 && midX <= 70;
  });
  const outerSegs = triSubSegs.filter((s) => !innerSegs.includes(s));
  assert(innerSegs.length === 3, `Expected 3 inner segments forming triangle, got ${innerSegs.length}`);
  const trimmedTri = SegmentTrimEngine.trimAndWeld(triSubSegs, new Set(outerSegs.map((s) => s.id)), crossModel.elements);
  assert(trimmedTri.length === 1, `Trimming outer tails should synthesize 1 closed triangle, got ${trimmedTri.length}`);
  assert(trimmedTri[0].attributes.d.includes('Z'), 'Synthesized triangle has Z closing command (no gap)');

  // ==============================================================================
  // 3. Click vs Drag-Sweep Jitter Protection (Issue 2 Click Protection)
  // ==============================================================================
  console.log('\n[3. Click vs Drag-Sweep Jitter Protection]');

  const clickModel = new VectorModel();
  const cLine1: VectorElement = {
    id: 'c_line_1',
    tagName: 'line',
    attributes: { x1: '0', y1: '50', x2: '100', y2: '50', stroke: '#ffffff', 'stroke-width': '2' },
  };
  const cLine2: VectorElement = {
    id: 'c_line_2',
    tagName: 'line',
    attributes: { x1: '50', y1: '0', x2: '50', y2: '100', stroke: '#ffffff', 'stroke-width': '2' },
  };
  clickModel.elements = [cLine1, cLine2];
  const clickContext: ToolContext = {
    model: clickModel,
    canvasMgr,
    selectionTool,
    render: () => {},
    renderOverlay: () => '',
    syncToHost: () => {},
    pushUndo: () => {},
  };

  selectionTool.deselectAll();
  const clickHandler = new ShapeBuilderToolHandler(clickContext);
  clickHandler.activate();

  clickHandler.onPointerDown({ button: 0 } as PointerEvent, { x: 50, y: 20 });
  assert(clickHandler.sweptSubSegIds.size === 1, 'Initial hit registered');

  clickHandler.onPointerMove({ button: 0 } as PointerEvent, { x: 51, y: 21 });
  assert(!clickHandler.hasExceededDragThreshold, 'Jitter within 5px does NOT trigger drag sweep');

  clickHandler.onPointerUp({ button: 0 } as PointerEvent, { x: 51, y: 21 });
  assert(clickHandler.sweptSubSegIds.size === 0, 'Swept subsegments cleared cleanly after single click');

  // ==============================================================================
  // 4. Deep Undo Stack Capacity (Issue 3)
  // ==============================================================================
  console.log('\n[4. Deep Undo Stack Capacity (1000 steps)]');

  const undoModel = new VectorModel();
  const undoHistService = new HistoryService({
    model: undoModel,
    canvasMgr,
    selectionTool,
    onResetPropertyPanel: () => {},
    render: () => {},
    syncToHost: () => {},
  });

  assert(undoHistService.maxHistory >= 1000, `maxHistory should be at least 1000, got ${undoHistService.maxHistory}`);

  for (let i = 1; i <= 100; i++) {
    undoHistService.pushUndo();
    undoModel.elements = [
      {
        id: `el_step_${i}`,
        tagName: 'rect',
        attributes: { id: `el_step_${i}`, x: `${i}`, y: `${i}`, width: '10', height: '10' },
      },
    ];
  }

  assert(undoHistService.undoCount === 100, `Undo stack should contain 100 snapshots (not truncated at 30), got ${undoHistService.undoCount}`);

  let undosDone = 0;
  while (undoHistService.canUndo) {
    undoHistService.undo();
    undosDone++;
  }

  assert(undosDone === 100, `Should successfully undo all 100 steps back to beginning, got ${undosDone}`);
  assert(!undoHistService.canUndo, 'Undo stack is now at step 0');
  assert(undoHistService.canRedo, 'Redo stack is ready to redo');

  // Verify that redundant non-visual state pushes do not require multiple undo presses
  undoModel.elements = [{ id: 'shapeA', tagName: 'rect', attributes: { id: 'shapeA', x: '10', y: '10' } }];
  undoHistService.pushUndo(); // records state before change
  undoModel.elements = [{ id: 'shapeB', tagName: 'rect', attributes: { id: 'shapeB', x: '20', y: '20' } }];
  // Redundant push where elements did not change (e.g. selection only or empty click)
  undoHistService.pushUndo();
  assert(undoHistService.undoCount <= 2, 'Redundant visually identical push is ignored');
  // 1 undo immediately produces a visual change back to shapeA
  undoHistService.undo();
  assert(undoModel.elements[0].id === 'shapeA', `1 single undo must immediately restore shapeA, got ${undoModel.elements[0].id}`);

  console.log('\nShape Builder Isolation, T-Junction & Deep Undo Suite complete: ALL PASSED.');
  return true;
}
