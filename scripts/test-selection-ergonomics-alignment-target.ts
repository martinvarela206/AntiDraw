import { ElementAligner, AlignmentTarget, AlignmentType } from '../src/webview/engine/layout/ElementAligner.js';
import { SelectionCursorHelper } from '../src/webview/tools/interactions/SelectionCursorHelper.js';
import { SelectionMiniHud } from '../src/webview/tools/interactions/SelectionMiniHud.js';
import { TransformInteraction } from '../src/webview/tools/interactions/TransformInteraction.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';
import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

export function runSelectionErgonomicsAlignmentTests(): void {
  console.log('\n======================================================');
  console.log('🧪 Running Selection Ergonomics & Multi-Target Alignment Suite');
  console.log('======================================================');

  // Helper to create simple rect vector element
  const createRectEl = (id: string, x: number, y: number, width: number, height: number): VectorElement => ({
    id,
    type: 'path',
    isClosed: true,
    attributes: { fill: '#3b82f6' },
    vertices: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
  });

  // -----------------------------------------------------------------------------------
  // 1. Multi-Target Alignment: Collective Selection Boundary ('selection')
  // -----------------------------------------------------------------------------------
  const elA = createRectEl('el-a', 100, 100, 100, 50); // x: 100..200, y: 100..150, cx: 150, cy: 125
  const elB = createRectEl('el-b', 250, 120, 100, 80); // x: 250..350, y: 120..200, cx: 300, cy: 160
  // Collective bounds: minX: 100, maxX: 350, cx: 225, minY: 100, maxY: 200, cy: 150

  const alignedSelLeft = ElementAligner.alignElements([elA, elB], 'left', 800, 600, 'selection');
  const boxALeft = ElementAligner.getElementBox(alignedSelLeft[0]);
  const boxBLeft = ElementAligner.getElementBox(alignedSelLeft[1]);
  assert(
    boxALeft !== null && boxBLeft !== null && boxALeft.minX === 100 && boxBLeft.minX === 100,
    'Target Selection: Both elements align left edges to collective minX (100)'
  );

  const alignedSelRight = ElementAligner.alignElements([elA, elB], 'right', 800, 600, 'selection');
  const boxARight = ElementAligner.getElementBox(alignedSelRight[0]);
  const boxBRight = ElementAligner.getElementBox(alignedSelRight[1]);
  assert(
    boxARight !== null && boxBRight !== null && boxARight.maxX === 350 && boxBRight.maxX === 350,
    'Target Selection: Both elements align right edges to collective maxX (350)'
  );

  const alignedSelCenter = ElementAligner.alignElements([elA, elB], 'center', 800, 600, 'selection');
  const boxACenter = ElementAligner.getElementBox(alignedSelCenter[0]);
  const boxBCenter = ElementAligner.getElementBox(alignedSelCenter[1]);
  assert(
    boxACenter !== null && boxBCenter !== null && Math.abs(boxACenter.cx - 225) < 0.001 && Math.abs(boxBCenter.cx - 225) < 0.001,
    'Target Selection: Both elements align centers to collective cx (225)'
  );

  // -----------------------------------------------------------------------------------
  // 2. Multi-Target Alignment: Stationary Key Object ('key_object')
  // -----------------------------------------------------------------------------------
  // Align to Key Object where elB is the key object
  const alignedKeyB = ElementAligner.alignElements([elA, elB], 'left', 800, 600, 'key_object', 'el-b');
  const boxKeyA = ElementAligner.getElementBox(alignedKeyB[0]);
  const boxKeyB = ElementAligner.getElementBox(alignedKeyB[1]);
  assert(
    boxKeyB !== null && boxKeyB.minX === 250 && boxKeyB.maxX === 350,
    'Target Key Object: Designated key object el-b remains 100% stationary'
  );
  assert(
    boxKeyA !== null && boxKeyA.minX === 250,
    'Target Key Object: Subordinate object el-a translates to align with el-b left edge (250)'
  );

  // Align with default key object (elements[0] = elA)
  const alignedKeyDefault = ElementAligner.alignElements([elA, elB], 'right', 800, 600, 'key_object');
  const boxDefA = ElementAligner.getElementBox(alignedKeyDefault[0]);
  const boxDefB = ElementAligner.getElementBox(alignedKeyDefault[1]);
  assert(
    boxDefA !== null && boxDefA.maxX === 200 && boxDefB !== null && boxDefB.maxX === 200,
    'Target Key Object: Default key object (el-a) stays stationary while el-b right edge aligns to 200'
  );

  // -----------------------------------------------------------------------------------
  // 3. Multi-Target Alignment: Canvas / Artboard Boundaries ('canvas')
  // -----------------------------------------------------------------------------------
  const alignedCanvas = ElementAligner.alignElements([elA, elB], 'top', 800, 600, 'canvas');
  const boxCanA = ElementAligner.getElementBox(alignedCanvas[0]);
  const boxCanB = ElementAligner.getElementBox(alignedCanvas[1]);
  assert(
    boxCanA !== null && boxCanB !== null && boxCanA.minY === 0 && boxCanB.minY === 0,
    'Target Canvas: Multiple elements simultaneously align their top edges to canvas origin (0)'
  );

  const alignedSingle = ElementAligner.alignElements([elA], 'center', 800, 600);
  const boxSingle = ElementAligner.getElementBox(alignedSingle[0]);
  assert(
    boxSingle !== null && Math.abs(boxSingle.cx - 400) < 0.001,
    'Single Element Alignment: Naturally defaults to canvas horizontal center (400)'
  );

  // -----------------------------------------------------------------------------------
  // 4. Visual Accessibility & Non-Color-Reliant Selection Mode Badges
  // -----------------------------------------------------------------------------------
  const allModes = SelectionCursorHelper.getAllModes();
  assert(allModes.length === 4, 'SelectionCursorHelper: Returns all 4 transform modes (move, scale, rotate, distort)');

  const moveBadge = SelectionCursorHelper.getModeBadge('move');
  const scaleBadge = SelectionCursorHelper.getModeBadge('scale');
  const rotateBadge = SelectionCursorHelper.getModeBadge('rotate');
  const distortBadge = SelectionCursorHelper.getModeBadge('distort');
  assert(
    moveBadge === 'MOV' && scaleBadge === 'SCL' && rotateBadge === 'ROT' && distortBadge === 'DST',
    'SelectionCursorHelper: Provides explicit 3-letter textual badges (MOV, SCL, ROT, DST) for color-blind accessibility'
  );

  const moveCursor = SelectionCursorHelper.getModeCursor('move');
  assert(
    moveCursor.includes('%3Ctitle%3EModo%20MOV%3C%2Ftitle%3E') || moveCursor.includes('%3Ctitle%3EModo%20'),
    'SelectionCursorHelper: Embedded SVG cursor contains accessible semantic <title> tag'
  );

  // Overlay textual badge rendering
  const selectionTool = new SelectionTool();
  selectionTool.select('el-a', elA);
  const model = new VectorModel();
  model.elements = [elA];
  const mockCtx: any = {
    selectionTool,
    canvasMgr: { zoom: 1 },
    model,
    renderOverlay: () => {},
  };
  const transformInteraction = new TransformInteraction();

  selectionTool.selectionMode = 'move';
  const overlayMove = transformInteraction.renderOverlay(mockCtx, 1, null, null);
  assert(
    overlayMove.includes('class="ad-selection-mode-badge"') &&
    overlayMove.includes('role="status"') &&
    overlayMove.includes('aria-label="MOVER (W)"') &&
    overlayMove.includes('MOVER (W)'),
    'TransformInteraction: Overlay renders prominent accessible textual badge "MOVER (W)" eliminating color-alone dependency'
  );

  selectionTool.selectionMode = 'rotate';
  const overlayRotate = transformInteraction.renderOverlay(mockCtx, 1, null, null);
  assert(
    overlayRotate.includes('aria-label="ROTAR (R)"') && overlayRotate.includes('ROTAR (R)'),
    'TransformInteraction: Overlay renders accessible textual badge "ROTAR (R)"'
  );

  // -----------------------------------------------------------------------------------
  // 5. Accessibility Tree & UI Integration (Mini-HUD & Selection Tool State)
  // -----------------------------------------------------------------------------------
  const miniHud = new SelectionMiniHud();
  const dummyContainer = {
    children: [],
    innerHTML: '',
    style: { display: 'none' },
    querySelectorAll: () => [],
    addEventListener: () => {},
  } as any;
  miniHud.setDockedMode(true);
  assert(miniHud.getIsDockedMode() === true, 'SelectionMiniHud: Configured for top-ruler docked accessibility');

  selectionTool.alignmentTarget = 'key_object';
  selectionTool.keyObjectId = 'el-b';
  assert(
    selectionTool.alignmentTarget === 'key_object' && selectionTool.keyObjectId === 'el-b',
    'SelectionTool: Manages active alignment target state and designated key object ID'
  );

  console.log('\nResults: 5/5 assertions passed.');
  return true;
}

if (process.argv[1]?.endsWith('test-selection-ergonomics-alignment-target.ts') || process.argv[1]?.endsWith('test-selection-ergonomics-alignment-target.js')) {
  runSelectionErgonomicsAlignmentTests();
}
