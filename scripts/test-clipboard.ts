import { ClipboardManager } from '../src/webview/engine/clipboard/ClipboardManager.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { SvgValidator } from '../src/webview/engine/export/SvgValidator.js';

export async function runClipboardTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Multi-Flavour Clipboard Test Suite (07.3)');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  // 1. Empty elements handling
  const emptyRes = ClipboardManager.buildSelectionSvg([]);
  assert(
    typeof emptyRes.svgString === 'string' && emptyRes.width > 0 && emptyRes.height > 0,
    'Empty selection returns valid fallback canvas dimensions without crashing'
  );

  // 2. Synthesize elements with bounding box
  const testElements: VectorElement[] = [
    {
      id: 'rect_clip_1',
      tagName: 'rect',
      isParametric: true,
      shapeType: 'rect',
      vertices: [
        { id: 'v0', x: 100, y: 100, command: 'M', nodeType: 'sharp' },
        { id: 'v1', x: 200, y: 100, command: 'L', nodeType: 'sharp' },
        { id: 'v2', x: 200, y: 160, command: 'L', nodeType: 'sharp' },
        { id: 'v3', x: 100, y: 160, command: 'L', nodeType: 'sharp' },
      ],
      attributes: {
        id: 'rect_clip_1',
        x: '100',
        y: '100',
        width: '100',
        height: '60',
        fill: '#3b82f6',
        stroke: '#1e3a8a',
        'stroke-width': '2',
      },
    },
    {
      id: 'circle_clip_2',
      tagName: 'circle',
      isParametric: true,
      shapeType: 'circle',
      vertices: [
        { id: 'v4', x: 250, y: 100, command: 'M', nodeType: 'smooth' },
        { id: 'v5', x: 310, y: 160, command: 'M', nodeType: 'smooth' },
      ],
      attributes: {
        id: 'circle_clip_2',
        cx: '280',
        cy: '130',
        r: '30',
        fill: '#10b981',
      },
    },
  ];

  const selectionResult = ClipboardManager.buildSelectionSvg(testElements);

  assert(
    selectionResult.width > 0 && selectionResult.height > 0,
    `Selection bounds computed successfully (width: ${selectionResult.width}, height: ${selectionResult.height})`
  );

  assert(
    selectionResult.svgString.includes('id="rect_clip_1"') && selectionResult.svgString.includes('id="circle_clip_2"'),
    'Compiled selection SVG contains all selected entities'
  );

  const validation = SvgValidator.validate(selectionResult.svgString);
  assert(
    validation.isValid,
    `Selection SVG is 100% syntactically and structurally valid (${validation.error || 'clean XML'})`
  );

  assert(
    selectionResult.svgString.includes('viewBox="'),
    'Compiled selection SVG contains adapted tight viewBox'
  );

  // 3. Mock navigator.clipboard write and fallback verification
  let capturedItems: any = null;
  let textFallbackCalled = false;

  (globalThis as any).Blob = class MockBlob {
    constructor(public parts: any[], public options: any) {}
  };

  (globalThis as any).ClipboardItem = class MockClipboardItem {
    constructor(public items: Record<string, any>) {}
  };

  const mockClipboard = {
    write: async (items: any[]) => {
      capturedItems = items;
    },
    writeText: async (_text: string) => {
      textFallbackCalled = true;
    },
  };

  try {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });
  } catch (_) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: mockClipboard },
      configurable: true,
      writable: true,
    });
  }

  // Run async copy with await
  const copyOk = await ClipboardManager.copySelectionMultiFlavour(testElements);

  assert(
    copyOk === true,
    'ClipboardManager.copySelectionMultiFlavour returned true'
  );

  // Verify sync mock execution
  assert(
    capturedItems !== null && capturedItems.length === 1,
    'navigator.clipboard.write was called with a ClipboardItem'
  );

  const itemPayload = capturedItems[0].items;
  assert(
    itemPayload['text/plain'] !== undefined,
    'Clipboard payload includes text/plain flavour'
  );
  assert(
    itemPayload['image/svg+xml'] !== undefined,
    'Clipboard payload includes image/svg+xml flavour'
  );

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 Multi-flavour clipboard passed all tests!\n');
    return true;
  } else {
    console.error('❌ One or more clipboard tests failed.\n');
    return false;
  }
}
