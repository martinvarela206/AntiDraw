import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { CanvasActionDispatcher } from '../src/webview/services/CanvasActionDispatcher.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SvgDeserializer } from '../src/webview/engine/serialization/SvgDeserializer.js';
import { GroupHierarchyService } from '../src/webview/engine/selection/GroupHierarchyService.js';
import { DOMParser } from 'linkedom';

if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

export async function runGroupActionTests(): Promise<boolean> {
  console.log('\n--- Running Hierarchical SVG Grouping & Group Actions Suite ---');

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

  // 1. Group Selection Command (Ctrl+G)
  console.log('\n[1. Group Selection Command (Ctrl+G)]');
  const model = new VectorModel();
  const selectionTool = new SelectionTool();

  let undoCount = 0;
  const dispatcher = new CanvasActionDispatcher({
    model,
    selectionTool,
    pushUndo: () => { undoCount++; },
    render: () => {},
    syncToHost: () => {},
    onResetPropertyPanel: () => {},
    onUpdatePropertyPanel: () => {},
    getActiveTool: () => 'select',
  });

  const el1: VectorElement = {
    id: 'el_1',
    tagName: 'rect',
    shapeType: 'rect',
    isParametric: true,
    attributes: { x: '10', y: '10', width: '40', height: '40', fill: '#ff0000' },
    vertices: [
      { id: 'v1', x: 10, y: 10, command: 'M' },
      { id: 'v2', x: 50, y: 10, command: 'L' },
      { id: 'v3', x: 50, y: 50, command: 'L' },
      { id: 'v4', x: 10, y: 50, command: 'L' },
    ],
  };

  const el2: VectorElement = {
    id: 'el_2',
    tagName: 'circle',
    shapeType: 'circle',
    isParametric: true,
    attributes: { cx: '100', cy: '100', r: '20', fill: '#00ff00' },
    vertices: [
      { id: 'v5', x: 80, y: 100, command: 'M' },
      { id: 'v6', x: 120, y: 100, command: 'L' },
    ],
  };

  const el3: VectorElement = {
    id: 'el_3',
    tagName: 'path',
    shapeType: 'path',
    isParametric: false,
    attributes: { fill: '#0000ff' },
    vertices: [
      { id: 'v7', x: 200, y: 200, command: 'M' },
      { id: 'v8', x: 250, y: 250, command: 'L' },
    ],
  };

  model.elements = [el1, el2, el3];

  // Select el1 and el3 (skipping el2 in between)
  selectionTool.select('el_1');
  selectionTool.toggleSelect('el_3');

  dispatcher.groupSelection();

  assert(model.elements.length === 2, `Model now has 2 root elements (got ${model.elements.length})`);
  assert(undoCount === 1, `Undo snapshot was recorded on group (got ${undoCount})`);

  const group = model.elements.find((e) => e.tagName === 'g')!;
  assert(group !== undefined, `New element is a <g> container`);
  assert(group.children?.length === 2, `Group contains 2 children (got ${group.children?.length})`);
  assert(group.children?.[0].id === 'el_1', `First child is el_1`);
  assert(group.children?.[1].id === 'el_3', `Second child is el_3`);
  assert(model.elements.some((e) => e.id === 'el_2'), `el_2 is preserved at root`);
  assert(selectionTool.isSelected(group.id), `New group is selected`);
  assert(!selectionTool.isSelected('el_1'), `el_1 is no longer directly selected in root`);

  // 2. Isolated Stacking Context & Presentation Attributes
  console.log('\n[2. Isolated Stacking Context & Presentation Attributes]');
  group.attributes['opacity'] = '0.5';
  group.attributes['mix-blend-mode'] = 'multiply';

  // Check that children's individual opacity is not modified
  assert(group.children[0].attributes['opacity'] === undefined, 'Child el_1 opacity is not altered (isolated stacking context)');
  assert(group.children[1].attributes['opacity'] === undefined, 'Child el_3 opacity is not altered (isolated stacking context)');

  // Serialization fidelity
  const serializedSvg = SvgSerializer.toSvgString(model);
  assert(serializedSvg.includes('<g id="'), 'Serialized SVG contains <g id=');
  assert(serializedSvg.includes('opacity="0.5"'), 'Serialized SVG preserves group opacity="0.5"');
  assert(serializedSvg.includes('mix-blend-mode="multiply"') || serializedSvg.includes('mix-blend-mode: multiply'), 'Serialized SVG preserves mix-blend-mode');
  assert(serializedSvg.includes('</g>'), 'Serialized SVG contains closing </g>');

  // Deserialization roundtrip
  const reloadedModel = new VectorModel();
  SvgDeserializer.loadSvgString(serializedSvg, reloadedModel);
  assert(reloadedModel.elements.length === 2, `Reloaded model has 2 elements (got ${reloadedModel.elements.length})`);
  const reloadedGroup = reloadedModel.elements.find((e) => e.tagName === 'g');
  assert(reloadedGroup !== undefined, 'Reloaded model preserves <g> element');
  assert(reloadedGroup?.attributes['opacity'] === '0.5', 'Reloaded group preserves opacity="0.5"');
  assert(reloadedGroup?.children?.length === 2, `Reloaded group has 2 children (got ${reloadedGroup?.children?.length})`);
  assert(reloadedGroup?.children?.[0].id === 'el_1', 'Reloaded first child is el_1');
  assert(reloadedGroup?.children?.[1].id === 'el_3', 'Reloaded second child is el_3');

  // 3. Recursive Leaf Elements Collection & Transforms
  console.log('\n[3. Recursive Leaf Elements Collection & Transforms]');
  const leaves = GroupHierarchyService.collectLeafElements(group);
  assert(leaves.length === 2, `Collected exactly 2 leaf elements from group (got ${leaves.length})`);
  assert(leaves[0].id === 'el_1' && leaves[1].id === 'el_3', 'Leaf elements match child vectors');

  // Translate all leaf elements of group by (+50, +50)
  leaves.forEach((leaf) => {
    if (leaf.vertices) {
      leaf.vertices.forEach((v) => {
        v.x += 50;
        v.y += 50;
      });
    }
  });

  assert(el1.vertices?.[0].x === 60 && el1.vertices?.[0].y === 60, `el_1 vertex was translated (got ${el1.vertices?.[0].x}, ${el1.vertices?.[0].y})`);
  assert(el3.vertices?.[0].x === 250 && el3.vertices?.[0].y === 250, `el_3 vertex was translated (got ${el3.vertices?.[0].x}, ${el3.vertices?.[0].y})`);

  // 4. Nested Grouping & Roundtrip
  console.log('\n[4. Nested Grouping & Roundtrip]');
  selectionTool.deselectAll();
  selectionTool.select(group.id);
  selectionTool.toggleSelect('el_2');

  dispatcher.groupSelection();
  assert(model.elements.length === 1, `Nested grouping collapsed root to 1 parent group`);
  const outerGroup = model.elements[0];
  assert(outerGroup.tagName === 'g', `Outer element is a <g>`);
  assert(outerGroup.children?.length === 2, `Outer group has 2 children`);
  const innerGroup = outerGroup.children?.find((c) => c.tagName === 'g');
  assert(innerGroup !== undefined, `Inner group is preserved inside outer group`);
  assert(innerGroup?.children?.length === 2, `Inner group retains its 2 children`);

  const nestedSvg = SvgSerializer.toSvgString(model);
  const reloadedNested = new VectorModel();
  SvgDeserializer.loadSvgString(nestedSvg, reloadedNested);
  assert(reloadedNested.elements.length === 1, `Reloaded nested SVG has 1 root element`);
  const reOuter = reloadedNested.elements[0];
  assert(reOuter.tagName === 'g', 'Reloaded root element is <g>');
  const reInner = reOuter.children?.find((c) => c.tagName === 'g');
  assert(reInner !== undefined, 'Reloaded nested <g> exists');
  assert(reInner?.children?.length === 2, 'Reloaded nested <g> has 2 leaf children');

  // 5. Ungroup Command (Ctrl+Shift+G)
  console.log('\n[5. Ungroup Command (Ctrl+Shift+G)]');
  selectionTool.deselectAll();
  selectionTool.select(outerGroup.id);

  // Ungroup outer group
  dispatcher.ungroupSelection();
  assert(model.elements.length === 2, `Ungrouping outer group restores 2 root elements`);
  assert(model.elements.some((e) => e.tagName === 'g'), `Inner group is now at root`);
  assert(model.elements.some((e) => e.id === 'el_2'), `el_2 is restored at root`);
  assert(selectionTool.selectedElementIds.size === 2, `Both unpacked children are selected`);

  // Ungroup inner group
  selectionTool.deselectAll();
  const rootInnerGroup = model.elements.find((e) => e.tagName === 'g')!;
  selectionTool.select(rootInnerGroup.id);
  dispatcher.ungroupSelection();

  assert(model.elements.length === 3, `Ungrouping inner group restores all 3 original elements at root`);
  assert(model.elements.every((e) => e.tagName !== 'g'), `No groups remain at root`);
  assert(model.elements.some((e) => e.id === 'el_1'), `el_1 is present at root`);
  assert(model.elements.some((e) => e.id === 'el_2'), `el_2 is present at root`);
  assert(model.elements.some((e) => e.id === 'el_3'), `el_3 is present at root`);

  console.log(`\nHierarchical SVG Grouping Tests complete: ${passedCount} passed, ${failedCount} failed.\n`);
  return failedCount === 0;
}
