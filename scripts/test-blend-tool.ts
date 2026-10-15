import { BlendEngine, BlendConfig } from '../src/webview/engine/blend/BlendEngine.js';
import { BlendInspector } from '../src/webview/ui/inspectors/BlendInspector.js';
import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { CommandRegistry } from '../src/webview/engine/commands/CommandRegistry.js';
import { registerSystemCommands } from '../src/webview/engine/commands/SystemCommands.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';

export async function runBlendToolTests(): Promise<boolean> {
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

  console.log('\n--- Running Blend Tool & Morphological Interpolation Suite ---');

  // =========================================================================
  // 1. Equal-Length Resampling & Basic Morphological Interpolation
  // =========================================================================
  console.log('\n[1. Equal-Length Resampling & Basic Morphological Interpolation]');

  // Square at (100, 100) with size 100x100
  const shapeA: VectorElement = {
    id: 'blend_shape_a',
    tagName: 'rect',
    attributes: {
      id: 'blend_shape_a',
      x: '100',
      y: '100',
      width: '100',
      height: '100',
      fill: '#ff0000',
      stroke: '#333333',
      'stroke-width': '2',
      opacity: '1',
    },
    vertices: [
      { id: 'a1', x: 100, y: 100, command: 'M', nodeType: 'sharp' },
      { id: 'a2', x: 200, y: 100, command: 'L', nodeType: 'sharp' },
      { id: 'a3', x: 200, y: 200, command: 'L', nodeType: 'sharp' },
      { id: 'a4', x: 100, y: 200, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: true,
  };

  // Triangle at (500, 100)
  const shapeB: VectorElement = {
    id: 'blend_shape_b',
    tagName: 'path',
    attributes: {
      id: 'blend_shape_b',
      d: 'M 500 200 L 600 200 L 550 100 Z',
      fill: '#0000ff',
      stroke: '#ffffff',
      'stroke-width': '6',
      opacity: '0.6',
    },
    vertices: [
      { id: 'b1', x: 500, y: 200, command: 'M', nodeType: 'sharp' },
      { id: 'b2', x: 600, y: 200, command: 'L', nodeType: 'sharp' },
      { id: 'b3', x: 550, y: 100, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: true,
  };

  const blendGroup = BlendEngine.createBlendGroup(shapeA, shapeB, { steps: 3 });

  assert(BlendEngine.isBlendGroup(blendGroup), 'Created valid blend group (<g data-blend="true">)');
  assert(blendGroup.children?.length === 5, `Children count is 5 (Shape A + 3 intermediate steps + Shape B) (got ${blendGroup.children?.length})`);

  // Check intermediate step 2 (t = 2/4 = 0.5 - exact midpoint)
  const midStep = blendGroup.children![2];
  assert(midStep.attributes['data-blend-intermediate'] === 'true', 'Mid-step has intermediate marker');
  assert(midStep.attributes['data-blend-step-index'] === '2', 'Mid-step has step index 2');

  // Stroke width at t=0.5: 2 + (6 - 2) * 0.5 = 4
  assert(midStep.attributes['stroke-width'] === '4', `Stroke width interpolated to 4 (got ${midStep.attributes['stroke-width']})`);

  // Opacity at t=0.5: 1 + (0.6 - 1) * 0.5 = 0.8
  assert(midStep.attributes['opacity'] === '0.8', `Opacity interpolated to 0.8 (got ${midStep.attributes['opacity']})`);

  // Color fill at t=0.5: blend between #ff0000 (255, 0, 0) and #0000ff (0, 0, 255) -> (128, 0, 128) #800080
  const midFill = midStep.attributes.fill;
  assert(midFill.toLowerCase() === '#800080', `Fill color blended to purple #800080 (got ${midFill})`);

  // =========================================================================
  // 2. Manual Calibration of Initial Node (Node 0)
  // =========================================================================
  console.log('\n[2. Manual Calibration of Initial Node (Node 0)]');

  const origVerts = [
    { id: 'v0', x: 0, y: 0, command: 'M' as const, nodeType: 'sharp' as const },
    { id: 'v1', x: 10, y: 0, command: 'L' as const, nodeType: 'sharp' as const },
    { id: 'v2', x: 10, y: 10, command: 'L' as const, nodeType: 'sharp' as const },
    { id: 'v3', x: 0, y: 10, command: 'L' as const, nodeType: 'sharp' as const },
  ];

  // Shift by 1: index 1 (10, 0) becomes the new Node 0
  const shifted1 = BlendEngine.shiftStartNode(origVerts, 1);
  assert(shifted1[0].x === 10 && shifted1[0].y === 0, 'New Node 0 is (10, 0)');
  assert(shifted1[0].command === 'M', 'Node 0 command is M');
  assert(shifted1[1].x === 10 && shifted1[1].y === 10, 'Node 1 is (10, 10)');
  assert(shifted1[3].x === 0 && shifted1[3].y === 0, 'Node 3 is wrapped to (0, 0)');

  // Shift by 2: index 2 (10, 10) becomes Node 0
  const shifted2 = BlendEngine.shiftStartNode(origVerts, 2);
  assert(shifted2[0].x === 10 && shifted2[0].y === 10, 'New Node 0 is (10, 10)');

  // Test updating blend group with manual start nodes
  BlendEngine.updateBlendConfig(blendGroup, { startNodeAIndex: 1, startNodeBIndex: 2 });
  const cfgAfterShift = BlendEngine.getBlendConfig(blendGroup);
  assert(cfgAfterShift?.startNodeAIndex === 1, 'Group attribute data-blend-start-a updated to 1');
  assert(cfgAfterShift?.startNodeBIndex === 2, 'Group attribute data-blend-start-b updated to 2');

  // =========================================================================
  // 3. Contour Direction Reversal (Anti-Twisting / Desenredado)
  // =========================================================================
  console.log('\n[3. Contour Direction Reversal (Anti-Twisting)]');

  const splineVerts = [
    { id: 's0', x: 0, y: 0, handleOut: { x: 5, y: 2 }, command: 'M' as const, nodeType: 'smooth' as const },
    { id: 's1', x: 10, y: 0, handleIn: { x: 8, y: 2 }, command: 'C' as const, nodeType: 'smooth' as const },
  ];

  const reversedSpline = BlendEngine.reverseContour(splineVerts);
  assert(reversedSpline[0].x === 0 && reversedSpline[0].y === 0, 'Reversed anchor at origin preserved');
  // Tangents swapped
  assert(reversedSpline[0].handleIn !== undefined && reversedSpline[0].handleIn.x === 5, 'handleOut swapped to handleIn');

  // Toggle reverse direction on figure B to untwist
  assert(cfgAfterShift?.reverseDirectionB === false, 'Initially direct orientation (reverseDirectionB: false)');
  BlendEngine.toggleReverseDirectionB(blendGroup);
  const cfgReversed = BlendEngine.getBlendConfig(blendGroup);
  assert(cfgReversed?.reverseDirectionB === true, 'Toggled reverseDirectionB to true (anti-twisting active)');

  // Toggle back
  BlendEngine.toggleReverseDirectionB(blendGroup);
  const cfgRestored = BlendEngine.getBlendConfig(blendGroup);
  assert(cfgRestored?.reverseDirectionB === false, 'Restored reverseDirectionB back to false');

  // =========================================================================
  // 4. Step Count Updates & Expansion (Baking)
  // =========================================================================
  console.log('\n[4. Step Count Updates & Expansion (Baking)]');

  // Update step count to 7
  BlendEngine.updateBlendConfig(blendGroup, { steps: 7 });
  assert(blendGroup.children?.length === 9, `Updated children count to 9 (1 + 7 + 1) (got ${blendGroup.children?.length})`);

  // Expand (Bake) blend group into standalone elements
  const expanded = BlendEngine.expandBlendGroup(blendGroup);
  assert(expanded.length === 9, `Expanded into 9 independent vector elements (got ${expanded.length})`);
  assert(expanded.every((el) => el.attributes['data-blend-intermediate'] === undefined), 'Expanded elements purged internal intermediate metadata');

  // =========================================================================
  // 5. BlendInspector HTML Rendering
  // =========================================================================
  console.log('\n[5. BlendInspector HTML Rendering]');

  const html = BlendInspector.renderHtml(blendGroup);
  assert(html.includes('Fusión Paramétrica (Blend)'), 'Inspector title rendered');
  assert(html.includes('id="el-blend-steps-slider"'), 'Rendered steps slider');
  assert(html.includes('id="el-blend-start-a"'), 'Rendered Start Node A input');
  assert(html.includes('id="el-blend-start-b"'), 'Rendered Start Node B input');
  assert(html.includes('id="btn-blend-toggle-twist"'), 'Rendered anti-twisting toggle button');
  assert(html.includes('id="btn-blend-expand"'), 'Rendered expand blend button');

  // =========================================================================
  // 6. System Commands Integration
  // =========================================================================
  console.log('\n[6. System Commands Integration]');

  const registry = new CommandRegistry();
  registerSystemCommands(registry);

  assert(registry.get('blend.create') !== undefined, 'Command blend.create registered');
  assert(registry.get('blend.toggleReverseB') !== undefined, 'Command blend.toggleReverseB registered');
  assert(registry.get('blend.expand') !== undefined, 'Command blend.expand registered');

  const model = new VectorModel();
  const selectionTool = new SelectionTool();

  model.elements.push(shapeA, shapeB);
  selectionTool.selectedElementIds.add(shapeA.id);
  selectionTool.selectedElementIds.add(shapeB.id);

  let undoPushed = false;
  let rendered = false;
  let synced = false;

  const cmdCtx = {
    model,
    selectionTool,
    pushUndo: () => { undoPushed = true; },
    render: () => { rendered = true; },
    syncToHost: () => { synced = true; },
  };

  registry.setContext(cmdCtx as any);

  // Execute blend.create via command registry
  const resCreate = registry.execute('blend.create');
  assert(resCreate.success === true, 'blend.create executed successfully');
  assert(model.elements.length === 1, 'Replaced 2 source elements with 1 live blend group');
  assert(BlendEngine.isBlendGroup(model.elements[0]), 'Model contains live blend group');

  // Execute blend.toggleReverseB via command registry
  const resTwist = registry.execute('blend.toggleReverseB');
  assert(resTwist.success === true, 'blend.toggleReverseB executed successfully');
  const activeCfg = BlendEngine.getBlendConfig(model.elements[0]);
  assert(activeCfg?.reverseDirectionB === true, 'Command successfully toggled reverseDirectionB');

  // Execute blend.expand via command registry
  const resExpand = registry.execute('blend.expand');
  assert(resExpand.success === true, 'blend.expand executed successfully');
  assert(model.elements.length > 1, `Blend baked into ${model.elements.length} standalone vector elements`);

  console.log(`\nBlend Tool Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
