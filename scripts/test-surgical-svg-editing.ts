import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { DOMParser } from 'linkedom';

if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

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

export function runSurgicalSvgEditingTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Surgical SVG Editing & Foreign Namespace Preservation Suite');
  console.log('======================================================');

  // Test 1: XML Comments Preservation across localized mutations
  {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <!-- Section 1: Main Header Branding -->
  <rect id="brand_rect" x="10" y="10" width="100" height="40" fill="#3b82f6"/>
  <!-- Section 2: Auxiliary Geometry -->
  <circle id="aux_circ" cx="200" cy="200" r="20" fill="#10b981"/>
</svg>`;

    const model = new VectorModel();
    model.loadSvgString(sourceSvg);

    // Mutate brand_rect position
    const rect = model.elements.find((e) => e.id === 'brand_rect');
    if (rect) {
      rect.attributes.x = '45';
      rect.attributes.fill = '#ef4444';
    }

    const patchedSvg = SvgSerializer.toSvgString(model, { surgical: true });

    assert(
      patchedSvg.includes('<!-- Section 1: Main Header Branding -->') &&
        patchedSvg.includes('<!-- Section 2: Auxiliary Geometry -->'),
      'Preserves XML comments in-place during localized mutations'
    );
    assert(
      patchedSvg.includes('x="45"') && patchedSvg.includes('fill="#ef4444"'),
      'Surgically patches mutated element attributes (x="45", fill="#ef4444")'
    );
  }

  // Test 2: Foreign Namespaces (inkscape:, sodipodi:) and custom attributes retention
  {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="500" height="500">
  <path id="curve1" d="M 10 10 L 90 90" stroke="#000000" inkscape:connector-curvature="0" sodipodi:nodetypes="cc" inkscape:label="Path Layer"/>
</svg>`;

    const model = new VectorModel();
    model.loadSvgString(sourceSvg);

    const path = model.elements.find((e) => e.id === 'curve1');
    if (path) {
      path.attributes.stroke = '#8b5cf6';
      path.attributes['stroke-width'] = '4';
    }

    const patchedSvg = SvgSerializer.toSvgString(model, { surgical: true });

    assert(
      patchedSvg.includes('xmlns:inkscape=') &&
        patchedSvg.includes('xmlns:sodipodi=') &&
        patchedSvg.includes('inkscape:connector-curvature="0"') &&
        patchedSvg.includes('sodipodi:nodetypes="cc"') &&
        patchedSvg.includes('inkscape:label="Path Layer"'),
      'Preserves foreign namespaces (inkscape, sodipodi) and custom tooling attributes'
    );
    assert(
      patchedSvg.includes('stroke="#8b5cf6"') && patchedSvg.includes('stroke-width="4"'),
      'Patches standard stroke attributes while leaving third-party attributes intact'
    );
  }

  // Test 3: Untouched elements exact attribute ordering & format preservation
  {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <rect id="untouched_rect" fill="#f59e0b" height="30" width="60" y="5" x="5"/>
  <circle id="mutated_circ" cx="100" cy="100" r="10" fill="#6366f1"/>
</svg>`;

    const model = new VectorModel();
    model.loadSvgString(sourceSvg);

    const circ = model.elements.find((e) => e.id === 'mutated_circ');
    if (circ) {
      circ.attributes.r = '25';
    }

    const patchedSvg = SvgSerializer.toSvgString(model, { surgical: true });

    assert(
      patchedSvg.includes('fill="#f59e0b" height="30" width="60" y="5" x="5"'),
      'Untouched element retains exact attribute order and formatting'
    );
    assert(patchedSvg.includes('r="25"'), 'Targeted element successfully mutated');
  }

  // Test 4: currentColor Fidelity Restoration on Surgical Save
  {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" color="#0ea5e9" width="24" height="24">
  <path id="icon_stroke" d="M 2 2 L 22 22" stroke="currentColor" fill="none"/>
</svg>`;

    const model = new VectorModel();
    model.loadSvgString(sourceSvg);

    // Verify deserializer registered currentColor marker
    const path = model.elements.find((e) => e.id === 'icon_stroke');
    assert(
      path?.attributes['data-original-stroke'] === 'currentColor',
      'Deserializer tracked data-original-stroke="currentColor"'
    );

    // Surgically serialize without changing the stroke color
    const patchedSvg = SvgSerializer.toSvgString(model, { surgical: true });

    assert(
      patchedSvg.includes('stroke="currentColor"'),
      'Surgical modifier restores stroke="currentColor" instead of hardcoded hex'
    );
    assert(
      !patchedSvg.includes('data-original-stroke'),
      'Surgical modifier purges proprietary data-original-stroke attribute from export'
    );
  }

  // Test 5: Clean Element Deletion and Insertion Synchronization
  {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
  <!-- Header Block -->
  <rect id="to_delete" x="0" y="0" width="50" height="50" fill="#000000"/>
  <rect id="keeper" x="60" y="0" width="50" height="50" fill="#10b981"/>
</svg>`;

    const model = new VectorModel();
    model.loadSvgString(sourceSvg);

    // Remove to_delete and add new_rect
    model.elements = model.elements.filter((e) => e.id !== 'to_delete');
    model.elements.push({
      id: 'new_rect',
      tagName: 'rect',
      attributes: {
        id: 'new_rect',
        x: '150',
        y: '0',
        width: '80',
        height: '40',
        fill: '#ec4899',
      },
    });

    const patchedSvg = SvgSerializer.toSvgString(model, { surgical: true });

    assert(
      !patchedSvg.includes('id="to_delete"'),
      'Deleted element cleanly excised from SVG document'
    );
    assert(
      patchedSvg.includes('id="new_rect"') && patchedSvg.includes('fill="#ec4899"'),
      'Newly added element successfully mounted in patched document'
    );
    assert(
      patchedSvg.includes('<!-- Header Block -->') && patchedSvg.includes('id="keeper"'),
      'Surrounding comments and preserved elements remain intact'
    );
  }

  console.log(`\nSurgical SVG Editing: ${passed}/5 tests passed.`);
  if (failed > 0) {
    throw new Error(`Surgical SVG Editing tests failed: ${failed} assertions failed.`);
  }
  return true;
}

if (process.argv[1]?.endsWith('test-surgical-svg-editing.ts')) {
  runSurgicalSvgEditingTests();
}
