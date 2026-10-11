import { Toolbar } from '../src/webview/ui/Toolbar.js';
import { ViewportController } from '../src/webview/engine/ViewportController.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { CanvasActionDispatcher } from '../src/webview/services/CanvasActionDispatcher.js';
import { TransformNumericModal } from '../src/webview/ui/TransformNumericModal.js';
import { QuickHelpInspector } from '../src/webview/ui/inspectors/QuickHelpInspector.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

// Ensure complete DOM mock in Node environment
function setupDomMock() {
  const elements = new Set<any>();

  function createMockElement(tag: string): any {
    const listeners: Record<string, Function[]> = {};
    const attrs: Record<string, string> = {};

    let rawInnerHTML = '';
    const el: any = {
      tagName: tag.toUpperCase(),
      className: '',
      get innerHTML() { return rawInnerHTML; },
      set innerHTML(html: string) {
        rawInnerHTML = html;
        const tagRegex = /<([a-z0-9]+)([^>]*)>/gi;
        let match;
        while ((match = tagRegex.exec(html)) !== null) {
          const childTag = match[1];
          if (childTag === 'svg' || childTag === 'polyline' || childTag === 'line') continue;
          const attrStr = match[2];
          const childEl = createMockElement(childTag);
          const idMatch = /id=["']([^"']+)["']/i.exec(attrStr);
          if (idMatch) childEl.setAttribute('id', idMatch[1]);
          const classMatch = /class=["']([^"']+)["']/i.exec(attrStr);
          if (classMatch) childEl.className = classMatch[1];
          const valMatch = /value=["']([^"']+)["']/i.exec(attrStr);
          if (valMatch) childEl.value = valMatch[1];
          el.appendChild(childEl);
        }
      },
      innerText: '',
      textContent: '',
      title: '',
      value: '',
      checked: false,
      children: [] as any[],
      style: {},
      parentNode: null as any,
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      getAttribute: (k: string) => attrs[k] || null,
      removeAttribute: (k: string) => { delete attrs[k]; },
      addEventListener: (evt: string, fn: Function) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      removeEventListener: (evt: string, fn: Function) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt].filter((f) => f !== fn);
        }
      },
      dispatchEvent: (e: any) => {
        const type = e.type || e;
        const list = listeners[type] || [];
        for (const fn of list) {
          fn({
            type,
            target: el,
            preventDefault: () => {},
            stopPropagation: () => {},
            ...e,
          });
        }
        return true;
      },
      click: () => {
        el.dispatchEvent({ type: 'click', target: el });
      },
      focus: () => {},
      select: () => {},
      appendChild: (child: any) => {
        el.children.push(child);
        child.parentNode = el;
        elements.add(child);
        return child;
      },
      removeChild: (child: any) => {
        const idx = el.children.indexOf(child);
        if (idx >= 0) el.children.splice(idx, 1);
        child.parentNode = null;
        elements.delete(child);
        return child;
      },
      remove: () => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      },
      querySelector: (selector: string): any => {
        return findFirst(el, selector);
      },
      querySelectorAll: (selector: string): any[] => {
        const results: any[] = [];
        findAll(el, selector, results);
        return results;
      },
    };

    elements.add(el);
    return el;
  }

  function matches(node: any, sel: string): boolean {
    if (!node) return false;
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return typeof node.className === 'string' && node.className.split(/\s+/).includes(cls);
    }
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return node.id === id || node.getAttribute?.('id') === id;
    }
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inner = sel.slice(1, -1);
      const [k, vRaw] = inner.split('=');
      const v = vRaw ? vRaw.replace(/['"]/g, '') : null;
      const attrVal = node.getAttribute?.(k);
      return v !== null ? attrVal === v : attrVal !== null;
    }
    return node.tagName?.toLowerCase() === sel.toLowerCase();
  }

  function findFirst(root: any, sel: string): any {
    for (const child of root.children) {
      if (matches(child, sel)) return child;
      const found = findFirst(child, sel);
      if (found) return found;
    }
    return null;
  }

  function findAll(root: any, sel: string, acc: any[]) {
    for (const child of root.children) {
      if (matches(child, sel)) acc.push(child);
      findAll(child, sel, acc);
    }
  }

  const body = createMockElement('body');
  const windowMock: any = {
    addEventListener: (evt: string, fn: Function) => {
      body.addEventListener(evt, fn);
    },
    removeEventListener: (evt: string, fn: Function) => {
      body.removeEventListener(evt, fn);
    },
  };

  (globalThis as any).document = {
    createElement: createMockElement,
    body: body,
    querySelector: (sel: string) => findFirst(body, sel),
    querySelectorAll: (sel: string) => {
      const results: any[] = [];
      findAll(body, sel, results);
      return results;
    },
    getElementById: (id: string) => findFirst(body, '#' + id),
  };

  (globalThis as any).window = windowMock;
}

