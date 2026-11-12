import { strict as assert } from 'assert';
import { ToolStateMachine, ToolSessionState, ToolEvent } from '../src/webview/tools/ToolStateMachine.js';
import { CoordinateSpaceTransformer, CameraViewportTransform } from '../src/webview/tools/CoordinateSpaceTransformer.js';
import { AffineMatrix } from '../src/webview/core/geom/TransformMatrix.js';
import { Point } from '../src/webview/core/geom/Point.js';

export function runToolStateMachineTests(): void {
  console.log('\n======================================================');
  console.log('🧪 Running Tool State Machine & Canonical Projections Suite');
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

  // --- 1. Pure Deterministic Reducer Tests ---
  it('Initializes with default idle state and select tool', () => {
    const sm = new ToolStateMachine('select');
    assert.equal(sm.state.activeTool, 'select');
    assert.equal(sm.state.phase, 'idle');
    assert.equal(sm.state.isInteracting, false);
    assert.equal(sm.state.startDocumentPoint, null);
    assert.equal(sm.state.currentDocumentPoint, null);
  });

  it('ACTIVATE switches active tool and triggers RENDER_OVERLAY', () => {
    const sm = new ToolStateMachine('select');
    const transition = sm.dispatch({
      type: 'ACTIVATE',
      toolType: 'pen',
      timestamp: Date.now(),
      payload: {},
    });
    assert.equal(transition.nextState.activeTool, 'pen');
    assert.equal(transition.absorbed, true);
    assert(transition.sideEffects?.some((s) => s.type === 'RENDER_OVERLAY'));
  });

  it('POINTER_DOWN transitions from idle to tracking with captured coordinates', () => {
    const sm = new ToolStateMachine('pen');
    const transition = sm.dispatch({
      type: 'POINTER_DOWN',
      toolType: 'pen',
      timestamp: Date.now(),
      payload: {
        screenPoint: { x: 100, y: 150 },
        documentPoint: { x: 50, y: 75 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        metaKey: false,
      },
    });

    assert.equal(transition.nextState.phase, 'tracking');
    assert.equal(transition.nextState.isInteracting, true);
    assert.deepEqual(transition.nextState.startDocumentPoint, { x: 50, y: 75 });
    assert.equal(transition.nextState.activeModifiers.ctrl, true);
  });

  it('POINTER_MOVE past threshold promotes phase from tracking to dragging', () => {
    const sm = new ToolStateMachine('pen');
    sm.dispatch({
      type: 'POINTER_DOWN',
      toolType: 'pen',
      timestamp: Date.now(),
      payload: {
        screenPoint: { x: 100, y: 150 },
        documentPoint: { x: 50, y: 75 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });

    const moveTransition = sm.dispatch({
      type: 'POINTER_MOVE',
      toolType: 'pen',
      timestamp: Date.now() + 10,
      payload: {
        screenPoint: { x: 120, y: 170 },
        documentPoint: { x: 70, y: 95 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });

    assert.equal(moveTransition.nextState.phase, 'dragging');
    assert.deepEqual(moveTransition.nextState.currentDocumentPoint, { x: 70, y: 95 });
  });

  it('POINTER_UP after dragging commits transaction and triggers undo/sync side-effects', () => {
    const sm = new ToolStateMachine('pen');
    sm.dispatch({
      type: 'POINTER_DOWN',
      toolType: 'pen',
      timestamp: Date.now(),
      payload: {
        screenPoint: { x: 100, y: 150 },
        documentPoint: { x: 50, y: 75 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });
    sm.dispatch({
      type: 'POINTER_MOVE',
      toolType: 'pen',
      timestamp: Date.now() + 10,
      payload: {
        screenPoint: { x: 120, y: 170 },
        documentPoint: { x: 70, y: 95 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });

    const upTransition = sm.dispatch({
      type: 'POINTER_UP',
      toolType: 'pen',
      timestamp: Date.now() + 20,
      payload: {
        screenPoint: { x: 120, y: 170 },
        documentPoint: { x: 70, y: 95 },
        buttons: 0,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });

    assert.equal(upTransition.nextState.phase, 'idle');
    assert.equal(upTransition.nextState.isInteracting, false);
    assert(upTransition.sideEffects?.some((s) => s.type === 'PUSH_UNDO'));
    assert(upTransition.sideEffects?.some((s) => s.type === 'SYNC_TO_HOST'));
  });

  it('KEY_DOWN and KEY_UP accurately maintain activeKeyCodes set and modifiers', () => {
    const sm = new ToolStateMachine('select');
    sm.dispatch({
      type: 'KEY_DOWN',
      toolType: 'select',
      timestamp: Date.now(),
      payload: {
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        repeat: false,
      },
    });

    assert(sm.state.activeKeyCodes.has('ShiftLeft'));
    assert.equal(sm.state.activeModifiers.shift, true);

    sm.dispatch({
      type: 'KEY_UP',
      toolType: 'select',
      timestamp: Date.now() + 50,
      payload: {
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        repeat: false,
      },
    });

    assert(!sm.state.activeKeyCodes.has('ShiftLeft'));
    assert.equal(sm.state.activeModifiers.shift, false);
  });

  it('CANCEL resets interaction state to idle and triggers CANCEL_INTERACTION', () => {
    const sm = new ToolStateMachine('rect');
    sm.dispatch({
      type: 'POINTER_DOWN',
      toolType: 'rect',
      timestamp: Date.now(),
      payload: {
        screenPoint: { x: 10, y: 10 },
        documentPoint: { x: 10, y: 10 },
        buttons: 1,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      },
    });
    const cancelTransition = sm.dispatch({
      type: 'CANCEL',
      toolType: 'rect',
      timestamp: Date.now(),
      payload: {},
    });

    assert.equal(cancelTransition.nextState.phase, 'idle');
    assert.equal(cancelTransition.nextState.isInteracting, false);
    assert(cancelTransition.sideEffects?.some((s) => s.type === 'CANCEL_INTERACTION'));
  });

  // --- 2. Canonical 3-Tier Coordinate Space Projections ---
  it('Screen to Document transforms screen coordinates through zoom and camera offset', () => {
    const camera: CameraViewportTransform = {
      zoom: 2.0,
      cameraOffset: { x: 100, y: 200 },
      viewBox: { x: 0, y: 0, width: 800, height: 600 },
    };

    const screenPt: Point = { x: 300, y: 400 };
    // docX = (300 - 100) / 2 + 0 = 100
    // docY = (400 - 200) / 2 + 0 = 100
    const docPt = CoordinateSpaceTransformer.screenToDocument(screenPt, camera);
    assert.equal(docPt.x, 100);
    assert.equal(docPt.y, 100);

    // Round-trip back to screen
    const roundTripScreen = CoordinateSpaceTransformer.documentToScreen(docPt, camera);
    assert.equal(roundTripScreen.x, 300);
    assert.equal(roundTripScreen.y, 400);
  });

  it('Document to Local applies inverse of element transformation matrix', () => {
    // Translate element by (50, 50) and scale 2x
    const elemTransform = AffineMatrix.translation(50, 50).multiply(AffineMatrix.scaling(2, 2));

    const docPt: Point = { x: 90, y: 110 };
    // inv(T(50,50) * S(2,2)) = S(0.5,0.5) * T(-50,-50)
    // local = (90 - 50) * 0.5 = 20, (110 - 50) * 0.5 = 30
    const localPt = CoordinateSpaceTransformer.documentToLocal(docPt, elemTransform);
    assert.equal(Math.round(localPt.x), 20);
    assert.equal(Math.round(localPt.y), 30);

    // Local back to Document
    const roundTripDoc = CoordinateSpaceTransformer.localToDocument(localPt, elemTransform);
    assert.equal(Math.round(roundTripDoc.x), 90);
    assert.equal(Math.round(roundTripDoc.y), 110);
  });

  it('Full 3-tier pipeline Screen -> Document -> Local works end-to-end', () => {
    const camera: CameraViewportTransform = {
      zoom: 1.5,
      cameraOffset: { x: 50, y: 50 },
      viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
    };
    const elemTransform = AffineMatrix.translation(100, 100);

    const screenPt: Point = { x: 350, y: 500 };
    // docX = (350 - 50) / 1.5 = 200
    // docY = (500 - 50) / 1.5 = 300
    // localX = 200 - 100 = 100
    // localY = 300 - 100 = 200
    const localPt = CoordinateSpaceTransformer.screenToLocal(screenPt, camera, elemTransform);
    assert.equal(Math.round(localPt.x), 100);
    assert.equal(Math.round(localPt.y), 200);

    // Inverse 3-tier pipeline Local -> Screen
    const backToScreen = CoordinateSpaceTransformer.localToScreen(localPt, elemTransform, camera);
    assert.equal(Math.round(backToScreen.x), 350);
    assert.equal(Math.round(backToScreen.y), 500);
  });

  // --- 3. Pointer Coalescence Extraction ---
  it('extractCoalescedPoints falls back gracefully when getCoalescedEvents is unavailable', () => {
    const camera: CameraViewportTransform = {
      zoom: 1.0,
      cameraOffset: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 800, height: 600 },
    };

    const mockEvent = { clientX: 120, clientY: 80 } as PointerEvent;
    const result = ToolStateMachine.extractCoalescedPoints(mockEvent, camera);
    assert.equal(result.docPoints.length, 1);
    assert.deepEqual(result.docPoints[0], { x: 120, y: 80 });
  });

  it('extractCoalescedPoints extracts all intermediate samples from native getCoalescedEvents', () => {
    const camera: CameraViewportTransform = {
      zoom: 2.0,
      cameraOffset: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 800, height: 600 },
    };

    const mockEvent = {
      clientX: 200,
      clientY: 200,
      getCoalescedEvents: () => [
        { clientX: 100, clientY: 100 },
        { clientX: 150, clientY: 150 },
        { clientX: 200, clientY: 200 },
      ],
    } as unknown as PointerEvent;

    const result = ToolStateMachine.extractCoalescedPoints(mockEvent, camera);
    assert.equal(result.docPoints.length, 3);
    assert.deepEqual(result.docPoints[0], { x: 50, y: 50 });
    assert.deepEqual(result.docPoints[1], { x: 75, y: 75 });
    assert.deepEqual(result.docPoints[2], { x: 100, y: 100 });
  });

  console.log(`\nResults: ${passed} passed, 0 failed.`);
  return true;
}

if (process.argv[1]?.endsWith('test-tool-state-machine.ts')) {
  runToolStateMachineTests();
}
