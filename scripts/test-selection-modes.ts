import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { TransformInteraction } from '../src/webview/tools/interactions/TransformInteraction.js';
import { PivotManager } from '../src/webview/tools/interactions/PivotManager.js';
import { TranslateInteraction } from '../src/webview/tools/interactions/TranslateInteraction.js';
import { ToolContext } from '../src/webview/tools/IToolHandler.js';
import { SelectToolHandler } from '../src/webview/tools/SelectToolHandler.js';
import { KeyboardShortcutController } from '../src/webview/controllers/KeyboardShortcutController.js';
import { Toolbar } from '../src/webview/ui/Toolbar.js';
import { QuickHelpInspector } from '../src/webview/ui/inspectors/QuickHelpInspector.js';
import { SelectionCursorHelper } from '../src/webview/tools/interactions/SelectionCursorHelper.js';

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

// Minimal DOM mock for Node environment when KeyboardShortcutController attaches listeners
function ensureDomMock() {
  const listeners: Record<string, Function[]> = {};
  const win = (globalThis as any).window || {};
  const oldAdd = win.addEventListener;

  win.addEventListener = (type: string, fn: Function) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(fn);
    if (oldAdd) oldAdd(type, fn);
  };

  win.dispatchEvent = (e: any) => {
    const fns = listeners[e.type] || [];
    fns.forEach((f) => f(e));
  };

  (globalThis as any).window = win;

  if (typeof (globalThis as any).document === 'undefined') {
    (globalThis as any).document = {
      activeElement: null,
      createElement: () => ({
        tagName: 'DIV',
        style: {},
        innerHTML: '',
        children: [],
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
      }),
    };
  }
}

