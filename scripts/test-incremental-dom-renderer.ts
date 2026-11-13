import { strict as assert } from 'assert';
import { SvgDomRenderer } from '../src/webview/engine/canvas/SvgDomRenderer.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';

export async function runIncrementalDomRendererTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Incremental DOM Diffing Renderer Suite');
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

  // Setup DOM mock for tests
  class MockElement {
    public attributes: Record<string, string> = {};
    public children: MockElement[] = [];
    public style: Record<string, string> = {};
    public tagName: string;
    public textContent: string = '';
    public parentNode: MockElement | null = null;

    constructor(tagName: string) {
      this.tagName = tagName;
    }

    public get childElementCount(): number {
      return this.children.length;
    }

    public get firstChild(): MockElement | null {
      return this.children[0] || null;
    }

    public set innerHTML(val: string) {
      if (val === '') {
        this.children = [];
      }
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

    public appendChild(child: MockElement) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    public removeChild(child: MockElement) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    public insertBefore(newChild: MockElement, _refChild: MockElement | null) {
      newChild.parentNode = this;
      this.children.unshift(newChild);
      return newChild;
    }

    public querySelector(sel: string): MockElement | null {
      if (sel.startsWith('#')) {
        const id = sel.substring(1);
        return this.children.find((c) => c.getAttribute('id') === id) || null;
      }
      return this.children.find((c) => c.tagName.toLowerCase() === sel.toLowerCase()) || null;
    }

    public querySelectorAll(tag: string): MockElement[] {
      return this.children.filter((c) => c.tagName.toLowerCase() === tag.toLowerCase());
    }

    public cloneNode(_deep: boolean): MockElement {
      const copy = new MockElement(this.tagName);
      copy.attributes = { ...this.attributes };
      copy.textContent = this.textContent;
      copy.children = this.children.map((c) => c.cloneNode(true));
      return copy;
    }
  }

  (globalThis as any).document = {
    createElementNS: (_ns: string, tag: string) => new MockElement(tag),
    createElement: (tag: string) => {
      const el = new MockElement(tag);
      let html = '';
      Object.defineProperty(el, 'innerHTML', {
        get: () => html,
        set: (val: string) => {
          html = val;
          // Simple mock parser for test tempSvg
          const svgEl = new MockElement('svg');
          const idMatch = val.match(/id="([^"]+)"/g);
          if (idMatch) {
            idMatch.forEach((m) => {
              const id = m.replace('id="', '').replace('"', '');
              const child = new MockElement('path');
              child.setAttribute('id', id);
              svgEl.appendChild(child);
            });
          }
          el.children = [svgEl];
        },
      });
      return el;
    },
  };

  const renderer = new SvgDomRenderer();
  const model = new VectorModel();
  const el1: VectorElement = {
    id: 'rect_dom_1',
    tagName: 'rect',
    attributes: { id: 'rect_dom_1', x: '10', y: '20', width: '50', height: '60', fill: '#ff0000' },
  };
  const el2: VectorElement = {
    id: 'circle_dom_2',
    tagName: 'circle',
    attributes: { id: 'circle_dom_2', cx: '100', cy: '100', r: '40', fill: '#00ff00' },
  };
  model.elements = [el1, el2];

  const mockSvgCanvas = new MockElement('svg') as unknown as SVGSVGElement;

  await test('Initial render mounts full artboard and elements', () => {
    SvgDomRenderer.resetStats();
    renderer.render(mockSvgCanvas, model);

    assert.strictEqual(SvgDomRenderer.stats.fullRenders, 1, 'Should record 1 full render');
    assert.strictEqual(SvgDomRenderer.stats.incrementalRenders, 0);
    assert.ok((mockSvgCanvas as any).children.length >= 2, 'Canvas must contain children');
    assert.ok((mockSvgCanvas as any).querySelector('#__artboard_bg__'), 'Canvas must contain artboard bg');
    assert.strictEqual(el1.dirty, false, 'Element dirty flag should be reset');
    assert.strictEqual(el2.dirty, false, 'Element dirty flag should be reset');
  });

  await test('Second render with clean elements skips DOM mutations (incremental diffing)', () => {
    SvgDomRenderer.resetStats();
    renderer.render(mockSvgCanvas, model);

    assert.strictEqual(SvgDomRenderer.stats.fullRenders, 0, 'Full render must NOT be triggered');
    assert.strictEqual(SvgDomRenderer.stats.incrementalRenders, 1, 'Must use incremental render');
    assert.strictEqual(SvgDomRenderer.stats.nodesCreated, 0, 'No nodes should be created');
    assert.strictEqual(SvgDomRenderer.stats.nodesUpdated, 0, 'No nodes should be updated');
    assert.strictEqual(SvgDomRenderer.stats.nodesRemoved, 0, 'No nodes should be removed');
    assert.strictEqual(SvgDomRenderer.stats.nodesSkipped, 2, 'Both clean nodes must be skipped');
  });

  await test('Mutating one element with dirty=true updates only that node in-place', () => {
    SvgDomRenderer.resetStats();
    el1.attributes.fill = '#0000ff';
    el1.dirty = true;

    renderer.render(mockSvgCanvas, model);

    assert.strictEqual(SvgDomRenderer.stats.incrementalRenders, 1);
    assert.strictEqual(SvgDomRenderer.stats.nodesUpdated, 1, 'Only 1 node should be updated');
    assert.strictEqual(SvgDomRenderer.stats.nodesSkipped, 1, 'Unchanged el2 should be skipped');
    assert.strictEqual(el1.dirty, false, 'Dirty flag must be cleared');

    const domNode = (mockSvgCanvas as any).querySelector('#rect_dom_1');
    assert.strictEqual(domNode.getAttribute('fill'), '#0000ff', 'DOM node attribute must be updated in-place');
  });

  await test('Adding a new element creates and mounts only that node', () => {
    SvgDomRenderer.resetStats();
    const el3: VectorElement = {
      id: 'path_dom_3',
      tagName: 'path',
      attributes: { id: 'path_dom_3', d: 'M 0 0 L 10 10', stroke: '#123456' },
      dirty: true,
    };
    model.elements.push(el3);

    renderer.render(mockSvgCanvas, model);

    assert.strictEqual(SvgDomRenderer.stats.nodesCreated, 1, 'Should create 1 new DOM node');
    assert.strictEqual(SvgDomRenderer.stats.nodesSkipped, 2, 'Existing 2 nodes should be skipped');
    assert.ok((mockSvgCanvas as any).querySelector('#path_dom_3'), 'New node must exist in canvas DOM');
  });

  await test('Removing an element deletes only that node from canvas DOM', () => {
    SvgDomRenderer.resetStats();
    // Remove el2
    model.elements = model.elements.filter((e) => e.id !== 'circle_dom_2');

    renderer.render(mockSvgCanvas, model);

    assert.strictEqual(SvgDomRenderer.stats.nodesRemoved, 1, 'Should remove 1 orphaned DOM node');
    assert.strictEqual((mockSvgCanvas as any).querySelector('#circle_dom_2'), null, 'Orphan node must be deleted');
  });

  console.log(`\nIncremental DOM Diffing Renderer: ${passed}/5 tests passed.\n`);
  return true;
}
