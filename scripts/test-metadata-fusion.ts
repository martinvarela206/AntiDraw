import { DOMParser } from 'linkedom';
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = DOMParser;
}

import { VectorModel, VectorElement } from '../src/webview/engine/VectorModel.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';
import { AppearanceStackManager } from '../src/webview/engine/appearance/AppearanceStackManager.js';
import { GlobalSwatch } from '../src/webview/engine/color/GlobalSwatchManager.js';
import type { CompanionMetadata } from '../src/webview/bridge/VsCodeBridge.js';

export function runMetadataFusionTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Sidecar Metadata Fusion Test Suite (07.2)');
  console.log('======================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failedCount++;
    }
  }

  // 1. Setup Source Model
  const sourceModel = new VectorModel();
  sourceModel.canvas = {
    width: 600,
    height: 400,
    viewBox: '0 0 600 400',
    backgroundColor: 'none',
    currentColor: '#000000',
    preserveAspectRatio: 'xMidYMid meet',
  };

  const customSwatches: GlobalSwatch[] = [
    { id: 'brand_navy', name: 'Brand Navy', color: '#0a192f', tint: 1.0 },
    { id: 'brand_cyan', name: 'Brand Cyan', color: '#64ffda', tint: 0.8 },
  ];
  sourceModel.swatches = customSwatches;

  const masterEl: VectorElement = {
    id: 'elem_master_road',
    tagName: 'rect',
    isParametric: true,
    shapeType: 'rect',
    attributes: {
      id: 'elem_master_road',
      x: '50',
      y: '50',
      width: '200',
      height: '100',
      fill: '#0a192f',
      stroke: '#ffffff',
      'stroke-width': '4',
    },
  };
  sourceModel.elements.push(masterEl);

  // Add 2 Appearance Stack layers (one below, one above)
  const layerBelow = AppearanceStackManager.addStrokeLayer(masterEl, {
    stroke: '#000000',
    strokeWidth: 12,
    position: 'below',
  });

  const layerAbove = AppearanceStackManager.addStrokeLayer(masterEl, {
    stroke: '#ff9900',
    strokeWidth: 2,
    strokeDash: '5,5',
    position: 'above',
  });

  assert(
    AppearanceStackManager.getStack(masterEl).strokes.length === 2,
    'Master element has exactly 2 secondary appearance layers in source model'
  );

  // 2. Export clean SVG
  const exportedSvg = SvgSerializer.toSvgString(sourceModel);

  assert(
    exportedSvg.includes('class="ad-appearance-stroke-slave"'),
    'Compiled SVG contains slave stroke layers for external W3C renderers'
  );

  assert(
    !exportedSvg.includes('data-appearance-stack'),
    'Compiled SVG strictly excludes proprietary data-appearance-stack attribute (W3C pure)'
  );

  // 3. Create Companion Metadata (Sidecar JSON)
  const companionMetadata: CompanionMetadata = {
    swatches: sourceModel.swatches,
    elements: {
      [masterEl.id]: {
        'data-appearance-stack': masterEl.attributes['data-appearance-stack'],
      },
    },
  };

  assert(
    companionMetadata.swatches?.length === 2,
    'Companion metadata holds 2 custom global swatches'
  );
  assert(
    typeof companionMetadata.elements?.[masterEl.id]?.['data-appearance-stack'] === 'string',
    'Companion metadata captures serialized appearance stack JSON'
  );

  // 4. Rehydrate Target Model from SVG + Companion JSON
  const rehydratedModel = new VectorModel();
  rehydratedModel.loadSvgString(exportedSvg, companionMetadata);

  assert(
    rehydratedModel.elements.length === 1,
    `Rehydrated model has exactly 1 master element (found ${rehydratedModel.elements.length}) - slave layers properly filtered`
  );

  const rehydratedMaster = rehydratedModel.elements[0];
  assert(
    rehydratedMaster?.id === masterEl.id,
    `Master element ID correctly restored as '${masterEl.id}'`
  );

  const rehydratedStack = AppearanceStackManager.getStack(rehydratedMaster);
  assert(
    rehydratedStack.strokes.length === 2,
    `Appearance stack rehydrated with 2 strokes (found ${rehydratedStack.strokes.length})`
  );

  const rehydratedBelow = rehydratedStack.strokes.find((s) => s.id === layerBelow.id);
  const rehydratedAbove = rehydratedStack.strokes.find((s) => s.id === layerAbove.id);

  assert(
    rehydratedBelow !== undefined && rehydratedBelow.strokeWidth === 12 && rehydratedBelow.position === 'below',
    'Under-casing stroke layer restored with correct width 12 and position below'
  );

  assert(
    rehydratedAbove !== undefined && rehydratedAbove.stroke === '#ff9900' && rehydratedAbove.strokeDash === '5,5',
    'Centerline stroke layer restored with correct color #ff9900 and dash 5,5'
  );

  assert(
    rehydratedModel.swatches.length === 2 && rehydratedModel.swatches[0].id === 'brand_navy',
    'Global swatches restored identically from companion metadata'
  );

  console.log('------------------------------------------------------');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${passedCount + failedCount} assertions.`);

  if (failedCount === 0) {
    console.log('🎉 Sidecar metadata fusion passed all fidelity tests!\n');
    return true;
  } else {
    console.error('❌ One or more metadata fusion assertions failed.\n');
    return false;
  }
}
