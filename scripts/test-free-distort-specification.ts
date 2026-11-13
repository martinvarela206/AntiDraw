import { ProjectiveHomography, QuadCorners } from '../src/webview/engine/geometry/ProjectiveHomography.js';
import { DistortTransformer } from '../src/webview/tools/interactions/DistortTransformer.js';
import { VectorModel, VectorElement, PathVertex } from '../src/webview/engine/VectorModel.js';
import { BoundingBox } from '../src/webview/engine/SelectionTool.js';

export function runFreeDistortSpecificationTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Running Free Distort & Projective Baking Suite');
  console.log('======================================================');

  let passed = 0;
  let total = 5;

  // Test 1: Projective homography closed-form solver and collinearity preservation
  try {
    const box: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
    // Trapezoidal destination quad (top edge compressed to 60px centered, bottom edge remains 100px)
    const quad: QuadCorners = {
      nw: { x: 20, y: 0 },
      ne: { x: 80, y: 0 },
      se: { x: 100, y: 100 },
      sw: { x: 0, y: 100 },
    };

    const homography = ProjectiveHomography.fromBoxToQuad(box, quad);
    const nwProjected = homography.projectPoint({ x: 0, y: 0 });
    const neProjected = homography.projectPoint({ x: 100, y: 0 });
    const seProjected = homography.projectPoint({ x: 100, y: 100 });
    const swProjected = homography.projectPoint({ x: 0, y: 100 });
    const midTop = homography.projectPoint({ x: 50, y: 0 });

    const eps = 1e-4;
    const nwMatches = Math.abs(nwProjected.x - 20) < eps && Math.abs(nwProjected.y - 0) < eps;
    const neMatches = Math.abs(neProjected.x - 80) < eps && Math.abs(neProjected.y - 0) < eps;
    const midMatches = Math.abs(midTop.x - 50) < eps && Math.abs(midTop.y - 0) < eps;

    if (nwMatches && neMatches && midMatches) {
      console.log('  ✅ [PASS] ProjectiveHomography maps Cartesian coordinates through Heckbert 3x3 projective matrix');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Homography projection failed:', { nwProjected, neProjected, midTop });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 1:', err?.message || err);
  }

  // Test 2: Tangent handle projection preserves C1 continuity
  try {
    const box: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
    const quad: QuadCorners = {
      nw: { x: 10, y: 10 },
      ne: { x: 90, y: 0 },
      se: { x: 100, y: 100 },
      sw: { x: 0, y: 90 },
    };
    const homography = ProjectiveHomography.fromBoxToQuad(box, quad);

    const vertex: PathVertex = {
      id: 'v1',
      x: 50,
      y: 50,
      handleIn: { x: 30, y: 50 },
      handleOut: { x: 70, y: 50 },
      nodeType: 'smooth',
      command: 'M',
    };

    const [projected] = homography.projectVertices([vertex]);

    const hasHandles = !!(projected.handleIn && projected.handleOut);
    // Check that anchor and both handles remain strictly collinear
    let isCollinear = false;
    if (hasHandles) {
      const v = projected;
      const h1 = projected.handleIn!;
      const h2 = projected.handleOut!;
      const cross = (h1.x - v.x) * (h2.y - v.y) - (h1.y - v.y) * (h2.x - v.x);
      isCollinear = Math.abs(cross) < 1e-4;
    }

    if (hasHandles && isCollinear) {
      console.log('  ✅ [PASS] Projective vertices transformation preserves Bézier tangent handle C1 continuity');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Collinearity violated on projected handles:', projected);
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 2:', err?.message || err);
  }

  // Test 3: Rigid parametric shapes are converted to curves on distort commit
  try {
    const model = new VectorModel();
    const rectEl: VectorElement = {
      id: 'rect1',
      tagName: 'rect',
      isParametric: true,
      shapeType: 'rect',
      attributes: {
        x: '0',
        y: '0',
        width: '100',
        height: '100',
        fill: '#3b82f6',
      },
      vertices: [
        { id: 'v0', x: 0, y: 0, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 100, y: 0, nodeType: 'sharp', command: 'L' },
        { id: 'v2', x: 100, y: 100, nodeType: 'sharp', command: 'L' },
        { id: 'v3', x: 0, y: 100, nodeType: 'sharp', command: 'L' },
      ],
      isClosed: true,
    };
    model.elements = [rectEl];

    const initialBox: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
    const deformedVerts: PathVertex[] = [
      { id: 'v0', x: 20, y: 0, nodeType: 'sharp', command: 'M' },
      { id: 'v1', x: 80, y: 0, nodeType: 'sharp', command: 'L' },
      { id: 'v2', x: 100, y: 100, nodeType: 'sharp', command: 'L' },
      { id: 'v3', x: 0, y: 100, nodeType: 'sharp', command: 'L' },
    ];
    const ghostMap = new Map<string, PathVertex[]>([['rect1', deformedVerts]]);

    const mockCtx: any = {
      model,
      syncToHost: () => {},
      render: () => {},
      pushUndo: () => {},
    };

    DistortTransformer.applyDistortCommit(mockCtx, ghostMap, [rectEl], initialBox);

    const isNowPath = rectEl.tagName === 'path';
    const isNoLongerParametric = !rectEl.isParametric;
    const hasDataDistortBase = !!rectEl.attributes['data-distort-base'];
    const verticesBaked = rectEl.vertices?.[0].x === 20 && rectEl.vertices?.[1].x === 80;

    if (isNowPath && isNoLongerParametric && hasDataDistortBase && verticesBaked) {
      console.log('  ✅ [PASS] Parametric primitives are cleanly baked to Bézier curves upon committing perspective distortion');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Primitive conversion failed:', {
        isNowPath,
        isNoLongerParametric,
        hasDataDistortBase,
        verticesBaked,
      });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 3:', err?.message || err);
  }

  // Test 4: Lossless restoration of base geometry from data-distort-base
  try {
    const model = new VectorModel();
    const rectEl: VectorElement = {
      id: 'rect1',
      tagName: 'path',
      attributes: {
        fill: '#3b82f6',
      },
      vertices: [
        { id: 'v0', x: 0, y: 0, nodeType: 'sharp', command: 'M' },
        { id: 'v1', x: 100, y: 0, nodeType: 'sharp', command: 'L' },
        { id: 'v2', x: 100, y: 100, nodeType: 'sharp', command: 'L' },
        { id: 'v3', x: 0, y: 100, nodeType: 'sharp', command: 'L' },
      ],
      isClosed: true,
    };
    model.elements = [rectEl];

    const initialBox: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
    const deformedVerts: PathVertex[] = [
      { id: 'v0', x: 30, y: 10, nodeType: 'sharp', command: 'M' },
      { id: 'v1', x: 70, y: 10, nodeType: 'sharp', command: 'L' },
      { id: 'v2', x: 100, y: 100, nodeType: 'sharp', command: 'L' },
      { id: 'v3', x: 0, y: 100, nodeType: 'sharp', command: 'L' },
    ];
    const ghostMap = new Map<string, PathVertex[]>([['rect1', deformedVerts]]);

    const mockCtx: any = {
      model,
      syncToHost: () => {},
      render: () => {},
      pushUndo: () => {},
    };

    DistortTransformer.applyDistortCommit(mockCtx, ghostMap, [rectEl], initialBox);

    // Now restore all corners
    DistortTransformer.resetAllCorners(mockCtx, [rectEl], initialBox);

    const basePurged = !rectEl.attributes['data-distort-base'];
    const verticesRestored = rectEl.vertices?.[0].x === 0 && rectEl.vertices?.[1].x === 100;

    if (basePurged && verticesRestored) {
      console.log('  ✅ [PASS] restoreAllCorners cleanly restores pristine base coordinates from data-distort-base');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Restoration of base geometry failed:', { basePurged, verticesRestored });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 4:', err?.message || err);
  }

  // Test 5: Convexity evaluation detects non-convex or degenerate quads
  try {
    const convexQuad: QuadCorners = {
      nw: { x: 10, y: 0 },
      ne: { x: 90, y: 0 },
      se: { x: 100, y: 100 },
      sw: { x: 0, y: 100 },
    };

    // Bowtie (self-intersecting) quad
    const nonConvexQuad: QuadCorners = {
      nw: { x: 0, y: 0 },
      ne: { x: 100, y: 100 },
      se: { x: 100, y: 0 },
      sw: { x: 0, y: 100 },
    };

    const isConvexValid = ProjectiveHomography.isConvex(convexQuad);
    const isNonConvexDetected = !ProjectiveHomography.isConvex(nonConvexQuad);

    if (isConvexValid && isNonConvexDetected) {
      console.log('  ✅ [PASS] Convexity evaluation prevents invalid bowtie or self-intersecting quads in Free Distort');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Convexity check failed:', { isConvexValid, isNonConvexDetected });
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Exception in Test 5:', err?.message || err);
  }

  console.log(`\nFree Distort & Projective Baking: ${passed}/${total} tests passed.`);
  return passed === total;
}
