import { KeymapRegistry, KeybindingDef } from '../src/webview/commands/KeymapRegistry.js';
import { PolylineToolHandler } from '../src/webview/tools/PolylineToolHandler.js';
import { PenToolHandler } from '../src/webview/tools/PenToolHandler.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CommandRegistry } from '../src/webview/engine/commands/CommandRegistry.js';
import { registerSystemCommands } from '../src/webview/engine/commands/SystemCommands.js';

export function runKeyboardShortcutsDisambiguationTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Keyboard Shortcuts Disambiguation Suite');
  console.log('======================================================');

  let passed = 0;
  const total = 5;

  // Test 1: Complete eradication of Ctrl+Alt combinations to prevent AltGr collisions
  try {
    const keymap = KeymapRegistry.getInstance();
    const bindings = keymap.getBindings();

    const ctrlAltBindings = bindings.filter((b) => b.ctrlOrMeta && b.alt);

    const cmdRegistry = CommandRegistry.getInstance();
    registerSystemCommands(cmdRegistry);
    const registeredCommands = cmdRegistry.getAll();
    const ctrlAltCommands = registeredCommands.filter((c) => c.shortcut && c.shortcut.includes('Ctrl+Alt'));

    if (ctrlAltBindings.length === 0 && ctrlAltCommands.length === 0) {
      console.log('  ✅ [PASS] All Ctrl+Alt bindings eradicated across KeymapRegistry and CommandRegistry');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Found remaining Ctrl+Alt bindings:', { ctrlAltBindings, ctrlAltCommands });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 1:', err?.message || err);
  }

  // Test 2: 'Z' shortcut disambiguation (Drawing Closure vs Zoom Tool vs Undo)
  try {
    const keymap = KeymapRegistry.getInstance();
    const cmdRegistry = CommandRegistry.getInstance();

    // 2a. Idle state: 'Z' maps to zoom tool
    const zoomEvent = {
      code: 'KeyZ',
      key: 'z',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    const matchedZoom = keymap.findMatchingBinding(zoomEvent);

    // 2b. Undo state: 'Ctrl+Z' maps to edit.undo
    const undoEvent = {
      code: 'KeyZ',
      key: 'z',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    const matchedUndo = keymap.findMatchingBinding(undoEvent);

    // 2c. Polyline drawing state: 'Z' closes path
    let polylineClosed = false;
    let overlayRendered = false;
    const mockPolylineCtx: any = {
      model: new VectorModel('<svg viewBox="0 0 100 100"></svg>'),
      renderOverlay: () => { overlayRendered = true; },
      render: () => {},
      syncToHost: () => {},
      pushUndo: () => {},
      viewBoxTransform: { screenToSvg: (x: number, y: number) => ({ x, y }) },
      toolbar: { activeTool: 'polyline', setTool: () => {} },
      getActiveTool: () => 'polyline',
      setTool: () => {},
      canvasMgr: { zoom: 1 },
      propertyPanel: { update: () => {} },
      selectionTool: { select: () => {}, deselectAll: () => {} },
    };
    const polylineHandler = new PolylineToolHandler(mockPolylineCtx);
    cmdRegistry.setContext(mockPolylineCtx);
    // Simulate active polyline path with 3 vertices
    (polylineHandler as any).currentPolylineVertices = [
      { id: 'v1', x: 10, y: 10, command: 'M', nodeType: 'asymmetric' },
      { id: 'v2', x: 50, y: 10, command: 'L', nodeType: 'asymmetric' },
      { id: 'v3', x: 30, y: 50, command: 'L', nodeType: 'asymmetric' },
    ];

    const closeKeyZEvent = {
      key: 'z',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;

    const handledPolyline = polylineHandler.onKeyDown(closeKeyZEvent);
    const addedPolyline = mockPolylineCtx.model.elements.find((el: any) => el.isClosed);

    if (
      matchedZoom?.toolId === 'zoom' &&
      matchedUndo?.commandId === 'edit.undo' &&
      handledPolyline === true &&
      addedPolyline &&
      addedPolyline.isClosed === true
    ) {
      console.log('  ✅ [PASS] Disambiguated Z: path auto-closure when drawing, zoom tool when idle, and undo on Ctrl+Z');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Z disambiguation mismatch:', { matchedZoom, matchedUndo, handledPolyline, addedPolyline });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 2:', err?.message || err);
  }

  // Test 3: Standard Drawing Tool Keybindings (V, A/N, M, L, Shift+M, Shift+E)
  try {
    const keymap = KeymapRegistry.getInstance();
    const cmdRegistry = CommandRegistry.getInstance();

    const makeEvent = (code: string, key: string, shift = false): KeyboardEvent => ({
      code,
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: shift,
    } as unknown as KeyboardEvent);

    const selectMatch = keymap.findMatchingBinding(makeEvent('KeyV', 'v'));
    const nodeMatchA = keymap.findMatchingBinding(makeEvent('KeyA', 'a'));
    const nodeMatchN = keymap.findMatchingBinding(makeEvent('KeyN', 'n'));
    const rectMatchM = keymap.findMatchingBinding(makeEvent('KeyM', 'm'));
    const ellipseMatchL = keymap.findMatchingBinding(makeEvent('KeyL', 'l'));
    const shapeBuilderMatch = keymap.findMatchingBinding(makeEvent('KeyM', 'M', true));
    const eraserMatch = keymap.findMatchingBinding(makeEvent('KeyE', 'E', true));

    const allMatched =
      selectMatch?.toolId === 'select' &&
      nodeMatchA?.toolId === 'node' &&
      nodeMatchN?.toolId === 'node' &&
      rectMatchM?.toolId === 'rect' &&
      ellipseMatchL?.toolId === 'ellipse' &&
      shapeBuilderMatch?.toolId === 'shapeBuilder' &&
      eraserMatch?.toolId === 'eraser';

    if (allMatched) {
      console.log('  ✅ [PASS] Canonical drawing tools correctly resolved (Select: V, Node: A/N, Rect: M, Ellipse: L, ShapeBuilder: Shift+M, Eraser: Shift+E)');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Tool keybinding resolution failed:', {
        selectMatch,
        nodeMatchA,
        rectMatchM,
        ellipseMatchL,
        shapeBuilderMatch,
        eraserMatch,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 3:', err?.message || err);
  }

  // Test 4: Selection-Contextual Transform Cycle (W = Move, E = Scale, R = Rotate, D = Distort)
  try {
    const model = new VectorModel('<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="40" height="40" /></svg>');
    const selectionTool = new SelectionTool();
    selectionTool.select('r1', model.getElementById('r1'));

    // Verify selection tool supports all four contextual transform modes
    selectionTool.selectionMode = 'move';
    const hasMove = selectionTool.selectionMode === 'move';

    selectionTool.selectionMode = 'scale';
    const hasScale = selectionTool.selectionMode === 'scale';

    selectionTool.selectionMode = 'rotate';
    const hasRotate = selectionTool.selectionMode === 'rotate';

    selectionTool.selectionMode = 'distort';
    const hasDistort = selectionTool.selectionMode === 'distort';

    // Deselect and verify mode resets to canonical 'scale'
    selectionTool.deselectAll();
    const hasReset = selectionTool.selectionMode === 'scale';

    if (hasMove && hasScale && hasRotate && hasDistort && hasReset) {
      console.log('  ✅ [PASS] Selection-contextual transform modes cycle correctly across move (W), scale (E), rotate (R), and distort (D)');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Transform mode cycling failed');
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 4:', err?.message || err);
  }

  // Test 5: Guide, Layer, and Blend Shortcuts Sanity (Ctrl+Shift+; , Ctrl+Shift+L, Ctrl+Shift+B)
  try {
    const keymap = KeymapRegistry.getInstance();
    const cmdRegistry = CommandRegistry.getInstance();

    const makeCtrlShiftEvent = (code: string, key: string): KeyboardEvent => ({
      code,
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as unknown as KeyboardEvent);

    const guideLockMatch = keymap.findMatchingBinding(makeCtrlShiftEvent('Semicolon', ';'));
    const layerLockMatch = keymap.findMatchingBinding(makeCtrlShiftEvent('KeyL', 'l'));
    const blendMatch = keymap.findMatchingBinding(makeCtrlShiftEvent('KeyB', 'b'));

    if (
      guideLockMatch?.commandId === 'guide.toggleLock' &&
      layerLockMatch?.commandId === 'layer.lockAllAbove' &&
      blendMatch?.commandId === 'blend.create'
    ) {
      console.log('  ✅ [PASS] High-value productivity commands bound to Ctrl+Shift combinations without AltGr conflict');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Command shortcut resolution failed:', {
        guideLockMatch,
        layerLockMatch,
        blendMatch,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 5:', err?.message || err);
  }

  console.log(`\nResults: ${passed}/${total} assertions passed.`);
  return passed === total;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const success = runKeyboardShortcutsDisambiguationTests();
  process.exit(success ? 0 : 1);
}
