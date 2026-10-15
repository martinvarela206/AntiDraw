import { parseHTML } from 'linkedom';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorExplorerPanel, VectorExplorerCallbacks } from '../src/webview/ui/VectorExplorerPanel.js';

export async function runVectorExplorerTests(): Promise<boolean> {
  console.log('\n--- Running Vector Explorer (Scene Tree) Suite ---');

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

  // Create real DOM document via linkedom
  const { document, Event } = parseHTML('<!doctype html><html><body><div id="vector-explorer-container"></div></body></html>');
  const container = document.getElementById('vector-explorer-container') as HTMLElement;

  // Set up model, canvas manager, and selection tool
  const model = new VectorModel();
  const canvasMgr = new CanvasManager();
  canvasMgr.showVectorExplorer = true; // explicitly visible for test
  const selectionTool = new SelectionTool();

  // Add sample elements to model (Z-order: rect_1 at bottom, circle_2 in middle, star_3 on top)
  const rectEl: VectorElement = {
    id: 'rect_1',
    tagName: 'rect',
    shapeType: 'rect',
    isParametric: true,
    attributes: { id: 'rect_1', 'data-name': 'Background Box', display: 'inline', 'data-locked': 'false' },
    vertices: [],
  };
  const circleEl: VectorElement = {
    id: 'circle_2',
    tagName: 'circle',
    shapeType: 'circle',
    isParametric: true,
    attributes: { id: 'circle_2', 'data-name': 'Sun Disc', display: 'none', 'data-locked': 'true' },
    vertices: [],
  };
  const starEl: VectorElement = {
    id: 'star_3',
    tagName: 'polygon',
    shapeType: 'star',
    isParametric: true,
    attributes: { id: 'star_3', 'data-name': 'Gold Star', display: 'inline', 'data-locked': 'false' },
    vertices: [],
  };

  model.elements = [rectEl, circleEl, starEl];

  // Add guides and grids to canvasMgr
  canvasMgr.addGuide('horizontal', 150);
  canvasMgr.addGuide('vertical', 300);

  let selectedIdFired: string | null = null;
  let multiSelectFired: boolean | undefined = undefined;
  let toggledVisIdFired: string | null = null;
  let toggledLockIdFired: string | null = null;
  let recenterFired: boolean = false;
  let closedFired: boolean = false;

  const callbacks: VectorExplorerCallbacks = {
    onSelectElement: (id, multi) => {
      selectedIdFired = id;
      multiSelectFired = multi;
    },
    onToggleVisibility: (id) => {
      toggledVisIdFired = id;
      const el = model.elements.find((e) => e.id === id);
      if (el) {
        el.attributes.display = el.attributes.display === 'none' ? 'inline' : 'none';
      }
    },
    onToggleLock: (id) => {
      toggledLockIdFired = id;
      const el = model.elements.find((e) => e.id === id);
      if (el) {
        const locked = el.attributes['data-locked'] === 'true';
        el.attributes['data-locked'] = locked ? 'false' : 'true';
      }
    },
    onRecenterViewBox: () => {
      recenterFired = true;
    },
    onClose: () => {
      closedFired = true;
    },
  };

  const explorer = new VectorExplorerPanel(container, model, canvasMgr, selectionTool, callbacks);

  // -----------------------------------------------------------
  // Test 1: Container and Two Branches presence
  // -----------------------------------------------------------
  assert(container.innerHTML.includes('Explorador de Vectores'), 'Panel header contains title');
  assert(container.innerHTML.includes('Rama 1: Contexto'), 'Branch 1 (Context Elements) rendered');
  assert(container.innerHTML.includes('Rama 2: Objetos SVG'), 'Branch 2 (Document Objects) rendered');

  // -----------------------------------------------------------
  // Test 2: Rama 1 Context Elements (Grids, Guides, ViewBox)
  // -----------------------------------------------------------
  assert(container.innerHTML.includes('orthogonal (20px)'), 'Context branch lists primary grid');
  assert(container.innerHTML.includes('H: 150px'), 'Context branch lists horizontal guide');
  assert(container.innerHTML.includes('V: 300px'), 'Context branch lists vertical guide');
  assert(container.innerHTML.includes('0 0 800 600'), 'Context branch displays ViewBox dimensions');

  // -----------------------------------------------------------
  // Test 3: Rama 2 Document Elements in reverse Z-order
  // -----------------------------------------------------------
  const starIdx = container.innerHTML.indexOf('star_3');
  const circleIdx = container.innerHTML.indexOf('circle_2');
  const rectIdx = container.innerHTML.indexOf('rect_1');

  assert(starIdx < circleIdx && circleIdx < rectIdx, 'Elements listed from top of Z-order (star) to bottom (rect)');
  assert(container.innerHTML.includes('★') && container.innerHTML.includes('Gold Star'), 'Star element displays star icon and name');
  assert(container.innerHTML.includes('○') && container.innerHTML.includes('Sun Disc'), 'Circle element displays circle icon and name');
  assert(container.innerHTML.includes('▭') && container.innerHTML.includes('Background Box'), 'Rect element displays rect icon and name');

  // -----------------------------------------------------------
  // Test 4: Selection State Synchronization
  // -----------------------------------------------------------
  selectionTool.selectedElementIds.add('star_3');
  explorer.update();
  const starItem = container.querySelector('[data-element-id="star_3"]') as HTMLElement;
  assert(starItem !== null, 'Found star item element in real DOM tree');
  assert(starItem.classList.contains('selected'), 'Selected element has .selected class in tree');

  // -----------------------------------------------------------
  // Test 5: Element Selection & Multi-select dispatch
  // -----------------------------------------------------------
  const rectItem = container.querySelector('[data-element-id="rect_1"]') as HTMLElement;
  assert(rectItem !== null, 'Found rect item element in real DOM tree');
  const shiftClickEvt = new Event('click', { bubbles: true });
  (shiftClickEvt as any).shiftKey = true;
  rectItem.dispatchEvent(shiftClickEvt);
  assert(selectedIdFired === 'rect_1', 'onSelectElement fired with correct element ID');
  assert(multiSelectFired === true, 'onSelectElement preserves Shift multiSelect modifier');

  // -----------------------------------------------------------
  // Test 6: Visibility Toggle
  // -----------------------------------------------------------
  const circleVisBtn = container.querySelector('.btn-elem-vis[data-element-id="circle_2"]') as HTMLElement;
  assert(circleVisBtn !== null, 'Found circle visibility toggle button');
  circleVisBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert(toggledVisIdFired === 'circle_2', 'onToggleVisibility callback invoked');
  assert(circleEl.attributes.display === 'inline', 'Circle visibility toggled from none to inline');

  // -----------------------------------------------------------
  // Test 7: Lock Toggle
  // -----------------------------------------------------------
  const rectLockBtn = container.querySelector('.btn-elem-lock[data-element-id="rect_1"]') as HTMLElement;
  assert(rectLockBtn !== null, 'Found rect lock toggle button');
  rectLockBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert(toggledLockIdFired === 'rect_1', 'onToggleLock callback invoked');
  assert(rectEl.attributes['data-locked'] === 'true', 'Rect locked attribute toggled to true');

  // -----------------------------------------------------------
  // Test 8: Recenter ViewBox Button
  // -----------------------------------------------------------
  const recenterBtn = container.querySelector('#btn-recenter-vb') as HTMLElement;
  assert(recenterBtn !== null, 'Found recenter ViewBox button in Context branch');
  recenterBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert(recenterFired === true, 'onRecenterViewBox callback invoked on button click');

  // -----------------------------------------------------------
  // Test 9: Close Explorer Button
  // -----------------------------------------------------------
  const closeBtn = container.querySelector('#btn-close-explorer') as HTMLElement;
  assert(closeBtn !== null, 'Found close explorer button in header');
  closeBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert(closedFired === true, 'onClose callback invoked on close button click');

  // -----------------------------------------------------------
  // Test 10: Visibility / Collapse API
  // -----------------------------------------------------------
  explorer.setVisible(false);
  assert(container.classList.contains('hidden'), 'setVisible(false) adds hidden class');
  assert(container.style.display === 'none', 'setVisible(false) sets display: none');

  explorer.setVisible(true);
  assert(!container.classList.contains('hidden'), 'setVisible(true) removes hidden class');
  assert(container.style.display === 'flex', 'setVisible(true) sets display: flex');

  console.log(`\nVector Explorer Test Results: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
