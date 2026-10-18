import { NodeEditorTool } from '../src/webview/engine/NodeEditorTool.js';
import { NodeInspector } from '../src/webview/ui/inspectors/NodeInspector.js';
import { PathVertex, VectorElement } from '../src/webview/engine/VectorModel.js';
import { PathGeometryCompiler } from '../src/webview/engine/geometry/PathGeometryCompiler.js';

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

  console.log('\nNode Editing UX & Handle Precision Tests complete: ALL PASSED.');
  return true;
}