export async function runSelectionModesTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running 3 Modal Selection States & Hotkeys Suite (10.1 & 10.2)');
  console.log('======================================================');

  ensureDomMock();

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

  let overlayRenderedCount = 0;
  const mockCanvasMgr: any = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    selectedGuideId: null,
    activeGuideTransformId: null,
    hitTestGuide: () => null,
    getGuideById: () => null,
    guides: [],
  };
  const mockCtx: ToolContext = {
    model,
    canvasMgr: mockCanvasMgr,
    selectionTool,
    activeTool: 'select',
    snapMgr: { snapPoint: (p: any) => ({ point: p, didSnap: false }) } as any,
    render: () => {},
    renderOverlay: () => { overlayRenderedCount++; },
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
  // 4. CONMUTACIÓN DE MODOS POR TECLADO (10.2: W, R, E)
  // -----------------------------------------------------------------------------------
  let selectionChangedFired = 0;
  const selectHandler = new SelectToolHandler(mockCtx, {} as any, {
    onSelectionChanged: () => { selectionChangedFired++; },
  });

  // 4.1 SelectToolHandler onKeyDown: W -> move
  selectionTool.selectionMode = 'scale';
  const consumedW = selectHandler.onKeyDown({ key: 'w', ctrlKey: false, metaKey: false, altKey: false } as any);
  assert(consumedW === true, 'Hotkeys: SelectToolHandler consumes key "w"');
  assert(selectionTool.selectionMode === 'move', 'Hotkeys: Pressing "w" switches selectionMode to "move"');
  assert(selectionChangedFired === 1, 'Hotkeys: Pressing "w" triggers onSelectionChanged callback');

  // 4.2 SelectToolHandler onKeyDown: R -> scale
  const consumedR = selectHandler.onKeyDown({ key: 'R', ctrlKey: false, metaKey: false, altKey: false } as any);
  assert(consumedR === true, 'Hotkeys: SelectToolHandler consumes key "R"');
  assert(selectionTool.selectionMode === 'scale', 'Hotkeys: Pressing "R" switches selectionMode to "scale"');
  assert(selectionChangedFired === 2, 'Hotkeys: Pressing "R" triggers onSelectionChanged callback');

  // 4.3 SelectToolHandler onKeyDown: E -> rotate
  const consumedE = selectHandler.onKeyDown({ key: 'e', ctrlKey: false, metaKey: false, altKey: false } as any);
  assert(consumedE === true, 'Hotkeys: SelectToolHandler consumes key "e"');
  assert(selectionTool.selectionMode === 'rotate', 'Hotkeys: Pressing "e" switches selectionMode to "rotate"');
  assert(selectionChangedFired === 3, 'Hotkeys: Pressing "e" triggers onSelectionChanged callback');

  // 4.4 KeyboardShortcutController Integration
  let propertyPanelUpdated = 0;
  let activeToolName: any = 'select';
  const mockToolbar: any = {
    get activeTool() { return activeToolName; },
    getActiveTool: () => activeToolName,
    setTool: (t: any) => { activeToolName = t; },
  };

  const keyboardCtrl = new KeyboardShortcutController({
    toolbar: mockToolbar,
    selectionTool,
    canvasMgr: mockCanvasMgr,
    nodeEditorTool: {} as any,
    model,
    propertyPanel: { update: () => { propertyPanelUpdated++; }, resetPanelMode: () => {} } as any,
    clipboardService: {} as any,
    nodeToolHandler: {} as any,
    shapeToolHandler: { shapeStartPt: null, onKeyDown: () => false, onKeyUp: () => false } as any,
    penToolHandler: {} as any,
    polylineToolHandler: {} as any,
    isDragging: () => false,
    activeHandle: () => null,
    copySelection: () => {},
    cutSelection: () => {},
    pasteClipboard: () => {},
    duplicateSelection: () => {},
    handleConvertToCurves: () => {},
    undo: () => {},
    redo: () => {},
    cancelCurrentAction: () => {},
    pushUndo: () => {},
    render: () => {},
    renderOverlay: () => { overlayRenderedCount++; },
    syncToHost: () => {},
    syncMetadataToHost: () => {},
  });

  // Test KeyboardShortcutController dispatch with window keydown event
  // Test W:
  selectionTool.selectionMode = 'scale';
  (globalThis as any).window.dispatchEvent({
    type: 'keydown',
    key: 'w',
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {},
  });
  assert(selectionTool.selectionMode === 'move', 'Keyboard Controller: Dispatched "w" sets mode to "move"');
  assert(propertyPanelUpdated >= 1, 'Keyboard Controller: Dispatched "w" triggers propertyPanel.update()');

  // Test R (when select active): switches mode to scale without switching tool to rect
  (globalThis as any).window.dispatchEvent({
    type: 'keydown',
    key: 'r',
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {},
  });
  assert(selectionTool.selectionMode === 'scale', 'Keyboard Controller: Dispatched "r" sets mode to "scale"');
  assert(mockToolbar.activeTool === 'select', 'Keyboard Controller: Dispatched "r" preserves "select" tool instead of switching to "rect"');

  // Test E (when select active): switches mode to rotate without switching tool to ellipse
  (globalThis as any).window.dispatchEvent({
    type: 'keydown',
    key: 'e',
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {},
  });
  assert(selectionTool.selectionMode === 'rotate', 'Keyboard Controller: Dispatched "e" sets mode to "rotate"');
  assert(mockToolbar.activeTool === 'select', 'Keyboard Controller: Dispatched "e" preserves "select" tool instead of switching to "ellipse"');

  // Test W when another tool was active: activates select tool and sets move mode
  activeToolName = 'pen';
  (globalThis as any).window.dispatchEvent({
    type: 'keydown',
    key: 'w',
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {},
  });
  assert(mockToolbar.activeTool === 'select', 'Keyboard Controller: Pressing "w" in other tool switches active tool to "select"');
  assert(selectionTool.selectionMode === 'move', 'Keyboard Controller: Tool switched via "w" initializes directly into "move" mode');

  // 4.5 QuickHelpInspector Documentation
  const selectHelp = (QuickHelpInspector as any).TOOL_HELP_MAP['select'];
  assert(selectHelp !== undefined, 'QuickHelpInspector contains select tool documentation');
  const hasWHotkey = selectHelp.shortcuts.some((s: any) => s.keys.includes('W') && s.description.includes('Mover'));
  const hasRHotkey = selectHelp.shortcuts.some((s: any) => s.keys.includes('R') && s.description.includes('Escala'));
  const hasEHotkey = selectHelp.shortcuts.some((s: any) => s.keys.includes('E') && s.description.includes('Rotar'));
  const hasMiniHud = selectHelp.shortcuts.some((s: any) => s.keys.includes('Mini-HUD') && s.description.includes('Mover'));
  assert(hasWHotkey, 'QuickHelpInspector documents "W" hotkey for Modo Mover');
  assert(hasRHotkey, 'QuickHelpInspector documents "R" hotkey for Modo Escala');
  assert(hasEHotkey, 'QuickHelpInspector documents "E" hotkey for Modo Rotar');
  assert(hasMiniHud, 'QuickHelpInspector documents "Mini-HUD" floating widget on Bounding Box');

  // -----------------------------------------------------------------------------------
  // 5. Contextual Floating Mini-HUD ([ ✥ Mover | ⤢ Escalar | ⟳ Rotar ]) Suite
  // -----------------------------------------------------------------------------------
  console.log('\n--- 5. Contextual Floating Mini-HUD Tests ---');
  const miniHud = transformInteraction.miniHud;
  const groupBox = selectionTool.getGroupSelectionBoundingBox([rectEl], 0)!;
  assert(groupBox !== null, 'Mini-HUD: Selection bounding box calculated (100x100 at 100,100)');

  // 5.1 Hit Testing on Mini-HUD Segments
  const hudY = groupBox.y - 23; // Default screen offset with zoom 1.0
  const hitMove = miniHud.hitTest(groupBox, { x: groupBox.cx - 68, y: hudY }, 1.0);
  assert(hitMove === 'move', 'Mini-HUD: Hit test at left segment returns "move"');

  const hitScale = miniHud.hitTest(groupBox, { x: groupBox.cx, y: hudY }, 1.0);
  assert(hitScale === 'scale', 'Mini-HUD: Hit test at middle segment returns "scale"');

  const hitRotate = miniHud.hitTest(groupBox, { x: groupBox.cx + 68, y: hudY }, 1.0);
  assert(hitRotate === 'rotate', 'Mini-HUD: Hit test at right segment returns "rotate"');

  const hitOutside = miniHud.hitTest(groupBox, { x: groupBox.cx, y: hudY - 30 }, 1.0);
  assert(hitOutside === null, 'Mini-HUD: Hit test outside boundary returns null');

  // 5.2 Hover Cursor
  const hoverCursorInside = miniHud.getHoverCursor(groupBox, { x: groupBox.cx, y: hudY }, 1.0);
  assert(hoverCursorInside === 'pointer', 'Mini-HUD: Hover cursor returns "pointer" when hovering over HUD');

  const hoverCursorOutside = miniHud.getHoverCursor(groupBox, { x: groupBox.cx, y: hudY - 30 }, 1.0);
  assert(hoverCursorOutside === null, 'Mini-HUD: Hover cursor returns null when outside HUD');

  const transformHoverCursor = transformInteraction.getHoverCursor(mockCtx, { x: groupBox.cx - 68, y: hudY }, [rectEl]);
  assert(transformHoverCursor === 'pointer', 'TransformInteraction.getHoverCursor returns "pointer" for Mini-HUD');

  // 5.3 SVG Overlay Markup
  const hudSvgMove = miniHud.renderOverlay(groupBox, 'move', 1.0);
  assert(hudSvgMove.includes('class="selection-mini-hud"'), 'Mini-HUD SVG: Contains selection-mini-hud class');
  assert(hudSvgMove.includes('✥ Mover'), 'Mini-HUD SVG: Contains "✥ Mover" label');
  assert(hudSvgMove.includes('⤢ Escalar'), 'Mini-HUD SVG: Contains "⤢ Escalar" label');
  assert(hudSvgMove.includes('⟳ Rotar'), 'Mini-HUD SVG: Contains "⟳ Rotar" label');
  assert(hudSvgMove.includes('fill="#10b981"'), 'Mini-HUD SVG: Move mode highlights with emerald hue (#10b981)');

  const hudSvgScale = miniHud.renderOverlay(groupBox, 'scale', 1.0);
  assert(hudSvgScale.includes('fill="#6366f1"'), 'Mini-HUD SVG: Scale mode highlights with indigo hue (#6366f1)');

  const hudSvgRotate = miniHud.renderOverlay(groupBox, 'rotate', 1.0);
  assert(hudSvgRotate.includes('fill="#8b5cf6"'), 'Mini-HUD SVG: Rotate mode highlights with purple hue (#8b5cf6)');

  // 5.4 One-Click Mode Switching via SelectToolHandler
  let hudSelectionChanged = 0;
  const hudCallbacks = {
    onSelectionChanged: () => {
      hudSelectionChanged++;
    },
  };
  const hudSelectHandler = new SelectToolHandler(mockCtx, {} as any, hudCallbacks);

  // Click on "move" segment
  selectionTool.selectionMode = 'scale';
  const handledMoveClick = hudSelectHandler.onPointerDown(
    { button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as any,
    { x: groupBox.cx - 68, y: hudY }
  );
  assert(handledMoveClick === true, 'SelectToolHandler: Pointer down on Move HUD segment consumed event');
  assert(selectionTool.selectionMode === 'move', 'SelectToolHandler: Clicking Move HUD segment switched selectionMode to "move"');
  assert(hudSelectionChanged >= 1, 'SelectToolHandler: Clicking Move HUD segment triggered onSelectionChanged');

  // Click on "rotate" segment
  const handledRotateClick = hudSelectHandler.onPointerDown(
    { button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as any,
    { x: groupBox.cx + 68, y: hudY }
  );
  assert(handledRotateClick === true, 'SelectToolHandler: Pointer down on Rotate HUD segment consumed event');
  assert(selectionTool.selectionMode === 'rotate', 'SelectToolHandler: Clicking Rotate HUD segment switched selectionMode to "rotate"');

  // Click on "scale" segment
  const handledScaleClick = hudSelectHandler.onPointerDown(
    { button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as any,
    { x: groupBox.cx, y: hudY }
  );
  assert(handledScaleClick === true, 'SelectToolHandler: Pointer down on Scale HUD segment consumed event');
  assert(selectionTool.selectionMode === 'scale', 'SelectToolHandler: Clicking Scale HUD segment switched selectionMode to "scale"');

  // -----------------------------------------------------------------------------------
  // 6. Ciclo Cromático Secundario por Clics Pausados y Cursores con Micro-Insignia
  // -----------------------------------------------------------------------------------
  console.log('\n--- 6. Paused Clicks Chromatic Cycle & Distinctive Mode Cursors Tests ---');

  // 6.1 SelectionCursorHelper
  const moveCursor = SelectionCursorHelper.getModeCursor('move');
  const scaleCursor = SelectionCursorHelper.getModeCursor('scale');
  const rotateCursor = SelectionCursorHelper.getModeCursor('rotate');

  assert(moveCursor.includes('%2310b981') && moveCursor.endsWith('move'), 'SelectionCursorHelper: Move cursor contains #10b981 and fallback "move"');
  assert(scaleCursor.includes('%236366f1') && scaleCursor.endsWith('default'), 'SelectionCursorHelper: Scale cursor contains #6366f1 and fallback "default"');
  assert(rotateCursor.includes('%238b5cf6') && rotateCursor.endsWith('grab'), 'SelectionCursorHelper: Rotate cursor contains #8b5cf6 and fallback "grab"');

  // 6.2 Deterministic 3-State Cycle (move -> scale -> rotate -> move)
  let updatedCursor = '';
  const cycleCallbacks: any = {
    setCursor: (c: string) => { updatedCursor = c; },
    onSelectionChanged: () => {},
  };

  selectionTool.selectionMode = 'move';
  transformInteraction.toggleSelectionMode(mockCtx, cycleCallbacks);
  assert(selectionTool.selectionMode === 'scale', 'Chromatic Cycle: toggleSelectionMode from "move" advances to "scale"');
  assert(updatedCursor === scaleCursor, 'Chromatic Cycle: toggleSelectionMode immediately sets scale cursor');

  transformInteraction.toggleSelectionMode(mockCtx, cycleCallbacks);
  assert(selectionTool.selectionMode === 'rotate', 'Chromatic Cycle: toggleSelectionMode from "scale" advances to "rotate"');
  assert(updatedCursor === rotateCursor, 'Chromatic Cycle: toggleSelectionMode immediately sets rotate cursor');

  transformInteraction.toggleSelectionMode(mockCtx, cycleCallbacks);
  assert(selectionTool.selectionMode === 'move', 'Chromatic Cycle: toggleSelectionMode from "rotate" returns to "move"');
  assert(updatedCursor === moveCursor, 'Chromatic Cycle: toggleSelectionMode immediately sets move cursor');

  // 6.3 Hover Cursor over Selected Element reflects Active Mode
  let setHoverCursorVal = '';
  const hoverHandler = new SelectToolHandler(mockCtx, {} as any, {
    setCursor: (c: string) => { setHoverCursorVal = c; },
  });

  selectionTool.selectionMode = 'move';
  hoverHandler.onPointerMove({} as any, { x: 150, y: 150 });
  assert(setHoverCursorVal === moveCursor, 'SelectToolHandler.onPointerMove over selected element in "move" mode returns move cursor');

  selectionTool.selectionMode = 'scale';
  hoverHandler.onPointerMove({} as any, { x: 150, y: 150 });
  assert(setHoverCursorVal === scaleCursor, 'SelectToolHandler.onPointerMove over selected element in "scale" mode returns scale cursor');

  selectionTool.selectionMode = 'rotate';
  hoverHandler.onPointerMove({} as any, { x: 130, y: 130 });
  assert(setHoverCursorVal === rotateCursor, 'SelectToolHandler.onPointerMove over selected element in "rotate" mode returns rotate cursor');

  // 6.4 Paused click on selected element body toggles mode in SelectToolHandler
  selectionTool.selectionMode = 'move';
  (hoverHandler as any).lastClickTime = 0;
  (hoverHandler as any).lastClickUpTime = Date.now() - 500;
  hoverHandler.onPointerDown({ button: 0 } as any, { x: 130, y: 130 });
  hoverHandler.onPointerUp({ button: 0 } as any, { x: 130, y: 130 });
  assert(selectionTool.selectionMode === 'scale', 'Paused click on selected object body advances mode from "move" to "scale"');

  (hoverHandler as any).lastClickTime = 0;
  (hoverHandler as any).lastClickUpTime = Date.now() - 500;
  hoverHandler.onPointerDown({ button: 0 } as any, { x: 130, y: 130 });
  hoverHandler.onPointerUp({ button: 0 } as any, { x: 130, y: 130 });
  assert(selectionTool.selectionMode === 'rotate', 'Second paused click on selected object body advances mode from "scale" to "rotate"');

  (hoverHandler as any).lastClickTime = 0;
  (hoverHandler as any).lastClickUpTime = Date.now() - 500;
  hoverHandler.onPointerDown({ button: 0 } as any, { x: 130, y: 130 });
  hoverHandler.onPointerUp({ button: 0 } as any, { x: 130, y: 130 });
  assert(selectionTool.selectionMode === 'move', 'Third paused click on selected object body advances mode from "rotate" back to "move"');

  // -----------------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------------
  console.log('------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed of ${passed + failed} assertions.`);

  if (failed === 0) {
    console.log('🎉 3 Modal Selection States & Hotkeys passed all tests!\n');
    return true;
  } else {
    console.error('💥 3 Modal Selection States & Hotkeys failed test assertions!\n');
    return false;
  }
}
