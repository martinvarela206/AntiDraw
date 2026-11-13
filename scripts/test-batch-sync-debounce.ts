import { strict as assert } from 'assert';
import { HostSyncService } from '../src/webview/services/HostSyncService.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { HistoryService } from '../src/webview/services/HistoryService.js';

export async function runBatchSyncDebounceTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Batch Sync & Commit Debounce Suite');
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

  // Mock VsCodeBridge
  let updateDocCalls: any[] = [];
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).acquireVsCodeApi = () => {
    return {
      postMessage: (m: any) => {
        if (m.type === 'updateDocument') updateDocCalls.push(m);
      },
      setState: () => {},
      getState: () => null,
    };
  };

  const model = new VectorModel();
  const canvasMgr = new CanvasManager();
  const selectionTool = new SelectionTool();
  const historyService = new HistoryService({
    model,
    canvasMgr,
    selectionTool,
    syncToHost: () => {},
    render: () => {},
  });

  const hostSync = new HostSyncService({
    model,
    canvasMgr,
    selectionTool,
    historyService,
    getViewportCtrl: () => undefined,
    getCanvasContainer: () => undefined,
    getTopBar: () => undefined,
    applyCanvasSize: () => {},
    render: () => {},
    recenterViewBox: () => {},
  });

  await test('Normal syncToHost outside preview executes synchronously and immediately', () => {
    updateDocCalls = [];
    model.elements = [{
      id: 'r1',
      tagName: 'rect',
      attributes: { id: 'r1', width: '100', height: '100' },
      isClosed: true,
    }];

    const success = hostSync.syncToHost(true);
    assert.equal(success, true);
    assert.equal(updateDocCalls.length, 1, 'Should immediately dispatch 1 updateDocument message');
    assert.ok(updateDocCalls[0].text.includes('<rect'));
  });

  await test('During beginPreview, multiple syncToHost calls are coalesced and debounced', async () => {
    updateDocCalls = [];
    hostSync.beginPreview();

    // Simulate 20 high-frequency frame mutations (e.g. 60 FPS pointermove during drag)
    for (let i = 0; i < 20; i++) {
      model.elements[0].attributes.x = String(i * 5);
      hostSync.syncToHost(false);
    }

    // Zero messages should have been dispatched immediately over IPC
    assert.equal(updateDocCalls.length, 0, 'No IPC messages should be sent synchronously during Preview');

    // Wait 300ms for debounce timer to fire
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(updateDocCalls.length, 1, 'All 20 frame updates should coalesce into exactly 1 debounced commit');
    assert.ok(updateDocCalls[0].text.includes('x="95"'));
  });

  await test('commitPreview cancels pending debounced timer and flushes immediately', async () => {
    updateDocCalls = [];
    hostSync.beginPreview();

    model.elements[0].attributes.x = '200';
    hostSync.syncToHost(false);
    assert.equal(updateDocCalls.length, 0);

    // Call commit immediately
    hostSync.commitPreview();
    assert.equal(updateDocCalls.length, 1, 'commitPreview must flush sync immediately without waiting for timer');
    assert.ok(updateDocCalls[0].text.includes('x="200"'));

    // Wait to ensure no secondary timer fires
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(updateDocCalls.length, 1, 'Debounce timer must be cancelled, no duplicate message');
  });

  await test('cancelPreview cancels pending debounced timer and discards pending sync', async () => {
    updateDocCalls = [];
    hostSync.beginPreview();

    model.elements[0].attributes.x = '999';
    hostSync.syncToHost(false);
    assert.equal(updateDocCalls.length, 0);

    // Cancel preview
    hostSync.cancelPreview();

    // Wait to ensure no sync happens
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(updateDocCalls.length, 0, 'cancelPreview must discard uncommitted mutations');
  });

  await test('syncToHostDebounced batches rapid keyboard nudges into a single commit', async () => {
    updateDocCalls = [];

    // Simulate holding down an arrow key (10 keydown events in 100ms)
    for (let i = 0; i < 10; i++) {
      model.elements[0].attributes.y = String(i * 2);
      hostSync.syncToHostDebounced(150);
    }

    assert.equal(updateDocCalls.length, 0, 'No immediate messages during rapid keyboard repeat');

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(updateDocCalls.length, 1, 'Single coalesced message sent after arrow key hold stops');
    assert.ok(updateDocCalls[0].text.includes('y="18"'));
  });

  console.log(`\nBatch Sync & Debounce Tests Completed: ${passed} passed`);
  return true;
}

if (process.argv[1] && process.argv[1].includes('test-batch-sync-debounce')) {
  runBatchSyncDebounceTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
