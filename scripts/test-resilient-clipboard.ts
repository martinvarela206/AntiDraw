import { strict as assert } from 'assert';
import { ClipboardManager } from '../src/webview/engine/clipboard/ClipboardManager.js';
import { ClipboardService } from '../src/webview/services/ClipboardService.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

export async function runResilientClipboardTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Resilient Multi-Flavour Clipboard Suite');
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

  const sampleElements: VectorElement[] = [
    {
      id: 'rect_1',
      tagName: 'rect',
      attributes: {
        id: 'rect_1',
        x: '10',
        y: '20',
        width: '100',
        height: '50',
        fill: '#ff0000',
      },
    },
    {
      id: 'path_1',
      tagName: 'path',
      attributes: {
        id: 'path_1',
        d: 'M 30 30 L 60 60',
        stroke: '#00ff00',
      },
      vertices: [
        { id: 'v1', x: 30, y: 30, type: 'corner' },
        { id: 'v2', x: 60, y: 60, type: 'corner' },
      ],
      isClosed: false,
    },
  ];

  await test('ClipboardManager.buildSelectionSvg produces isolated bounded SVG markup', () => {
    const result = ClipboardManager.buildSelectionSvg(sampleElements);
    assert.ok(result.svgString.includes('<svg'), 'Should contain <svg element');
    assert.ok(result.svgString.includes('viewBox='), 'Should calculate and include viewBox');
    assert.ok(result.svgString.includes('rect_1'), 'Should contain rect_1 element');
    assert.ok(result.svgString.includes('path_1'), 'Should contain path_1 element');
    assert.ok(result.width > 0 && result.height > 0, 'Bounding box dimensions must be positive');
  });

  await test('copySelectionMultiFlavour succeeds via Attempt 1 (all flavours)', async () => {
    let writtenItems: any[] = [];
    (globalThis as any).Blob = class MockBlob {
      constructor(public content: any[], public options: any) {}
    };
    (globalThis as any).ClipboardItem = class MockClipboardItem {
      constructor(public data: Record<string, any>) {}
    };
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        write: async (items: any[]) => {
          writtenItems = items;
        },
      },
      configurable: true,
      writable: true,
    });

    const success = await ClipboardManager.copySelectionMultiFlavour(sampleElements);
    assert.strictEqual(success, true, 'Should successfully write clipboard');
    assert.strictEqual(writtenItems.length, 1, 'Should write 1 ClipboardItem');
    const dataKeys = Object.keys(writtenItems[0].data);
    assert.ok(dataKeys.includes('text/plain'), 'Payload must include text/plain');
    assert.ok(dataKeys.includes('text/html'), 'Payload must include text/html');
    assert.ok(dataKeys.includes('image/svg+xml'), 'Payload must include image/svg+xml');
  });

  await test('copySelectionMultiFlavour gracefully falls back to Attempt 2 when image/svg+xml is disallowed', async () => {
    let callCount = 0;
    let writtenItems: any[] = [];
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        write: async (items: any[]) => {
          callCount++;
          if (callCount === 1) {
            // Simulate Chromium rejection of image/svg+xml
            throw new Error('Type image/svg+xml not supported on write');
          }
          writtenItems = items;
        },
      },
      configurable: true,
      writable: true,
    });

    const success = await ClipboardManager.copySelectionMultiFlavour(sampleElements);
    assert.strictEqual(success, true, 'Should recover via Attempt 2 fallback');
    assert.strictEqual(callCount, 2, 'Should have invoked write twice');
    const dataKeys = Object.keys(writtenItems[0].data);
    assert.ok(dataKeys.includes('text/plain'), 'Fallback must include text/plain');
    assert.ok(dataKeys.includes('text/html'), 'Fallback must include text/html');
    assert.ok(!dataKeys.includes('image/svg+xml'), 'Fallback must omit image/svg+xml to satisfy Chromium');
  });

  await test('copySelectionMultiFlavour gracefully falls back to writeText (Attempt 3) when write() fails entirely', async () => {
    let writtenText = '';
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        write: async () => {
          throw new Error('ClipboardItem write forbidden by sandbox');
        },
        writeText: async (text: string) => {
          writtenText = text;
        },
      },
      configurable: true,
      writable: true,
    });

    const success = await ClipboardManager.copySelectionMultiFlavour(sampleElements);
    assert.strictEqual(success, true, 'Should recover via Attempt 3 writeText');
    assert.ok(writtenText.includes('<svg'), 'writeText must receive SVG string');
  });

  await test('ClipboardService.copy & paste staggers elements and maintains elementPivots calibration', () => {
    const model = new VectorModel();
    const origRect: VectorElement = JSON.parse(JSON.stringify(sampleElements[0]));
    model.elements = [origRect];

    const selectionTool = new SelectionTool();
    selectionTool.elementPivots = new Map();
    selectionTool.elementPivots.set('rect_1', { x: 50, y: 60 });
    selectionTool.selectedElementIds.add('rect_1');

    const canvasMgr = new CanvasManager();
    let undoCount = 0;
    let renderCount = 0;

    const service = new ClipboardService({
      model,
      selectionTool,
      canvasMgr,
      pushUndo: () => { undoCount++; },
      render: () => { renderCount++; },
      syncToHost: () => {},
      syncMetadataToHost: () => {},
      onResetPropertyPanel: () => {},
      onShowGuideSettings: () => {},
      onUpdatePropertyPanel: () => {},
    });

    service.copy();
    assert.strictEqual(service.hasContent, true, 'Should register content in clipboard buffer');

    service.paste();
    assert.strictEqual(undoCount, 1, 'Should record undo step on paste');
    assert.strictEqual(model.elements.length, 2, 'Should append pasted element');

    const pasted = model.elements[1];
    assert.notStrictEqual(pasted.id, 'rect_1', 'Pasted element must receive unique id');
    assert.strictEqual(pasted.attributes.id, pasted.id, 'Pasted attributes.id must synchronize with id');
    assert.strictEqual(pasted.attributes.x, '25', 'Position x must be staggered by +15px (10 + 15 = 25)');
    assert.strictEqual(pasted.attributes.y, '35', 'Position y must be staggered by +15px (20 + 15 = 35)');

    const pastedPivot = selectionTool.elementPivots.get(pasted.id);
    assert.ok(pastedPivot, 'Pasted element must preserve registered pivot');
    assert.strictEqual(pastedPivot?.x, 65, 'Pivot x must stagger by +15px (50 + 15 = 65)');
    assert.strictEqual(pastedPivot?.y, 75, 'Pivot y must stagger by +15px (60 + 15 = 75)');
  });

  console.log(`\nResilient Multi-Flavour Clipboard: ${passed}/5 tests passed.\n`);
  return true;
}