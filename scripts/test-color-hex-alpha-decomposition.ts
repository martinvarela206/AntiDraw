import { Color } from '../src/webview/core/color/Color.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { SurgicalSvgModifier } from '../src/webview/engine/serialization/SurgicalSvgModifier.js';

export function runColorHexAlphaDecompositionTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running W3C Standard Hex Color Alpha Decomposition Suite');
  console.log('======================================================');

  let passed = 0;
  const total = 5;

  // Test 1: Color.decomposeColor handles 8-digit hex, 4-digit hex, rgba(), and keywords
  try {
    const d8 = Color.decomposeColor('#4f46e580'); // alpha 128 / 255 ≈ 0.502
    const d4 = Color.decomposeColor('#f008');     // alpha 136 / 255 ≈ 0.533
    const dRgba = Color.decomposeColor('rgba(255, 128, 0, 0.4)');
    const d6 = Color.decomposeColor('#22c55e');
    const dNone = Color.decomposeColor('none');
    const dCc = Color.decomposeColor('currentColor');

    const ok8 = d8?.color === '#4f46e5' && Math.abs((d8.alpha || 0) - 0.502) < 0.005;
    const ok4 = d4?.color === '#ff0000' && Math.abs((d4.alpha || 0) - 0.533) < 0.005;
    const okRgba = dRgba?.color === '#ff8000' && Math.abs((dRgba.alpha || 0) - 0.4) < 0.005;
    const ok6 = d6?.color === '#22c55e' && d6.alpha === undefined;
    const okNone = dNone?.color === 'none' && dNone.alpha === undefined;
    const okCc = dCc?.color === 'currentColor';

    if (ok8 && ok4 && okRgba && ok6 && okNone && okCc) {
      console.log('  ✅ [PASS] Color.decomposeColor accurately separates base 6-digit hex from alpha channel');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Color.decomposeColor failed:', { d8, d4, dRgba, d6, dNone, dCc });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 1:', err?.message || err);
  }

  // Test 2: SvgDeserializer decomposes #RRGGBBAA and #RGBA on inbound SVG ingestion
  try {
    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect id="r1" x="10" y="10" width="30" height="30" fill="#ff000080" stroke="#00ff0040" />
      <circle id="c1" cx="50" cy="50" r="20" fill="#3b82f680" fill-opacity="0.5" />
    </svg>`;

    const model = new VectorModel();
    model.loadSvgString(rawSvg);
    const r1 = model.getElementById('r1');
    const c1 = model.getElementById('c1');

    const r1FillClean = r1?.attributes.fill === '#ff0000';
    const r1FillOp = Math.abs(parseFloat(r1?.attributes['fill-opacity'] || '0') - 0.502) < 0.01;
    const r1StrokeClean = r1?.attributes.stroke === '#00ff00';
    const r1StrokeOp = Math.abs(parseFloat(r1?.attributes['stroke-opacity'] || '0') - 0.251) < 0.01;

    // c1 has existing fill-opacity="0.5" compounded with alpha 0.502 -> ~0.251
    const c1FillClean = c1?.attributes.fill === '#3b82f6';
    const c1FillOp = Math.abs(parseFloat(c1?.attributes['fill-opacity'] || '0') - 0.251) < 0.01;

    if (r1FillClean && r1FillOp && r1StrokeClean && r1StrokeOp && c1FillClean && c1FillOp) {
      console.log('  ✅ [PASS] SvgDeserializer decomposes 8-digit hex fill & stroke into standard hex and opacity attributes');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Deserialization decomposition failed:', {
        r1Attrs: r1?.attributes,
        c1Attrs: c1?.attributes,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 2:', err?.message || err);
  }

  // Test 3: SvgSerializer enforces strict W3C SVG 1.1 compliance (No 8-digit hex in output)
  try {
    const model = new VectorModel();
    model.elements.push({
      id: 'path1',
      tagName: 'path',
      attributes: {
        id: 'path1',
        d: 'M 0 0 L 50 50 Z',
        fill: '#4f46e580', // 8-digit hex in memory
        stroke: '#22c55ecc', // ~0.8 alpha
        'stroke-width': '2',
      },
      vertices: [
        { id: 'v1', x: 0, y: 0, command: 'M', nodeType: 'corner' },
        { id: 'v2', x: 50, y: 50, command: 'L', nodeType: 'corner' },
      ],
      isClosed: true,
    });

    const serialized = SvgSerializer.toSvgString(model);

    const hasHex8 = /#[0-9a-fA-F]{8}/.test(serialized);
    const hasCleanFill = serialized.includes('fill="#4f46e5"');
    const hasFillOp = serialized.includes('fill-opacity="0.502"');
    const hasCleanStroke = serialized.includes('stroke="#22c55e"');
    const hasStrokeOp = serialized.includes('stroke-opacity="0.8"');

    if (!hasHex8 && hasCleanFill && hasFillOp && hasCleanStroke && hasStrokeOp) {
      console.log('  ✅ [PASS] SvgSerializer decomposes 8-digit hex into W3C SVG 1.1 standard attributes (0% #RRGGBBAA output)');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Serializer color decomposition mismatch:', {
        hasHex8,
        hasCleanFill,
        hasFillOp,
        hasCleanStroke,
        hasStrokeOp,
        serialized,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 3:', err?.message || err);
  }

  // Test 4: Gradient stops with alpha channels are decomposed to stop-color and stop-opacity
  try {
    const model = new VectorModel();
    const gradJson = JSON.stringify({
      id: 'g1',
      type: 'linear',
      stops: [
        { id: 's0', offset: 0, color: '#ff000080', opacity: 1 },
        { id: 's1', offset: 1, color: '#0000ff', opacity: 0.7 },
      ],
    });

    model.elements.push({
      id: 'rect_grad',
      tagName: 'rect',
      attributes: {
        id: 'rect_grad',
        x: '0',
        y: '0',
        width: '100',
        height: '100',
        fill: 'url(#ad-grad-rect_grad)',
        'data-gradient': gradJson,
      },
    });

    const serialized = SvgSerializer.toSvgString(model);

    const hasHex8 = /#[0-9a-fA-F]{8}/.test(serialized);
    const hasStopColorClean = serialized.includes('stop-color="#ff0000"');
    const hasStopOpClean = serialized.includes('stop-opacity="0.502"');

    if (!hasHex8 && hasStopColorClean && hasStopOpClean) {
      console.log('  ✅ [PASS] Gradient stops with alpha channels decompose to standard stop-color and stop-opacity');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Gradient stop alpha decomposition failed:', {
        hasHex8,
        hasStopColorClean,
        hasStopOpClean,
        serialized,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 4:', err?.message || err);
  }

  // Test 5: SurgicalSvgModifier localized patching decomposes 8-digit hex without comment corruption
  try {
    const originalDoc = `<!-- Header comment --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="40" height="40" fill="#000000" /><!-- Footer comment --></svg>`;
    const model = new VectorModel();
    model.loadSvgString(originalDoc);
    const r1 = model.getElementById('r1');
    if (r1) {
      r1.attributes.fill = '#ec489980'; // Mutated with 8-digit hex
    }

    const patched = SurgicalSvgModifier.patchSvgDocument(originalDoc, model, { surgical: true });

    const hasHex8 = /#[0-9a-fA-F]{8}/.test(patched);
    const hasCleanFill = patched.includes('fill="#ec4899"');
    const hasFillOp = patched.includes('fill-opacity="0.502"');
    const preservesComments = patched.includes('<!-- Header comment -->') && patched.includes('<!-- Footer comment -->');

    if (!hasHex8 && hasCleanFill && hasFillOp && preservesComments) {
      console.log('  ✅ [PASS] SurgicalSvgModifier applies localized W3C alpha decomposition while preserving XML comments');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Surgical modifier alpha decomposition failed:', {
        hasHex8,
        hasCleanFill,
        hasFillOp,
        preservesComments,
        patched,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 5:', err?.message || err);
  }

  console.log(`\nResults: ${passed}/${total} assertions passed.`);
  return passed === total;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const success = runColorHexAlphaDecompositionTests();
  process.exit(success ? 0 : 1);
}
