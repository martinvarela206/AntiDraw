import { SnappingEngine, SnappingContext } from '../src/webview/engine/canvas/SnappingEngine.js';
import { GridConfig } from '../src/webview/engine/CanvasManager.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

export async function runUnifiedGridSnappingTests(): Promise<boolean> {
  console.log('\n--- Running Unified Multi-Target Grid Snapping Suite ---');

  const baseCtx: SnappingContext = {
    snapThreshold: 10,
    zoom: 1,
    snapToPixelGrid: false,
    snapToGrid: true,
    snapToGuides: false,
    snapToNodes: false,
    snapToVertices: false,
    snapToViewBox: false,
    showGuides: false,
    showGrid: true,
    guides: [],
    grids: [],
    rulerConfig: { originX: 0, originY: 0, scale: 1, step: 20 },
  };

  // 1. Orthogonal Grid
  // Spacing = 20, phase = (0, 0)
  // Half-step = 10
  // Point 1 (Intersection): (100, 100) -> even * 10, even * 10
  // Point 2 (Cell Center): (110, 110) -> odd * 10, odd * 10
  // Point 3 (Segment Midpoint): (110, 100) -> odd * 10, even * 10
  // Point 3 (Segment Midpoint): (100, 110) -> even * 10, odd * 10
  const orthoGrid: GridConfig = {
    id: 'ortho-1',
    type: 'orthogonal',
    size: 20,
    color: '#00ffff',
    opacity: 0.5,
    visible: true,
  };

  const orthoCtx: SnappingContext = { ...baseCtx, grids: [orthoGrid] };

  console.log('\n[1. Orthogonal Grid: Intersections, Centers, and Midpoints]');
  // Test Point 1 (Intersection)
  const snap1 = SnappingEngine.snapPoint({ x: 102, y: 99 }, orthoCtx);
  assert(snap1.x === 100 && snap1.y === 100, `Snaps to Point 1 (Intersection) at (100, 100) -> got (${snap1.x}, ${snap1.y})`);

  // Test Point 2 (Cell Center)
  const snap2 = SnappingEngine.snapPoint({ x: 109, y: 112 }, orthoCtx);
  assert(snap2.x === 110 && snap2.y === 110, `Snaps to Point 2 (Cell Center) at (110, 110) -> got (${snap2.x}, ${snap2.y})`);

  // Test Point 3 (Horizontal segment midpoint)
  const snap3H = SnappingEngine.snapPoint({ x: 111, y: 101 }, orthoCtx);
  assert(snap3H.x === 110 && snap3H.y === 100, `Snaps to Point 3 (Horiz Midpoint) at (110, 100) -> got (${snap3H.x}, ${snap3H.y})`);

  // Test Point 3 (Vertical segment midpoint)
  const snap3V = SnappingEngine.snapPoint({ x: 99, y: 108 }, orthoCtx);
  assert(snap3V.x === 100 && snap3V.y === 110, `Snaps to Point 3 (Vert Midpoint) at (100, 110) -> got (${snap3V.x}, ${snap3V.y})`);

  // 2. Isometric Grid
  console.log('\n[2. Isometric Grid: Diamond Crossings, Centers, and Midpoints]');
  const isoGrid: GridConfig = {
    id: 'iso-1',
    type: 'isometric',
    spacing: 40,
    color: '#00ffff',
    opacity: 0.5,
    visible: true,
  };

  const isoCtx: SnappingContext = { ...baseCtx, grids: [isoGrid] };

  // Test near an isometric node (e.g., origin (0, 0))
  const snapIso1 = SnappingEngine.snapPoint({ x: 2, y: -1 }, isoCtx);
  assert(Math.abs(snapIso1.x) < 0.001 && Math.abs(snapIso1.y) < 0.001, `Snaps to Iso Point 1 (Intersection) at (0, 0) -> got (${snapIso1.x}, ${snapIso1.y})`);

  // Test iso cell center: (col * S, row * H)
  // For S=40, tileW = 40 * sqrt(3) ~ 69.282, tileH = 40, rowSpacing = 20, colSpacing = 34.641
  // Diamond center at (colSpacing, rowSpacing) = (34.641, 20)
  const snapIso2 = SnappingEngine.snapPoint({ x: 35, y: 21 }, isoCtx);
  assert(Math.abs(snapIso2.x - 40 * Math.sqrt(3) / 2) < 0.5 && Math.abs(snapIso2.y - 20) < 0.5, `Snaps to Iso Point 2 (Center) -> got (${snapIso2.x}, ${snapIso2.y})`);

  // 3. Axonometric Grid
  console.log('\n[3. Axonometric Grid: Crossings, Centers, and Midpoints]');
  const axoGrid: GridConfig = {
    id: 'axo-1',
    type: 'axonometric',
    spacing: 30,
    color: '#00ffff',
    opacity: 0.5,
    visible: true,
  };

  const axoCtx: SnappingContext = { ...baseCtx, grids: [axoGrid] };

  // Test axo intersection at (0, 0)
  const snapAxo1 = SnappingEngine.snapPoint({ x: 1.5, y: -1.5 }, axoCtx);
  assert(Math.abs(snapAxo1.x) < 0.001 && Math.abs(snapAxo1.y) < 0.001, `Snaps to Axo Point 1 (Intersection) at (0, 0) -> got (${snapAxo1.x}, ${snapAxo1.y})`);

  // Test axo center at (S/2, S/2) where S=30 -> (15, 15)
  const snapAxo2 = SnappingEngine.snapPoint({ x: 16, y: 14 }, axoCtx);
  assert(Math.abs(snapAxo2.x - 15) < 0.1 && Math.abs(snapAxo2.y - 15) < 0.1, `Snaps to Axo Point 2 (Tile Center) -> got (${snapAxo2.x}, ${snapAxo2.y})`);

  // Test axo midpoint along vertical line at (0, 15)
  const snapAxo3 = SnappingEngine.snapPoint({ x: 1, y: 16 }, axoCtx);
  assert(Math.abs(snapAxo3.x - 0) < 0.1 && Math.abs(snapAxo3.y - 15) < 0.1, `Snaps to Axo Point 3 (Vertical Midpoint) -> got (${snapAxo3.x}, ${snapAxo3.y})`);

  console.log('\nUnified Multi-Target Grid Snapping Tests complete: ALL PASSED.');
  return true;
}
