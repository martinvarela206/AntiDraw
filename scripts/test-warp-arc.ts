import { WarpEngine, WarpArcOptions } from '../src/webview/engine/warp/WarpEngine.js';
import { VectorElement, PathVertex, VectorModel } from '../src/webview/engine/VectorModel.js';
import { BoundingBox } from '../src/webview/engine/geometry/BoundingBoxCalculator.js';
import { CommandRegistry } from '../src/webview/engine/commands/CommandRegistry.js';
import { registerSystemCommands } from '../src/webview/engine/commands/SystemCommands.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

export async function runWarpArcTests(): Promise<boolean> {
  passed = 0;
  failed = 0;

  console.log('--- Running Proportional Warp Arc & Envelope Transformation Suite ---');

  // 1. Proportional Aspect Ratio k = hh / hw & Circular Concentricity
  console.log('\n[1. Physical Aspect Ratio (k = hh / hw) & Concentric Circular Arcs]');
  {
    // Rectangular non-square box: W=400, H=100 (k = 0.25) centered at (300, 200)
    const box: BoundingBox = {
      x: 100,
      y: 150,
      width: 400,
      height: 100,
      cx: 300,
      cy: 200,
    };

    const options: WarpArcOptions = {
      bend: 0.5, // 50% bend upwards
      direction: 'horizontal',
    };

    // Center point (300, 200)
    const centerWarped = WarpEngine.warpPoint({ x: 300, y: 200 }, box, options);
    assert(Math.abs(centerWarped.x - 300) < 1e-4, `Center X remains fixed at cx=300 (got ${centerWarped.x})`);
    assert(Math.abs(centerWarped.y - 200) < 1e-4, `Center Y remains fixed at cy=200 (got ${centerWarped.y})`);

    // Centerline radius r0 = hw / (bend * pi / 2) = 200 / (pi / 4) ~= 254.6479
    const expectedR0 = 200 / (0.5 * Math.PI / 2);
    const centerCurvY = 200 + expectedR0;

    // Top midpoint (300, 150) -> yy = -50
    const topMid = WarpEngine.warpPoint({ x: 300, y: 150 }, box, options);
    const rTopMid = centerCurvY - topMid.y;
    assert(Math.abs(rTopMid - (expectedR0 + 50)) < 1e-3, `Top midpoint radius is r0 + 50 (got ${rTopMid.toFixed(2)}, expected ${(expectedR0 + 50).toFixed(2)})`);

    // Bottom midpoint (300, 250) -> yy = +50
    const bottomMid = WarpEngine.warpPoint({ x: 300, y: 250 }, box, options);
    const rBottomMid = centerCurvY - bottomMid.y;
    assert(Math.abs(rBottomMid - (expectedR0 - 50)) < 1e-3, `Bottom midpoint radius is r0 - 50 (got ${rBottomMid.toFixed(2)}, expected ${(expectedR0 - 50).toFixed(2)})`);

    // Radial thickness Delta r = rTop - rBottom
    const deltaR = rTopMid - rBottomMid;
    assert(Math.abs(deltaR - 100) < 1e-3, `Radial thickness Delta r equals exact physical height H=100 (got ${deltaR.toFixed(2)})`);

    // Check corner points: top-left (100, 150) and bottom-left (100, 250)
    const topLeft = WarpEngine.warpPoint({ x: 100, y: 150 }, box, options);
    const distTopLeft = Math.hypot(topLeft.x - 300, topLeft.y - centerCurvY);
    assert(Math.abs(distTopLeft - (expectedR0 + 50)) < 1e-3, `Top-left corner lies on exact concentric circle of radius rTop (got ${distTopLeft.toFixed(2)})`);

    const bottomLeft = WarpEngine.warpPoint({ x: 100, y: 250 }, box, options);
    const distBottomLeft = Math.hypot(bottomLeft.x - 300, bottomLeft.y - centerCurvY);
    assert(Math.abs(distBottomLeft - (expectedR0 - 50)) < 1e-3, `Bottom-left corner lies on exact concentric circle of radius rBottom (got ${distBottomLeft.toFixed(2)})`);
  }

  // 2. Analytical Folding-Over Safeguard (r = max(0, r0 - yy))
  console.log('\n[2. Analytical Folding-Over Safeguard (r = max(0, r0 - yy))]');
  {
    // Tall narrow box: W=100, H=400 (k = 4.0) under extreme 100% bend
    const tallBox: BoundingBox = {
      x: 100,
      y: 50,
      width: 100,
      height: 400,
      cx: 150,
      cy: 250,
    };

    const extremeOptions: WarpArcOptions = {
      bend: 1.0, // 100% maximum bend
      direction: 'horizontal',
    };

    // hw = 50, hh = 200.
    // theta0 = pi / 2.
    // rBase = 50 / (pi / 2) ~= 31.83 px.
    // At bottom of box: yy = +200. Unsafeguarded: r = 31.83 - 200 = -168.17 < 0!
    const bottomPt = { x: 150, y: 450 }; // yy = +200
    const warpedBottom = WarpEngine.warpPoint(bottomPt, tallBox, extremeOptions);

    const rBase = 50 / (Math.PI / 2);
    const centerCurvY = 250 + rBase;
    const computedRadius = Math.hypot(warpedBottom.x - 150, warpedBottom.y - centerCurvY);

    assert(computedRadius >= 0, `Computed radius is strictly non-negative (got ${computedRadius.toFixed(2)})`);
    assert(Math.abs(computedRadius - 0) < 1e-4, `Safeguard clamped radius smoothly to apex r=0 (got ${computedRadius.toFixed(4)})`);
    assert(Math.abs(warpedBottom.x - 150) < 1e-4, `Apex X matches curvature center cx=150`);
    assert(Math.abs(warpedBottom.y - centerCurvY) < 1e-4, `Apex Y matches curvature center cy+r0`);

    // Verify 100 sampled points across the entire tall box never produce negative radii
    let anyNegative = false;
    for (let i = 0; i < 100; i++) {
      const sampleX = tallBox.x + Math.random() * tallBox.width;
      const sampleY = tallBox.y + Math.random() * tallBox.height;
      const res = WarpEngine.warpPoint({ x: sampleX, y: sampleY }, tallBox, extremeOptions);
      const dist = Math.hypot(res.x - 150, res.y - centerCurvY);
      if (dist < -1e-5) anyNegative = true;
    }
    assert(!anyNegative, '100% of sampled points strictly satisfy r >= 0 with zero negative radii');
  }

  // 3. Bézier Tangent Handles Analytical Transformation
  console.log('\n[3. Analytical Bézier Tangent Handle Deformation]');
  {
    const box: BoundingBox = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      cx: 100,
      cy: 50,
    };

    const vertices: PathVertex[] = [
      {
        id: 'v0',
        x: 0,
        y: 50,
        nodeType: 'smooth',
        command: 'M',
        handleOut: { x: 30, y: 0 }, // Horizontal tangent handle pointing right
      },
      {
        id: 'v1',
        x: 200,
        y: 50,
        nodeType: 'smooth',
        command: 'C',
        handleIn: { x: -30, y: 0 }, // Horizontal tangent handle pointing left
      },
    ];

    const warped = WarpEngine.warpVertices(vertices, box, { bend: 0.5 });
    assert(warped.length === 2, 'Warped 2 vertices');
    assert(warped[0].handleOut !== undefined, 'HandleOut preserved on v0');
    assert(warped[1].handleIn !== undefined, 'HandleIn preserved on v1');

    // On an upward arc, the rightward tangent handle at the left endpoint should tilt upwards (negative dy in SVG screen space)
    assert(warped[0].handleOut!.y < 0, `HandleOut rotated along arc curvature (got dy=${warped[0].handleOut!.y.toFixed(2)})`);
    assert(warped[1].handleIn!.y < 0, `HandleIn rotated along arc curvature (got dy=${warped[1].handleIn!.y.toFixed(2)})`);
  }

  // 4. Identity Mapping when bend = 0
  console.log('\n[4. Identity Mapping on Zero Bend]');
  {
    const box: BoundingBox = { x: 50, y: 50, width: 200, height: 100, cx: 150, cy: 100 };
    const p1 = { x: 75, y: 80 };
    const pWarped = WarpEngine.warpPoint(p1, box, { bend: 0 });
    assert(pWarped.x === p1.x && pWarped.y === p1.y, 'Zero bend returns exact identical coordinates');
  }

  // 5. Vertical Directional Warp
  console.log('\n[5. Vertical Directional Warp]');
  {
    const box: BoundingBox = { x: 100, y: 100, width: 200, height: 400, cx: 200, cy: 300 };
    const pCenter = WarpEngine.warpPoint({ x: 200, y: 300 }, box, { bend: 0.5, direction: 'vertical' });
    assert(Math.abs(pCenter.x - 200) < 1e-4, 'Vertical bend preserves center X=200');
    assert(Math.abs(pCenter.y - 300) < 1e-4, 'Vertical bend preserves center Y=300');

    // Point on top (200, 100) bends rightwards (x > 200)
    const pTop = WarpEngine.warpPoint({ x: 200, y: 100 }, box, { bend: 0.5, direction: 'vertical' });
    assert(pTop.x > 200, `Top point deflected rightwards in vertical arc (got X=${pTop.x.toFixed(2)})`);
  }

  // 6. Lossless Reversible Geometry Tracking (data-warp-base)
  console.log('\n[6. Lossless Reversible Geometry Tracking (data-warp-base)]');
  {
    const el: VectorElement = {
      id: 'el_warp_test',
      tagName: 'path',
      attributes: { id: 'el_warp_test', fill: '#6366f1' },
      isClosed: true,
      vertices: [
        { id: 'v0', x: 100, y: 100, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 300, y: 100, nodeType: 'sharp', command: 'L' },
        { id: 'v2', x: 300, y: 200, nodeType: 'sharp', command: 'L' },
        { id: 'v3', x: 100, y: 200, nodeType: 'sharp', command: 'L' },
      ],
    };

    // Initial warp
    WarpEngine.warpElement(el, { bend: 0.4 });
    assert(!!el.attributes['data-warp-base'], 'Pristine base vertices cached in data-warp-base');
    assert(el.attributes['data-warp-bend'] === '0.4', 'Recorded active bend attribute');

    // Continuous dynamic adjustment with different bend (e.g., -0.6)
    WarpEngine.warpElement(el, { bend: -0.6 });
    assert(el.attributes['data-warp-bend'] === '-0.6', 'Updated active bend to -0.6');

    // Reset warp
    const resetSuccess = WarpEngine.resetWarp(el);
    assert(resetSuccess === true, 'Reset warp executed successfully');
    assert(el.attributes['data-warp-base'] === undefined, 'data-warp-base attribute removed');
    assert(el.vertices![0].x === 100 && el.vertices![0].y === 100, 'v0 restored exact original coordinates (100, 100)');
    assert(el.vertices![2].x === 300 && el.vertices![2].y === 200, 'v2 restored exact original coordinates (300, 200)');
  }

  // 7. System Commands Integration
  console.log('\n[7. System Commands Integration]');
  {
    const registry = new CommandRegistry();
    registerSystemCommands(registry);

    assert(registry.has('warp.applyArc'), 'Command warp.applyArc is registered');
    assert(registry.has('warp.reset'), 'Command warp.reset is registered');

    const model = new VectorModel();
    const selectionTool = new SelectionTool();
    const testEl: VectorElement = {
      id: 'cmd_warp_el',
      tagName: 'path',
      attributes: { id: 'cmd_warp_el', fill: '#10b981' },
      isClosed: true,
      vertices: [
        { id: 'v0', x: 50, y: 50, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 250, y: 50, nodeType: 'sharp', command: 'L' },
        { id: 'v2', x: 250, y: 150, nodeType: 'sharp', command: 'L' },
        { id: 'v3', x: 50, y: 150, nodeType: 'sharp', command: 'L' },
      ],
    };
    model.elements.push(testEl);
    selectionTool.select('cmd_warp_el');

    const cmdCtx = {
      model,
      selectionTool,
      pushUndo: () => {},
      render: () => {},
      syncToHost: () => {},
    };

    registry.setContext(cmdCtx);

    const applyRes = registry.execute('warp.applyArc', { bend: 0.5 });
    assert(applyRes.success === true, 'warp.applyArc executed successfully');
    assert(!!testEl.attributes['data-warp-base'], 'Element has data-warp-base after command execution');

    const resetRes = registry.execute('warp.reset');
    assert(resetRes.success === true, 'warp.reset executed successfully');
    assert(!testEl.attributes['data-warp-base'], 'Element restored and data-warp-base removed after reset command');
    assert(testEl.vertices![0].x === 50 && testEl.vertices![0].y === 50, 'Restored original vertex coordinates');
  }

  console.log(`\nWarp Arc Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
