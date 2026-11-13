import { strict as assert } from 'assert';
import { IpcValidator, WebviewToHostMessage, HostToWebviewMessage } from '../src/shared/ipc/IpcContracts.js';
import { AntiDrawCustomDocument } from '../src/editor/AntiDrawCustomDocument.js';
import { AntiDrawEditorProvider } from '../src/editor/AntiDrawEditorProvider.js';
import { AdrwProjectService } from '../src/webview/engine/project/AdrwContainer.js';
import * as vscode from 'vscode';
import { mockFsStorage, Uri, MockMemento } from './mocks/vscode.js';

export async function runIpcHandshakeRevisionTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running IPC Handshake, Monotonic Revision & Deduplication Suite');
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

  // 1. Validator Tests
  await test('IpcValidator validates WebviewToHost messages with revision and requestId', () => {
    const readyValidation = IpcValidator.validateWebviewToHost({
      type: 'ready',
      requestId: 'req_123',
      clientVersion: '0.103.21',
    });
    assert.equal(readyValidation.isValid, true);
    assert.equal(readyValidation.message?.type, 'ready');
    assert.equal((readyValidation.message as any)?.requestId, 'req_123');

    const updateDocValidation = IpcValidator.validateWebviewToHost({
      type: 'updateDocument',
      text: '<svg></svg>',
      revision: 4,
      requestId: 'doc_req_4',
    });
    assert.equal(updateDocValidation.isValid, true);
    assert.equal((updateDocValidation.message as any)?.revision, 4);
    assert.equal((updateDocValidation.message as any)?.requestId, 'doc_req_4');

    const updateMetaValidation = IpcValidator.validateWebviewToHost({
      type: 'updateMetadata',
      metadata: { zoom: 1.5 },
      revision: 5,
      requestId: 'meta_req_5',
    });
    assert.equal(updateMetaValidation.isValid, true);
    assert.equal((updateMetaValidation.message as any)?.revision, 5);
  });

  await test('IpcValidator validates HostToWebview loadSvg with revision and requestId', () => {
    const loadValidation = IpcValidator.validateHostToWebview({
      type: 'loadSvg',
      text: '<svg></svg>',
      revision: 1,
      requestId: 'load_init',
    });
    assert.equal(loadValidation.isValid, true);
    assert.equal((loadValidation.message as any)?.revision, 1);
    assert.equal((loadValidation.message as any)?.requestId, 'load_init');
  });

  // 2. VsCodeBridge Client Tests
  let postedMessages: any[] = [];
  (global as any).acquireVsCodeApi = () => {
    return {
      postMessage: (m: any) => postedMessages.push(m),
      setState: () => {},
      getState: () => null,
    };
  };
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const { VsCodeBridge } = await import('../src/webview/bridge/VsCodeBridge.js');
  const bridge = VsCodeBridge.getInstance();

  await test('VsCodeBridge notifyReady posts ready message with requestId', () => {
    postedMessages = [];
    bridge.notifyReady();
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].type, 'ready');
    assert.ok(postedMessages[0].requestId.startsWith('ready_'));
  });

  await test('VsCodeBridge increments monotonic revision on updateDocument and updateMetadata', () => {
    postedMessages = [];
    const initialRev = bridge.getRevision();

    const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect/></svg>';
    bridge.updateDocument(validSvg);

    assert.equal(bridge.getRevision(), initialRev + 1);
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].type, 'updateDocument');
    assert.equal(postedMessages[0].revision, initialRev + 1);
    assert.ok(postedMessages[0].requestId.startsWith('doc_'));

    bridge.updateMetadata({ showGrid: true });
    assert.equal(bridge.getRevision(), initialRev + 2);
    assert.equal(postedMessages.length, 2);
    assert.equal(postedMessages[1].type, 'updateMetadata');
    assert.equal(postedMessages[1].revision, initialRev + 2);
    assert.ok(postedMessages[1].requestId.startsWith('meta_'));
  });

  // 3. Host Provider Handshake & Revision Order Tests
  await test('AntiDrawEditorProvider waits for ready before emitting loadSvg and rejects stale revisions', async () => {
    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.21' } },
      workspaceState: new MockMemento(),
      globalState: new MockMemento(),
    };

    const provider = new AntiDrawEditorProvider(mockContext);
    const initialSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect id="r1"/></svg>';
    const container = AdrwProjectService.createFromSvg(initialSvg, 'sample.adrw');
    const docUri = Uri.file('/workspace/sample.adrw') as any;
    const customDoc = new AntiDrawCustomDocument(
      docUri,
      container,
      true,
      'sample.adrw',
      docUri,
      Uri.file('/workspace') as any
    );

    let messageListener: ((msg: any) => Promise<void>) | null = null;
    let hostOutbox: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        asWebviewUri: (u: any) => u,
        postMessage: (m: any) => hostOutbox.push(m),
        onDidReceiveMessage: (fn: any) => {
          messageListener = fn;
          return { dispose: () => {} };
        },
      },
      onDidDispose: () => ({ dispose: () => {} }),
    };

    await provider.resolveCustomEditor(customDoc, mockPanel, {} as any);
    assert.ok(messageListener, 'Message listener should be registered');
    assert.equal(hostOutbox.length, 0, 'No loadSvg should be posted before ready handshake');

    // 3.1 Send ready handshake
    await messageListener!({ type: 'ready', requestId: 'ready_1' });
    assert.equal(hostOutbox.length, 1, 'Should post loadSvg immediately upon receiving ready handshake');
    assert.equal(hostOutbox[0].type, 'loadSvg');
    assert.equal(hostOutbox[0].revision, 1);

    // 3.2 Send updateDocument with revision 2
    const updatedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle id="c1"/></svg>';
    await messageListener!({
      type: 'updateDocument',
      text: updatedSvg,
      revision: 2,
      requestId: 'doc_rev_2',
    });
    assert.equal(customDoc.container.svgContent, updatedSvg);
    assert.equal(customDoc.isDirty, true);

    // 3.3 Send stale updateDocument with revision 1 (lower than current 2) -> Should be rejected
    const staleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><line id="l1"/></svg>';
    await messageListener!({
      type: 'updateDocument',
      text: staleSvg,
      revision: 1,
      requestId: 'doc_rev_1_stale',
    });
    assert.equal(customDoc.container.svgContent, updatedSvg, 'Stale SVG with lower revision must NOT overwrite state');

    // 3.4 Duplicate message with identical requestId -> Should be ignored safely
    let dirtyCount = 0;
    provider.onDidChangeCustomDocument(() => dirtyCount++);

    await messageListener!({
      type: 'updateDocument',
      text: updatedSvg,
      revision: 3,
      requestId: 'doc_rev_3_unique',
    });
    assert.equal(dirtyCount, 1);

    // Send exact same requestId again
    await messageListener!({
      type: 'updateDocument',
      text: updatedSvg,
      revision: 3,
      requestId: 'doc_rev_3_unique',
    });
    assert.equal(dirtyCount, 1, 'Duplicate requestId must be skipped by host deduplicator');
  });

  console.log(`\nIPC Handshake & Monotonic Revision Tests Completed: ${passed} passed`);
  return true;
}

if (process.argv[1] && process.argv[1].includes('test-ipc-handshake-revision')) {
  runIpcHandshakeRevisionTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
