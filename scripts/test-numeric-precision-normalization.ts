import { formatNum, PathGeometryCompiler } from '../src/webview/engine/geometry/PathGeometryCompiler.js';
import { VectorModel, PathVertex } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SurgicalSvgModifier } from '../src/webview/engine/serialization/SurgicalSvgModifier.js';

export function runNumericPrecisionNormalizationTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Numeric Precision Normalization Suite');
  console.log('======================================================');

  let passed = 0;
  let total = 5;

  // Test 1: formatNum precision and edge cases (trailing zeroes, negative zero, infinity)
  try {
    const r1 = formatNum(10.000000000000002, 3);
    const r2 = formatNum(45.1234567, 3);
    const r3 = formatNum(45.1234567, 2);
    const r4 = formatNum(-0.00000001, 3);
    const r5 = formatNum(7.5, 4);

    if (r1 === '10' && r2 === '45.123' && r3 === '45.12' && r4 === '0' && r5 === '7.5') {
      console.log('  ✅ [PASS] formatNum correctly strips trailing zeroes, clamps precision, and eliminates negative zeroes');
      passed++;
    } else {
      console.error('  ❌ [FAIL] formatNum output unexpected:', { r1, r2, r3, r4, r5 });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 1:', err?.message || err);
  }

  // Test 2: compilePathD configurable precision
  try {
    const vertices: PathVertex[] = [
      { id: 'v1', x: 10.123456, y: 20.654321, nodeType: 'sharp', command: 'M' },
      { id: 'v2', x: 50.987654, y: 80.111222, nodeType: 'sharp', command: 'L' },
    ];

    const dPrec3 = PathGeometryCompiler.compilePathD(vertices, false, 3);
    const dPrec1 = PathGeometryCompiler.compilePathD(vertices, false, 1);

    const expected3 = 'M 10.123 20.654 L 50.988 80.111';
    const expected1 = 'M 10.1 20.7 L 51 80.1';

    if (dPrec3 === expected3 && dPrec1 === expected1) {
      console.log('  ✅ [PASS] PathGeometryCompiler.compilePathD complies with configured decimal precision');
      passed++;
    } else {
      console.error('  ❌ [FAIL] compilePathD output mismatch:', { dPrec3, expected3, dPrec1, expected1 });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 2:', err?.message || err);
  }

  // Test 3: SvgSerializer normalizes root viewBox and geometric attributes with configurable precision
  try {
    const model = new VectorModel();
    model.canvas.width = 800.0000000001;
    model.canvas.height = 600.0000000002;
    model.canvas.viewBox = '0.0000 0.0000 800.0000000001 600.0000000002';
    model.elements = [
      {
        id: 'rect1',
        tagName: 'rect',
        attributes: {
          x: '15.123456',
          y: '25.654321',
          width: '100.999999',
          height: '50.000001',
          fill: '#3b82f6',
        },
      },
    ];

    const svgOutput = SvgSerializer.toSvgString(model, { precision: 2, surgical: false });
    const hasCleanRoot = svgOutput.includes('width="800"') && svgOutput.includes('height="600"') && svgOutput.includes('viewBox="0 0 800 600"');
    const hasCleanRect = svgOutput.includes('x="15.12"') && svgOutput.includes('y="25.65"') && svgOutput.includes('width="101"') && svgOutput.includes('height="50"');

    if (hasCleanRoot && hasCleanRect) {
      console.log('  ✅ [PASS] SvgSerializer normalizes root viewBox and scalar attributes cleanly with precision=2');
      passed++;
    } else {
      console.error('  ❌ [FAIL] SvgSerializer output did not match expected precision:', svgOutput);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 3:', err?.message || err);
  }

  // Test 4: Normalization of points coordinates and transform floating point drift
  try {
    const model = new VectorModel();
    model.elements = [
      {
        id: 'poly1',
        tagName: 'polyline',
        attributes: {
          points: '10.000000001,20.000000002 30.123456,40.654321',
          transform: 'translate(12.000000004, 34.000000005) rotate(45.000000001)',
          fill: 'none',
          stroke: '#ef4444',
        },
      },
    ];

    const svgOutput = SvgSerializer.toSvgString(model, { precision: 3, surgical: false });
    const hasCleanPoints = svgOutput.includes('points="10,20 30.123,40.654"');
    const hasCleanTransform = svgOutput.includes('transform="translate(12, 34) rotate(45)"');

    if (hasCleanPoints && hasCleanTransform) {
      console.log('  ✅ [PASS] Normalizes polyline points and affine transform floating-point noise');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Points or transform normalization failed:', svgOutput);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 4:', err?.message || err);
  }

  // Test 5: Surgical SVG modification honors precision on localized mutations
  try {
    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <!-- Original untouchable comment -->
  <rect id="box" x="10" y="10" width="100" height="100" fill="#10b981" />
</svg>`;

    const model = new VectorModel();
    model.sourceSvgText = rawSvg;
    model.canvas.width = 400;
    model.canvas.height = 400;
    model.canvas.viewBox = '0 0 400 400';
    model.elements = [
      {
        id: 'box',
        tagName: 'rect',
        attributes: {
          x: '10.00000000004',
          y: '10.12345678',
          width: '100',
          height: '100',
          fill: '#10b981',
          transform: 'matrix(1.000000002, 0.000000001, -0.000000001, 1.000000002, 50.123456, 60.987654)',
        },
      },
    ];

    const patchedSvg = SurgicalSvgModifier.patchSvgDocument(rawSvg, model, { surgical: true, precision: 3 });
    const hasComment = patchedSvg.includes('<!-- Original untouchable comment -->');
    const hasCleanX = patchedSvg.includes('x="10"');
    const hasCleanY = patchedSvg.includes('y="10.123"');
    const hasCleanMatrix = patchedSvg.includes('matrix(1, 0, 0, 1, 50.123, 60.988)');

    if (hasComment && hasCleanX && hasCleanY && hasCleanMatrix) {
      console.log('  ✅ [PASS] Surgical modifier preserves XML comments while applying precision normalization to mutated attributes');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Surgical modifier precision normalization failed:', patchedSvg);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 5:', err?.message || err);
  }

  console.log(`\nNumeric Precision Normalization: ${passed}/${total} tests passed.`);
  return passed === total;
}
