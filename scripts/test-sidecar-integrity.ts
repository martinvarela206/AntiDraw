import { strict as assert } from 'assert';
import { SidecarIntegrityService } from '../src/editor/SidecarIntegrityService.js';
import { AntiDrawEditorProvider } from '../src/editor/AntiDrawEditorProvider.js';
import { AntiDrawCustomDocument } from '../src/editor/AntiDrawCustomDocument.js';
import { AdrwProjectService, AdrwContainer } from '../src/webview/engine/project/AdrwContainer.js';
import { mockFsStorage, Uri, MockMemento } from './mocks/vscode.js';

export async function runSidecarIntegrityTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Sidecar Integrity & Versioning (.svg.json) Suite');
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
      extension: { packageJSON: { version: '0.103.16' } },
      workspaceState: new MockMemento(),
      globalState: new MockMemento(),
    };
  }

  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400"><rect id="r1" width="50" height="50"/></svg>';

  await test('Resolves standardized .svg.json and legacy .json URIs', () => {
    const svgUri = Uri.file('/workspace/art/badge.svg') as any;
    const canonicalUri = SidecarIntegrityService.getSidecarUri(svgUri);
    assert.equal(canonicalUri.path, '/workspace/art/badge.svg.json', 'Standardized extension is .svg.json');

    const legacyUri = SidecarIntegrityService.getLegacySidecarUri(svgUri);
    assert.equal(legacyUri.path, '/workspace/art/badge.json', 'Legacy extension replaces .svg with .json');
  });

  await test('Computes consistent SHA-256 hash across LF and CRLF line endings', () => {
    const svgLf = '<svg width="100">\n  <rect/>\n</svg>';
    const svgCrlf = '<svg width="100">\r\n  <rect/>\r\n</svg>';

    const hash1 = SidecarIntegrityService.computeSvgHash(svgLf);
    const hash2 = SidecarIntegrityService.computeSvgHash(svgCrlf);

    assert.equal(hash1, hash2, 'Line ending differences do not alter cryptographic hash');
    assert.equal(hash1.length, 64, 'Produces 64-char hex SHA-256');
  });

  await test('Packages sidecar with schemaVersion: 1, svgHash and stripped volatile keys', () => {
    const metadata = {
      zoom: 2.0,
      cameraOffset: { x: 50, y: 50 },
      undoStack: ['snapshotA'],
      grids: [{ spacing: 10 }],
      elements: {
        r1: { 'data-shape': 'rect', 'data-corner-radius': '4' },
      },
    };

    const payload = SidecarIntegrityService.packageSidecar(sampleSvg, metadata);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(typeof payload.svgHash, 'string');
    assert.equal(payload.svgHash, SidecarIntegrityService.computeSvgHash(sampleSvg));

    // Volatile keys must be stripped
    assert.equal(payload.metadata.zoom, undefined);
    assert.equal(payload.metadata.cameraOffset, undefined);
    assert.equal(payload.metadata.undoStack, undefined);

    // Persistent keys retained
    assert.deepEqual(payload.metadata.grids, [{ spacing: 10 }]);
    assert.deepEqual(payload.metadata.elements, { r1: { 'data-shape': 'rect', 'data-corner-radius': '4' } });
  });

  await test('Unpackages and validates synchronized sidecar', () => {
    const metadata = { guides: [{ axis: 'x', pos: 100 }] };
    const payload = SidecarIntegrityService.packageSidecar(sampleSvg, metadata);
    const rawJson = JSON.stringify(payload);

    const result = SidecarIntegrityService.unpackageSidecar(rawJson, sampleSvg);
    assert.equal(result.isValid, true);
    assert.equal(result.isDesynchronized, false);
    assert.equal(result.isLegacy, false);
    assert.deepEqual(result.metadata, metadata);
  });

  await test('Detects external desynchronization when SVG markup is modified externally', () => {
    const originalSvg = '<svg width="200" height="200"><circle r="80"/></svg>';
    const payload = SidecarIntegrityService.packageSidecar(originalSvg, { elements: { c1: { 'data-shape': 'circle' } } });
    const rawJson = JSON.stringify(payload);

    // Modified externally in Inkscape / Illustrator
    const externallyModifiedSvg = '<svg width="300" height="300"><circle r="120" fill="red"/></svg>';

    const result = SidecarIntegrityService.unpackageSidecar(rawJson, externallyModifiedSvg);
    assert.equal(result.isValid, true);
    assert.equal(result.isDesynchronized, true, 'Hash mismatch identifies external desynchronization');
    assert.notEqual(result.storedHash, result.computedHash);
  });

  await test('Gracefully ingests legacy .json sidecars without crashing', () => {
    const legacyRaw = JSON.stringify({
      zoom: 1.5,
      showGrid: true,
      elements: { p1: { 'data-shape': 'path' } },
    });

    const result = SidecarIntegrityService.unpackageSidecar(legacyRaw, sampleSvg);
    assert.equal(result.isValid, true);
    assert.equal(result.isLegacy, true);
    assert.equal(result.isDesynchronized, false);
    assert.equal(result.metadata?.showGrid, true);
    assert.equal(result.metadata?.zoom, undefined, 'Volatile keys stripped from legacy import');
  });

  await test('AntiDrawEditorProvider reads and writes versioned .svg.json sidecar with hash', async () => {
    const svgUri = Uri.file('/test-workspace/icon.svg') as any;
    const sidecarUri = Uri.file('/test-workspace/icon.svg.json') as any;

    const mockContext = createMockContext();
    const provider = new AntiDrawEditorProvider(mockContext);

    const container: AdrwContainer = AdrwProjectService.createFromSvg(sampleSvg, 'icon.svg');
    container.companionMetadata = {
      guides: [{ axis: 'y', pos: 25 }],
      elements: { r1: { 'data-shape': 'rect' } },
    };

    const doc = new AntiDrawCustomDocument(
      svgUri,
      container,
      false, // SVG mode
      'icon.svg',
      Uri.file('/test-workspace/icon.adrw') as any,
      Uri.file('/test-workspace') as any
    );

    // Save document
    await provider.saveCustomDocument(doc, { isCancellationRequested: false } as any);

    assert(mockFsStorage.has(sidecarUri.path), 'Sidecar .svg.json was created on save');
    const sidecarBytes = mockFsStorage.get(sidecarUri.path)!;
    const sidecar = JSON.parse(new TextDecoder('utf-8').decode(sidecarBytes));

    assert.equal(sidecar.schemaVersion, 1);
    assert.equal(sidecar.svgHash, SidecarIntegrityService.computeSvgHash(sampleSvg));
    assert.deepEqual(sidecar.metadata.guides, [{ axis: 'y', pos: 25 }]);

    // Test readSidecarMetadata on synchronized document
    const readMeta = await provider.readSidecarMetadata(svgUri, sampleSvg);
    assert.deepEqual(readMeta.guides, [{ axis: 'y', pos: 25 }]);

    // Test readSidecarMetadata when SVG was altered externally (desynchronized)
    const alteredSvg = '<svg width="999"><path d="M0 0"/></svg>';
    const desyncMeta = await provider.readSidecarMetadata(svgUri, alteredSvg);
    assert.equal(desyncMeta, null, 'Desynchronized sidecar metadata is safely discarded to protect model integrity');
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-sidecar-integrity.ts')) {
  runSidecarIntegrityTests();
}
