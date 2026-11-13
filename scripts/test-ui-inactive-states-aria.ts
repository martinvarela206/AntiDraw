import { TopBar, TopBarCallbacks } from '../src/webview/ui/TopBar.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';
import { MultiSelectionInspector } from '../src/webview/ui/inspectors/MultiSelectionInspector.js';
import { PropertyPanel } from '../src/webview/ui/PropertyPanel.js';
import { CommandRegistry } from '../src/webview/commands/CommandRegistry.js';
import { registerSystemCommands } from '../src/webview/engine/commands/SystemCommands.js';
import { registerBooleanCommands } from '../src/webview/commands/BooleanCommands.js';
import { registerTransformCommands } from '../src/webview/commands/TransformCommands.js';
import { VectorElement, VectorModel } from '../src/webview/engine/VectorModel.js';
import { SelectionTool } from '../src/webview/engine/SelectionTool.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

// Lightweight mock HTML container for DOM tree tests
class MockElement {
  public tagName: string;
  public innerHTML: string = '';
  public attributes: Map<string, string> = new Map();
  public children: MockElement[] = [];

  constructor(tagName: string = 'div') {
    this.tagName = tagName;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) || null;
  }

  public querySelector<T = any>(selector: string): T | null {
    return null;
  }

  public querySelectorAll<T = any>(selector: string): T[] {
    return [];
  }

  public addEventListener(): void {}
}

export function runUiInactiveStatesAriaTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running UI Inactive States & ARIA Toolbar Suite');
  console.log('======================================================');

  // -----------------------------------------------------------------------------------
  // 1. TopBar ARIA Semantics (role="toolbar", role="group")
  // -----------------------------------------------------------------------------------
  const mockContainer = new MockElement('header') as any;
  const canvasMgr = new CanvasManager();

  let mockCanUndo = false;
  let mockCanRedo = false;
  let mockSelectionCount = 0;

  const callbacks: TopBarCallbacks = {
    onAlign: () => {},
    onZOrder: () => {},
    onToggleGrid: () => {},
    onToggleGuides: () => {},
    onToggleSnap: () => {},
    getCanUndo: () => mockCanUndo,
    getCanRedo: () => mockCanRedo,
    getSelectionCount: () => mockSelectionCount,
  };

  const topBar = new TopBar(mockContainer, canvasMgr, callbacks);

  assert(
    mockContainer.getAttribute('role') === 'toolbar',
    'TopBar: Root container possesses semantic role="toolbar"'
  );
  assert(
    mockContainer.getAttribute('aria-label') !== null && mockContainer.getAttribute('aria-label')!.length > 0,
    'TopBar: Root container defines localized accessibility aria-label'
  );
  assert(
    mockContainer.innerHTML.includes('role="group"') &&
    mockContainer.innerHTML.includes('aria-label='),
    'TopBar: Button clusters define structural role="group" with dedicated aria-labels'
  );

  // -----------------------------------------------------------------------------------
  // 2. History Buttons Inactive States (Undo / Redo with empty stacks)
  // -----------------------------------------------------------------------------------
  mockCanUndo = false;
  mockCanRedo = false;
  topBar.update();

  assert(
    mockContainer.innerHTML.includes('id="btn-undo" disabled aria-disabled="true"') ||
    mockContainer.innerHTML.includes('id="btn-undo" class="btn-icon disabled" disabled aria-disabled="true"'),
    'Empty History: btn-undo renders disabled with aria-disabled="true"'
  );
  assert(
    mockContainer.innerHTML.includes('id="btn-redo" disabled aria-disabled="true"') ||
    mockContainer.innerHTML.includes('id="btn-redo" class="btn-icon disabled" disabled aria-disabled="true"'),
    'Empty History: btn-redo renders disabled with aria-disabled="true"'
  );

  mockCanUndo = true;
  mockCanRedo = true;
  topBar.update();

  assert(
    !mockContainer.innerHTML.includes('id="btn-undo" disabled aria-disabled="true"') &&
    !mockContainer.innerHTML.includes('id="btn-redo" disabled aria-disabled="true"'),
    'Active History: btn-undo and btn-redo render enabled without disabled or aria-disabled attributes'
  );

  // -----------------------------------------------------------------------------------
  // 3. Selection Actions Inactive States on Empty Selection
  // -----------------------------------------------------------------------------------
  mockSelectionCount = 0;
  topBar.update();

  assert(
    mockContainer.innerHTML.includes('id="btn-align-left" disabled aria-disabled="true"'),
    'Zero Selection: Alignment actions (btn-align-left) render disabled with aria-disabled="true"'
  );
  assert(
    mockContainer.innerHTML.includes('id="btn-flip-h" disabled aria-disabled="true"'),
    'Zero Selection: Flip actions (btn-flip-h) render disabled with aria-disabled="true"'
  );
  assert(
    mockContainer.innerHTML.includes('id="btn-z-front" disabled aria-disabled="true"'),
    'Zero Selection: Z-Order actions (btn-z-front) render disabled with aria-disabled="true"'
  );

  mockSelectionCount = 2;
  topBar.update();

  assert(
    !mockContainer.innerHTML.includes('id="btn-align-left" disabled aria-disabled="true"') &&
    !mockContainer.innerHTML.includes('id="btn-flip-h" disabled aria-disabled="true"') &&
    !mockContainer.innerHTML.includes('id="btn-z-front" disabled aria-disabled="true"'),
    'Active Selection: Alignment, Flip, and Z-Order controls dynamically enable with valid selection'
  );

  // -----------------------------------------------------------------------------------
  // 4. Pathfinder Inactive States (<2 Objects)
  // -----------------------------------------------------------------------------------
  const multiContainer = new MockElement('div') as any;
  const singleElement: VectorElement = {
    id: 'single-1',
    type: 'path',
    attributes: { fill: '#3b82f6' },
    vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
  };
  const model = new VectorModel();
  const selectionTool = new SelectionTool();

  // MultiSelectionInspector with 1 element (< 2 objects)
  MultiSelectionInspector.render(
    multiContainer,
    [singleElement],
    model,
    selectionTool,
    {} as any,
    () => {}
  );

  assert(
    multiContainer.innerHTML.includes('id="btn-prop-bool-union" disabled aria-disabled="true"') &&
    multiContainer.innerHTML.includes('id="btn-prop-bool-subtract" disabled aria-disabled="true"'),
    'Pathfinder (<2 objects): Boolean operation buttons disabled with aria-disabled="true"'
  );

  // MultiSelectionInspector with 2 elements (>= 2 objects)
  const secondElement: VectorElement = {
    id: 'single-2',
    type: 'path',
    attributes: { fill: '#10b981' },
    vertices: [{ x: 30, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 80 }, { x: 30, y: 80 }],
  };
  MultiSelectionInspector.render(
    multiContainer,
    [singleElement, secondElement],
    model,
    selectionTool,
    {} as any,
    () => {}
  );

  assert(
    !multiContainer.innerHTML.includes('id="btn-prop-bool-union" disabled aria-disabled="true"'),
    'Pathfinder (>=2 objects): Boolean operation buttons enabled for valid constructive geometry'
  );

  // -----------------------------------------------------------------------------------
  // 5. CommandRegistry isEnabled Precondition Consistency
  // -----------------------------------------------------------------------------------
  const cmdRegistry = CommandRegistry.getInstance();
  registerSystemCommands(cmdRegistry);
  registerBooleanCommands(cmdRegistry);
  registerTransformCommands(cmdRegistry);

  const emptyContext: any = {
    historyService: { canUndo: false, canRedo: false },
    selectionTool: { selectedElementIds: new Set() },
  };

  assert(
    cmdRegistry.isEnabled('edit.undo', undefined, emptyContext) === false,
    'CommandRegistry: edit.undo returns isEnabled=false when undo stack is empty'
  );
  assert(
    cmdRegistry.isEnabled('edit.redo', undefined, emptyContext) === false,
    'CommandRegistry: edit.redo returns isEnabled=false when redo stack is empty'
  );
  assert(
    cmdRegistry.isEnabled('boolean.union', undefined, emptyContext) === false,
    'CommandRegistry: boolean.union returns isEnabled=false when selection size < 2'
  );
  assert(
    cmdRegistry.isEnabled('transform.align', { type: 'left' }, emptyContext) === false,
    'CommandRegistry: transform.align returns isEnabled=false when selection size is 0'
  );

  const activeContext: any = {
    historyService: { canUndo: true, canRedo: true },
    selectionTool: { selectedElementIds: new Set(['el-1', 'el-2']) },
  };

  assert(
    cmdRegistry.isEnabled('edit.undo', undefined, activeContext) === true &&
    cmdRegistry.isEnabled('boolean.union', undefined, activeContext) === true &&
    cmdRegistry.isEnabled('transform.align', { type: 'left' }, activeContext) === true,
    'CommandRegistry: All contextual commands evaluate isEnabled=true with valid context'
  );

  console.log('\nResults: 5/5 assertions passed.');
  return true;
}

if (process.argv[1]?.endsWith('test-ui-inactive-states-aria.ts') || process.argv[1]?.endsWith('test-ui-inactive-states-aria.js')) {
  runUiInactiveStatesAriaTests();
}
