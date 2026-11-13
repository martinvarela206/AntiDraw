import { strict as assert } from 'assert';
import { mockFsStorage, Uri, MockMemento } from './mocks/vscode.js';
import { SvgDomRenderer } from '../src/webview/engine/canvas/SvgDomRenderer.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { AntiDrawEditorProvider } from '../src/editor/AntiDrawEditorProvider.js';
import { AntiDrawCustomDocument } from '../src/editor/AntiDrawCustomDocument.js';
import { SidecarIntegrityService } from '../src/editor/SidecarIntegrityService.js';
import { AdrwProjectService, AdrwContainer } from '../src/webview/engine/project/AdrwContainer.js';

export async function runSvgDirectSaveAndDomDiffTests(): Promise<boolean> {
  console.log('\n--- Test Suite 90: Guardado Directo SVG, Sanitización de Sidecar (.svg.json) y SvgDomRenderer Fail-Safe ---');

  let passed = 0;
  function test(desc: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${desc}:`, err);
      throw err;
    }
  }

  // --- 1. SvgDomRenderer Fail-Safe Diffing ---
  class MockDomNode {
    public attributes: Record<string, string> = {};
    public tagName: string;
    public children: MockDomNode[] = [];
    public parentNode: MockDomNode | null = null;
    public style: Record<string, string> = {};

    constructor(tagName: string) {
      this.tagName = tagName;
    }

    public get childElementCount(): number {
      return this.children.length;
    }

    public setAttribute(k: string, v: string) {
      this.attributes[k] = v;
    }

    public getAttribute(k: string): string | null {
      return this.attributes[k] ?? null;
    }

    public setAttributeNS(_ns: string, k: string, v: string) {
      this.attributes[k] = v;
    }

    public appendChild(c: MockDomNode) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    }

    public removeChild(c: MockDomNode) {
      const idx = this.children.indexOf(c);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        c.parentNode = null;
      }
      return c;
    }

    public querySelector(sel: string): MockDomNode | null {
      if (sel.startsWith('#')) {
        const id = sel.substring(1);
        return this.children.find((c) => c.getAttribute('id') === id) || null;
      }
      return this.children.find((c) => c.tagName.toLowerCase() === sel.toLowerCase()) || null;
    }
  }

  (globalThis as any).document = {
    createElementNS: (_ns: string, tag: string) => new MockDomNode(tag),
  };

  const renderer = new SvgDomRenderer();
  const mockCanvas = new MockDomNode('svg') as unknown as SVGSVGElement;
  const model = new VectorModel();

  const pathElem: VectorElement = {
    id: 'path_sample_1',
    tagName: 'path',
    attributes: { id: 'path_sample_1', d: 'M 10 10 L 20 20', stroke: '#ffffff' },
  };
  model.elements = [pathElem];

  test('SvgDomRenderer proyeccion inicial monta path y resetea dirty', () => {
    SvgDomRenderer.resetStats();
    renderer.render(mockCanvas, model);
    assert.equal(SvgDomRenderer.stats.fullRenders, 1);
    const domNode = (mockCanvas as any).querySelector('#path_sample_1');
    assert.ok(domNode, 'Nodo DOM del path debe existir');
    assert.equal(domNode.getAttribute('d'), 'M 10 10 L 20 20');
    assert.equal(pathElem.dirty, false, 'dirty debe ser false tras render');
  });

  test('SvgDomRenderer fail-safe actualiza path en el DOM aun si mutador olvida marcar dirty=true', () => {
    SvgDomRenderer.resetStats();
    // Simular el movimiento del trazo como hace TranslateInteraction:
    // modifica `attributes.d` pero `dirty` sigue siendo `false`
    pathElem.attributes.d = 'M 60 70 L 70 80';
    pathElem.dirty = false;

    renderer.render(mockCanvas, model);

    const domNode = (mockCanvas as any).querySelector('#path_sample_1');
    assert.equal(domNode.getAttribute('d'), 'M 60 70 L 70 80', 'El trazo en el DOM SVG DEBE actualizarse');
    assert.equal(SvgDomRenderer.stats.nodesUpdated, 1, 'Debe registrar 1 nodo actualizado');
    assert.equal(SvgDomRenderer.stats.nodesSkipped, 0);
  });

  test('SvgDomRenderer omite mutaciones cuando los atributos y el dirty estan limpios', () => {
    SvgDomRenderer.resetStats();
    // No cambiamos atributos
    renderer.render(mockCanvas, model);
    assert.equal(SvgDomRenderer.stats.nodesSkipped, 1, 'Nodo sin cambios debe ser omitido');
    assert.equal(SvgDomRenderer.stats.nodesUpdated, 0);
  });

  // --- 2. SidecarIntegrityService Estandarización .svg.json pura ---
  test('SidecarIntegrityService resuelve exclusivamente .svg.json sin metodos legados .json', () => {
    const svgUri = Uri.file('/projects/test.svg') as any;
    const sidecarUri = SidecarIntegrityService.getSidecarUri(svgUri);
    assert.equal(sidecarUri.path, '/projects/test.svg.json', 'El sidecar canónico DEBE ser .svg.json');
    assert.equal((SidecarIntegrityService as any).getLegacySidecarUri, undefined, 'No debe existir getLegacySidecarUri');
  });

  // --- 3. AntiDrawEditorProvider Guardado Directo SVG sin .adrw ---
  const sampleSvgMarkup = '<svg width="64" height="64"><path id="p1" d="M0 0 L10 10"/></svg>';
  const initialContainer: AdrwContainer = AdrwProjectService.createFromSvg(sampleSvgMarkup, 'sample.svg');

  test('openCustomDocument en archivo .svg NO genera contenedor .adrw en disco', async () => {
    mockFsStorage.clear();
    const svgUri = Uri.file('/test-workspace/sample_test.svg') as any;
    const adrwUri = Uri.file('/test-workspace/sample_test.adrw') as any;

    mockFsStorage.set(svgUri.path, new TextEncoder().encode(sampleSvgMarkup));

    const mockContext: any = {
      extensionUri: Uri.file('/extension') as any,
      workspaceState: { get: () => undefined, update: () => {} },
      globalState: { get: () => undefined, update: () => {} },
    };

    const provider = new AntiDrawEditorProvider(mockContext);
    const doc = await provider.openCustomDocument(svgUri, {} as any, {} as any);

    assert.equal(doc.isAdrw, false, 'Documento debe ser modo SVG puro');
    assert.equal(mockFsStorage.has(adrwUri.path), false, 'NO debe haberse creado sample_test.adrw en disco');
  });

  test('saveCustomDocument en archivo .svg persiste directamente en el .svg y en su .svg.json', async () => {
    mockFsStorage.clear();
    const svgUri = Uri.file('/test-workspace/sample_test.svg') as any;
    const adrwUri = Uri.file('/test-workspace/sample_test.adrw') as any;
    const sidecarUri = Uri.file('/test-workspace/sample_test.svg.json') as any;

    const modifiedSvg = '<svg width="64" height="64"><path id="p1" d="M 50 50 L 60 60"/></svg>';
    const container: AdrwContainer = {
      ...initialContainer,
      svgContent: modifiedSvg,
      companionMetadata: {
        guides: [{ axis: 'x', pos: 32 }],
      },
    };

    const doc = new AntiDrawCustomDocument(
      svgUri,
      container,
      false, // isAdrw = false
      'sample_test.svg',
      adrwUri,
      Uri.file('/test-workspace') as any
    );
    doc.setDirty(true);

    const mockContext: any = {
      extensionUri: Uri.file('/extension') as any,
      workspaceState: { get: () => undefined, update: () => {} },
      globalState: { get: () => undefined, update: () => {} },
    };

    const provider = new AntiDrawEditorProvider(mockContext);
    await provider.saveCustomDocument(doc, { isCancellationRequested: false } as any);

    assert.equal(doc.isDirty, false, 'El guardado debe limpiar el dirty state');
    assert.ok(mockFsStorage.has(svgUri.path), 'El archivo .svg DEBE haber sido escrito directamente');
    assert.ok(mockFsStorage.has(sidecarUri.path), 'El archivo companion .svg.json DEBE haber sido escrito');
    assert.equal(mockFsStorage.has(adrwUri.path), false, 'NO DEBE escribirse archivo .adrw al guardar un .svg');

    const savedSvg = new TextDecoder('utf-8').decode(mockFsStorage.get(svgUri.path)!);
    assert.equal(savedSvg, modifiedSvg, 'El contenido del .svg debe coincidir con el svgContent modificado');

    const savedSidecar = JSON.parse(new TextDecoder('utf-8').decode(mockFsStorage.get(sidecarUri.path)!));
    assert.equal(savedSidecar.schemaVersion, 1);
    assert.deepEqual(savedSidecar.metadata.guides, [{ axis: 'x', pos: 32 }]);
  });

  console.log(`Suite 90 Completada: ${passed} pasados, 0 fallados.\n`);
  return true;
}
