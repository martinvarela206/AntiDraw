import { VectorElement } from '../src/webview/engine/VectorModel.js';
import { SceneLayerService } from '../src/webview/engine/scene/SceneLayerService.js';

export async function runSceneLayerSweepTests(): Promise<boolean> {
  console.log('\n--- Running Scene Layer Linear O(N) Sweep Suite ---');

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

  // 1. Flat Document Stack: [el0, el1, el2, el3, el4]
  console.log('\n[1. Flat Document Z-Stack Sweep]');
  const makeFlatElements = (): VectorElement[] => [
    { id: 'el0', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] },
    { id: 'el1', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] },
    { id: 'el2', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] },
    { id: 'el3', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] },
    { id: 'el4', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] },
  ];

  let elements = makeFlatElements();
  // Select el2 (middle item)
  let res = SceneLayerService.lockAllAbove(elements, new Set(['el2']));
  assert(res.affectedCount === 2, `Lock All Above affected exactly 2 elements (got ${res.affectedCount})`);
  assert(elements[4].attributes['data-locked'] === 'true', 'Top element el4 is locked');
  assert(elements[3].attributes['data-locked'] === 'true', 'Element el3 is locked');
  assert(elements[2].attributes['data-locked'] === 'false', 'Selected element el2 remains unlocked');
  assert(elements[1].attributes['data-locked'] === 'false', 'Element el1 below remains unlocked');
  assert(elements[0].attributes['data-locked'] === 'false', 'Bottom element el0 remains unlocked');

  // Test hideAllAbove on flat stack
  elements = makeFlatElements();
  res = SceneLayerService.hideAllAbove(elements, new Set(['el2']));
  assert(res.affectedCount === 2, `Hide All Above affected exactly 2 elements (got ${res.affectedCount})`);
  assert(elements[4].attributes.display === 'none', 'Top element el4 is hidden');
  assert(elements[3].attributes.display === 'none', 'Element el3 is hidden');
  assert(elements[2].attributes.display === 'inline', 'Selected element el2 remains visible');
  assert(elements[1].attributes.display === 'inline', 'Element el1 below remains visible');
  assert(elements[0].attributes.display === 'inline', 'Bottom element el0 remains visible');

  // 2. Boundary Conditions
  console.log('\n[2. Boundary Conditions]');
  // Topmost element selected (nothing above)
  elements = makeFlatElements();
  res = SceneLayerService.lockAllAbove(elements, new Set(['el4']));
  assert(res.affectedCount === 0, 'Lock All Above with top element selected affects 0 elements');

  // Bottommost element selected (everything above)
  elements = makeFlatElements();
  res = SceneLayerService.lockAllAbove(elements, new Set(['el0']));
  assert(res.affectedCount === 4, `Lock All Above with bottom element selected affects 4 elements (got ${res.affectedCount})`);
  assert(elements[0].attributes['data-locked'] === 'false', 'Selected bottom element remains unlocked');

  // Multiple selection: el1 and el3 selected (highest is el3, so only el4 above)
  elements = makeFlatElements();
  res = SceneLayerService.lockAllAbove(elements, new Set(['el1', 'el3']));
  assert(res.affectedCount === 1 && res.affectedIds[0] === 'el4', 'Multiple selection: only artwork above highest selected element is locked');

  // 3. Hierarchical Scene with Nested Groups
  console.log('\n[3. Hierarchical Scene with Nested Groups]');
  // Tree:
  // - root_bottom (idx 0)
  // - group_mid (idx 1):
  //     - child_0
  //     - child_1 (SELECTED)
  //     - child_2
  // - root_top (idx 2)
  const child0: VectorElement = { id: 'child_0', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] };
  const child1: VectorElement = { id: 'child_1', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] };
  const child2: VectorElement = { id: 'child_2', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] };
  const groupMid: VectorElement = {
    id: 'group_mid',
    tagName: 'g',
    attributes: { 'data-locked': 'false', display: 'inline' },
    children: [child0, child1, child2],
    vertices: [],
  };
  const rootBottom: VectorElement = { id: 'root_bottom', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] };
  const rootTop: VectorElement = { id: 'root_top', tagName: 'rect', attributes: { 'data-locked': 'false', display: 'inline' }, vertices: [] };

  const hierarchicalElements: VectorElement[] = [rootBottom, groupMid, rootTop];

  res = SceneLayerService.lockAllAbove(hierarchicalElements, new Set(['child_1']));
  assert(res.affectedIds.includes('root_top'), 'Root element root_top (above group) is locked');
  assert(res.affectedIds.includes('child_2'), 'Sibling child_2 (above child_1 in group) is locked');
  assert(!res.affectedIds.includes('child_1'), 'Selected child_1 is not locked');
  assert(!res.affectedIds.includes('child_0'), 'Sibling child_0 (below child_1) is not locked');
  assert(!res.affectedIds.includes('root_bottom'), 'Root element root_bottom (below group) is not locked');

  // 4. Global Unlock and Show
  console.log('\n[4. Global Unlock and Show Tests]');
  const unlockRes = SceneLayerService.unlockAll(hierarchicalElements);
  assert(unlockRes.affectedCount >= 2, `unlockAll restored all locked elements (affected ${unlockRes.affectedCount})`);
  assert(rootTop.attributes['data-locked'] === 'false', 'root_top unlocked');
  assert(child2.attributes['data-locked'] === 'false', 'child_2 unlocked');

  // Hide some elements and test showAll
  child2.attributes.display = 'none';
  rootTop.attributes.display = 'none';
  const showRes = SceneLayerService.showAll(hierarchicalElements);
  assert(showRes.affectedCount === 2, `showAll restored all hidden elements (affected ${showRes.affectedCount})`);
  assert(child2.attributes.display === 'inline', 'child_2 visible');
  assert(rootTop.attributes.display === 'inline', 'root_top visible');

  // 5. Performance Stress Test: 10,000 Elements (Linear O(N) Verification)
  console.log('\n[5. High-Density O(N) Performance Benchmark (10,000 Elements)]');
  const hugeList: VectorElement[] = [];
  for (let i = 0; i < 10000; i++) {
    hugeList.push({
      id: `huge_${i}`,
      tagName: 'rect',
      attributes: { 'data-locked': 'false', display: 'inline' },
      vertices: [],
    });
  }

  const startTime = performance.now();
  // Select element at index 5000 (locks 4999 elements above)
  const hugeRes = SceneLayerService.lockAllAbove(hugeList, new Set(['huge_5000']));
  const duration = performance.now() - startTime;

  assert(hugeRes.affectedCount === 4999, `High-density sweep correctly affected 4,999 elements (got ${hugeRes.affectedCount})`);
  assert(duration < 25, `O(N) sweep completed in ${duration.toFixed(2)}ms (< 25ms benchmark threshold)`);

  console.log(`\nScene Layer Sweep Tests complete: ${passedCount} passed, ${failedCount} failed.\n`);
  return failedCount === 0;
}
