import { NodeEditorTool } from '../src/webview/engine/NodeEditorTool.js';
import { NodeInspector } from '../src/webview/ui/inspectors/NodeInspector.js';
import { PathVertex, VectorElement } from '../src/webview/engine/VectorModel.js';
import { PathGeometryCompiler } from '../src/webview/engine/geometry/PathGeometryCompiler.js';
import { BoundingBoxCalculator } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runNodeEditingUxTests(): Promise<boolean> {
  console.log('\n--- Running Node Editing UX & Handle Precision Suite ---');

  const nodeEditor = new NodeEditorTool();

  // Test 1: Segment Click & Both Nodes Selection Topology
  console.log('\n[1. Segment Selection & Double-Node Focus]');
  const vertices: PathVertex[] = [
    { id: 'v0', x: 10, y: 10, nodeType: 'sharp', command: 'M' },
    { id: 'v1', x: 50, y: 10, nodeType: 'sharp', command: 'L' },
    { id: 'v2', x: 50, y: 50, nodeType: 'sharp', command: 'L' },
    { id: 'v3', x: 10, y: 50, nodeType: 'sharp', command: 'L' },
  ];

  // Hit test on segment 0 (from v0 to v1): test point (30, 10)
  const hitSegIdx = nodeEditor.hitTestSegment(vertices, { x: 30, y: 10 }, 8, true);
  assert(hitSegIdx === 0, `Hit test on horizontal segment returns index 0 -> got ${hitSegIdx}`);

  // Test 2: Convert Segment to Curve
  console.log('\n[2. Convert Segment to Curve: Symmetric Handles & Asymmetric Types]');
  const curvedVerts = nodeEditor.convertSegmentToCurve(vertices, 0, true);
  assert(curvedVerts[0].handleOut !== undefined, 'v0 receives handleOut');
  assert(curvedVerts[1].handleIn !== undefined, 'v1 receives handleIn');
  assert(curvedVerts[1].command === 'C', 'v1 command becomes C');
  assert(curvedVerts[0].nodeType === 'asymmetric', 'v0 nodeType transitions from sharp to asymmetric');
  assert(curvedVerts[1].nodeType === 'asymmetric', 'v1 nodeType transitions from sharp to asymmetric');

  const compiledD = PathGeometryCompiler.compilePathD(curvedVerts, true);
  assert(compiledD.includes('C'), `Compiled path D contains cubic curve operator 'C' -> got ${compiledD}`);

  // Test 3: Handle Hit-Testing Priority Over Segments
  console.log('\n[3. Handle Hit-Testing Priority over Segments]');
  // The handleOut of v0 is placed at (10 + 40/3, 10) = (23.33, 10)
  const handlePt = { ...curvedVerts[0].handleOut! };
  const hitHandle = nodeEditor.hitTestVertices(curvedVerts, handlePt, 12, 'v1');
  assert(hitHandle !== null, 'Hit test detects handle');
  assert(hitHandle?.type === 'handleOut', `Hit type is handleOut -> got ${hitHandle?.type}`);
  assert(hitHandle?.vertex.id === 'v0', `Hit handle belongs to v0 -> got ${hitHandle?.vertex.id}`);

  // Test 3.1: Sub-2px Micro Handles (like in 64x64 icon coordinates) directly on segment
  console.log('\n[3.1 Micro Handles (< 2px) on Segment Proximity]');
  const microVerts: PathVertex[] = [
    { id: 'm0', x: 32, y: 33, nodeType: 'sharp', command: 'M' },
    { id: 'm1', x: 29.5, y: 35.5, nodeType: 'sharp', command: 'L' },
  ];
  const curvedMicro = nodeEditor.convertSegmentToCurve(microVerts, 0, false);
  const mHandleOut = curvedMicro[0].handleOut!;
  const microLen = Math.hypot(mHandleOut.x - curvedMicro[0].x, mHandleOut.y - curvedMicro[0].y);
  assert(microLen < 2.0, `Micro handle length is sub-2px: ${microLen.toFixed(2)}`);

  // Cursor is slightly offset (e.g. 0.3 units) near the handle on the segment chord
  const hitMicroHandle = nodeEditor.hitTestVertices(curvedMicro, { x: mHandleOut.x + 0.1, y: mHandleOut.y + 0.1 }, 12, 'm0', 16);
  assert(hitMicroHandle !== null, 'Hit test successfully detects micro handle (< 2px)');
  assert(hitMicroHandle?.type === 'handleOut', 'Detected hit is handleOut');
  assert(hitMicroHandle?.vertex.id === 'm0', 'Detected hit belongs to m0');

  // Test 4: Convert Segment to Line Restores Sharp
  console.log('\n[4. Convert Segment to Line Restores Linear Geometry]');
  const lineVerts = nodeEditor.convertSegmentToLine(curvedVerts, 0, true);
  assert(lineVerts[0].handleOut === undefined, 'v0 handleOut is removed');
  assert(lineVerts[1].handleIn === undefined, 'v1 handleIn is removed');
  assert(lineVerts[1].command === 'L', 'v1 command restored to L');
  assert(lineVerts[0].nodeType === 'sharp', 'v0 nodeType restored to sharp');
  assert(lineVerts[1].nodeType === 'sharp', 'v1 nodeType restored to sharp');

  // Test 5: NodeInspector Contextual Conversion Button & Bézier Handle Inputs
  console.log('\n[5. NodeInspector UI Markup & Contextual Segment Button]');
  const testEl: VectorElement = {
    id: 'el1',
    tagName: 'path',
    attributes: { d: compiledD },
    vertices: curvedVerts,
    isClosed: true,
  };

  // When node has handles (curved segment), inspect v0
  const curvedHtml = NodeInspector.renderHtml(testEl, curvedVerts[0], 1, false);
  assert(curvedHtml.includes('id="node-handle-out-x"'), 'Markup includes numerical input for Handle Out X');
  assert(curvedHtml.includes('id="node-handle-out-y"'), 'Markup includes numerical input for Handle Out Y');
  assert(curvedHtml.includes('id="btn-segment-to-line"'), 'Displays [A Línea Recta] button when segment is curved');
  assert(!curvedHtml.includes('id="btn-segment-to-curve"'), 'Omits redundant [A Curva Bézier] button when already curved');
  assert(!curvedHtml.includes('(cerrado)'), 'Omits ugly unstyled (cerrado) status label in actions');

  // When node is straight line, inspect lineVerts[0]
  const lineEl: VectorElement = {
    id: 'el2',
    tagName: 'path',
    attributes: { d: 'M 10 10 L 50 10 L 50 50 L 10 50 Z' },
    vertices: lineVerts,
    isClosed: true,
  };
  const lineHtml = NodeInspector.renderHtml(lineEl, lineVerts[0], 1, false);
  assert(lineHtml.includes('id="btn-segment-to-curve"'), 'Displays [A Curva Bézier] button when segment is straight line');
  assert(!lineHtml.includes('id="btn-segment-to-line"'), 'Omits redundant [A Línea Recta] button when already straight');

  // Test 6: getSegmentConversionState with straight, curve, and mixed segments
  console.log('\n[6. Segment Conversion State Evaluation (Straight, Curved & Mixed)]');
  // Scenario matching user screenshot:
  // v3 (node 3) -> v1 (node 1) is straight segment, EVEN IF node1 has command: 'C' (SVG path parsed)
  // v1 (node 1) -> v4 (node 4) is curved segment
  const mixedVerts: PathVertex[] = [
    { id: 'node3', x: 20, y: 50, nodeType: 'sharp', command: 'M' },
    { id: 'node1', x: 50, y: 30, nodeType: 'asymmetric', command: 'C', handleOut: { x: 52, y: 20 } },
    { id: 'node4', x: 30, y: 10, nodeType: 'asymmetric', command: 'C', handleIn: { x: 42, y: 12 } },
  ];

  // When segment 0 (node3 to node1) is selected: it is straight despite node1.command === 'C'!
  const seg0State = NodeEditorTool.getSegmentConversionState(mixedVerts, 0, ['node3', 'node1'], true);
  assert(seg0State === 'line', `Straight segment 0 evaluates to 'line' despite command 'C' -> got ${seg0State}`);

  // When segment 1 (node1 to node4) is selected: it is curved!
  const seg1State = NodeEditorTool.getSegmentConversionState(mixedVerts, 1, ['node1', 'node4'], true);
  assert(seg1State === 'curve', `Curved segment 1 evaluates to 'curve' -> got ${seg1State}`);

  // When nodes spanning both straight and curved segments are selected (node3, node1, node4)
  const mixedState = NodeEditorTool.getSegmentConversionState(mixedVerts, null, ['node3', 'node1', 'node4'], false);
  assert(mixedState === 'mixed', `Spanning straight and curved segments evaluates to 'mixed' -> got ${mixedState}`);

  // When multiple non-adjacent nodes touching different segment types are selected (user screenshot scenario)
  const multiNodeShape: PathVertex[] = [
    { id: 'top-left', x: 20, y: 10, nodeType: 'asymmetric', command: 'M', handleOut: { x: 10, y: 20 } },
    { id: 'top-mid', x: 40, y: 10, nodeType: 'sharp', command: 'L' },
    { id: 'top-right', x: 60, y: 10, nodeType: 'asymmetric', command: 'C', handleOut: { x: 70, y: 20 } },
    { id: 'bot-right', x: 60, y: 50, nodeType: 'sharp', command: 'L' },
    { id: 'bot-mid', x: 40, y: 50, nodeType: 'sharp', command: 'L' },
    { id: 'bot-left', x: 20, y: 50, nodeType: 'sharp', command: 'L' },
  ];
  // Select 4 corner nodes (non-adjacent: top-left, top-right, bot-left, bot-right)
  const nonAdjacentMixed = NodeEditorTool.getSegmentConversionState(
    multiNodeShape,
    null,
    ['top-left', 'top-right', 'bot-left', 'bot-right'],
    true
  );
  assert(nonAdjacentMixed === 'mixed', `Non-adjacent nodes connected to curve and straight segments evaluate to 'mixed' -> got ${nonAdjacentMixed}`);

  // Test 7: NodeInspector Mixed Segments State UI
  console.log('\n[7. NodeInspector Mixed Segments UI Rendering]');
  const mixedHtml = NodeInspector.renderHtml(testEl, mixedVerts[1], 3, false, 'mixed');
  assert(mixedHtml.includes('id="btn-segment-mixed"'), 'Renders [Segmentos Mixtos] button when state is mixed');
  assert(mixedHtml.includes('disabled'), '[Segmentos Mixtos] button is disabled');
  assert(!mixedHtml.includes('id="btn-segment-to-line"'), 'Omits [A Línea Recta] button in mixed state');
  assert(!mixedHtml.includes('id="btn-segment-to-curve"'), 'Omits [A Curva Bézier] button in mixed state');

  // Test 8: Handle Isolation in NodeOverlayBuilder (Zero Leakage)
  console.log('\n[8. Bézier Handle Isolation & Leakage Prevention in Overlay]');
  const { NodeOverlayBuilder } = await import('../src/webview/tools/node/NodeOverlayBuilder.js');
  const overlayNodeEditor = new NodeEditorTool();
  const mockCtx: any = {
    model: {
      isParametricElement: () => false,
      isElementClosed: () => true,
    },
  };
  const overlayBuilder = new NodeOverlayBuilder(mockCtx, overlayNodeEditor);

  const leakTestEl: VectorElement = {
    id: 'leakEl',
    tagName: 'path',
    attributes: {},
    vertices: mixedVerts,
    isClosed: true,
  };

  // Select straight segment 0 (from node3 to node1). Node 1 has handleOut to node4, but segment 0 is straight!
  overlayNodeEditor.selectedSegmentIdx = 0;
  overlayNodeEditor.selectedVertexIds = new Set(['node3', 'node1']);
  overlayNodeEditor.selectedVertexId = 'node1';

  const overlayHtml = overlayBuilder.renderIdleBezierHandles(leakTestEl, 1);
  assert(overlayHtml === '', `Straight segment selection renders NO handles (zero leakage) -> got length ${overlayHtml.length}`);

  // Now select curved segment 1 (from node1 to node4)
  overlayNodeEditor.selectedSegmentIdx = 1;
  overlayNodeEditor.selectedVertexIds = new Set(['node1', 'node4']);
  overlayNodeEditor.selectedVertexId = 'node4';

  const curvedOverlayHtml = overlayBuilder.renderIdleBezierHandles(leakTestEl, 1);
  assert(curvedOverlayHtml.includes('circle'), 'Curved segment selection renders its handles');

  // Test 9: Bézier Curve Analytical Extrema Bounding Box & Outer Bulge Hit-Testing
  console.log('\n[9. Bézier Analytical Extrema Bounding Box & Outer Bulge Hit-Testing]');
  // Shape with anchors at y=100, but curve bulging upward towards y=25
  const bulgeVertices: PathVertex[] = [
    { id: 'b0', x: 0, y: 100, nodeType: 'asymmetric', command: 'M', handleOut: { x: 0, y: 0 } },
    { id: 'b1', x: 100, y: 100, nodeType: 'asymmetric', command: 'C', handleIn: { x: 100, y: 0 } },
    { id: 'b2', x: 100, y: 150, nodeType: 'sharp', command: 'L' },
    { id: 'b3', x: 0, y: 150, nodeType: 'sharp', command: 'L' },
  ];

  const bulgeEl: VectorElement = {
    id: 'bulgeEl',
    tagName: 'path',
    attributes: { fill: '#ff0000', stroke: '#000000' },
    vertices: bulgeVertices,
    isClosed: true,
  };

  const calculatedBox = BoundingBoxCalculator.getBoundingBox(bulgeEl);
  assert(calculatedBox !== null, 'Bounding box computed for curved element');
  // For P0=100, P1=0, P2=0, P3=100, the minimum is at t=0.5 where B(0.5) = 25.
  // Anchor min Y was 100; with extrema calculation, box.y must be exactly 25!
  assert(Math.abs(calculatedBox!.y - 25) < 1e-3, `Bounding box y encompasses Bézier peak (y=25) -> got ${calculatedBox!.y}`);
  assert(Math.abs(calculatedBox!.height - 125) < 1e-3, `Bounding box height spans from y=25 to y=150 (height=125) -> got ${calculatedBox!.height}`);

  // Test hit testing on the bulging curve apex outside anchor bounds (e.g. at (50, 26))
  const hitBulge = HitTestService.hitTest([bulgeEl], { x: 50, y: 26 }, 1.0, 8);
  assert(hitBulge !== null, 'HitTestService successfully detects click on curve bulge outside anchor box');
  assert(hitBulge?.element.id === 'bulgeEl', `Hit element is bulgeEl -> got ${hitBulge?.element.id}`);

  console.log('\nNode Editing UX & Handle Precision Tests complete: ALL PASSED.');
  return true;
}
