import { SpineCurveService, WidthProfile } from '../src/webview/engine/stroke/SpineCurveService.js';
import { VectorElement, PathVertex } from '../src/webview/engine/VectorModel.js';
import { CanvasActionDispatcher } from '../src/webview/services/CanvasActionDispatcher.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';

export async function runSpineCurveAndStrokeTests(): Promise<boolean> {
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  console.log('\n--- Running Spine Curve & Variable Stroke Suite ---');

  // =========================================================================
  // 1. Width Function w(t) and Smooth Hermite Interpolation
  // =========================================================================
  console.log('\n[1. Width Function w(t) & Smooth Hermite Interpolation]');

  // Test uniform evaluation
  const uniformW = SpineCurveService.evaluateWidth(undefined, 8, 0.5);
  assert(uniformW.width === 8, 'Uniform profile evaluates exact base width 8');
  assert(uniformW.widthLeft === 4 && uniformW.widthRight === 4, 'Uniform width splits symmetrically 4 + 4');

  // Test discrete control point profile with C1 cubic Hermite interpolation
  const profile: WidthProfile = {
    points: [
      { t: 0.0, width: 2, widthLeft: 1, widthRight: 1 },
      { t: 0.5, width: 10, widthLeft: 5, widthRight: 5 },
      { t: 1.0, width: 4, widthLeft: 2, widthRight: 2 },
    ],
    mode: 'variable',
  };

  const wAt0 = SpineCurveService.evaluateWidth(profile, 1, 0.0);
  assert(wAt0.width === 2, 'Evaluated width at t=0 is exact 2');

  const wAtMid = SpineCurveService.evaluateWidth(profile, 1, 0.5);
  assert(wAtMid.width === 10, 'Evaluated width at t=0.5 is exact 10');

  const wAt1 = SpineCurveService.evaluateWidth(profile, 1, 1.0);
  assert(wAt1.width === 4, 'Evaluated width at t=1.0 is exact 4');

  // Monotonic midpoint between 0 and 0.5 (t = 0.25)
  const wAtQuarter = SpineCurveService.evaluateWidth(profile, 1, 0.25);
  assert(wAtQuarter.width > 2 && wAtQuarter.width < 10, `Smooth Hermite interpolation at t=0.25 is monotonic (${wAtQuarter.width})`);
  // Hermite at s=0.5: h(0.5) = 0.5, so w = 2 + (10 - 2) * 0.5 = 6
  assert(Math.abs(wAtQuarter.width - 6) < 0.01, `C1 Hermite at midpoint evaluates to 6 (got ${wAtQuarter.width})`);

  // Clamping outside [0, 1]
  const wUnder = SpineCurveService.evaluateWidth(profile, 1, -0.2);
  assert(wUnder.width === 2, 'Parameter < 0 smoothly clamped to t=0');
  const wOver = SpineCurveService.evaluateWidth(profile, 1, 1.4);
  assert(wOver.width === 4, 'Parameter > 1 smoothly clamped to t=1');

  // =========================================================================
  // 2. Deterministic Multi-Harmonic Sketch Ink Modulation
  // =========================================================================
  console.log('\n[2. Deterministic Multi-Harmonic Sketch Ink Modulation]');

  const sketchProfile: WidthProfile = {
    points: [{ t: 0, width: 10 }, { t: 1, width: 10 }],
    mode: 'sketch',
    sketchParams: {
      amplitude: 0.6,
      frequency: 4,
      seed: 12345,
      roughness: 0.2,
    },
  };

  const sketchW1 = SpineCurveService.evaluateWidth(sketchProfile, 10, 0.2);
  const sketchW2 = SpineCurveService.evaluateWidth(sketchProfile, 10, 0.2);
  assert(sketchW1.width === sketchW2.width, 'Deterministic reproduction: same t and seed yields exact identical width');

  const sketchWDiffT = SpineCurveService.evaluateWidth(sketchProfile, 10, 0.45);
  assert(sketchWDiffT.width !== sketchW1.width, 'Organic modulation produces rich variation along curve parameter');
  assert(sketchWDiffT.width > 0.1, 'Sketch ink width guarantees non-zero positive width');

  // =========================================================================
  // 3. Analytical Tangent T(t) and Orthogonal Normal N(t) Projection
  // =========================================================================
  console.log('\n[3. Analytical Tangent T(t) & Orthogonal Normal N(t) Projection]');

  // Horizontal line: (100, 200) -> (500, 200)
  const lineEl: VectorElement = {
    id: 'test_line',
    tagName: 'line',
    attributes: {
      id: 'test_line',
      x1: '100',
      y1: '200',
      x2: '500',
      y2: '200',
      stroke: '#000000',
      'stroke-width': '10',
    },
    vertices: [
      { id: 'v1', x: 100, y: 200, command: 'M', nodeType: 'sharp' },
      { id: 'v2', x: 500, y: 200, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: false,
    shapeType: 'line',
  };

  const lineSpine = SpineCurveService.sampleSpineCurve(lineEl, 10);
  assert(lineSpine.length > 0, `Sampled ${lineSpine.length} spine points along line`);

  // Verify unit tangent T = (1, 0) and orthogonal normal N = (0, 1) or (0, -1)
  const pMid = lineSpine[Math.floor(lineSpine.length / 2)];
  assert(Math.abs(pMid.tangent.x - 1) < 1e-4 && Math.abs(pMid.tangent.y) < 1e-4, 'Unit tangent along horizontal line is (1, 0)');
  assert(Math.abs(pMid.normal.x) < 1e-4 && Math.abs(pMid.normal.y - 1) < 1e-4, 'Orthogonal normal N = (-Ty, Tx) is (0, 1)');

  // Verify dot product orthogonality T . N === 0
  const dotTN = pMid.tangent.x * pMid.normal.x + pMid.tangent.y * pMid.normal.y;
  assert(Math.abs(dotTN) < 1e-6, `Zero angular error: T · N = 0 (got ${dotTN})`);

  // Verify offset boundaries P(t) ± (w/2)*N(t) for strokeWidth = 10 (half = 5)
  // At y = 200: Left offset P - 5*N = (x, 200 - 5) = 195, Right offset P + 5*N = (x, 200 + 5) = 205
  assert(Math.abs(pMid.leftPt.y - 195) < 1e-3, `Left boundary offset is exact 195 (got ${pMid.leftPt.y})`);
  assert(Math.abs(pMid.rightPt.y - 205) < 1e-3, `Right boundary offset is exact 205 (got ${pMid.rightPt.y})`);

  // Cubic Bézier curve
  const bezierEl: VectorElement = {
    id: 'test_bezier',
    tagName: 'path',
    attributes: {
      id: 'test_bezier',
      d: 'M 100 300 C 200 100, 400 500, 500 300',
      stroke: '#ff0055',
      'stroke-width': '8',
    },
    vertices: [
      { id: 'bv1', x: 100, y: 300, handleOut: { x: 200, y: 100 }, command: 'M', nodeType: 'smooth' },
      { id: 'bv2', x: 500, y: 300, handleIn: { x: 400, y: 500 }, command: 'C', nodeType: 'smooth' },
    ],
    isClosed: false,
    shapeType: 'path',
  };

  const bezierSpine = SpineCurveService.sampleSpineCurve(bezierEl, 8);
  assert(bezierSpine.length >= 24, `Sampled ${bezierSpine.length} spine points on cubic Bézier`);
  // Verify all points satisfy orthogonality T · N === 0
  let allOrthogonal = true;
  for (const pt of bezierSpine) {
    const dot = pt.tangent.x * pt.normal.x + pt.tangent.y * pt.normal.y;
    if (Math.abs(dot) > 1e-4) allOrthogonal = false;
  }
  assert(allOrthogonal, '100% of cubic Bézier spine points satisfy analytical orthogonality T · N = 0');

  // =========================================================================
  // 4. Smooth Schneider Bézier Fitting (Anti-Polygonization) & Linecaps
  // =========================================================================
  console.log('\n[4. Smooth Schneider Bézier Fitting & Linecaps]');

  // Test Butt Cap Outline
  const buttOutline = SpineCurveService.generateVariableOutline(lineEl, 10, undefined, { linecap: 'butt' });
  assert(buttOutline !== null, 'Generated butt cap stroke outline');
  assert(buttOutline?.isClosed === true, 'Outline is a fully closed vector shape');
  assert(buttOutline?.attributes.fill === '#000000', 'Outline adopted original stroke color as fill');
  assert(buttOutline?.attributes.stroke === 'none', 'Outline stroke set to none');

  // Verify Schneider cubic Bézier fitting produced smooth curves ('C' commands)
  const hasCubicNodes = buttOutline?.vertices?.some((v) => v.command === 'C');
  assert(hasCubicNodes === true, 'Schneider curve fitting successfully synthesized smooth cubic Bézier curves (C)');
  assert(buttOutline?.vertices && buttOutline.vertices.length < 30, `Compact vertex representation (got ${buttOutline?.vertices?.length} vertices, not hundreds of polygon points)`);

  // Test Round Cap Outline
  const roundOutline = SpineCurveService.generateVariableOutline(lineEl, 10, undefined, { linecap: 'round' });
  assert(roundOutline !== null, 'Generated round cap stroke outline');
  assert(roundOutline?.isClosed === true, 'Round cap outline is closed');

  // Test Square Cap Outline
  const squareOutline = SpineCurveService.generateVariableOutline(lineEl, 10, undefined, { linecap: 'square' });
  assert(squareOutline !== null, 'Generated square cap stroke outline');

  // =========================================================================
  // 5. Width Profile Presets: Tapered & Sketch Modulation
  // =========================================================================
  console.log('\n[5. Width Profile Presets: Tapered & Sketch Modulation]');

  // Apply tapered profile
  const taperedProfile = SpineCurveService.applyTaperedProfile(lineEl, 1, 14, 1);
  assert(lineEl.attributes[SpineCurveService.WIDTH_PROFILE_ATTR] !== undefined, 'Width profile serialized into element attributes');
  const readProfile = SpineCurveService.getWidthProfile(lineEl);
  assert(readProfile?.mode === 'variable', 'Read profile has variable mode');
  assert(readProfile?.points[1].width === 14, 'Tapered midpoint has width 14');

  // Generate tapered outline
  const taperedOutline = SpineCurveService.generateVariableOutline(lineEl);
  assert(taperedOutline !== null, 'Generated variable tapered outline');

  // Apply sketch modulation
  const sketchRes = SpineCurveService.applySketchModulation(lineEl, { amplitude: 0.7, frequency: 6 });
  assert(sketchRes.mode === 'sketch', 'Sketch modulation applied with mode === "sketch"');
  assert(sketchRes.sketchParams?.amplitude === 0.7, 'Custom sketch amplitude preserved');

  const sketchOutline = SpineCurveService.generateVariableOutline(lineEl);
  assert(sketchOutline !== null, 'Generated organic sketch ink outline');

  // Reset profile
  SpineCurveService.setWidthProfile(lineEl, null);
  assert(lineEl.attributes[SpineCurveService.WIDTH_PROFILE_ATTR] === undefined, 'Width profile cleared cleanly to uniform');

  // =========================================================================
  // 6. CanvasActionDispatcher.strokeToPath Integration
  // =========================================================================
  console.log('\n[6. CanvasActionDispatcher.strokeToPath Integration]');

  const testModel = new VectorModel();
  const testSelection = new SelectionTool();

  const testStrokeEl: VectorElement = {
    id: 'dispatch_stroke_el',
    tagName: 'path',
    attributes: {
      id: 'dispatch_stroke_el',
      d: 'M 50 100 C 150 50, 250 150, 350 100',
      stroke: '#3b82f6',
      'stroke-width': '6',
      'stroke-linecap': 'round',
    },
    vertices: [
      { id: 'dv1', x: 50, y: 100, handleOut: { x: 150, y: 50 }, command: 'M', nodeType: 'smooth' },
      { id: 'dv2', x: 350, y: 100, handleIn: { x: 250, y: 150 }, command: 'C', nodeType: 'smooth' },
    ],
    isClosed: false,
    shapeType: 'path',
  };

  testModel.elements.push(testStrokeEl);
  testSelection.select(testStrokeEl.id);

  let undoPushed = false;
  let synced = false;
  let rendered = false;

  const dispatcher = new CanvasActionDispatcher({
    model: testModel,
    selectionTool: testSelection,
    pushUndo: () => { undoPushed = true; },
    render: () => { rendered = true; },
    syncToHost: () => { synced = true; },
    onResetPropertyPanel: () => {},
    onUpdatePropertyPanel: () => {},
    getActiveTool: () => 'select',
  });

  dispatcher.strokeToPath();

  assert(undoPushed, 'Transactional undo snapshot recorded prior to conversion');
  assert(testModel.elements.length === 1, 'Swapped stroked element in-place (1 element in model)');
  const convertedEl = testModel.elements[0];
  assert(convertedEl.id !== 'dispatch_stroke_el', 'Element replaced with new outline vector');
  assert(convertedEl.attributes.fill === '#3b82f6', 'Inherited original stroke color as vector fill #3b82f6');
  assert(convertedEl.attributes.stroke === 'none', 'Stroke reset to none');
  assert(convertedEl.isClosed === true, 'Converted vector is a closed outline');
  assert(testSelection.isSelected(convertedEl.id), 'Selection updated to the newly synthesized outline');
  assert(rendered && synced, 'Canvas re-rendered and synchronized to host');

  console.log(`\nSpine Curve & Variable Stroke Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
