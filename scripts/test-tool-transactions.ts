import { strict as assert } from 'assert';
import {
  ToolTransactionManager,
  ActiveToolTransaction,
  BeginAction,
  PreviewAction,
  CommitAction,
  CancelAction,
} from '../src/webview/tools/ToolTransactionManager.js';
import { DocumentState } from '../src/webview/core/model/DocumentState.js';
import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';

export function runToolTransactionManagerTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Atomic Tool Transactions & Life Cycle Suite');
  console.log('======================================================');

  let passed = 0;
  function it(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw err;
    }
  }

  it('Generates unique monotonic transaction identifiers (txId)', () => {
    const txId1 = ToolTransactionManager.generateTxId('rect');
    const txId2 = ToolTransactionManager.generateTxId('rect');
    assert(txId1.startsWith('tx_rect_'));
    assert(txId2.startsWith('tx_rect_'));
    assert.notEqual(txId1, txId2);
  });

  it('Begin initiates active transaction and captures initial context', () => {
    const mgr = new ToolTransactionManager();
    assert.equal(mgr.isTransactionActive, false);

    const beginAction = mgr.begin('pen', {
      description: 'Draw Bézier curve',
      initialSelection: ['el_1', 'el_2'],
    });

    assert.equal(mgr.isTransactionActive, true);
    assert.equal(beginAction.action, 'Begin');
    assert.equal(beginAction.toolType, 'pen');
    assert.deepEqual(beginAction.initialSelection, ['el_1', 'el_2']);

    const activeTx = mgr.activeTransaction;
    assert(activeTx !== null);
    assert.equal(activeTx?.txId, beginAction.txId);
    assert.equal(activeTx?.previewCount, 0);
  });

  it('Preview emits transient updates without terminating transaction', () => {
    const mgr = new ToolTransactionManager();
    mgr.begin('rect', { description: 'Draw Rectangle' });

    const ghostEl: VectorElement = {
      id: 'ghost_1',
      tagName: 'rect',
      attributes: { x: '10', y: '10', width: '100', height: '80' },
      isClosed: true,
    };

    const prev1 = mgr.preview({ ghostElements: [ghostEl] });
    assert(prev1 !== null);
    assert.equal(prev1?.action, 'Preview');
    assert.equal(mgr.activeTransaction?.previewCount, 1);
    assert.equal(mgr.isTransactionActive, true);

    const prev2 = mgr.preview({ ghostElements: [ghostEl] });
    assert(prev2 !== null);
    assert.equal(mgr.activeTransaction?.previewCount, 2);
    assert.equal(mgr.isTransactionActive, true);
  });

  it('Commit consolidates transaction and clears active state', () => {
    const mgr = new ToolTransactionManager();
    const begin = mgr.begin('polyline', { description: 'Draw Polyline' });

    const finalEl: VectorElement = {
      id: 'poly_1',
      tagName: 'polyline',
      attributes: { points: '0,0 50,50 100,20' },
      isClosed: false,
    };

    const commitAction = mgr.commit('Create Polyline', { addedElements: [finalEl] });
    assert(commitAction !== null);
    assert.equal(commitAction?.action, 'Commit');
    assert.equal(commitAction?.txId, begin.txId);
    assert.equal(commitAction?.description, 'Create Polyline');
    assert.equal(commitAction?.addedElements?.length, 1);

    assert.equal(mgr.isTransactionActive, false);
    assert.equal(mgr.activeTransaction, null);
  });

  it('Cancel rolls back transaction cleanly with reason', () => {
    const mgr = new ToolTransactionManager();
    const begin = mgr.begin('smartFill', { description: 'Smart Fill Sweep' });
    mgr.preview({ payload: { step: 1 } });

    const cancelAction = mgr.cancel('escape');
    assert(cancelAction !== null);
    assert.equal(cancelAction?.action, 'Cancel');
    assert.equal(cancelAction?.txId, begin.txId);
    assert.equal(cancelAction?.reason, 'escape');

    assert.equal(mgr.isTransactionActive, false);
    assert.equal(mgr.activeTransaction, null);
  });

  it('Subscribes and notifies TransactionListener callbacks for full lifecycle', () => {
    const mgr = new ToolTransactionManager();
    const events: string[] = [];

    const unsubscribe = mgr.addListener({
      onBegin: (tx) => events.push(`begin:${tx.toolType}`),
      onPreview: (tx, action) => events.push(`preview:${action.txId}`),
      onCommit: (tx, action) => events.push(`commit:${action.description}`),
      onCancel: (tx, action) => events.push(`cancel:${action.reason}`),
    });

    mgr.begin('star', { description: 'Draw Star' });
    mgr.preview();
    mgr.commit('Created Star');

    assert.deepEqual(events, ['begin:star', 'preview:' + events[1].split(':')[1], 'commit:Created Star']);

    unsubscribe();
    mgr.begin('eraser');
    mgr.cancel('user_abort');
    // Events shouldn't receive new dispatches after unsubscribe
    assert.equal(events.length, 3);
  });

  it('Maintains audit log of transactions and bounded history', () => {
    const mgr = new ToolTransactionManager();
    mgr.begin('line', { description: 'Line' });
    mgr.preview();
    mgr.commit('Line committed');

    const log = mgr.historyAuditLog;
    assert(log.length >= 3);
    assert.equal(log[0].action, 'Begin');
    assert.equal(log[1].action, 'Preview');
    assert.equal(log[2].action, 'Commit');
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-tool-transactions.ts')) {
  runToolTransactionManagerTests();
}
