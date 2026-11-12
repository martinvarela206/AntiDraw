import { strict as assert } from 'assert';
import { AntiDrawCustomDocument } from '../src/editor/AntiDrawCustomDocument.js';
import { AntiDrawEditorProvider } from '../src/editor/AntiDrawEditorProvider.js';
import { SessionStateStorage } from '../src/editor/SessionStateStorage.js';
import { AdrwProjectService, AdrwContainer } from '../src/webview/engine/project/AdrwContainer.js';
import * as vscode from 'vscode';
import { mockFsStorage, Uri, MockMemento } from './mocks/vscode.js';

export async function runCustomDocumentLifecycleTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Native CustomDocument Lifecycle & Hot Exit Suite');
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

  function createMockContext(): any {
    return {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.15' } },
      workspaceState: new MockMemento(),
      globalState: new MockMemento(),
    };
  }

  const initialSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect id="r1" width="100" height="100"/></svg>';
  const initialContainer: AdrwContainer = AdrwProjectService.createFromSvg(initialSvg, 'test-doc.adrw');

  await test('AntiDrawCustomDocument tracks URI, container and dirty state', () => {
    const uri = Uri.file('/test-workspace/test-doc.adrw') as any;
    const doc = new AntiDrawCustomDocument(
      uri,
      initialContainer,
      true,
      'test-doc.adrw',
      uri,
      Uri.file('/test-workspace') as any
    );

    assert.equal(doc.uri.path, '/test-workspace/test-doc.adrw');
    assert.equal(doc.isAdrw, true);
    assert.equal(doc.isDirty, false);

    doc.setDirty(true);
    assert.equal(doc.isDirty, true);
    doc.setDirty(false);
    assert.equal(doc.isDirty, false);
  });

  await test('AntiDrawCustomDocument registers webview panels and broadcasts messages', () => {
    const uri = Uri.file('/test-workspace/test-doc.adrw') as any;
    const doc = new AntiDrawCustomDocument(
      uri,
      initialContainer,
      true,
      'test-doc.adrw',
      uri,
      Uri.file('/test-workspace') as any
    );

    const receivedMessages: any[] = [];
    const mockPanel: any = {
      webview: {
        postMessage: (msg: any) => {
          receivedMessages.push(msg);
        },
      },
      onDidDispose: (cb: any) => ({ dispose: () => {} }),
    };

    doc.registerPanel(mockPanel);
    assert.equal(doc.registeredPanels.length, 1);

    doc.broadcastMessage({ type: 'syncEvent', val: 42 });
    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0].type, 'syncEvent');
    assert.equal(receivedMessages[0].val, 42);

    doc.unregisterPanel(mockPanel);
    assert.equal(doc.registeredPanels.length, 0);
  });

  await test('openCustomDocument opens normal .adrw file from workspace fs', async () => {
    const fileUri = Uri.file('/test-workspace/sample.adrw') as any;
    const serialized = AdrwProjectService.serializeContainer(initialContainer);
    mockFsStorage.set(fileUri.path, new TextEncoder().encode(serialized));

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);

    const openContext: any = { backupId: undefined, untitledDocumentData: undefined };
    const cancelToken: any = { isCancellationRequested: false };

    const doc = await provider.openCustomDocument(fileUri, openContext, cancelToken);
    assert.equal(doc.baseFileName, 'sample.adrw');
    assert.equal(doc.isAdrw, true);
    assert.equal(doc.isDirty, false);
    assert.equal(doc.container.format, 'antidraw');
  });

  await test('openCustomDocument restores uncommitted draft from Hot Exit backupId', async () => {
    const fileUri = Uri.file('/test-workspace/draft.adrw') as any;
    const backupUri = Uri.file('/backup-storage/draft.adrw.backup') as any;

    const modifiedContainer = { ...initialContainer, svgContent: '<svg><circle r="50"/></svg>' };
    const serializedBackup = AdrwProjectService.serializeContainer(modifiedContainer);
    mockFsStorage.set(backupUri.path, new TextEncoder().encode(serializedBackup));

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);

    const openContext: any = { backupId: backupUri.toString(), untitledDocumentData: undefined };
    const cancelToken: any = { isCancellationRequested: false };

    const doc = await provider.openCustomDocument(fileUri, openContext, cancelToken);
    assert.equal(doc.isDirty, true, 'Document restored from Hot Exit must be marked dirty');
    assert(doc.container.svgContent.includes('<circle r="50"/>'), 'Restores modified content from backup');
  });

  await test('backupCustomDocument persists container to destination and provides working delete()', async () => {
    const fileUri = Uri.file('/test-workspace/active.adrw') as any;
    const doc = new AntiDrawCustomDocument(
      fileUri,
      initialContainer,
      true,
      'active.adrw',
      fileUri,
      Uri.file('/test-workspace') as any
    );

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);

    const backupDest = Uri.file('/backup-dir/active_backup.json') as any;
    const backupContext: any = { destination: backupDest };
    const cancelToken: any = { isCancellationRequested: false };

    const backup = await provider.backupCustomDocument(doc, backupContext, cancelToken);
    assert.equal(backup.id, backupDest.toString());
    assert(mockFsStorage.has(backupDest.path), 'Backup was written to fs');

    // Test delete callback
    await backup.delete();
    assert(!mockFsStorage.has(backupDest.path), 'Backup temp file was deleted cleanly by callback');
  });

  await test('saveCustomDocument persists container atomically and resets isDirty', async () => {
    const fileUri = Uri.file('/test-workspace/saved.adrw') as any;
    const doc = new AntiDrawCustomDocument(
      fileUri,
      initialContainer,
      true,
      'saved.adrw',
      fileUri,
      Uri.file('/test-workspace') as any
    );
    doc.setDirty(true);

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);
    const cancelToken: any = { isCancellationRequested: false };

    await provider.saveCustomDocument(doc, cancelToken);
    assert.equal(doc.isDirty, false, 'Save clears dirty flag');
    assert(mockFsStorage.has(fileUri.path), 'File was written to disk');

    const readBytes = mockFsStorage.get(fileUri.path)!;
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(readBytes));
    assert.equal(parsed.format, 'antidraw');
  });

  await test('revertCustomDocument reloads content from disk and resets isDirty', async () => {
    const fileUri = Uri.file('/test-workspace/revertable.adrw') as any;

    // Save initial container to disk
    const diskContainer: AdrwContainer = { ...initialContainer, svgContent: '<svg id="committed"/>' };
    mockFsStorage.set(fileUri.path, new TextEncoder().encode(AdrwProjectService.serializeContainer(diskContainer)));

    // In-memory document has uncommitted changes
    const memoryContainer: AdrwContainer = { ...initialContainer, svgContent: '<svg id="uncommitted-mess"/>' };
    const doc = new AntiDrawCustomDocument(
      fileUri,
      memoryContainer,
      true,
      'revertable.adrw',
      fileUri,
      Uri.file('/test-workspace') as any
    );
    doc.setDirty(true);

    const broadcasted: any[] = [];
    doc.registerPanel({
      webview: { postMessage: (msg: any) => broadcasted.push(msg) },
      onDidDispose: () => ({ dispose: () => {} }),
    } as any);

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);
    const cancelToken: any = { isCancellationRequested: false };

    await provider.revertCustomDocument(doc, cancelToken);
    assert.equal(doc.isDirty, false, 'Revert resets dirty state');
    assert.equal(doc.container.svgContent, '<svg id="committed"/>', 'Container restored from disk');
    assert.equal(broadcasted.length, 1);
    assert.equal(broadcasted[0].type, 'loadSvg');
    assert.equal(broadcasted[0].text, '<svg id="committed"/>');
  });

  await test('SessionStateStorage separates volatile workstation keys from persistent shape metadata', () => {
    const mixed = {
      zoom: 1.75,
      cameraOffset: { x: 250, y: 120 },
      undoStack: ['snap1', 'snap2'],
      redoStack: ['snap3'],
      grids: [{ spacing: 20 }],
      guides: [{ pos: 50 }],
      elements: {
        el1: { 'data-shape': 'rect' },
      },
    };

    const { persistent, volatile, hasVolatile } = SessionStateStorage.splitMetadata(mixed);
    assert.equal(hasVolatile, true);
    assert.equal(volatile.zoom, 1.75);
    assert.deepEqual(volatile.cameraOffset, { x: 250, y: 120 });
    assert.deepEqual(volatile.undoStack, ['snap1', 'snap2']);
    assert.deepEqual(volatile.redoStack, ['snap3']);

    // Persistent must NOT have volatile keys
    assert.equal(persistent.zoom, undefined);
    assert.equal(persistent.cameraOffset, undefined);
    assert.equal(persistent.undoStack, undefined);
    assert.equal(persistent.redoStack, undefined);

    // Persistent retains shapes and canvas config
    assert.deepEqual(persistent.grids, [{ spacing: 20 }]);
    assert.deepEqual(persistent.guides, [{ pos: 50 }]);
    assert.deepEqual(persistent.elements, { el1: { 'data-shape': 'rect' } });

    // Round-trip merge restores full state for webview consumption
    const merged = SessionStateStorage.mergeMetadata(persistent, volatile);
    assert.equal(merged.zoom, 1.75);
    assert.deepEqual(merged.cameraOffset, { x: 250, y: 120 });
    assert.deepEqual(merged.undoStack, ['snap1', 'snap2']);
    assert.deepEqual(merged.elements, { el1: { 'data-shape': 'rect' } });
  });

  await test('saveCustomDocument for SVG documents writes clean sidecar JSON without volatile Git noise', async () => {
    const svgUri = Uri.file('/test-workspace/drawing.svg') as any;
    const sidecarUri = Uri.file('/test-workspace/drawing.json') as any;

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);

    // Container with mixed persistent and volatile metadata
    const mixedContainer: AdrwContainer = {
      ...initialContainer,
      companionMetadata: {
        zoom: 3.0,
        cameraOffset: { x: 999, y: 888 },
        undoStack: ['snapshot1'],
        guides: [{ axis: 'x', pos: 100 }],
        elements: { rect_1: { 'data-shape': 'rect' } },
      },
    };

    const doc = new AntiDrawCustomDocument(
      svgUri,
      mixedContainer,
      false, // isAdrw = false (SVG mode)
      'drawing.svg',
      Uri.file('/test-workspace/drawing.adrw') as any,
      Uri.file('/test-workspace') as any
    );
    doc.setDirty(true);

    const cancelToken: any = { isCancellationRequested: false };
    await provider.saveCustomDocument(doc, cancelToken);

    assert(mockFsStorage.has(sidecarUri.path), 'Sidecar JSON was written to fs');
    const sidecarBytes = mockFsStorage.get(sidecarUri.path)!;
    const sidecarJson = JSON.parse(new TextDecoder('utf-8').decode(sidecarBytes));

    // Verify ZERO volatile keys in sidecar JSON!
    assert.equal(sidecarJson.zoom, undefined, 'No zoom in on-disk sidecar');
    assert.equal(sidecarJson.cameraOffset, undefined, 'No cameraOffset in on-disk sidecar');
    assert.equal(sidecarJson.undoStack, undefined, 'No undoStack in on-disk sidecar');

    // Verify persistent properties are intact
    assert.deepEqual(sidecarJson.guides, [{ axis: 'x', pos: 100 }]);
    assert.deepEqual(sidecarJson.elements, { rect_1: { 'data-shape': 'rect' } });
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-custom-document-lifecycle.ts')) {
  runCustomDocumentLifecycleTests();
}
