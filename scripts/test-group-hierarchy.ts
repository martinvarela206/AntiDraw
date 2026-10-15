import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { GroupHierarchyService } from '../src/webview/engine/selection/GroupHierarchyService.js';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';

export async function runGroupHierarchyTests(): Promise<boolean> {
  console.log('\n--- Running Group Hierarchy & Drill-Down Navigation Suite ---');

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

  // Construct a nested group tree:
  // Root elements:
  // - rect_root (10, 10, 50, 50)
  // - group_root:
  //     - child_rect (100, 100, 40, 40)
  //     - group_nested:
  //         - inner_circle (200, 200, 30, 30)
  //         - inner_path (250, 250, 20, 20)

  const rectRoot: VectorElement = {
    id: 'rect_root',
    tagName: 'rect',
    shapeType: 'rect',
    isParametric: true,
    attributes: { x: '10', y: '10', width: '50', height: '50', fill: '#ff0000' },
    vertices: [],
  };

  const childRect: VectorElement = {
    id: 'child_rect',
    tagName: 'rect',
    shapeType: 'rect',
    isParametric: true,
    attributes: { x: '100', y: '100', width: '40', height: '40', fill: '#00ff00' },
    vertices: [
      { id: 'v1', x: 100, y: 100 } as any,
      { id: 'v2', x: 140, y: 100 } as any,
      { id: 'v3', x: 140, y: 140 } as any,
      { id: 'v4', x: 100, y: 140 } as any,
    ],
  };

  const innerCircle: VectorElement = {
    id: 'inner_circle',
    tagName: 'circle',
    shapeType: 'circle',
    isParametric: true,
    attributes: { cx: '215', cy: '215', r: '15', fill: '#0000ff' },
    vertices: [
      { id: 'c1', x: 200, y: 200 } as any,
      { id: 'c2', x: 230, y: 200 } as any,
      { id: 'c3', x: 230, y: 230 } as any,
      { id: 'c4', x: 200, y: 230 } as any,
    ],
  };

  const innerPath: VectorElement = {
    id: 'inner_path',
    tagName: 'path',
    shapeType: 'path',
    isParametric: false,
    attributes: { fill: '#ffff00' },
    vertices: [
      { id: 'p1', x: 250, y: 250 } as any,
      { id: 'p2', x: 270, y: 250 } as any,
      { id: 'p3', x: 270, y: 270 } as any,
      { id: 'p4', x: 250, y: 270 } as any,
    ],
  };

  const groupNested: VectorElement = {
    id: 'group_nested',
    tagName: 'g',
    attributes: {},
    children: [innerCircle, innerPath],
    vertices: [],
  };

  const groupRoot: VectorElement = {
    id: 'group_root',
    tagName: 'g',
    attributes: {},
    children: [childRect, groupNested],
    vertices: [],
  };

  const elements: VectorElement[] = [rectRoot, groupRoot];

  // 1. Ancestry chain computation
  console.log('\n[1. Pure Ancestry Chain Tests]');
  const chainRoot = GroupHierarchyService.getAncestryChain(elements, 'rect_root');
  assert(chainRoot.length === 1 && chainRoot[0].id === 'rect_root', 'Ancestry chain for root element has length 1');

  const chainChild = GroupHierarchyService.getAncestryChain(elements, 'child_rect');
  assert(
    chainChild.length === 2 && chainChild[0].id === 'group_root' && chainChild[1].id === 'child_rect',
    'Ancestry chain for direct child has length 2 [group_root, child_rect]'
  );

  const chainDeep = GroupHierarchyService.getAncestryChain(elements, 'inner_circle');
  assert(
    chainDeep.length === 3 &&
      chainDeep[0].id === 'group_root' &&
      chainDeep[1].id === 'group_nested' &&
      chainDeep[2].id === 'inner_circle',
    'Ancestry chain for nested child has length 3 [group_root, group_nested, inner_circle]'
  );

  // 2. Single-click selection resolution
  console.log('\n[2. Single-Click Selection Resolution Tests]');
  // No active drill-down context:
  const sel1 = GroupHierarchyService.resolveSelection(elements, 'inner_circle', null);
  assert(
    sel1.targetId === 'group_root' && sel1.nextContextId === null,
    'Single-click with no active context resolves to topmost root group'
  );

  // With activeContextId = 'group_root':
  const sel2 = GroupHierarchyService.resolveSelection(elements, 'inner_circle', 'group_root');
  assert(
    sel2.targetId === 'group_nested' && sel2.nextContextId === 'group_root',
    'Single-click inside active group_root context resolves to intermediate group_nested'
  );

  // With activeContextId = 'group_nested':
  const sel3 = GroupHierarchyService.resolveSelection(elements, 'inner_circle', 'group_nested');
  assert(
    sel3.targetId === 'inner_circle' && sel3.nextContextId === 'group_nested',
    'Single-click inside active group_nested context resolves to leaf inner_circle'
  );

  // Click outside active drill-down context resets to clicked root element:
  const sel4 = GroupHierarchyService.resolveSelection(elements, 'rect_root', 'group_nested');
  assert(
    sel4.targetId === 'rect_root' && sel4.nextContextId === null,
    'Single-click outside active context resets context to null and selects rect_root'
  );

  // 3. Double-click drill-down
  console.log('\n[3. Double-Click Drill-Down Tests]');
  // User has group_root selected, double-clicks inner_circle:
  const drill1 = GroupHierarchyService.drillDown(elements, 'group_root', 'inner_circle');
  assert(
    drill1.nextSelectedId === 'group_nested' && drill1.nextContextId === 'group_root' && !drill1.isLeaf,
    'Double-click on group_root drills down to group_nested (isLeaf=false)'
  );

  // User has group_nested selected, double-clicks inner_circle:
  const drill2 = GroupHierarchyService.drillDown(elements, 'group_nested', 'inner_circle');
  assert(
    drill2.nextSelectedId === 'inner_circle' && drill2.nextContextId === 'group_nested' && drill2.isLeaf,
    'Double-click on group_nested drills down to inner_circle (isLeaf=true)'
  );

  // User has inner_circle selected, double-clicks it again:
  const drill3 = GroupHierarchyService.drillDown(elements, 'inner_circle', 'inner_circle');
  assert(
    drill3.nextSelectedId === 'inner_circle' && drill3.isLeaf,
    'Double-click on leaf inner_circle remains on leaf with isLeaf=true (ready for node tool)'
  );

  // 4. Escape key hierarchical ascension
  console.log('\n[4. Escape Key Hierarchical Ascension Tests]');
  // From innermost leaf inner_circle:
  const asc1 = GroupHierarchyService.ascend(elements, 'inner_circle');
  assert(
    asc1.handled && asc1.nextSelectedId === 'group_nested' && asc1.nextContextId === 'group_root',
    'Escape from inner_circle ascends to parent group_nested with context group_root'
  );

  // From group_nested:
  const asc2 = GroupHierarchyService.ascend(elements, 'group_nested');
  assert(
    asc2.handled && asc2.nextSelectedId === 'group_root' && asc2.nextContextId === null,
    'Escape from group_nested ascends to root group_root with context null'
  );

  // From group_root:
  const asc3 = GroupHierarchyService.ascend(elements, 'group_root');
  assert(
    asc3.handled && asc3.nextSelectedId === null && asc3.nextContextId === null,
    'Escape from root group deselects all (nextSelectedId=null)'
  );

  // 5. Shift + Click additive selection blocking ancestors
  console.log('\n[5. Shift + Click Additive Selection Tests]');
  const add1 = GroupHierarchyService.resolveAdditiveSelection(elements, 'inner_circle', null);
  assert(add1 === 'group_root', 'Shift+Click with no context selects root group');

  const add2 = GroupHierarchyService.resolveAdditiveSelection(elements, 'child_rect', 'group_root');
  assert(add2 === 'child_rect', 'Shift+Click inside group_root selects child_rect at same level');

  const add3 = GroupHierarchyService.resolveAdditiveSelection(elements, 'inner_path', 'group_nested');
  assert(add3 === 'inner_path', 'Shift+Click inside group_nested selects sibling inner_path at same level');

  // 6. Group BoundingBox Calculator
  console.log('\n[6. Group Composite BoundingBox Tests]');
  const groupNestedBox = BoundingBoxCalculator.getBoundingBox(groupNested);
  assert(
    groupNestedBox !== null &&
      groupNestedBox.x === 200 &&
      groupNestedBox.y === 200 &&
      groupNestedBox.width === 70 &&
      groupNestedBox.height === 70,
    `Composite bounding box for group_nested encompasses inner_circle and inner_path: ${JSON.stringify(groupNestedBox)}`
  );

  const groupRootBox = BoundingBoxCalculator.getBoundingBox(groupRoot);
  assert(
    groupRootBox !== null &&
      groupRootBox.x === 100 &&
      groupRootBox.y === 100 &&
      groupRootBox.width === 170 &&
      groupRootBox.height === 170,
    `Composite bounding box for group_root encompasses child_rect and group_nested: ${JSON.stringify(groupRootBox)}`
  );

  // 7. Recursive Hit Testing
  console.log('\n[7. Recursive Hit Testing Tests]');
  const hitLeaf = HitTestService.hitTest(elements, { x: 215, y: 215 }, 1);
  assert(hitLeaf !== null && hitLeaf.element.id === 'inner_circle', 'HitTest successfully penetrates group hierarchy to find inner_circle');

  const hitOutside = HitTestService.hitTest(elements, { x: 500, y: 500 }, 1);
  assert(hitOutside === null, 'HitTest outside all elements returns null');

  // 8. SelectionTool activeGroupContextId lifecycle
  console.log('\n[8. SelectionTool activeGroupContextId Lifecycle Tests]');
  const selTool = new SelectionTool();
  assert(selTool.activeGroupContextId === null, 'SelectionTool initializes activeGroupContextId as null');
  selTool.activeGroupContextId = 'group_root';
  selTool.select('child_rect');
  assert(selTool.isSelected('child_rect'), 'SelectionTool selects child_rect');
  selTool.deselectAll();
  assert(selTool.activeGroupContextId === null, 'SelectionTool.deselectAll() resets activeGroupContextId to null');

  console.log(`\nGroup Hierarchy Tests complete: ${passedCount} passed, ${failedCount} failed.\n`);
  return failedCount === 0;
}
