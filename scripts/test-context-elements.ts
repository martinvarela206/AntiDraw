import { ContextElementService } from '../src/webview/engine/scene/ContextElementService.js';
import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { GuideManager, GuideLine } from '../src/webview/engine/canvas/GuideManager.js';
import { HitTestService } from '../src/webview/engine/selection/HitTestService.js';
import { SvgSerializer } from '../src/webview/engine/serialization/SvgSerializer.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

export function runContextElementTests(): { passed: number; failed: number } {
  console.log('\n--- Running Contextual Elements & Infinite Guide ViewBox Clipping Suite ---\n');

  // =========================================================================
  // 1. Vector to Context Element Conversion
  // =========================================================================
  console.log('[1. Vector to Context Element Conversion]');
  const rectEl: VectorElement = {
    id: 'rect_test',
    tagName: 'rect',
    attributes: {
      id: 'rect_test',
      x: '50',
      y: '50',
      width: '120',
      height: '80',
      fill: '#ff5500',
      stroke: '#333333',
      'stroke-width': '3',
      'stroke-dasharray': '8 4',
      opacity: '0.9',
    },
    vertices: [
      { id: 'v1', x: 50, y: 50, command: 'M', nodeType: 'sharp' },
      { id: 'v2', x: 170, y: 50, command: 'L', nodeType: 'sharp' },
      { id: 'v3', x: 170, y: 130, command: 'L', nodeType: 'sharp' },
      { id: 'v4', x: 50, y: 130, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: true,
  };

  assert(!ContextElementService.isContextElement(rectEl), 'Element is initially not contextual');
  ContextElementService.convertToContextElement(rectEl);

  assert(ContextElementService.isContextElement(rectEl), 'Element marked as contextual');
  assert(rectEl.attributes.stroke === '#00f0ff', 'Stroke converted to guide cyan #00f0ff');
  assert(rectEl.attributes.fill === 'none', 'Fill converted to none');
  assert(rectEl.attributes['stroke-width'] === '1', 'Stroke width converted to 1');
  assert(rectEl.attributes['stroke-dasharray'] === '4 2', 'Stroke dasharray converted to 4 2');
  assert(rectEl.attributes['vector-effect'] === 'non-scaling-stroke', 'Vector-effect is non-scaling-stroke');
  assert(rectEl.attributes['data-orig-fill'] === '#ff5500', 'Original fill preserved under data-orig-fill');
  assert(rectEl.attributes['data-orig-stroke'] === '#333333', 'Original stroke preserved under data-orig-stroke');
  assert(rectEl.attributes['data-orig-stroke-width'] === '3', 'Original stroke-width preserved');
  assert(rectEl.attributes['data-orig-stroke-dasharray'] === '8 4', 'Original dasharray preserved');

  // Recursive group conversion
  const childCircle: VectorElement = {
    id: 'circle_child',
    tagName: 'circle',
    attributes: { id: 'circle_child', cx: '100', cy: '100', r: '40', fill: '#00ccff', stroke: '#000000' },
  };
  const groupEl: VectorElement = {
    id: 'group_test',
    tagName: 'g',
    attributes: { id: 'group_test' },
    children: [childCircle],
  };

  ContextElementService.convertToContextElement(groupEl);
  assert(ContextElementService.isContextElement(groupEl), 'Group is marked as contextual');
  assert(ContextElementService.isContextElement(childCircle), 'Child circle recursively marked as contextual');
  assert(childCircle.attributes.stroke === '#00f0ff', 'Child circle adopted guide stroke');

  // =========================================================================
  // 2. Desconversion to Ordinary Vector
  // =========================================================================
  console.log('\n[2. Desconversion to Ordinary Vector]');
  ContextElementService.convertToOrdinaryVector(rectEl);

  assert(!ContextElementService.isContextElement(rectEl), 'Element is no longer contextual');
  assert(rectEl.attributes.fill === '#ff5500', 'Restored original fill #ff5500');
  assert(rectEl.attributes.stroke === '#333333', 'Restored original stroke #333333');
  assert(rectEl.attributes['stroke-width'] === '3', 'Restored original stroke-width 3');
  assert(rectEl.attributes['stroke-dasharray'] === '8 4', 'Restored original dasharray 8 4');
  assert(rectEl.attributes['data-orig-fill'] === undefined, 'data-orig-fill purged');
  assert(rectEl.attributes['data-orig-stroke'] === undefined, 'data-orig-stroke purged');

  ContextElementService.convertToOrdinaryVector(groupEl);
  assert(!ContextElementService.isContextElement(groupEl), 'Group is no longer contextual');
  assert(!ContextElementService.isContextElement(childCircle), 'Child is no longer contextual');
  assert(childCircle.attributes.fill === '#00ccff', 'Child restored original fill');

  // =========================================================================
  // 3. Final SVG Elimination
  // =========================================================================
  console.log('\n[3. Final SVG Elimination]');
  const model = new VectorModel();
  model.canvas.width = 800;
  model.canvas.height = 600;
  model.canvas.viewBox = '0 0 800 600';

  const ordinaryRect: VectorElement = {
    id: 'ord_rect',
    tagName: 'rect',
    attributes: { id: 'ord_rect', x: '10', y: '10', width: '100', height: '100', fill: '#00ff00' },
  };
  const contextualGuidePath: VectorElement = {
    id: 'context_path',
    tagName: 'line',
    attributes: {
      id: 'context_path',
      x1: '0',
      y1: '200',
      x2: '800',
      y2: '200',
      stroke: '#00f0ff',
      'stroke-dasharray': '4 2',
      'data-contextual': 'true',
    },
  };

  model.elements = [ordinaryRect, contextualGuidePath];

  // Canvas DOM representation (excludeContextual: false)
  const liveCanvasSvg = SvgSerializer.toSvgString(model, { excludeContextual: false });
  assert(liveCanvasSvg.includes('id="ord_rect"'), 'Live canvas includes ordinary element');
  assert(liveCanvasSvg.includes('id="context_path"'), 'Live canvas includes contextual guide element');

  // Final exported/saved SVG (excludeContextual: true)
  const finalSavedSvg = SvgSerializer.toSvgString(model, { excludeContextual: true });
  assert(finalSavedSvg.includes('id="ord_rect"'), 'Final SVG preserves ordinary vector element');
  assert(!finalSavedSvg.includes('id="context_path"'), 'Final SVG EXCLUDES contextual guide element');
  assert(!finalSavedSvg.includes('data-contextual'), 'Final SVG contains zero data-contextual references');

  // Using model.toFinalSvgString()
  const finalModelSvg = model.toFinalSvgString();
  assert(!finalModelSvg.includes('id="context_path"'), 'model.toFinalSvgString() excludes contextual element');

  // =========================================================================
  // 4. Infinite Guide to Ordinary Vector ViewBox Clipping
  // =========================================================================
  console.log('\n[4. Infinite Guide to Ordinary Vector ViewBox Clipping]');
  const viewBox = { x: 0, y: 0, width: 800, height: 600 };

  // Vertical Guide at X=250
  const vertGuide: GuideLine = {
    id: 'g_vert',
    orientation: 'vertical',
    position: 250,
    angle: 90,
    pivotX: 250,
    pivotY: 300,
  };
  const vertVector = ContextElementService.convertGuideToVector(vertGuide, viewBox);
  assert(vertVector !== null, 'Vertical guide clipped successfully');
  assert(vertVector?.tagName === 'line', 'Created native <line> element');
  assert(vertVector?.attributes.x1 === '250', `x1 is exact at 250 (got ${vertVector?.attributes.x1})`);
  assert(vertVector?.attributes.y1 === '0', `y1 starts at top of ViewBox 0 (got ${vertVector?.attributes.y1})`);
  assert(vertVector?.attributes.x2 === '250', `x2 is exact at 250 (got ${vertVector?.attributes.x2})`);
  assert(vertVector?.attributes.y2 === '600', `y2 ends at bottom of ViewBox 600 (got ${vertVector?.attributes.y2})`);
  assert(vertVector?.vertices?.length === 2, 'Generated 2 endpoints');

  // Horizontal Guide at Y=400
  const horizGuide: GuideLine = {
    id: 'g_horiz',
    orientation: 'horizontal',
    position: 400,
    angle: 0,
    pivotX: 400,
    pivotY: 400,
  };
  const horizVector = ContextElementService.convertGuideToVector(horizGuide, viewBox);
  assert(horizVector !== null, 'Horizontal guide clipped successfully');
  assert(horizVector?.attributes.x1 === '0', `x1 starts at left of ViewBox 0 (got ${horizVector?.attributes.x1})`);
  assert(horizVector?.attributes.y1 === '400', `y1 is exact at 400 (got ${horizVector?.attributes.y1})`);
  assert(horizVector?.attributes.x2 === '800', `x2 ends at right of ViewBox 800 (got ${horizVector?.attributes.x2})`);
  assert(horizVector?.attributes.y2 === '400', `y2 is exact at 400 (got ${horizVector?.attributes.y2})`);

  // Angled Guide (45° through (400, 300))
  const angledGuide: GuideLine = {
    id: 'g_angled',
    orientation: 'angled',
    position: 0,
    angle: 45,
    pivotX: 400,
    pivotY: 300,
  };
  const angledVector = ContextElementService.convertGuideToVector(angledGuide, viewBox);
  assert(angledVector !== null, 'Angled guide clipped successfully to ViewBox boundaries');
  const ax1 = parseFloat(angledVector!.attributes.x1);
  const ay1 = parseFloat(angledVector!.attributes.y1);
  const ax2 = parseFloat(angledVector!.attributes.x2);
  const ay2 = parseFloat(angledVector!.attributes.y2);
  assert(ax1 >= 0 && ax1 <= 800 && ay1 >= 0 && ay1 <= 600, 'Endpoint 1 lies on ViewBox boundary');
  assert(ax2 >= 0 && ax2 <= 800 && ay2 >= 0 && ay2 <= 600, 'Endpoint 2 lies on ViewBox boundary');

  // Offscreen Guide (does not intersect ViewBox)
  const offscreenGuide: GuideLine = {
    id: 'g_off',
    orientation: 'vertical',
    position: 1200,
    angle: 90,
    pivotX: 1200,
    pivotY: 300,
  };
  const offscreenVector = ContextElementService.convertGuideToVector(offscreenGuide, viewBox);
  assert(offscreenVector === null, 'Offscreen guide safely returns null');

  // =========================================================================
  // 5. Freezing with "Bloquear Guías"
  // =========================================================================
  console.log('\n[5. Freezing with "Bloquear Guías"]');
  const guideManager = new GuideManager([vertGuide, horizGuide]);
  assert(!guideManager.lockGuides, 'Guides initially unlocked');

  // Hit test guide when unlocked
  const hitUnlockedGuide = guideManager.hitTestGuide({ x: 250, y: 100 }, 800, 600, 1, 8);
  assert(hitUnlockedGuide !== null && hitUnlockedGuide.id === 'g_vert', 'Guide is hit-testable when unlocked');

  // Lock guides
  guideManager.lockGuides = true;
  assert(guideManager.lockGuides, 'Guides are now locked');

  // Hit test guide when locked
  const hitLockedGuide = guideManager.hitTestGuide({ x: 250, y: 100 }, 800, 600, 1, 8);
  assert(hitLockedGuide === null, 'Guide hit-testing returns null when lockGuides is active (frozen)');

  // Hit testing contextual vector element when locked vs unlocked
  const contextVector: VectorElement = {
    id: 'context_vec',
    tagName: 'line',
    attributes: {
      id: 'context_vec',
      stroke: '#00f0ff',
      'stroke-width': '2',
      'data-contextual': 'true',
    },
    vertices: [
      { id: 'cv1', x: 100, y: 100, command: 'M', nodeType: 'sharp' },
      { id: 'cv2', x: 500, y: 100, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: false,
  };
  const ordVector: VectorElement = {
    id: 'ord_vec',
    tagName: 'line',
    attributes: {
      id: 'ord_vec',
      stroke: '#000000',
      'stroke-width': '2',
    },
    vertices: [
      { id: 'ov1', x: 100, y: 200, command: 'M', nodeType: 'sharp' },
      { id: 'ov2', x: 500, y: 200, command: 'L', nodeType: 'sharp' },
    ],
    isClosed: false,
  };

  const sceneElements = [ordVector, contextVector];

  // Unlocked: both are hit-testable
  const hitUnlockedContext = HitTestService.hitTest(sceneElements, { x: 300, y: 100 }, 1, 8, { lockGuides: false });
  assert(hitUnlockedContext !== null && hitUnlockedContext.element.id === 'context_vec', 'Contextual element hit-testable when lockGuides is false');

  // Locked: contextual element is frozen!
  const hitLockedContext = HitTestService.hitTest(sceneElements, { x: 300, y: 100 }, 1, 8, { lockGuides: true });
  assert(hitLockedContext === null, 'Contextual element is FROZEN and ignored during hit testing when lockGuides is true');

  // Ordinary element remains fully hit-testable even when lockGuides is true
  const hitOrdinaryUnderLock = HitTestService.hitTest(sceneElements, { x: 300, y: 200 }, 1, 8, { lockGuides: true });
  assert(hitOrdinaryUnderLock !== null && hitOrdinaryUnderLock.element.id === 'ord_vec', 'Ordinary vector element remains fully selectable when lockGuides is true');

  console.log(`\nContextual Elements Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}

