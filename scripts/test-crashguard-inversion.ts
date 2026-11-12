import { CrashGuard as EngineCrashGuard } from '../src/webview/engine/guard/CrashGuard.js';
import { INotifier } from '../src/webview/engine/guard/INotifier.js';
import { CrashGuard as ServicesCrashGuard } from '../src/webview/services/CrashGuard.js';
import { HistoryService } from '../src/webview/services/HistoryService.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';

export async function runCrashGuardInversionTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running CrashGuard Dependency Inversion (INotifier) Suite');
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

  // --- 1. Engine CrashGuard with Injected INotifier ---
  const notifications: { type: string; msg: string }[] = [];
  const mockNotifier: INotifier = {
    showInfo: (msg) => notifications.push({ type: 'info', msg }),
    showError: (msg) => notifications.push({ type: 'error', msg }),
    showWarning: (msg) => notifications.push({ type: 'warning', msg }),
  };

  const instanceGuard = new EngineCrashGuard(mockNotifier);

  // Normal execution
  const successVal = instanceGuard.runSafe('validOp', () => 42);
  assert(successVal === 42, 'Normal operation succeeds and returns value');
  assert(notifications.length === 0, 'No error notifications emitted on success');

  // Panicking synchronous execution
  let fallbackRan = false;
  const failVal = instanceGuard.runSafe(
    'panickingOp',
    () => {
      throw new Error('Simulated engine calculation fault');
    },
    (err) => {
      fallbackRan = true;
    }
  );

  assert(failVal === null, 'Failing operation returns null');
  assert(fallbackRan, 'Fallback callback was invoked on panic');
  assert(
    notifications.some(
      (n) => n.type === 'info' && n.msg.includes('panickingOp') && n.msg.includes('Simulated engine calculation fault')
    ),
    'Mock INotifier received info alert with action name and error details'
  );

  // Panicking asynchronous execution
  notifications.length = 0;
  fallbackRan = false;
  const asyncFailVal = await instanceGuard.runSafeAsync(
    'asyncPanickingOp',
    async () => {
      throw new Error('Async promise rejection in geometry pipeline');
    },
    () => {
      fallbackRan = true;
    }
  );

  assert(asyncFailVal === null, 'Failing async operation returns null');
  assert(fallbackRan, 'Async fallback callback was invoked');
  assert(
    notifications.some((n) => n.type === 'info' && n.msg.includes('asyncPanickingOp')),
    'Mock INotifier received async error notification'
  );

  // Static CrashGuard delegation
  notifications.length = 0;
  EngineCrashGuard.setNotifier(mockNotifier);
  const staticFailVal = EngineCrashGuard.runSafe('staticOp', () => {
    throw new Error('Static boundary failure');
  });
  assert(staticFailVal === null, 'Static runSafe contained exception');
  assert(
    notifications.some((n) => n.msg.includes('staticOp') && n.msg.includes('Static boundary failure')),
    'Static CrashGuard routed through setNotifier to mock INotifier'
  );

  // --- 2. Services CrashGuard with INotifier & History Rollback ---
  notifications.length = 0;
  let renderCalled = false;
  let statusReport = '';

  const model = new VectorModel();
  const historyService = new HistoryService({
    model,
    selectionTool: { clearSelection: () => {}, deselectAll: () => {} } as any,
    canvasMgr: { guides: [], customPivot: null, elementPivots: new Map() } as any,
    onResetPropertyPanel: () => {},
    render: () => {},
    syncToHost: () => {},
  });

  // Put 1 element in model and snapshot
  model.elements.push({ id: 'initial_rect', tagName: 'rect', attributes: {} });
  historyService.pushUndo();

  const servicesGuard = new ServicesCrashGuard({
    historyService,
    render: () => {
      renderCalled = true;
    },
    notifier: mockNotifier,
    reportStatusError: (msg) => {
      statusReport = msg;
    },
  });

  // Mutate model and throw during execution
  const resExecute = servicesGuard.execute('booleanUnion', () => {
    model.elements.push({ id: 'corrupt_shape', tagName: 'path', attributes: {} });
    throw new Error('Boolean intersection topology collapsed');
  });

  assert(resExecute === null, 'Services CrashGuard caught exception and returned null');
  assert(renderCalled, 'Render callback was triggered after rollback');
  assert(
    model.elements.length === 1 && model.elements[0].id === 'initial_rect',
    'History state was deterministically rolled back, discarding corrupt_shape'
  );
  assert(statusReport.includes('booleanUnion'), 'Status bar error callback was invoked');
  assert(
    notifications.some(
      (n) => n.type === 'error' && n.msg.includes('booleanUnion') && n.msg.includes('topology collapsed')
    ),
    'Services CrashGuard notified mock INotifier.showError without any VsCodeBridge dependency'
  );

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
