import { strict as assert } from 'assert';
import { KeymapRegistry, KeybindingDef } from '../src/webview/commands/KeymapRegistry.js';
import { CommandRegistry } from '../src/webview/engine/commands/CommandRegistry.js';
import { KeyboardShortcutController, KeyboardControllerContext } from '../src/webview/controllers/KeyboardShortcutController.js';

export async function runInternationalKeymapTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running International Keymap & Centralized Shortcuts Suite');
  console.log('======================================================');

  let passed = 0;
  async function test(desc: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}:`, err);
      throw err;
    }
  }

  function mockKeyEvent(overrides: Partial<KeyboardEvent> & { modifierState?: Record<string, boolean> }): KeyboardEvent {
    const { modifierState, ...rest } = overrides;
    return {
      type: 'keydown',
      code: '',
      key: '',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: () => {},
      stopPropagation: () => {},
      getModifierState: (mod: string) => !!(modifierState && modifierState[mod]),
      ...rest,
    } as any;
  }

  const keymap = KeymapRegistry.getInstance();

  await test('Normalizes Windows/Linux Ctrl and macOS Meta (Cmd) uniformly', () => {
    const winCtrl = mockKeyEvent({ ctrlKey: true });
    const macCmd = mockKeyEvent({ metaKey: true });
    const neither = mockKeyEvent({});

    assert.equal(KeymapRegistry.isCtrlOrMeta(winCtrl), true, 'Windows Ctrl should match');
    assert.equal(KeymapRegistry.isCtrlOrMeta(macCmd), true, 'macOS Cmd (Meta) should match');
    assert.equal(KeymapRegistry.isCtrlOrMeta(neither), false, 'Normal key should not match');
  });

  await test('Matches dual-resolution keybindings by physical code (event.code) and semantic key (event.key)', () => {
    // US QWERTY: code = 'KeyV', key = 'v'
    const usSelect = mockKeyEvent({ code: 'KeyV', key: 'v' });
    const match1 = keymap.findMatchingBinding(usSelect);
    assert.ok(match1);
    assert.equal(match1?.toolId, 'select');

    // AZERTY: pressing 'A' produces key = 'a' with code = 'KeyQ'
    const azertyNode = mockKeyEvent({ code: 'KeyQ', key: 'a' });
    const match2 = keymap.findMatchingBinding(azertyNode);
    assert.ok(match2);
    assert.equal(match2?.toolId, 'node', 'Should match Node tool via semantic key');

    // Physical position match: user with non-Latin or custom keyboard pressing physical KeyA
    const physicalKeyA = mockKeyEvent({ code: 'KeyA', key: 'ф' });
    const match3 = keymap.findMatchingBinding(physicalKeyA);
    assert.ok(match3);
    assert.equal(match3?.toolId, 'node', 'Should match Node tool via physical code KeyA');
  });

  await test('macOS Cmd+Z dispatches edit.undo via isCtrlOrMeta', () => {
    const macUndo = mockKeyEvent({ metaKey: true, code: 'KeyZ', key: 'z' });
    const match = keymap.findMatchingBinding(macUndo);
    assert.ok(match);
    assert.equal(match?.commandId, 'edit.undo');

    const macRedo = mockKeyEvent({ metaKey: true, shiftKey: true, code: 'KeyZ', key: 'Z' });
    const matchRedo = keymap.findMatchingBinding(macRedo);
    assert.ok(matchRedo);
    assert.equal(matchRedo?.commandId, 'edit.redo');
  });

  await test('AltGr on Spanish/European layouts strictly suppresses false-positive Ctrl+Alt collisions', () => {
    // In Windows Spanish layout, pressing AltGr + [ generates ctrlKey: true, altKey: true, and AltGraph modifier
    const spanishAltGrBracket = mockKeyEvent({
      ctrlKey: true,
      altKey: true,
      code: 'BracketLeft',
      key: '[',
      modifierState: { AltGraph: true },
    });

    const match = keymap.findMatchingBinding(spanishAltGrBracket);
    assert.equal(match, undefined, 'AltGr text symbol should NOT trigger any command');

    // Genuine Ctrl + Alt + L (without AltGraph) should trigger layer.lockAllAbove
    const genuineCtrlAltL = mockKeyEvent({
      ctrlKey: true,
      altKey: true,
      code: 'KeyL',
      key: 'l',
      modifierState: { AltGraph: false },
    });

    const genuineMatch = keymap.findMatchingBinding(genuineCtrlAltL);
    assert.ok(genuineMatch);
    assert.equal(genuineMatch?.commandId, 'layer.lockAllAbove');
  });

  await test('KeyboardShortcutController dispatches centralized commands and tool switches', () => {
    let activeTool = 'select';
    let executedCmd = '';

    const cmdRegistry = CommandRegistry.getInstance();
    cmdRegistry.setContext({ model: {} } as any);
    cmdRegistry.register({
      id: 'test.custom',
      label: 'Test Custom',
      execute: () => {
        executedCmd = 'test.custom';
        return { success: true };
      },
    });

    keymap.register({
      commandId: 'test.custom',
      code: 'KeyB',
      key: 'b',
      ctrlOrMeta: true,
    });

    // Mock DOM Window
    let keydownHandler: any = null;
    (global as any).window = {
      addEventListener: (type: string, fn: any) => {
        if (type === 'keydown') keydownHandler = fn;
      },
      removeEventListener: () => {},
    };

    const mockContext: any = {
      toolbar: {
        activeTool: 'select',
        setTool: (t: string) => {
          activeTool = t;
        },
      },
      selectionTool: {
        selectedElementIds: new Set(),
        marqueeRect: null,
      },
      canvasMgr: {},
      nodeEditorTool: {},
      model: { elements: [] },
      propertyPanel: { update: () => {} },
      clipboardService: { hasContent: false },
      nodeToolHandler: {},
      shapeToolHandler: { shapeStartPt: null },
      penToolHandler: {},
      polylineToolHandler: {},
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
      renderOverlay: () => {},
      syncToHost: () => {},
      syncMetadataToHost: () => {},
    };

    new KeyboardShortcutController(mockContext);
    assert.ok(keydownHandler, 'Keyboard listener should be attached');

    // Test tool switch to rect (R)
    keydownHandler(mockKeyEvent({ code: 'KeyR', key: 'r' }));
    assert.equal(activeTool, 'rect', 'Should switch to rect tool via KeyR');

    // Test tool switch to eraser (Shift+E)
    keydownHandler(mockKeyEvent({ code: 'KeyE', key: 'E', shiftKey: true }));
    assert.equal(activeTool, 'eraser', 'Should switch to eraser tool via Shift+E');

    // Test command dispatch (Ctrl+B / Cmd+B)
    keydownHandler(mockKeyEvent({ code: 'KeyB', key: 'b', ctrlKey: true }));
    assert.equal(executedCmd, 'test.custom', 'Should execute registered command test.custom');
  });

  console.log(`\nInternational Keymap Tests Completed: ${passed} passed`);
  return true;
}

if (process.argv[1] && process.argv[1].includes('test-international-keymap')) {
  runInternationalKeymapTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
