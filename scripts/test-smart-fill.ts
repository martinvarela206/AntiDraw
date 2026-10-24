import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SmartFillEngine } from '../src/webview/engine/boolean/SmartFillEngine.js';
import { BooleanOperations } from '../src/webview/engine/BooleanOperations.js';
import { SmartFillToolHandler } from '../src/webview/tools/SmartFillToolHandler.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { NodeEditorTool } from '../src/webview/engine/NodeEditorTool.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';
import { CanvasInteractionController, CanvasInteractionContext } from '../src/webview/controllers/CanvasInteractionController.js';
import { Session } from '../src/webview/engine/session/Session.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

export async function runSmartFillTests(): Promise<boolean> {
  console.log('\n--- Running Smart Fill Engine & Tool Suite ---');
  const model = new VectorModel();

  // =========================================================================
  // TEST SUITE 1: Rectangle cut by a diagonal line
  // =========================================================================
  {
    const rectVerts = model.convertShapeToVertices('rect', {
      x: '0',
      y: '0',
      width: '100',
      height: '100',
    });
    const rectEl: VectorElement = {
      id: 'rect_1',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'rect_1', x: '0', y: '0', width: '100', height: '100', fill: 'none', stroke: '#000' },
      vertices: rectVerts,
      isClosed: true,
    };

    const diagVerts = model.convertShapeToVertices('line', {
      x1: '0',
      y1: '0',
      x2: '100',
      y2: '100',
    });
    const diagEl: VectorElement = {
      id: 'diag_1',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'diag_1', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none', stroke: '#000' },
      vertices: diagVerts,
      isClosed: false,
    };

    const regions = SmartFillEngine.detectAllRegions([rectEl, diagEl], model);
    assert(regions.length === 2, `Rectangle cut by diagonal forms exactly 2 bounded regions (got ${regions.length})`);
    if (regions.length === 2) {
      assert(Math.abs(regions[0].area - 5000) < 50, `Region 1 area is approx 5000 (got ${regions[0].area.toFixed(1)})`);
      assert(Math.abs(regions[1].area - 5000) < 50, `Region 2 area is approx 5000 (got ${regions[1].area.toFixed(1)})`);
    }

    // Hit test upper triangle (20, 10)
    const upperFill = SmartFillEngine.fillRegionAtPoint({ x: 20, y: 10 }, [rectEl, diagEl], model, {
      fillColor: '#ef4444',
    });
    assert(upperFill !== null, 'Click at (20, 10) fills upper triangle');
    assert(upperFill?.tagName === 'path', 'Synthesized element is pure <path>');
    assert(upperFill?.attributes.fill === '#ef4444', 'Synthesized element adopted custom fillColor #ef4444');
    assert(upperFill?.isClosed === true, 'Synthesized element is topologically closed');

    // Hit test lower triangle (10, 20)
    const lowerFill = SmartFillEngine.fillRegionAtPoint({ x: 10, y: 20 }, [rectEl, diagEl], model, {
      fillColor: '#3b82f6',
    });
    assert(lowerFill !== null, 'Click at (10, 20) fills lower triangle');
    assert(lowerFill?.attributes.fill === '#3b82f6', 'Synthesized element adopted custom fillColor #3b82f6');
    assert(lowerFill?.id !== upperFill?.id, 'Each smart fill creates a uniquely identified element');

    // Click outside should return null
    const outsideFill = SmartFillEngine.fillRegionAtPoint({ x: 200, y: 200 }, [rectEl, diagEl], model);
    assert(outsideFill === null, 'Click outside boundaries returns null');
  }

  // =========================================================================
  // TEST SUITE 2: Two overlapping rectangles
  // =========================================================================
  {
    const r1Verts = model.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const r2Verts = model.convertShapeToVertices('rect', { x: '50', y: '0', width: '100', height: '100' });

    const r1: VectorElement = {
      id: 'r1',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'r1', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: r1Verts,
      isClosed: true,
    };
    const r2: VectorElement = {
      id: 'r2',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'r2', x: '50', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: r2Verts,
      isClosed: true,
    };

    const regions = BooleanOperations.detectClosedRegions([r1, r2], model);
    assert(regions.length === 3, `Two overlapping rectangles yield 3 distinct regions (got ${regions.length})`);

    // Center overlap [50 to 100]
    const centerFill = BooleanOperations.smartFill({ x: 75, y: 50 }, [r1, r2], model);
    assert(centerFill !== null, 'Click in overlap region (75, 50) returns filled vector');
    assert(centerFill?.attributes['fill-rule'] === 'evenodd', 'Fill rule is evenodd');

    // Left region [0 to 50]
    const leftFill = BooleanOperations.smartFill({ x: 25, y: 50 }, [r1, r2], model);
    assert(leftFill !== null, 'Click in left non-overlapping region (25, 50) returns filled vector');

    // Right region [100 to 150]
    const rightFill = BooleanOperations.smartFill({ x: 125, y: 50 }, [r1, r2], model);
    assert(rightFill !== null, 'Click in right non-overlapping region (125, 50) returns filled vector');
  }

  // =========================================================================
  // TEST SUITE 3: 4 Intersecting open lines forming a hashtag (# grid)
  // =========================================================================
  {
    const makeLine = (id: string, x1: number, y1: number, x2: number, y2: number): VectorElement => ({
      id,
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id, x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), stroke: '#000' },
      vertices: [
        { id: `${id}_v1`, x: x1, y: y1, command: 'M', nodeType: 'sharp' },
        { id: `${id}_v2`, x: x2, y: y2, command: 'L', nodeType: 'sharp' },
      ],
      isClosed: false,
    });

    const h1 = makeLine('h1', 0, 30, 120, 30);
    const h2 = makeLine('h2', 0, 70, 120, 70);
    const v1 = makeLine('v1', 30, 0, 30, 120);
    const v2 = makeLine('v2', 70, 0, 70, 120);

    const regions = SmartFillEngine.detectAllRegions([h1, h2, v1, v2], model);
    assert(regions.length === 1, `4 hashtag lines form exactly 1 bounded central cell (got ${regions.length})`);
    if (regions.length === 1) {
      assert(Math.abs(regions[0].area - 1600) < 20, `Central cell area is 40x40 = 1600 (got ${regions[0].area.toFixed(1)})`);
    }

    const cellFill = SmartFillEngine.fillRegionAtPoint({ x: 50, y: 50 }, [h1, h2, v1, v2], model);
    assert(cellFill !== null, 'Click inside hashtag grid (50, 50) synthesizes filled cell');
    assert(cellFill?.vertices?.length === 4, `Synthesized square cell has 4 vertices (got ${cellFill?.vertices?.length})`);

    // Click outside in the dangles
    const dangleFill = SmartFillEngine.fillRegionAtPoint({ x: 10, y: 10 }, [h1, h2, v1, v2], model);
    assert(dangleFill === null, 'Click in open quadrant outside hashtag returns null');
  }

  // =========================================================================
  // TEST SUITE 4: Two overlapping circles (Venn diagram)
  // =========================================================================
  {
    const c1Verts = model.convertShapeToVertices('circle', { cx: '100', cy: '100', r: '40' });
    const c2Verts = model.convertShapeToVertices('circle', { cx: '140', cy: '100', r: '40' });

    const c1: VectorElement = {
      id: 'c1',
      tagName: 'circle',
      shapeType: 'circle',
      isParametric: true,
      attributes: { id: 'c1', cx: '100', cy: '100', r: '40', fill: 'none' },
      vertices: c1Verts,
      isClosed: true,
    };
    const c2: VectorElement = {
      id: 'c2',
      tagName: 'circle',
      shapeType: 'circle',
      isParametric: true,
      attributes: { id: 'c2', cx: '140', cy: '100', r: '40', fill: 'none' },
      vertices: c2Verts,
      isClosed: true,
    };

    const regions = SmartFillEngine.detectAllRegions([c1, c2], model);
    assert(regions.length === 3, `Two intersecting circles produce 3 bounded regions (got ${regions.length})`);

    // Center lens
    const lensFill = SmartFillEngine.fillRegionAtPoint({ x: 120, y: 100 }, [c1, c2], model);
    assert(lensFill !== null, 'Click in intersection lens (120, 100) returns filled vector');

    // Left crescent
    const leftCrescent = SmartFillEngine.fillRegionAtPoint({ x: 80, y: 100 }, [c1, c2], model);
    assert(leftCrescent !== null, 'Click in left crescent (80, 100) returns filled vector');

    // Right crescent
    const rightCrescent = SmartFillEngine.fillRegionAtPoint({ x: 160, y: 100 }, [c1, c2], model);
    assert(rightCrescent !== null, 'Click in right crescent (160, 100) returns filled vector');
  }

  // =========================================================================
  // TEST SUITE 5: SmartFillToolHandler Interaction & Undo Lifecycle
  // =========================================================================
  {
    const testModel = new VectorModel();
    const selectionTool = new SelectionTool();
    const canvasMgr = new CanvasManager();

    let undoPushed = 0;
    let rendered = 0;
    let synced = 0;
    let currentCursor = '';

    const toolCtx: ToolContext = {
      model: testModel,
      selectionTool,
      canvasMgr,
      pushUndo: () => { undoPushed++; },
      syncToHost: () => { synced++; },
      render: () => { rendered++; },
      renderOverlay: () => {},
      snapPoint: (pt) => pt,
      getOtherVertices: () => [],
      setTool: () => {},
      getActiveTool: () => 'smartFill',
      confirm: async () => true,
    };

    const handler = new SmartFillToolHandler(toolCtx, {
      setCursor: (c) => { currentCursor = c; },
    });

    // Populate model with a 100x100 rect and diagonal line
    const rVerts = testModel.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const dVerts = testModel.convertShapeToVertices('line', { x1: '0', y1: '0', x2: '100', y2: '100' });
    testModel.elements.push({
      id: 'el_rect',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'el_rect', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: rVerts,
      isClosed: true,
    });
    testModel.elements.push({
      id: 'el_diag',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'el_diag', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none' },
      vertices: dVerts,
      isClosed: false,
    });

    assert(testModel.elements.length === 2, 'Initial model contains 2 source elements');

    // 1. Activate
    handler.activate();
    assert(currentCursor === 'crosshair', 'Cursor set to crosshair on activate');

    // 2. Click on upper triangle: down at (20, 10), up at (20, 10)
    const mockDownEvt = { button: 0 } as PointerEvent;
    const downConsumed = handler.onPointerDown(mockDownEvt, { x: 20, y: 10 });
    assert(downConsumed === true, 'onPointerDown consumed by smartFill handler');

    const mockUpEvt = { button: 0 } as PointerEvent;
    const upConsumed = handler.onPointerUp(mockUpEvt, { x: 20, y: 10 });
    assert(upConsumed === true, 'onPointerUp consumed and filled upper triangle');

    assert(testModel.elements.length === 3, `New element added to model (total 3 elements, got ${testModel.elements.length})`);
    assert(undoPushed === 1, 'pushUndo called exactly once');
    assert(rendered === 1, 'render called exactly once');
    assert(synced === 1, 'syncToHost called exactly once');

    const createdEl = testModel.elements[2];
    assert(createdEl.id.startsWith('smart_fill_'), `Synthesized element carries smart_fill prefix (${createdEl.id})`);
    assert(selectionTool.selectedElementIds.has(createdEl.id), 'Synthesized element was automatically selected');

    // Source elements must remain intact
    assert(testModel.elements[0].id === 'el_rect', 'Source rect remains unmutated at index 0');
    assert(testModel.elements[1].id === 'el_diag', 'Source diagonal remains unmutated at index 1');

    // 3. Drag gesture rejection (distance > 6px)
    handler.onPointerDown(mockDownEvt, { x: 10, y: 20 });
    const dragUpConsumed = handler.onPointerUp(mockUpEvt, { x: 50, y: 60 });
    assert(dragUpConsumed === false, 'Pointer release after a long drag is rejected');
    assert(testModel.elements.length === 3, 'No element added during drag rejection');

    // 4. Deactivate
    handler.deactivate();
    assert(currentCursor === '', 'Cursor cleared on deactivate');
  }

  // =========================================================================
  // TEST SUITE 6: Hover Overlay Preview & Real-Time Tracking
  // =========================================================================
  {
    const testModel = new VectorModel();
    const selectionTool = new SelectionTool();
    const canvasMgr = new CanvasManager();
    let overlayRendered = 0;

    const toolCtx: ToolContext = {
      model: testModel,
      selectionTool,
      canvasMgr,
      pushUndo: () => {},
      syncToHost: () => {},
      render: () => {},
      renderOverlay: () => { overlayRendered++; },
      snapPoint: (pt) => pt,
      getOtherVertices: () => [],
      setTool: () => {},
      getActiveTool: () => 'smartFill',
      confirm: async () => true,
    };

    const handler = new SmartFillToolHandler(toolCtx);

    const rVerts = testModel.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const dVerts = testModel.convertShapeToVertices('line', { x1: '0', y1: '0', x2: '100', y2: '100' });
    testModel.elements.push({
      id: 'el_rect2',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'el_rect2', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: rVerts,
      isClosed: true,
    });
    testModel.elements.push({
      id: 'el_diag2',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'el_diag2', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none' },
      vertices: dVerts,
      isClosed: false,
    });

    handler.activate();
    const mockMoveEvt = { button: 0 } as PointerEvent;

    // Hover over upper triangle (20, 10)
    handler.onPointerMove(mockMoveEvt, { x: 20, y: 10 });
    assert(handler.hoverRegionD !== null, 'onPointerMove generates non-null hoverRegionD over enclosed region');
    assert(overlayRendered > 0, 'renderOverlay was invoked on hover region change');

    const descriptors = handler.renderOverlay(1);
    assert(descriptors.length === 1, 'renderOverlay returns 1 descriptor');
    assert(descriptors[0].type === 'path', 'Overlay descriptor is path type');
    assert(descriptors[0].id === 'smart-fill-preview', 'Overlay descriptor carries smart-fill-preview id');
    assert(descriptors[0].vectorEffect === 'non-scaling-stroke', 'Overlay path uses non-scaling-stroke');

    // Move to empty space outside (300, 300)
    const prevRendered = overlayRendered;
    handler.onPointerMove(mockMoveEvt, { x: 300, y: 300 });
    assert(handler.hoverRegionD === null, 'onPointerMove outside clears hoverRegionD to null');
    assert(overlayRendered > prevRendered, 'renderOverlay was invoked to clear overlay');
    assert(handler.renderOverlay(1).length === 0, 'renderOverlay returns empty array outside');

    // Hover back and cancel
    handler.onPointerMove(mockMoveEvt, { x: 20, y: 10 });
    assert(handler.hoverRegionD !== null, 'hoverRegionD restored on re-entering upper triangle');
    const cancelled = handler.cancel();
    assert(cancelled === true, 'cancel() returns true when active preview exists');
    assert(handler.hoverRegionD === null, 'cancel() clears hoverRegionD');
  }

  // =========================================================================
  // TEST SUITE 7: CanvasInteractionController Event Routing for smartFill
  // =========================================================================
  {
    const ctrlModel = new VectorModel();
    const ctrlSelection = new SelectionTool();
    const ctrlNodeEditor = new NodeEditorTool();
    const ctrlCanvasMgr = new CanvasManager();

    const rVerts = ctrlModel.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const dVerts = ctrlModel.convertShapeToVertices('line', { x1: '0', y1: '0', x2: '100', y2: '100' });
    ctrlModel.elements.push({
      id: 'r_ctrl',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'r_ctrl', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: rVerts,
      isClosed: true,
    });
    ctrlModel.elements.push({
      id: 'd_ctrl',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'd_ctrl', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none' },
      vertices: dVerts,
      isClosed: false,
    });

    let currentCursor = '';
    let renderedCount = 0;
    let overlayCount = 0;
    let undoCount = 0;

    const mockToolCtx: ToolContext = {
      model: ctrlModel,
      selectionTool: ctrlSelection,
      canvasMgr: ctrlCanvasMgr,
      pushUndo: () => { undoCount++; },
      syncToHost: () => {},
      render: () => { renderedCount++; },
      renderOverlay: () => { overlayCount++; },
      snapPoint: (pt) => pt,
      getOtherVertices: () => [],
      setTool: () => {},
      getActiveTool: () => 'smartFill',
      confirm: async () => true,
    };

    const smartFillHandler = new SmartFillToolHandler(mockToolCtx, {
      setCursor: (c) => { currentCursor = c; },
    });

    const mockSession = new Session(
      {
        select: { cancel: () => false, deactivate: () => {} } as any,
        shape: { cancel: () => false, shapeStartPt: null } as any,
        polyline: { cancel: () => false, deactivate: () => {} } as any,
        pen: { cancel: () => false, deactivate: () => {}, isDragging: false } as any,
        node: { cancel: () => false, deactivate: () => {}, isDragging: false } as any,
        smartFill: smartFillHandler,
      },
      {
        onRender: () => { renderedCount++; },
        onRenderOverlay: () => { overlayCount++; },
        setCursor: (c) => { currentCursor = c; },
      }
    );

    let activeTool = 'smartFill';
    const mockToolbar = {
      get activeTool() { return activeTool; },
      setTool: (t: string) => { activeTool = t; },
    };

    const mockCanvasView = {
      cancelRaf: () => {},
      releasePointerCapture: () => {},
      setPointerCapture: () => {},
      setCursor: (c: string) => { currentCursor = c; },
    };

    const interactionCtx: CanvasInteractionContext = {
      model: ctrlModel,
      selectionTool: ctrlSelection,
      nodeEditorTool: ctrlNodeEditor,
      canvasMgr: ctrlCanvasMgr,
      tools: {
        toolCtx: mockToolCtx,
        selectToolHandler: {} as any,
        shapeToolHandler: {} as any,
        polylineToolHandler: {} as any,
        penToolHandler: {} as any,
        nodeToolHandler: {} as any,
        smartFillToolHandler: smartFillHandler,
        shapeBuilderToolHandler: {} as any,
        eraserToolHandler: {} as any,
        scissorKnifeToolHandler: {} as any,
        session: mockSession,
      },
      getViewportCtrl: () => undefined,
      getRulerView: () => undefined,
      getToolbar: () => mockToolbar as any,
      getPropertyPanel: () => undefined,
      getCanvasView: () => mockCanvasView as any,
      getContextMenu: () => undefined,
      render: () => { renderedCount++; },
      renderOverlay: () => { overlayCount++; },
      applyCanvasSize: () => {},
      syncRulerScroll: () => {},
      syncMetadataToHost: () => {},
      pushUndo: () => { undoCount++; },
    };

    const controller = new CanvasInteractionController(interactionCtx);

    // 1. Move over upper triangle
    const evtMove = { button: 0 } as PointerEvent;
    controller.onPointerMove(evtMove, { x: 20, y: 10 });
    assert(currentCursor === 'crosshair', 'CanvasInteractionController sets cursor to crosshair for smartFill');
    assert(smartFillHandler.hoverRegionD !== null, 'Controller routes pointermove to smartFillHandler');

    // 2. Down over upper triangle
    const evtDown = { button: 0, pointerId: 1 } as PointerEvent;
    controller.onPointerDown(evtDown, { x: 20, y: 10 });
    assert(smartFillHandler.lastDownPt !== null, 'Controller routes pointerdown to smartFillHandler');

    // 3. Up over upper triangle -> creates filled vector
    const evtUp = { button: 0, pointerId: 1 } as PointerEvent;
    controller.onPointerUp(evtUp, { x: 20, y: 10 });
    assert(ctrlModel.elements.length === 3, 'Controller routes pointerup to smartFillHandler producing new element');
    assert(undoCount === 1, 'pushUndo recorded once during controller interaction');
  }

  // =========================================================================
  // TEST SUITE 8: Mode 2 - Shift + Click Step-by-Step Additive Fusion
  // =========================================================================
  {
    const mode2Model = new VectorModel();
    const selectionTool = new SelectionTool();
    const canvasMgr = new CanvasManager();
    let undoCount = 0;

    const toolCtx: ToolContext = {
      model: mode2Model,
      selectionTool,
      canvasMgr,
      pushUndo: () => { undoCount++; },
      syncToHost: () => {},
      render: () => {},
      renderOverlay: () => {},
      snapPoint: (pt) => pt,
      getOtherVertices: () => [],
      setTool: () => {},
      getActiveTool: () => 'smartFill',
      confirm: async () => true,
    };

    const handler = new SmartFillToolHandler(toolCtx);
    const rVerts = mode2Model.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const dVerts = mode2Model.convertShapeToVertices('line', { x1: '0', y1: '0', x2: '100', y2: '100' });
    mode2Model.elements.push({
      id: 'r_src',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'r_src', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: rVerts,
      isClosed: true,
    });
    mode2Model.elements.push({
      id: 'd_src',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'd_src', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none' },
      vertices: dVerts,
      isClosed: false,
    });

    handler.activate();

    // Step 1: Normal Click on Upper Triangle (Mode 1)
    const evtDown1 = { button: 0, shiftKey: false } as PointerEvent;
    const evtUp1 = { button: 0, shiftKey: false } as PointerEvent;
    handler.onPointerDown(evtDown1, { x: 20, y: 10 });
    handler.onPointerUp(evtUp1, { x: 20, y: 10 });
    assert(mode2Model.elements.length === 3, 'Step 1 creates first piece (total 3 elements)');
    assert(undoCount === 1, 'First piece recorded undo step 1');
    const firstPieceId = mode2Model.elements[2].id;
    assert(handler.lastActiveElementId === firstPieceId, 'First piece registered as active element');

    // Step 2: Shift + Click on Adjacent Lower Triangle (Mode 2)
    const evtDown2 = { button: 0, shiftKey: true } as PointerEvent;
    const evtUp2 = { button: 0, shiftKey: true } as PointerEvent;
    handler.onPointerDown(evtDown2, { x: 10, y: 20 });
    handler.onPointerUp(evtUp2, { x: 10, y: 20 });

    assert(mode2Model.elements.length === 3, 'Shift+Click welded adjacent region in-place (total elements remains 3)');
    assert(undoCount === 2, 'Shift+Click recorded separate undo step 2 for granular undo capability');
    const unifiedElement = mode2Model.elements[2];
    assert(unifiedElement.id.startsWith('union_') || unifiedElement.id.startsWith('smart_fill_'), 'Result is unified shape');
    const mCount = (unifiedElement.attributes.d.match(/M/g) || []).length;
    assert(mCount === 1, 'Unified element forms a single outer continuous contour without internal seams');
  }

  // =========================================================================
  // TEST SUITE 9: Mode 3 - Drag Sweep Continuous Gesture (Shape Builder)
  // =========================================================================
  {
    const sweepModel = new VectorModel();
    const selectionTool = new SelectionTool();
    const canvasMgr = new CanvasManager();
    let undoCount = 0;

    const toolCtx: ToolContext = {
      model: sweepModel,
      selectionTool,
      canvasMgr,
      pushUndo: () => { undoCount++; },
      syncToHost: () => {},
      render: () => {},
      renderOverlay: () => {},
      snapPoint: (pt) => pt,
      getOtherVertices: () => [],
      setTool: () => {},
      getActiveTool: () => 'smartFill',
      confirm: async () => true,
    };

    const handler = new SmartFillToolHandler(toolCtx);
    const rVerts = sweepModel.convertShapeToVertices('rect', { x: '0', y: '0', width: '100', height: '100' });
    const dVerts = sweepModel.convertShapeToVertices('line', { x1: '0', y1: '0', x2: '100', y2: '100' });
    sweepModel.elements.push({
      id: 'r_swp',
      tagName: 'rect',
      shapeType: 'rect',
      isParametric: true,
      attributes: { id: 'r_swp', x: '0', y: '0', width: '100', height: '100', fill: 'none' },
      vertices: rVerts,
      isClosed: true,
    });
    sweepModel.elements.push({
      id: 'd_swp',
      tagName: 'line',
      shapeType: 'line',
      isParametric: true,
      attributes: { id: 'd_swp', x1: '0', y1: '0', x2: '100', y2: '100', fill: 'none' },
      vertices: dVerts,
      isClosed: false,
    });

    handler.activate();

    // 1. Pointer Down in upper triangle (20, 10)
    handler.onPointerDown({ button: 0 } as PointerEvent, { x: 20, y: 10 });
    assert(handler.sweptRegions.size === 1, 'Drag sweep initializes with region under pointerdown');

    // 2. Pointer Move (drag) crossing diagonal into lower triangle (10, 20)
    handler.onPointerMove({ button: 0, buttons: 1 } as PointerEvent, { x: 10, y: 20 });
    assert(handler.isSweeping === true, 'Handler enters isSweeping mode upon displacement');
    assert(handler.sweptRegions.size === 2, 'Sweep accumulated both adjacent regions (got 2)');
    assert(handler.hoverRegionD !== null, 'Multi-region combined preview overlay generated');

    // 3. Pointer Up
    handler.onPointerUp({ button: 0 } as PointerEvent, { x: 10, y: 20 });
    assert(sweepModel.elements.length === 3, 'Sweep release welded all accumulated regions into 1 unified element');
    assert(undoCount === 1, 'Drag sweep committed in a single atomic undo step');
    const sweepResult = sweepModel.elements[2];
    const mCount = (sweepResult.attributes.d.match(/M/g) || []).length;
    assert(mCount === 1, 'Sweep union dissolved common diagonal seam into single continuous boundary');
    assert(handler.sweptRegions.size === 0, 'Swept regions cleared after release');
  }

  // =========================================================================
  // TEST SUITE 10: Common Segment Elimination in Boolean Union
  // =========================================================================
  {
    const piece1Verts: any[] = [
      { id: 'p1_0', x: 0, y: 0, command: 'M', nodeType: 'sharp' },
      { id: 'p1_1', x: 50, y: 0, command: 'L', nodeType: 'sharp' },
      { id: 'p1_2', x: 50, y: 50, command: 'L', nodeType: 'sharp' },
      { id: 'p1_3', x: 0, y: 50, command: 'L', nodeType: 'sharp' },
    ];
    const piece1: VectorElement = {
      id: 'piece_1',
      tagName: 'path',
      shapeType: 'path',
      attributes: { id: 'piece_1', d: 'M 0 0 L 50 0 L 50 50 L 0 50 Z', fill: '#6366f1' },
      vertices: piece1Verts,
      isClosed: true,
    };

    const piece2Verts: any[] = [
      { id: 'p2_0', x: 50, y: 0, command: 'M', nodeType: 'sharp' },
      { id: 'p2_1', x: 100, y: 0, command: 'L', nodeType: 'sharp' },
      { id: 'p2_2', x: 100, y: 50, command: 'L', nodeType: 'sharp' },
      { id: 'p2_3', x: 50, y: 50, command: 'L', nodeType: 'sharp' },
    ];
    const piece2: VectorElement = {
      id: 'piece_2',
      tagName: 'path',
      shapeType: 'path',
      attributes: { id: 'piece_2', d: 'M 50 0 L 100 0 L 100 50 L 50 50 Z', fill: '#6366f1' },
      vertices: piece2Verts,
      isClosed: true,
    };

    const testModel = new VectorModel();
    const united = BooleanOperations.union([piece1, piece2], testModel);
    assert(united !== null, 'Contiguous pieces with shared edge union successfully');
    const mCount = (united!.attributes.d.match(/M/g) || []).length;
    assert(mCount === 1, 'United contiguous pieces produce exactly 1 outer contour without internal seam');
  }

  console.log(`\nSmart Fill Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