export async function runToolbarDblClickTests(): Promise<boolean> {
  setupDomMock();

  console.log('\n======================================================');
  console.log('🧪 Running Toolbar Double-Click & Numeric Transform Suite (09.2)');
  console.log('======================================================');

  // 1. Toolbar single-click vs double-click behavior
  const container = document.createElement('div');
  let changedTool = '';
  let dblClickedTool = '';

  const toolbar = new Toolbar(
    container,
    (t) => { changedTool = t; },
    (t) => { dblClickedTool = t; }
  );

  const selectBtn = container.querySelector('[data-tool="select"]');
  const zoomBtn = container.querySelector('[data-tool="zoom"]');

  assert(!!selectBtn && !!zoomBtn, 'Toolbar buttons rendered for select and zoom');

  // Single click sets active tool
  selectBtn.click();
  assert(changedTool === 'select' && toolbar.activeTool === 'select', 'Single click activates tool immediately without lag');

  // Double click fires onToolDoubleClick
  selectBtn.dispatchEvent({ type: 'dblclick' });
  assert(dblClickedTool === 'select', 'Double-click on Select tool fires onToolDoubleClick callback');

  zoomBtn.dispatchEvent({ type: 'dblclick' });
  assert(dblClickedTool === 'zoom', 'Double-click on Zoom tool fires onToolDoubleClick callback');

  // 2. ViewportController Fit-To-Screen
  const scrollArea = document.createElement('div');
  Object.defineProperty(scrollArea, 'clientWidth', { value: 1000, configurable: true });
  Object.defineProperty(scrollArea, 'clientHeight', { value: 800, configurable: true });

  const canvasWrapper = document.createElement('div');
  const canvasMgr = new CanvasManager();
  const model = new VectorModel();
  model.canvas.width = 800;
  model.canvas.height = 600;

  let zoomChangedVal = 0;
  let renderOverlayCalled = false;

  const viewportCtrl = new ViewportController({
    canvasScrollArea: scrollArea,
    canvasWrapper: canvasWrapper,
    getSvgCanvas: () => null,
    canvasMgr: canvasMgr,
    model: model,
    onRender: () => {},
    onApplyCanvasSize: () => {},
    onRenderOverlay: () => { renderOverlayCalled = true; },
    onZoomChanged: (z) => { zoomChangedVal = z; },
  });

  // Execute fitToScreen with 32px padding:
  // availW = 1000 - 64 = 936; vbW = 800 -> 936/800 = 1.17
  // availH = 800 - 64 = 736; vbH = 600 -> 736/600 = 1.226
  // min scale = 1.17
  viewportCtrl.fitToScreen(32);
  assert(canvasMgr.zoom === 1.17, `fitToScreen(32) scales zoom to exact fit (expected 1.17, got ${canvasMgr.zoom})`);
  assert(renderOverlayCalled, 'fitToScreen triggers overlay render');
  assert(zoomChangedVal === 1.17, 'fitToScreen notifies onZoomChanged callback');

  // 3. CanvasActionDispatcher Numeric Translation
  const selectionTool = new SelectionTool();
  let undoPushed = false;
  let rendered = false;
  let synced = false;

  const rectEl: VectorElement = {
    id: 'el_test_rect_1',
    tagName: 'path',
    vertices: [
      { id: 'v1', x: 100, y: 100 },
      { id: 'v2', x: 200, y: 100 },
      { id: 'v3', x: 200, y: 150 },
      { id: 'v4', x: 100, y: 150 },
    ],
    attributes: { d: 'M 100 100 L 200 100 L 200 150 L 100 150 Z' },
  };
  model.elements = [rectEl];
  selectionTool.select('el_test_rect_1');

  const dispatcher = new CanvasActionDispatcher({
    model: model,
    selectionTool: selectionTool,
    pushUndo: () => { undoPushed = true; },
    render: () => { rendered = true; },
    syncToHost: () => { synced = true; },
    onResetPropertyPanel: () => {},
    onUpdatePropertyPanel: () => {},
    getActiveTool: () => 'select',
  });

  // Non-duplicate translation (dx: 50, dy: -20)
  dispatcher.translateSelection(50, -20, false);
  assert(undoPushed, 'translateSelection pushes undo history');
  assert(rendered && synced, 'translateSelection re-renders and syncs state');
  assert(rectEl.vertices![0].x === 150 && rectEl.vertices![0].y === 80, `Vertices translated to (150, 80) (got ${rectEl.vertices![0].x}, ${rectEl.vertices![0].y})`);

  // Duplicate translation (dx: 30, dy: 30, duplicate: true)
  dispatcher.translateSelection(30, 30, true);
  assert(model.elements.length === 2, `Cloned element created on duplicate translate (got ${model.elements.length})`);
  const clone = model.elements[1];
  assert(clone.id !== rectEl.id, 'Clone received globally unique element ID');
  assert(clone.vertices![0].x === 180 && clone.vertices![0].y === 110, `Clone displaced by (+30, +30) to (180, 110) (got ${clone.vertices![0].x}, ${clone.vertices![0].y})`);
  assert(selectionTool.isSelected(clone.id) && !selectionTool.isSelected(rectEl.id), 'Selection switched to new clone');

  // 4. TransformNumericModal Component
  let appliedDx = 0;
  let appliedDy = 0;
  let appliedDup = false;

  TransformNumericModal.show({
    currentBox: { x: 100, y: 100, width: 200, height: 100 },
    selectedCount: 1,
    onApply: (dx, dy, dup) => {
      appliedDx = dx;
      appliedDy = dy;
      appliedDup = dup;
    },
  });

  const modalBackdrop = document.querySelector('.ad-modal-backdrop');
  assert(!!modalBackdrop, 'TransformNumericModal backdrop rendered in DOM');

  const dxInput = document.querySelector('#modal-transform-dx');
  const dyInput = document.querySelector('#modal-transform-dy');
  const dupCheck = document.querySelector('#modal-transform-duplicate');
  const applyBtn = document.querySelector('.ad-modal-btn-confirm');

  assert(!!dxInput && !!dyInput && !!dupCheck && !!applyBtn, 'Modal form controls instantiated');

  dxInput.value = '45';
  dxInput.dispatchEvent({ type: 'input' });
  dyInput.value = '-15';
  dyInput.dispatchEvent({ type: 'input' });
  dupCheck.checked = true;

  applyBtn.click();
  assert(appliedDx === 45 && appliedDy === -15 && appliedDup === true, `Modal apply dispatched dx=45, dy=-15, dup=true (got ${appliedDx}, ${appliedDy}, ${appliedDup})`);
  assert(!document.querySelector('.ad-modal-backdrop'), 'Modal dismissed after successful apply');

  // 5. QuickHelpInspector documentation
  const selectHelp = QuickHelpInspector.TOOL_HELP_MAP.select;
  const zoomHelp = QuickHelpInspector.TOOL_HELP_MAP.zoom;

  assert(
    selectHelp.shortcuts.some((s) => s.keys.includes('Doble clic icono (V)')),
    'QuickHelpInspector documents double-click on Select tool icon (V)'
  );
  assert(
    zoomHelp.shortcuts.some((s) => s.keys.includes('Doble clic icono (Z)')),
    'QuickHelpInspector documents double-click on Zoom tool icon (Z)'
  );

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed of ${passed + failed} assertions.`);
  if (failed === 0) {
    console.log('🎉 Toolbar double-click & numeric transform passed all tests!\n');
    return true;
  } else {
    console.error('💥 Some assertions failed!\n');
    return false;
  }
}
