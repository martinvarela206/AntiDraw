import { CanvasInteractionController, CanvasInteractionContext } from '../src/webview/controllers/CanvasInteractionController.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { Session } from '../src/webview/engine/session/Session.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { ToastNotification } from '../src/webview/ui/ToastNotification.js';

export async function runErrorBoundaryTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('🧪 Running Webview Error Boundary & CrashGuard Suite (08.1)');
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

  // Setup DOM mock environment for Node.js if needed
  if (typeof (globalThis as any).document === 'undefined') {
    const elementsById = new Map<string, any>();

    const docMock = {
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          className: '',
          innerText: '',
          textContent: '',
          children: [] as any[],
          style: {},
          classList: {
            add: (c: string) => { el.className += ' ' + c; },
            remove: (_c: string) => {},
          },
          appendChild: (child: any) => {
            el.children.push(child);
            child.parentNode = el;
            return child;
          },
          removeChild: (child: any) => {
            const idx = el.children.indexOf(child);
            if (idx >= 0) el.children.splice(idx, 1);
            child.parentNode = null;
            return child;
          },
          isConnected: true,
          parentNode: null as any,
        };
        return el;
      },
      getElementById: (id: string) => elementsById.get(id) || null,
      querySelector: (_sel: string) => null,
      body: {
        children: [] as any[],
        appendChild: (child: any) => {
          (docMock.body.children as any[]).push(child);
          child.parentNode = docMock.body;
          return child;
        },
      },
    };

    // Pre-populate status-info and status-coords
    const statusInfo = docMock.createElement('span');
    statusInfo.innerText = 'Ready';
    elementsById.set('status-info', statusInfo);

    const statusCoords = docMock.createElement('span');
    statusCoords.innerText = 'X: 0, Y: 0';
    elementsById.set('status-coords', statusCoords);

    const svgOverlay = docMock.createElement('div');
    elementsById.set('svg-overlay', svgOverlay);

    (globalThis as any).document = docMock;
  }

  // Mock Tool Handlers
  let selectCancelCalled = false;
  let selectShouldThrowOnDown = false;
  let selectShouldThrowOnMove = false;
  let selectShouldThrowOnUp = false;
  let selectShouldThrowOnCancel = false;

  const mockSelectToolHandler = {
    onPointerDown: (_e: any, _pt: any) => {
      if (selectShouldThrowOnDown) {
        throw new Error('Simulated panic in selectToolHandler.onPointerDown');
      }
      return true;
    },
    onPointerMove: (_e: any, _pt: any) => {
      if (selectShouldThrowOnMove) {
        throw new Error('Simulated panic in selectToolHandler.onPointerMove');
      }
      return true;
    },
    onPointerUp: (_e: any, _pt: any) => {
      if (selectShouldThrowOnUp) {
        throw new Error('Simulated panic in selectToolHandler.onPointerUp');
      }
      return true;
    },
    onDoubleClick: (_e: any, _pt: any) => false,
    cancel: () => {
      selectCancelCalled = true;
      if (selectShouldThrowOnCancel) {
        throw new Error('Simulated double-fault panic in tool.cancel()');
      }
      return true;
    },
    activate: () => {},
    deactivate: () => {},
  } as any;

  const mockShapeHandler = {
    shapeStartPt: null,
    onPointerDown: () => false,
    onPointerMove: () => {},
    onPointerUp: () => {},
    cancel: () => false,
    activate: () => {},
    deactivate: () => {},
  } as any;

  const mockPolylineHandler = {
    onPointerDown: () => false,
    onPointerMove: () => {},
    onPointerUp: () => false,
    onDoubleClick: () => false,
    cancel: () => false,
    activate: () => {},
    deactivate: () => {},
  } as any;

  const mockPenHandler = {
    isDragging: false,
    onPointerDown: () => false,
    onPointerMove: () => {},
    onPointerUp: () => false,
    onDoubleClick: () => false,
    cancel: () => false,
    activate: () => {},
    deactivate: () => {},
  } as any;

  const mockNodeHandler = {
    isDragging: false,
    onPointerDown: () => false,
    onPointerMove: () => false,
    onPointerUp: () => false,
    onDoubleClick: () => false,
    cancel: () => false,
    activate: () => {},
    deactivate: () => {},
  } as any;

  let renderCount = 0;
  let renderOverlayCount = 0;
  let pointerCaptureReleased = false;

  const mockCanvasView = {
    cancelRaf: () => {},
    releasePointerCapture: (_id: number) => { pointerCaptureReleased = true; },
    setPointerCapture: (_id: number) => {},
    setCursor: (_cur: string) => {},
  } as any;

  const mockToolbar = {
    activeTool: 'select',
    setTool: (tool: string) => { mockToolbar.activeTool = tool; },
  } as any;

  const mockSession = new Session(
    {
      select: mockSelectToolHandler,
      shape: mockShapeHandler,
      polyline: mockPolylineHandler,
      pen: mockPenHandler,
      node: mockNodeHandler,
    },
    {
      onRender: () => { renderCount++; },
      onRenderOverlay: () => { renderOverlayCount++; },
    }
  );

  const mockContext: CanvasInteractionContext = {
    model: new VectorModel(),
    selectionTool: { isSelected: () => false, selectedElementIds: new Set() } as any,
    nodeEditorTool: { hitTestVertices: () => null, hitTestSegment: () => null } as any,
    canvasMgr: new CanvasManager(),
    tools: {
      session: mockSession,
      selectToolHandler: mockSelectToolHandler,
      shapeToolHandler: mockShapeHandler,
      polylineToolHandler: mockPolylineHandler,
      penToolHandler: mockPenHandler,
      nodeToolHandler: mockNodeHandler,
    } as any,
    getViewportCtrl: () => ({
      getCanvasPointFromClient: (x: number, y: number) => ({ x, y }),
      isMiddlePanning: false,
      zoomAtClientPoint: () => {},
    }) as any,
    getRulerView: () => undefined,
    getToolbar: () => mockToolbar,
    getPropertyPanel: () => undefined,
    getCanvasView: () => mockCanvasView,
    getContextMenu: () => undefined,
    render: () => { renderCount++; },
    renderOverlay: () => { renderOverlayCount++; },
    applyCanvasSize: () => {},
    syncRulerScroll: () => {},
    syncMetadataToHost: () => {},
    pushUndo: () => {},
  };

  const controller = new CanvasInteractionController(mockContext);

  // -----------------------------------------------------------
  // Test 1: PointerDown Panic Recovery
  // -----------------------------------------------------------
  selectShouldThrowOnDown = true;
  selectCancelCalled = false;
  pointerCaptureReleased = false;

  const fakeDownEvent = { button: 0, pointerId: 42, preventDefault: () => {}, stopPropagation: () => {} } as any;
  controller.onPointerDown(fakeDownEvent, { x: 50, y: 50 });

  assert(mockSession.isDragging === false, 'Session dragging flag reset to false on PointerDown panic');
  assert(mockSession.activeHandle === null, 'Session activeHandle reset to null on PointerDown panic');
  assert(selectCancelCalled === true, 'Active tool cancel() was invoked to abort interaction');
  assert(pointerCaptureReleased === true, 'Pointer capture was safely released');

  const statusEl = document.getElementById('status-info');
  assert(
    statusEl !== null && (statusEl.innerText.includes('Recuperado de error') || statusEl.innerText.includes('⚠️')),
    'Status bar telemetry reflects graceful recovery notice'
  );

  // -----------------------------------------------------------
  // Test 2: PointerMove In-Flight Panic Recovery
  // -----------------------------------------------------------
  selectShouldThrowOnDown = false;
  selectShouldThrowOnMove = true;
  selectCancelCalled = false;

  // Start clean drag
  controller.onPointerDown(fakeDownEvent, { x: 50, y: 50 });
  assert(mockSession.isDragging === true, 'Session dragging started cleanly before move');

  // Trigger move which throws
  const fakeMoveEvent = { pointerId: 42, preventDefault: () => {}, stopPropagation: () => {} } as any;
  controller.onPointerMove(fakeMoveEvent, { x: 60, y: 60 });

  assert(mockSession.isDragging === false, 'Session dragging safely aborted after in-flight PointerMove panic');
  assert(selectCancelCalled === true, 'Tool cancel() was invoked on in-flight panic');

  // -----------------------------------------------------------
  // Test 3: PointerUp Panic Recovery
  // -----------------------------------------------------------
  selectShouldThrowOnMove = false;
  selectShouldThrowOnUp = true;
  selectCancelCalled = false;

  // Start drag
  controller.onPointerDown(fakeDownEvent, { x: 50, y: 50 });
  assert(mockSession.isDragging === true, 'Session dragging started cleanly before up');

  // Trigger pointer up which throws
  const fakeUpEvent = { pointerId: 42, preventDefault: () => {}, stopPropagation: () => {} } as any;
  controller.onPointerUp(fakeUpEvent, { x: 80, y: 80 });

  assert(mockSession.isDragging === false, 'Session dragging reset to false after PointerUp panic');
  assert(mockSession.activeHandle === null, 'Session activeHandle reset to null after PointerUp panic');

  // -----------------------------------------------------------
  // Test 4: Catastrophic Double-Fault (Tool cancel() also throws)
  // -----------------------------------------------------------
  selectShouldThrowOnDown = true;
  selectShouldThrowOnCancel = true;

  let crashed = false;
  try {
    controller.onPointerDown(fakeDownEvent, { x: 100, y: 100 });
  } catch (_e) {
    crashed = true;
  }

  assert(crashed === false, 'Error boundary absorbs catastrophic double-fault (tool.cancel() throw)');
  assert(mockSession.isDragging === false, 'Session flags remain cleanly unblocked even when cancel() throws');

  // -----------------------------------------------------------
  // Test 5: Canvas Remains Responsive After Recoveries
  // -----------------------------------------------------------
  selectShouldThrowOnDown = false;
  selectShouldThrowOnCancel = false;
  selectShouldThrowOnMove = false;
  selectShouldThrowOnUp = false;

  // Normal interaction should work immediately without reloading
  controller.onPointerDown(fakeDownEvent, { x: 10, y: 10 });
  assert(mockSession.isDragging === true, 'Editor immediately ready for next user interaction without reload');
  controller.onPointerUp(fakeUpEvent, { x: 15, y: 15 });
  assert(mockSession.isDragging === false, 'Editor completes clean interaction following recovery cycle');

  // -----------------------------------------------------------
  // Test 6: Toast Notification Instantiation
  // -----------------------------------------------------------
  const toast = ToastNotification.show({
    message: 'Test notification',
    type: 'warning',
    durationMs: 1000,
  });
  assert(toast !== null && toast.className.includes('ad-toast warning'), 'Toast notification element instantiated with correct styling');

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 Webview Error Boundary & CrashGuard passed all tests!\n');
    return true;
  } else {
    console.error('❌ Some tests failed.\n');
    return false;
  }
}

if (process.argv[1]?.endsWith('test-error-boundary.ts') || process.argv[1]?.endsWith('test-error-boundary.js')) {
  runErrorBoundaryTests().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
