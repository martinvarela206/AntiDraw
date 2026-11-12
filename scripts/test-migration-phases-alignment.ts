import { VectorScene, GroupNode, PathNode } from '../src/webview/core/model/VectorScene.js';
import { CommandRegistry, CommandSpec, CommandContext } from '../src/webview/commands/CommandRegistry.js';
import { SchneiderFit } from '../src/webview/engine/operations/booleans/SchneiderFit.js';
import { VectorElement } from '../src/webview/engine/VectorModel.js';

export function runMigrationPhasesAlignmentTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Migration Phases Alignment & VectorScene Suite');
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

  // --- 1. Pure L0 VectorScene In-Memory Construction ---
  const scene = new VectorScene(1000, 800, '0 0 1000 800', '#fafafa');
  assert(scene.width === 1000 && scene.height === 800, 'VectorScene initializes pure geometric dimensions');
  assert(scene.root.type === 'group' && scene.root.children.length === 0, 'Root node is empty group');

  const pathNode: PathNode = {
    id: 'path_test_1',
    type: 'path',
    visible: true,
    locked: false,
    opacity: 1,
    attributes: { fill: '#ff0000', stroke: '#000000', 'stroke-width': '2' },
    isClosed: true,
    d: 'M 10 10 L 100 10 L 100 100 Z',
    vertices: [
      { x: 10, y: 10, type: 'sharp' },
      { x: 100, y: 10, type: 'sharp' },
      { x: 100, y: 100, type: 'sharp' },
    ],
  };

  scene.addNode(pathNode);
  assert(scene.root.children.length === 1, 'Node successfully added to root');
  assert(scene.findNodeById('path_test_1')?.id === 'path_test_1', 'Node retrieval by ID operates in O(N)');

  // --- 2. Bidirectional VectorElement <-> VectorScene Conversion ---
  const initialElements: VectorElement[] = [
    {
      id: 'rect_1',
      tagName: 'rect',
      attributes: { x: '20', y: '30', width: '200', height: '150', fill: '#00ff00' },
    },
    {
      id: 'grp_1',
      tagName: 'g',
      attributes: { opacity: '0.8' },
      children: [
        {
          id: 'path_child',
          tagName: 'path',
          attributes: { d: 'M 0 0 L 50 50', stroke: '#333333' },
        },
      ],
    },
  ];

  const convertedScene = VectorScene.fromVectorElements(initialElements, {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    backgroundColor: '#ffffff',
  });

  assert(convertedScene.root.children.length === 2, 'fromVectorElements converted 2 top-level nodes');
  const groupNode = convertedScene.findNodeById('grp_1') as GroupNode;
  assert(groupNode && groupNode.type === 'group' && groupNode.children.length === 1, 'Group hierarchy preserved');

  const exportedElements = convertedScene.toVectorElements();
  assert(exportedElements.length === 2, 'toVectorElements exports 2 top-level elements');
  assert(exportedElements[0].id === 'rect_1', 'First exported element matches rect_1');
  assert(exportedElements[1].children?.length === 1, 'Group children preserved on export');

  // --- 3. CommandRegistry Integration with VectorScene Context ---
  const registry = CommandRegistry.getInstance();

  let commandExecuted = false;
  const testCommand: CommandSpec<{ multiplier: number }> = {
    id: 'test.scaleScene',
    label: 'Scale Scene Objects',
    isEnabled: (ctx) => {
      // Precondition based purely on scene graph
      return !!ctx.scene && ctx.scene.root.children.length > 0;
    },
    execute: (ctx, params) => {
      if (!ctx.scene) {
        return { success: false, error: 'No scene provided' };
      }
      commandExecuted = true;
      return { success: true, value: ctx.scene.root.children.length * (params?.multiplier || 1) };
    },
  };

  registry.register(testCommand);

  // Evaluation with empty scene
  const emptyContext: CommandContext = {
    model: {},
    scene: new VectorScene(800, 600),
  };
  assert(!registry.isEnabled('test.scaleScene', undefined, emptyContext), 'Command isEnabled returns false when scene has 0 children');

  // Evaluation with populated scene
  const populatedContext: CommandContext = {
    model: {},
    scene: convertedScene,
  };
  assert(registry.isEnabled('test.scaleScene', undefined, populatedContext), 'Command isEnabled returns true when scene has nodes');

  const execResult = registry.execute('test.scaleScene', { multiplier: 3 }, populatedContext);
  assert(execResult.success && execResult.value === 6, 'Command executed successfully consuming VectorScene from Context');
  assert(commandExecuted, 'Command execution callback invoked');

  // --- 4. Schneider Fitting Decoupled Execution ---
  // Verify that Schneider curve fitting runs purely as an independent geometric operation
  const samplePoints = [
    { x: 0, y: 0 },
    { x: 25, y: 10 },
    { x: 50, y: 40 },
    { x: 75, y: 90 },
    { x: 100, y: 160 },
  ];
  const fittedBeziers = SchneiderFit.fitCurve(samplePoints, 2.0);
  assert(Array.isArray(fittedBeziers) && fittedBeziers.length > 0, 'SchneiderFit computes smooth cubic Béziers independently');
  assert(
    typeof fittedBeziers[0].p0.x === 'number' && typeof fittedBeziers[0].p3.x === 'number',
    'Fitted Bézier segment contains valid cubic control points'
  );

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  return failedCount === 0;
}
