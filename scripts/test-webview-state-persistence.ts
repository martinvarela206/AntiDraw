import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { mockFsStorage, Uri, MockMemento } from './mocks/vscode.js';

export async function runWebviewStatePersistenceTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Webview Memory & State Persistence Suite');
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

  // Setup DOM / VS Code mock environment for Webview tests
  let mockInternalState: any = null;
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).acquireVsCodeApi = () => {
    return {
      postMessage: (_msg: any) => {},
      setState: (s: any) => {
        mockInternalState = s;
      },
      getState: () => mockInternalState,
    };
  };

  const { VsCodeBridge } = await import('../src/webview/bridge/VsCodeBridge.js');
  const { WebviewStateManager } = await import('../src/webview/services/WebviewStateManager.js');
  const { AntiDrawEditorProvider } = await import('../src/editor/AntiDrawEditorProvider.js');

  await test('WebviewStateManager correctly serializes and restores state via getState / setState', () => {
    WebviewStateManager.clearState();
    assert.equal(WebviewStateManager.restoreState(), null, 'Initial state should be null');

    const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><circle r="50"/></svg>';
    WebviewStateManager.saveState(
      {
        svgText: sampleSvg,
        zoom: 1.5,
        cameraOffset: { x: 120, y: -45 },
        fileName: 'diagram.svg',
      },
      true
    );

    const restored = WebviewStateManager.restoreState();
    assert.ok(restored, 'State should be restored');
    assert.equal(restored?.version, 1);
    assert.equal(restored?.svgText, sampleSvg);
    assert.equal(restored?.zoom, 1.5);
    assert.deepEqual(restored?.cameraOffset, { x: 120, y: -45 });
    assert.equal(restored?.fileName, 'diagram.svg');
  });

  await test('WebviewStateManager merges incremental partial updates', () => {
    WebviewStateManager.saveState(
      {
        zoom: 2.0,
      },
      true
    );

    const restored = WebviewStateManager.restoreState();
    assert.ok(restored);
    assert.equal(restored?.zoom, 2.0);
    // Previous svgText and cameraOffset remain preserved
    assert.ok(restored?.svgText.includes('<circle'));
    assert.deepEqual(restored?.cameraOffset, { x: 120, y: -45 });
  });

  await test('WebviewStateManager.clearState wipes stored state', () => {
    WebviewStateManager.clearState();
    const restored = WebviewStateManager.restoreState();
    assert.equal(restored, null, 'State should be wiped after clearState()');
  });

  await test('AntiDrawEditorProvider registers without retainContextWhenHidden', () => {
    let capturedOptions: any[] = [];
    const origRegisterCustomEditor = vscode.window.registerCustomEditorProvider;
    (vscode.window as any).registerCustomEditorProvider = (
      viewType: string,
      provider: any,
      options: any
    ) => {
      capturedOptions.push({ viewType, options });
      return { dispose: () => {} };
    };

    try {
      const mockContext: any = {
        extensionUri: Uri.file('/antidraw-ext'),
        extension: { packageJSON: { version: '0.103.18' } },
        workspaceState: new MockMemento(),
        globalState: new MockMemento(),
      };

      const disposable = AntiDrawEditorProvider.register(mockContext);
      assert.ok(disposable, 'Provider should register successfully');
      assert.equal(capturedOptions.length, 2, 'Should register both SVG and ADRW providers');

      for (const reg of capturedOptions) {
        assert.ok(
          !reg.options?.webviewOptions?.retainContextWhenHidden,
          `Provider ${reg.viewType} must NOT enable retainContextWhenHidden (RAM leak risk)`
        );
      }
    } finally {
      (vscode.window as any).registerCustomEditorProvider = origRegisterCustomEditor;
    }
  });

  console.log(`\nWebview State Persistence Tests Completed: ${passed} passed`);
  return true;
}

if (process.argv[1] && process.argv[1].includes('test-webview-state-persistence')) {
  runWebviewStatePersistenceTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
