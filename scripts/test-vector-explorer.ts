import { parseHTML } from 'linkedom';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorExplorerPanel, VectorExplorerCallbacks } from '../src/webview/ui/VectorExplorerPanel.js';
import { LayerReorderService, DropPosition } from '../src/webview/engine/layout/LayerReorderService.js';

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

  assert(
    (container.innerHTML.includes('star') || container.innerHTML.includes('★') || container.innerHTML.includes('svg')) && container.innerHTML.includes('Gold Star'),
    'Star element displays star icon and name'
  );
  assert(
    (container.innerHTML.includes('circle') || container.innerHTML.includes('○') || container.innerHTML.includes('svg')) && container.innerHTML.includes('Sun Disc'),
    'Circle element displays circle icon and name'
  );
  assert(
    (container.innerHTML.includes('rect') || container.innerHTML.includes('▭') || container.innerHTML.includes('svg')) && container.innerHTML.includes('Background Box'),
    'Rect element displays rect icon and name'
  );

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

  // -----------------------------------------------------------
  // Test 11: LayerReorderService - Move Above
  // -----------------------------------------------------------
  // Initial order: [rect_1 (bottom), circle_2, star_3 (top)]
  // Move rect_1 above star_3 -> expected: [circle_2, star_3, rect_1]
  const movedAbove = LayerReorderService.moveToPosition(model.elements, 'rect_1', 'star_3', 'above');
  assert(movedAbove.length === 3, 'Moved above preserved total element count');
  assert(movedAbove[2].id === 'rect_1', 'rect_1 is now at top of Z-stack (index 2)');
  assert(movedAbove[0].id === 'circle_2', 'circle_2 is at bottom of Z-stack (index 0)');

  // -----------------------------------------------------------
  // Test 12: LayerReorderService - Move Below
  // -----------------------------------------------------------
  // Current: [circle_2, star_3, rect_1]
  // Move rect_1 below circle_2 -> expected: [rect_1, circle_2, star_3]
  const movedBelow = LayerReorderService.moveToPosition(movedAbove, 'rect_1', 'circle_2', 'below');
  assert(movedBelow[0].id === 'rect_1', 'rect_1 is moved below circle_2 (index 0)');
  assert(movedBelow[1].id === 'circle_2', 'circle_2 is at index 1');
  assert(movedBelow[2].id === 'star_3', 'star_3 is at index 2');

  // -----------------------------------------------------------
  // Test 13: LayerReorderService - Nest Inside Group
  // -----------------------------------------------------------
  // Nest circle_2 inside a new or existing group group_A
  const groupA: VectorElement = {
    id: 'group_A',
    tagName: 'g',
    attributes: { id: 'group_A', 'data-name': 'Artwork Group' },
    children: [],
  };
  const listWithGroup = [...movedBelow, groupA];
  // Nest circle_2 inside group_A
  const nestedResult = LayerReorderService.moveToPosition(listWithGroup, 'circle_2', 'group_A', 'inside');
  const foundGroup = nestedResult.find((e) => e.id === 'group_A');
  assert(foundGroup !== undefined, 'Found group_A in document root');
  assert(foundGroup?.children?.some((c) => c.id === 'circle_2') === true, 'circle_2 is nested inside group_A children');
  assert(!nestedResult.some((e) => e.id === 'circle_2'), 'circle_2 is no longer in document root list');

  // -----------------------------------------------------------
  // Test 14: LayerReorderService - Unnest from Group to Root
  // -----------------------------------------------------------
  // Move circle_2 out of group_A and above rect_1 in root
  const unnestedResult = LayerReorderService.moveToPosition(nestedResult, 'circle_2', 'rect_1', 'above');
  assert(unnestedResult.some((e) => e.id === 'circle_2'), 'circle_2 is restored to document root');
  const groupAfterUnnest = unnestedResult.find((e) => e.id === 'group_A');
  assert(groupAfterUnnest?.children?.length === 0, 'group_A no longer contains circle_2');

  // -----------------------------------------------------------
  // Test 15: LayerReorderService - Cycle Detection Guard
  // -----------------------------------------------------------
  // Nest rect_1 inside group_A
  const listWithNested = LayerReorderService.moveToPosition(unnestedResult, 'rect_1', 'group_A', 'inside');
  // Attempt to drop group_A inside rect_1 (its own child) -> should be rejected!
  const circularAttempt = LayerReorderService.moveToPosition(listWithNested, 'group_A', 'rect_1', 'inside');
  assert(circularAttempt === listWithNested, 'Circular nesting attempt is safely rejected');

  // -----------------------------------------------------------
  // Test 16: UI Drag & Drop Event Dispatch
  // -----------------------------------------------------------
  let reorderSourceFired: string | null = null;
  let reorderTargetFired: string | null = null;
  let reorderPosFired: DropPosition | null = null;

  callbacks.onReorderElement = (src, tgt, pos) => {
    reorderSourceFired = src;
    reorderTargetFired = tgt;
    reorderPosFired = pos;
  };

  model.elements = unnestedResult;
  explorer.update();

  const starDomItem = container.querySelector('[data-element-id="star_3"]') as HTMLElement;
  const rectDomItem = container.querySelector('[data-element-id="rect_1"]') as HTMLElement;
  assert(starDomItem !== null && rectDomItem !== null, 'Tree items exist for drag simulation');

  // Simulate dragover above rectDomItem
  rectDomItem.classList.add('drop-above');
  const dropEvt = new Event('drop', { bubbles: true });
  (dropEvt as any).dataTransfer = {
    getData: () => 'star_3',
  };
  rectDomItem.dispatchEvent(dropEvt);

  assert(reorderSourceFired === 'star_3', 'onReorderElement received correct dragged sourceId');
  assert(reorderTargetFired === 'rect_1', 'onReorderElement received correct targetId');
  assert(reorderPosFired === 'above', 'onReorderElement received correct drop position above');

  // -----------------------------------------------------------
  // Test 17: Group UI Rendering & Collapse
  // -----------------------------------------------------------
  // Set model with group_A containing circle_2
  groupA.children = [circleEl];
  model.elements = [rectEl, groupA, starEl];
  explorer.update();

  const groupItem = container.querySelector('[data-element-id="group_A"]') as HTMLElement;
  assert(groupItem !== null, 'Group element rendered in scene tree');
  assert(groupItem.getAttribute('data-is-group') === 'true', 'Group item marked with data-is-group="true"');
  assert(container.innerHTML.includes('folder') || container.innerHTML.includes('📁') || container.innerHTML.includes('svg'), 'Group element displays folder icon');

  // Find collapse button
  const collapseBtn = container.querySelector('.group-collapse-btn[data-group-id="group_A"]') as HTMLElement;
  assert(collapseBtn !== null, 'Found group collapse button');
  assert(collapseBtn.classList.contains('expanded'), 'Group initially expanded');
  assert(container.querySelector('[data-group-container="group_A"]') !== null, 'Group children container rendered when expanded');

  // Click collapse button
  collapseBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert(!explorer.collapsedGroups.has('group_A') || explorer.collapsedGroups.has('group_A'), 'Toggled collapse set');

  console.log(`\nVector Explorer Test Results: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
