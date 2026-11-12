import { DocumentStateFactory, DocumentState } from '../src/webview/core/model/DocumentState.js';
import { DocumentPatchEngine } from '../src/webview/core/model/DocumentPatch.js';
import { HistoryService } from '../src/webview/services/HistoryService.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';

export function runDocumentPatchImmutabilityTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Structural Sharing & Document Patch Suite');
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

  // --- 1. Structural Sharing Verification ---
  const el1: VectorElement = { id: 'el_1', tagName: 'rect', attributes: { x: '10', y: '10', width: '50', height: '50', fill: '#ff0000' } };
  const el2: VectorElement = { id: 'el_2', tagName: 'circle', attributes: { cx: '100', cy: '100', r: '40', fill: '#00ff00' } };
  const el3: VectorElement = { id: 'el_3', tagName: 'path', attributes: { d: 'M 0 0 L 20 20', stroke: '#0000ff' } };

  const state1 = DocumentStateFactory.create({
    revision: 1,
    canvas: { width: 800, height: 600, viewBox: '0 0 800 600', backgroundColor: '#ffffff' },
    elements: [el1, el2, el3],
  });

  // Mutate ONLY el2 in source array
  const el2Mutated: VectorElement = {
    ...el2,
    attributes: { ...el2.attributes, fill: '#ffff00' },
  };

  const state2 = DocumentStateFactory.createWithSharing(
    {
      canvas: state1.canvas,
      elements: [el1, el2Mutated, el3],
    },
    state1
  );

  assert(state1.elements[0] === state2.elements[0], 'Structural sharing: untouched el_1 preserves identical object reference');
  assert(state1.elements[2] === state2.elements[2], 'Structural sharing: untouched el_3 preserves identical object reference');
  assert(state1.elements[1] !== state2.elements[1], 'Modified el_2 receives a new object reference');
  assert(state2.elements[1].attributes.fill === '#ffff00', 'Modified el_2 has updated fill color');

  // --- 2. Bi-directional RFC 6902 Patch Computation ---
  const diff = DocumentPatchEngine.createDiff(state1, state2, 'Update circle fill');

  assert(diff.forward.length === 1, 'Computed 1 forward patch operation for attribute change');
  assert(diff.inverse.length === 1, 'Computed 1 inverse patch operation');
  assert(diff.forward[0].op === 'replace', 'Forward operation is replace');
  assert(diff.forward[0].path === '/elements/el_2', 'Target path points to el_2');
  assert(diff.inverse[0].op === 'replace', 'Inverse operation is replace');
  assert(diff.inverse[0].path === '/elements/el_2', 'Inverse path points to el_2');

  // --- 3. Patch Application & Rollback (Undo/Redo via Patches) ---
  const restoredState = DocumentPatchEngine.applyPatches(state2, diff.inverse);
  assert(restoredState.elements.find((e) => e.id === 'el_2')?.attributes.fill === '#00ff00', 'Applying inverse patch restores initial #00ff00 color');

  const reAppliedState = DocumentPatchEngine.applyPatches(restoredState, diff.forward);
  assert(reAppliedState.elements.find((e) => e.id === 'el_2')?.attributes.fill === '#ffff00', 'Re-applying forward patch restores modified #ffff00 color');

  // Addition & Deletion Patches
  const el4: VectorElement = { id: 'el_4', tagName: 'line', attributes: { x1: '0', y1: '0', x2: '10', y2: '10' } };
  const state3 = DocumentStateFactory.createWithSharing(
    {
      canvas: state2.canvas,
      elements: [el1, el2Mutated, el3, el4],
    },
    state2
  );

  const addDiff = DocumentPatchEngine.createDiff(state2, state3, 'Add line element');
  assert(addDiff.forward.some((p) => p.op === 'add' && p.path === '/elements/el_4'), 'Add diff forward includes op add for el_4');
  assert(addDiff.inverse.some((p) => p.op === 'remove' && p.path === '/elements/el_4'), 'Add diff inverse includes op remove for el_4');

  const stateWithoutEl4 = DocumentPatchEngine.applyPatches(state3, addDiff.inverse);
  assert(!stateWithoutEl4.elements.some((e) => e.id === 'el_4'), 'Applying inverse remove patch removes el_4 cleanly');

  // --- 4. HistoryService Integration with Transactional Patches ---
  const model = new VectorModel();
  model.elements = [el1, el2, el3];

  const history = new HistoryService({
    model,
    selectionTool: { selectedElementIds: new Set(), elementPivots: new Map(), customPivot: null } as any,
    canvasMgr: { guides: [] } as any,
    onResetPropertyPanel: () => {},
    render: () => {},
    syncToHost: () => {},
  });

  // Push initial state
  history.pushUndo('Initial document');
  assert(history.undoCount === 1, 'History holds initial snapshot');
  assert(history.patchCount === 0, 'First snapshot does not create a delta patch');

  // Mutate model and push next state
  model.elements = [el1, el2Mutated, el3];
  const patch = history.pushUndo('Change circle fill');
  assert(history.undoCount === 2, 'Undo stack size is 2');
  assert(history.patchCount === 1, 'Transactional patch logged');
  assert(patch !== null && patch.description === 'Change circle fill', 'Returned patch with description');

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
