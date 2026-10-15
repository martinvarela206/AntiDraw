import { parseHTML } from 'linkedom';
import { GuideManager } from '../src/webview/engine/canvas/GuideManager.js';
import { CanvasManager, GuideLine } from '../src/webview/engine/CanvasManager.js';
import { RulerGuideInspector } from '../src/webview/ui/inspectors/RulerGuideInspector.js';
import { PropertyPanelCallbacks } from '../src/webview/ui/PropertyPanel.js';

export async function runGuideInspectionTests(): Promise<boolean> {
  console.log('\n--- Running Guide Numeric Inspection & Block Translation Suite ---');

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

  // 1. GuideManager Multi-selection Lifecycle
  console.log('\n[1. GuideManager Multi-Selection Tests]');
  const gm = new GuideManager();
  const gV1 = gm.addGuide('vertical', 100);
  const gV2 = gm.addGuide('vertical', 250);
  const gH1 = gm.addGuide('horizontal', 150);
  const gH2 = gm.addGuide('horizontal', 400);

  assert(gm.selectedGuideIds.size === 0, 'Initially no guides selected');
  gm.selectGuide(gV1.id);
  assert(gm.selectedGuideIds.size === 1 && gm.selectedGuideId === gV1.id, 'Single guide selected');
  assert(gm.isGuideSelected(gV1.id), 'isGuideSelected returns true for gV1');
  assert(!gm.isGuideSelected(gV2.id), 'isGuideSelected returns false for unselected gV2');

  // Additive selection (Shift + Click)
  gm.selectGuide(gV2.id, true);
  assert(gm.selectedGuideIds.size === 2, 'Additive selection selects both vertical guides');
  assert(gm.isGuideSelected(gV1.id) && gm.isGuideSelected(gV2.id), 'Both gV1 and gV2 are selected');

  // Toggle selection
  gm.toggleSelectGuide(gV1.id);
  assert(gm.selectedGuideIds.size === 1 && !gm.isGuideSelected(gV1.id), 'Toggling gV1 removes it from selection');
  gm.toggleSelectGuide(gV1.id);
  assert(gm.selectedGuideIds.size === 2 && gm.isGuideSelected(gV1.id), 'Toggling gV1 re-adds it');

  // Clear selection
  gm.clearSelectedGuides();
  assert(gm.selectedGuideIds.size === 0 && gm.selectedGuideId === null, 'clearSelectedGuides clears all');

  // 2. DOM Inspector Rendering for Single Vertical Guide
  console.log('\n[2. Single Vertical Guide Inspection Tests]');
  const { document, Event } = parseHTML('<!doctype html><html><body><div id="inspector"></div></body></html>');
  const container = document.getElementById('inspector') as HTMLElement;

  let updatedGuide: GuideLine | null = null;
  const callbacks: PropertyPanelCallbacks = {
    onUpdateElement: () => {},
    onUpdateCanvas: () => {},
    onNodeTypeChange: () => {},
    onSplitNode: () => {},
    onUpdateGuide: (g) => { updatedGuide = { ...g }; },
  };

  RulerGuideInspector.renderGuideSettings(gV1, container, callbacks);
  const posXInput = container.querySelector<HTMLInputElement>('#guide-pos-x');
  const posYInput = container.querySelector<HTMLInputElement>('#guide-pos-y');
  assert(posXInput !== null, 'Vertical guide renders X: input field');
  assert(posYInput === null, 'Vertical guide does not render Y: input field');
  assert(posXInput?.value === '100', `X: field contains exact position 100 (got ${posXInput?.value})`);

  // Edit X input: should update guide position and pivotX
  if (posXInput) {
    posXInput.value = '180';
    posXInput.dispatchEvent(new Event('change'));
  }
  assert(gV1.position === 180, `Guide position updated to 180 (got ${gV1.position})`);
  assert(gV1.pivotX === 180, `Guide pivotX updated to 180 (got ${gV1.pivotX})`);

  // 3. DOM Inspector Rendering for Single Horizontal Guide
  console.log('\n[3. Single Horizontal Guide Inspection Tests]');
  container.innerHTML = '';
  RulerGuideInspector.renderGuideSettings(gH1, container, callbacks);
  const posXInputH = container.querySelector<HTMLInputElement>('#guide-pos-x');
  const posYInputH = container.querySelector<HTMLInputElement>('#guide-pos-y');
  assert(posXInputH === null, 'Horizontal guide does not render X: input field');
  assert(posYInputH !== null, 'Horizontal guide renders Y: input field');
  assert(posYInputH?.value === '150', `Y: field contains exact position 150 (got ${posYInputH?.value})`);

  // Edit Y input: should update guide position and pivotY
  if (posYInputH) {
    posYInputH.value = '220';
    posYInputH.dispatchEvent(new Event('change'));
  }
  assert(gH1.position === 220, `Guide position updated to 220 (got ${gH1.position})`);
  assert(gH1.pivotY === 220, `Guide pivotY updated to 220 (got ${gH1.pivotY})`);

  // 4. Block Parametric Translation for Multiple Vertical Guides
  console.log('\n[4. Block Parametric Translation: Multiple Vertical Guides]');
  container.innerHTML = '';
  gV1.position = 100;
  gV1.pivotX = 100;
  gV2.position = 300;
  gV2.pivotX = 300;

  const multiV = [gV1, gV2];
  RulerGuideInspector.renderGuideSettings(multiV, container, callbacks);
  const blockPosX = container.querySelector<HTMLInputElement>('#guide-pos-x');
  const blockPosY = container.querySelector<HTMLInputElement>('#guide-pos-y');
  assert(blockPosX !== null, 'Multiple vertical guides render X: input');
  assert(blockPosY === null, 'Multiple vertical guides do not render Y: input');
  assert(container.textContent?.includes('(Bloque 2)'), 'Renders block indicator "(Bloque 2)"');

  // Change primary X from 100 to 150 (delta +50)
  if (blockPosX) {
    blockPosX.value = '150';
    blockPosX.dispatchEvent(new Event('change'));
  }
  assert(gV1.position === 150, `Primary guide gV1 shifted by +50 to 150 (got ${gV1.position})`);
  assert(gV2.position === 350, `Secondary guide gV2 shifted solidarily by +50 to 350 (got ${gV2.position})`);

  // 5. Block Parametric Translation for Mixed Vertical + Horizontal Guides
  console.log('\n[5. Block Parametric Translation: Mixed Vertical & Horizontal]');
  container.innerHTML = '';
  gH1.position = 200;
  gH1.pivotY = 200;
  gH2.position = 500;
  gH2.pivotY = 500;

  const mixedGuides = [gV1, gV2, gH1, gH2];
  RulerGuideInspector.renderGuideSettings(mixedGuides, container, callbacks);
  const mixedX = container.querySelector<HTMLInputElement>('#guide-pos-x');
  const mixedY = container.querySelector<HTMLInputElement>('#guide-pos-y');
  assert(mixedX !== null && mixedY !== null, 'Mixed guides render both X: and Y: input fields');

  // Shift Y block by +40 (from 200 to 240)
  if (mixedY) {
    mixedY.value = '240';
    mixedY.dispatchEvent(new Event('change'));
  }
  assert(gH1.position === 240, `gH1 shifted by +40 to 240 (got ${gH1.position})`);
  assert(gH2.position === 540, `gH2 shifted solidarily by +40 to 540 (got ${gH2.position})`);
  // Ensure vertical guides remained untouched during Y translation
  assert(gV1.position === 150, 'gV1 position unaffected by Y translation');
  assert(gV2.position === 350, 'gV2 position unaffected by Y translation');

  // 6. Block Lock/Unlock and Delete
  console.log('\n[6. Block Lock/Unlock and Delete]');
  const lockBtn = container.querySelector<HTMLButtonElement>('#btn-lock-guides');
  assert(lockBtn !== null, 'Found block lock button');
  if (lockBtn) {
    lockBtn.dispatchEvent(new Event('click'));
  }
  assert(mixedGuides.every((g) => g.locked === true), 'All selected guides are locked in block');

  const deletedIds: string[] = [];
  callbacks.onDeleteGuide = (id) => deletedIds.push(id);
  const deleteBtn = container.querySelector<HTMLButtonElement>('#btn-delete-guide');
  assert(deleteBtn !== null, 'Found block delete button');
  if (deleteBtn) {
    deleteBtn.dispatchEvent(new Event('click'));
  }
  assert(deletedIds.length === 4, `All 4 selected guides deleted in block (got ${deletedIds.length})`);

  console.log(`\nGuide Inspection Tests complete: ${passedCount} passed, ${failedCount} failed.\n`);
  return failedCount === 0;
}
