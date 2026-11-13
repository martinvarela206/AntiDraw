import { SvgMetadataCleaner } from '../src/webview/engine/serialization/SvgMetadataCleaner.js';
import { VectorModel } from '../src/webview/engine/VectorModel.js';
import { CommandRegistry } from '../src/webview/commands/CommandRegistry.js';
import { registerSystemCommands } from '../src/webview/engine/commands/SystemCommands.js';

export function runExplicitMetadataPurgeTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Explicit Metadata Purge & Sanitization Suite');
  console.log('======================================================');

  let passed = 0;
  let total = 5;

  // Test 1: Inkscape & Sodipodi namespaces and editor tags
  try {
    const rawInkscapeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="400" height="400" viewBox="0 0 400 400">
  <sodipodi:namedview id="base" pagecolor="#ffffff" bordercolor="#666666" showgrid="true" />
  <inkscape:perspective sodipodi:type="inkscape:persp3d" name="Perspective" />
  <rect id="rect1" x="10" y="20" width="100" height="80" fill="#3b82f6" inkscape:label="MyBox" sodipodi:nodetypes="cccc" />
</svg>`;

    const res = SvgMetadataCleaner.cleanSvg(rawInkscapeSvg);
    const hasSodipodiTag = res.cleanedSvg.includes('sodipodi:namedview');
    const hasInkscapeTag = res.cleanedSvg.includes('inkscape:perspective');
    const hasInkscapeNs = res.cleanedSvg.includes('xmlns:inkscape');
    const hasSodipodiNs = res.cleanedSvg.includes('xmlns:sodipodi');
    const hasRect = res.cleanedSvg.includes('<rect') && res.cleanedSvg.includes('fill="#3b82f6"');

    if (!hasSodipodiTag && !hasInkscapeTag && !hasInkscapeNs && !hasSodipodiNs && hasRect) {
      console.log('  ✅ [PASS] Strips Inkscape/Sodipodi namespaces and proprietary editor tags');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Did not strip all Inkscape/Sodipodi artifacts:', res.cleanedSvg);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 1:', err?.message || err);
  }

  // Test 2: Foreign attributes from Figma, Sketch & Illustrator
  try {
    const multiToolSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" xmlns:figma="https://www.figma.com/format/svg" width="200" height="200">
  <circle id="c1" cx="50" cy="50" r="30" fill="#ef4444" stroke="#000000"
          sketch:type="MSShapeGroup" figma:id="12:34" i:knockout="Off" />
</svg>`;

    const res = SvgMetadataCleaner.cleanSvg(multiToolSvg);
    const hasSketchAttr = res.cleanedSvg.includes('sketch:type');
    const hasFigmaAttr = res.cleanedSvg.includes('figma:id');
    const hasKnockout = res.cleanedSvg.includes('i:knockout');
    const retainsStdAttrs = res.cleanedSvg.includes('cx="50"') && res.cleanedSvg.includes('fill="#ef4444"');

    if (!hasSketchAttr && !hasFigmaAttr && !hasKnockout && retainsStdAttrs) {
      console.log('  ✅ [PASS] Strips Sketch, Figma and Adobe custom attributes while retaining standard geometry and styling');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Did not clean foreign attributes cleanly:', res.cleanedSvg);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 2:', err?.message || err);
  }

  // Test 3: XML comments and internal data-* attributes
  try {
    const commentDataSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <!-- Generator: AntiDraw v0.103.32 -->
  <!-- Critical Layer Note: Primary Branding -->
  <path id="path_logo" d="M10 10 L50 10 L30 50 Z" fill="#10b981"
        data-antidraw-id="internal_guid_9823"
        data-original-stroke="currentColor"
        data-contextual="false" />
</svg>`;

    const res = SvgMetadataCleaner.cleanSvg(commentDataSvg);
    const hasComments = res.cleanedSvg.includes('<!--');
    const hasDataAttrs = res.cleanedSvg.includes('data-antidraw-id') || res.cleanedSvg.includes('data-original-stroke');
    const hasPath = res.cleanedSvg.includes('d="M10 10 L50 10 L30 50 Z"');

    if (!hasComments && !hasDataAttrs && hasPath && res.commentsRemovedCount === 2) {
      console.log('  ✅ [PASS] Removes XML comments and internal tracking data-* attributes on demand');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Failed to remove comments or data-* attributes:', res.cleanedSvg);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 3:', err?.message || err);
  }

  // Test 4: Prunes unreferenced <defs> elements while keeping referenced ones
  try {
    const defsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
  <defs>
    <linearGradient id="active_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="orphaned_gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff0000" />
      <stop offset="100%" stop-color="#00ff00" />
    </linearGradient>
    <filter id="unused_filter">
      <feGaussianBlur stdDeviation="5" />
    </filter>
  </defs>
  <rect x="0" y="0" width="100" height="100" fill="url(#active_gradient)" />
</svg>`;

    const res = SvgMetadataCleaner.cleanSvg(defsSvg, { stripUnusedDefs: true });
    const hasActiveGradient = res.cleanedSvg.includes('id="active_gradient"');
    const hasOrphanedGradient = res.cleanedSvg.includes('id="orphaned_gradient"');
    const hasUnusedFilter = res.cleanedSvg.includes('id="unused_filter"');

    if (hasActiveGradient && !hasOrphanedGradient && !hasUnusedFilter && res.unusedDefsRemovedCount === 2) {
      console.log('  ✅ [PASS] Prunes orphaned <defs> elements while preserving actively referenced gradients and filters');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Defs pruning failed:', res.cleanedSvg);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 4:', err?.message || err);
  }

  // Test 5: End-to-end integration via VectorModel & CommandRegistry
  try {
    const model = new VectorModel();
    model.sourceSvgText = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <!-- In-memory comment -->
  <rect id="box" x="10" y="10" width="50" height="50" fill="#f59e0b" inkscape:label="YellowBox" data-antidraw-test="123" />
</svg>`;
    model.elements = [
      {
        id: 'box',
        tagName: 'rect',
        attributes: {
          x: '10',
          y: '10',
          width: '50',
          height: '50',
          fill: '#f59e0b',
          'inkscape:label': 'YellowBox',
          'data-antidraw-test': '123',
        },
      },
    ];

    const registry = CommandRegistry.getInstance();
    registerSystemCommands(registry);

    let undoPushed = false;
    let renderCalled = false;
    let syncCalled = false;

    const ctx = {
      model,
      pushUndo: () => {
        undoPushed = true;
      },
      render: () => {
        renderCalled = true;
      },
      syncToHost: () => {
        syncCalled = true;
      },
    };

    const cmdResult = registry.execute('document.purgeMetadata', undefined, ctx as any);

    const el = model.elements[0];
    const hasInkscapeInModel = 'inkscape:label' in el.attributes;
    const hasDataInModel = 'data-antidraw-test' in el.attributes;
    const cleanedInSource = !model.sourceSvgText.includes('inkscape:label') && !model.sourceSvgText.includes('data-antidraw-test');

    if (
      cmdResult.success &&
      undoPushed &&
      renderCalled &&
      syncCalled &&
      !hasInkscapeInModel &&
      !hasDataInModel &&
      cleanedInSource
    ) {
      console.log('  ✅ [PASS] End-to-end execution of document.purgeMetadata with undo step and UI synchronization');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Command integration failed:', {
        cmdResult,
        undoPushed,
        renderCalled,
        syncCalled,
        hasInkscapeInModel,
        hasDataInModel,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 5:', err?.message || err);
  }

  console.log(`\nExplicit Metadata Purge: ${passed}/${total} tests passed.`);
  return passed === total;
}
