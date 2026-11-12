import { strict as assert } from 'assert';
import { AntiDrawCustomDocument } from '../src/editor/AntiDrawCustomDocument.js';
import { AntiDrawEditorProvider } from '../src/editor/AntiDrawEditorProvider.js';
import { AdrwProjectService, AdrwContainer } from '../src/webview/engine/project/AdrwContainer.js';
import * as vscode from 'vscode';
import { mockFsStorage, Uri } from './mocks/vscode.js';

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

    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.14' } },
    };
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

    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.14' } },
    };
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

    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.14' } },
    };
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

    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.14' } },
    };
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

    const mockContext: any = {
      extensionUri: Uri.file('/antidraw-ext'),
      extension: { packageJSON: { version: '0.103.14' } },
    };
    const provider = new AntiDrawEditorProvider(mockContext);
    const cancelToken: any = { isCancellationRequested: false };

    await provider.revertCustomDocument(doc, cancelToken);
    assert.equal(doc.isDirty, false, 'Revert resets dirty state');
    assert.equal(doc.container.svgContent, '<svg id="committed"/>', 'Container restored from disk');
    assert.equal(broadcasted.length, 1);
    assert.equal(broadcasted[0].type, 'loadSvg');
    assert.equal(broadcasted[0].text, '<svg id="committed"/>');
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-custom-document-lifecycle.ts')) {
  runCustomDocumentLifecycleTests();
}
