import { CrashGuard as EngineCrashGuard, IInteractionCleanup } from '../src/webview/engine/guard/CrashGuard.js';
import { INotifier } from '../src/webview/engine/guard/INotifier.js';
import { CrashGuard as ServicesCrashGuard } from '../src/webview/services/CrashGuard.js';
import { HistoryService } from '../src/webview/services/HistoryService.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';

export async function runCrashGuardResilienceTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running CrashGuard Resilience, Pointer Capture & Rejection Suite');
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

  // --- 1. Interaction Cleanup on Engine CrashGuard Panics ---
  let pointerReleased = false;
  let flagsReset = false;

  const mockCleanup: IInteractionCleanup = {
    releasePointerCapture: () => {
      pointerReleased = true;
    },
    resetInteractionFlags: () => {
      flagsReset = true;
    },
  };

  const notifications: string[] = [];
  const mockNotifier: INotifier = {
    showInfo: (msg) => notifications.push(msg),
    showError: (msg) => notifications.push(msg),
  };

  const guard = new EngineCrashGuard(mockNotifier, mockCleanup);

  // Synchronous panic
  const syncResult = guard.runSafe('canvasDrag', () => {
    throw new Error('Pointer move calculation overflow');
  });

  assert(syncResult === null, 'Synchronous panic contained');
  assert(pointerReleased, 'releasePointerCapture was executed immediately on panic');
  assert(flagsReset, 'resetInteractionFlags was executed to unfreeze UI');
  assert(notifications.length > 0 && notifications[0].includes('canvasDrag'), 'User notified via port');

  // Asynchronous panic
  pointerReleased = false;
  flagsReset = false;
  notifications.length = 0;

  const asyncResult = await guard.runSafeAsync('asyncRender', async () => {
    throw new Error('Async texture compilation rejection');
  });

  assert(asyncResult === null, 'Asynchronous panic contained');
  assert(pointerReleased, 'releasePointerCapture was executed on async rejection');
  assert(flagsReset, 'resetInteractionFlags was executed on async rejection');

  // --- 2. Global Unhandled Rejection & Error Containment ---
  pointerReleased = false;
  flagsReset = false;
  notifications.length = 0;

  EngineCrashGuard.setNotifier(mockNotifier);
  EngineCrashGuard.setInteractionCleanup(mockCleanup);

  // Mock global window/event target
  const listeners: Record<string, Function[]> = {};
  const mockWindow = {
    addEventListener: (type: string, fn: Function) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((f) => f !== fn);
      }
    },
  };

  const uninstall = EngineCrashGuard.installGlobalHandlers(mockWindow);
  assert(typeof listeners['unhandledrejection'] !== 'undefined', 'Registered unhandledrejection listener');
  assert(typeof listeners['error'] !== 'undefined', 'Registered global error listener');

  // Emit unhandled promise rejection
  let defaultPrevented = false;
  const fakeRejectionEvent = {
    reason: new Error('Unhandled async background failure'),
    preventDefault: () => {
      defaultPrevented = true;
    },
  };

  listeners['unhandledrejection'][0](fakeRejectionEvent);

  assert(defaultPrevented, 'preventDefault called to avoid unhandled rejection browser crash');
  assert(pointerReleased, 'Global unhandled rejection triggered pointer capture release');
  assert(flagsReset, 'Global unhandled rejection triggered forced reset of interaction flags');
  assert(
    notifications.some((n) => n.includes('unhandledrejection')),
    'Notification emitted for global unhandled rejection'
  );

  // Emit global window error
  pointerReleased = false;
  flagsReset = false;
  const fakeErrorEvent = {
    error: new Error('Script execution error'),
  };
  listeners['error'][0](fakeErrorEvent);
  assert(pointerReleased && flagsReset, 'Global window error triggered pointer capture & flag reset');

  // Test uninstall
  uninstall();
  assert(listeners['unhandledrejection'].length === 0, 'unhandledrejection listener uninstalled');
  assert(listeners['error'].length === 0, 'error listener uninstalled');

  // --- 3. Services CrashGuard with Context Interaction Resets ---
  let servicePointerReleased = false;
  let serviceFlagsReset = false;

  const model = new VectorModel();
  const historyService = new HistoryService({
    model,
    selectionTool: { clearSelection: () => {}, deselectAll: () => {} } as any,
    canvasMgr: { guides: [], customPivot: null, elementPivots: new Map() } as any,
    onResetPropertyPanel: () => {},
    render: () => {},
    syncToHost: () => {},
  });

  const servicesGuard = new ServicesCrashGuard({
    historyService,
    render: () => {},
    notifier: mockNotifier,
    releasePointerCapture: () => {
      servicePointerReleased = true;
    },
    resetInteractionFlags: () => {
      serviceFlagsReset = true;
    },
  });

  servicesGuard.execute('booleanDifference', () => {
    throw new Error('Polygon clipper intersection degenerate cycle');
  });

  assert(servicePointerReleased, 'Services CrashGuard forced pointer capture release on panic');
  assert(serviceFlagsReset, 'Services CrashGuard forced interaction flags reset on panic');

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
