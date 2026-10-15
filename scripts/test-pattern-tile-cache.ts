/**
 * test-pattern-tile-cache.ts
 *
 * Comprehensive unit test suite for Section 11:
 * Multi-scale zoom-indexed pattern tile cache (PatternTileCacheService)
 * and GridCanvasRenderer fast-path tiling integration.
 */

import {
  PatternTileCacheService,
  PatternTileDescriptor,
  CachedPatternTile,
} from '../src/webview/engine/canvas/PatternTileCacheService.js';
import { GridCanvasRenderer } from '../src/webview/ui/GridCanvasRenderer.js';
import { CanvasManager } from '../src/webview/engine/CanvasManager.js';

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

export async function runPatternTileCacheTests(): Promise<boolean> {
  console.log('\n--- Running Multi-Scale Zoom-Indexed Pattern Tile Cache Suite ---');

  // =========================================================================
  // 1. Multi-Scale Discrete Logarithmic Scale Bucketing (LOD Mipmapping)
  // =========================================================================
  console.log('\n[1. Multi-Scale Discrete Logarithmic Scale Bucketing (LOD Mipmapping)]');
  {
    const cache = new PatternTileCacheService({
      config: { octaveSubdivisions: 2, minScale: 0.05, maxScale: 64.0 },
    });

    // With octaveSubdivisions = 2, buckets are powers of 2^(k/2):
    // 0.25, 0.3536, 0.5, 0.7071, 1.0, 1.4142, 2.0, 2.8284, 4.0...
    const b1_00 = cache.getScaleBucket(1.0);
    const b1_02 = cache.getScaleBucket(1.02);
    const b0_98 = cache.getScaleBucket(0.98);
    const b1_08 = cache.getScaleBucket(1.08);

    assert(b1_00 === 1.0, `Zoom 1.0 maps to scale bucket 1.0 (got ${b1_00})`);
    assert(b1_02 === 1.0, `Micro-zoom 1.02 reuses bucket 1.0 without re-rasterizing (got ${b1_02})`);
    assert(b0_98 === 1.0, `Micro-zoom 0.98 reuses bucket 1.0 without re-rasterizing (got ${b0_98})`);
    assert(b1_08 === 1.0, `Micro-zoom 1.08 reuses bucket 1.0 without re-rasterizing (got ${b1_08})`);

    const bSqrt2 = cache.getScaleBucket(1.4142);
    assert(Math.abs(bSqrt2 - 1.4142) < 0.001, `Zoom 1.414 maps to bucket 1.4142 (got ${bSqrt2})`);

    const b2_00 = cache.getScaleBucket(2.0);
    const b2_05 = cache.getScaleBucket(2.05);
    assert(b2_00 === 2.0, `Zoom 2.0 maps to bucket 2.0 (got ${b2_00})`);
    assert(b2_05 === 2.0, `Micro-zoom 2.05 reuses bucket 2.0 (got ${b2_05})`);

    const b0_50 = cache.getScaleBucket(0.5);
    assert(b0_50 === 0.5, `Zoom 0.5 maps to bucket 0.5 (got ${b0_50})`);

    // Min and Max scale clamping
    const bMin = cache.getScaleBucket(0.001);
    const bMax = cache.getScaleBucket(500.0);
    assert(bMin >= 0.05, `Zoom clamped above minScale 0.05 (got ${bMin})`);
    assert(bMax <= 64.0, `Zoom clamped below maxScale 64.0 (got ${bMax})`);
  }

  // =========================================================================
  // 2. Deterministic Composite Key Generation
  // =========================================================================
  console.log('\n[2. Deterministic Composite Key Generation]');
  {
    const cache = new PatternTileCacheService();
    const descA: PatternTileDescriptor = {
      id: 'iso_grid',
      width: 20,
      height: 20,
      color: '#ffffff',
      strokeWidth: 1,
    };
    const descB: PatternTileDescriptor = {
      id: 'iso_grid',
      width: 20,
      height: 20,
      color: '#ffffff',
      strokeWidth: 1,
    };
    const descC: PatternTileDescriptor = {
      id: 'iso_grid',
      width: 20,
      height: 20,
      color: '#ff0000', // Different color
      strokeWidth: 1,
    };

    const keyA = cache.getTileKey(descA, 1.0, 1.0);
    const keyB = cache.getTileKey(descB, 1.0, 1.0);
    const keyC = cache.getTileKey(descC, 1.0, 1.0);

    assert(keyA === keyB, `Identical descriptors generate identical keys: "${keyA}"`);
    assert(keyA !== keyC, `Descriptors with different colors generate distinct keys`);
  }

  // =========================================================================
  // 3. Cache Hit / Miss Lifecycle & Zero Re-rasterization on Micro-Zooms
  // =========================================================================
  console.log('\n[3. Cache Hit / Miss Lifecycle & Zero Re-rasterization on Micro-Zooms]');
  {
    let rasterizeCalls = 0;
    const mockFactory = (w: number, h: number) => {
      rasterizeCalls++;
      const mockCanvas: any = { width: w, height: h };
      const mockCtx: any = {
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        scale: () => {},
        beginPath: () => {},
        stroke: () => {},
        createPattern: () => ({ setTransform: () => {} }),
      };
      return { canvas: mockCanvas, ctx: mockCtx };
    };

    const cache = new PatternTileCacheService({ canvasFactory: mockFactory });
    const descriptor: PatternTileDescriptor = {
      id: 'mesh_pattern',
      width: 30,
      height: 30,
      color: 'rgba(255,255,255,0.2)',
      render: (ctx, w, h) => {
        ctx.beginPath();
      },
    };

    // First request: zoom 1.00 -> Cache Miss (rasterization 1)
    const tile1 = cache.getTile(descriptor, 1.0);
    assert(rasterizeCalls === 1, `First request triggers rasterization (miss)`);
    assert(cache.getMetrics().misses === 1, `Metrics report 1 miss`);
    assert(cache.getMetrics().hits === 0, `Metrics report 0 hits`);

    // Second request: zoom 1.02 -> Same scale bucket 1.0 -> Cache Hit! (zero re-rasterization)
    const tile2 = cache.getTile(descriptor, 1.02);
    assert(rasterizeCalls === 1, `Micro-zoom 1.02 reuses cached tile with zero re-rasterization`);
    assert(tile1 === tile2, `Returned tile is identical cached instance`);
    assert(cache.getMetrics().hits === 1, `Metrics report 1 hit`);

    // Third request: zoom 0.98 -> Same scale bucket 1.0 -> Cache Hit!
    const tile3 = cache.getTile(descriptor, 0.98);
    assert(rasterizeCalls === 1, `Micro-zoom 0.98 reuses cached tile without re-rasterizing`);
    assert(cache.getMetrics().hits === 2, `Metrics report 2 hits`);
    assert(Math.abs(cache.getMetrics().hitRatio - 2 / 3) < 0.001, `Hit ratio is 2/3 (got ${cache.getMetrics().hitRatio})`);

    // Fourth request: zoom 2.0 -> Different scale bucket 2.0 -> Cache Miss (rasterization 2)
    const tile4 = cache.getTile(descriptor, 2.0);
    assert(rasterizeCalls === 2, `Zoom 2.0 switches to scale bucket 2.0 and rasterizes new tile`);
    assert(tile4 !== tile1, `Tile at scale 2.0 is a distinct cached tile`);
    assert(cache.getMetrics().misses === 2, `Metrics report 2 misses`);
  }

  // =========================================================================
  // 4. Bounded LRU Eviction Policy
  // =========================================================================
  console.log('\n[4. Bounded LRU Eviction Policy]');
  {
    const cache = new PatternTileCacheService({ maxEntries: 3 });

    const d1: PatternTileDescriptor = { id: 'tile_1', width: 10, height: 10 };
    const d2: PatternTileDescriptor = { id: 'tile_2', width: 10, height: 10 };
    const d3: PatternTileDescriptor = { id: 'tile_3', width: 10, height: 10 };
    const d4: PatternTileDescriptor = { id: 'tile_4', width: 10, height: 10 };

    cache.getTile(d1, 1.0);
    cache.getTile(d2, 1.0);
    cache.getTile(d3, 1.0);

    assert(cache.getMetrics().entryCount === 3, `Cache holds 3 entries (at capacity limit)`);
    assert(cache.getMetrics().evictions === 0, `Zero evictions before exceeding capacity`);

    // Access d1 to refresh its LRU position (making d2 the oldest)
    cache.getTile(d1, 1.0);

    // Insert 4th entry -> forces eviction of oldest unaccessed (d2)
    cache.getTile(d4, 1.0);

    assert(cache.getMetrics().entryCount === 3, `Cache size maintained at maxEntries = 3`);
    assert(cache.getMetrics().evictions === 1, `Eviction count incremented to 1`);

    // Verify d1 is still cached (hit)
    const hitsBefore = cache.getMetrics().hits;
    cache.getTile(d1, 1.0);
    assert(cache.getMetrics().hits === hitsBefore + 1, `Recently accessed d1 was retained in cache`);

    // Verify d2 was evicted (miss on re-request)
    const missesBefore = cache.getMetrics().misses;
    cache.getTile(d2, 1.0);
    assert(cache.getMetrics().misses === missesBefore + 1, `Evicted d2 caused a cache miss`);
  }

  // =========================================================================
  // 5. Invalidation & Cache Reset
  // =========================================================================
  console.log('\n[5. Invalidation & Cache Reset]');
  {
    const cache = new PatternTileCacheService();
    const dIso: PatternTileDescriptor = { id: 'iso_grid', width: 20, height: 20 };
    const dAxo: PatternTileDescriptor = { id: 'axo_grid', width: 20, height: 20 };

    cache.getTile(dIso, 1.0);
    cache.getTile(dIso, 2.0);
    cache.getTile(dAxo, 1.0);

    assert(cache.getMetrics().entryCount === 3, `Initial entry count is 3`);

    // Invalidate specifically 'iso_grid'
    cache.invalidate('iso_grid');
    assert(cache.getMetrics().entryCount === 1, `Entries for iso_grid purged, axo_grid retained (got 1)`);

    // Purge all
    cache.clear();
    assert(cache.getMetrics().entryCount === 0, `clear() purged all cache entries`);
    assert(cache.getMetrics().totalBytes === 0, `Memory bytes reset to 0`);
  }

  // =========================================================================
  // 6. 1-Shot GPU-Accelerated Tiled Rect Rendering (CanvasPattern.setTransform)
  // =========================================================================
  console.log('\n[6. 1-Shot GPU-Accelerated Tiled Rect Rendering]');
  {
    let fillRectCalls = 0;
    let patternTransformApplied = false;
    let transformedMatrix: any = null;

    const mockPattern: any = {
      setTransform: (m: any) => {
        patternTransformApplied = true;
        transformedMatrix = m;
      },
    };

    const mockFactory = (w: number, h: number) => {
      const mockCanvas: any = { width: w, height: h };
      const ctx: any = {
        canvas: mockCanvas,
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        rect: () => {},
        scale: () => {},
        setLineDash: () => {},
        createPattern: () => mockPattern,
      };
      return { canvas: mockCanvas, ctx };
    };

    const mockCtx: any = {
      save: () => {},
      restore: () => {},
      fillRect: () => {
        fillRectCalls++;
      },
      createPattern: () => mockPattern,
    };

    const cache = new PatternTileCacheService({ canvasFactory: mockFactory });
    const descriptor = PatternTileCacheService.createIsometricGridDescriptor(20, '#00ff00');

    const rendered = cache.renderTiledRect(
      mockCtx,
      { x: 10, y: 10, width: 800, height: 600 },
      descriptor,
      1.25, // Zoom
      { x: 50, y: 30 }, // Camera offset
      { x: 0, y: 0 } // Origin
    );

    assert(rendered === true, `renderTiledRect succeeded with GPU pattern transform`);
    assert(patternTransformApplied === true, `pattern.setTransform was invoked`);
    assert(fillRectCalls === 1, `Executed in exactly 1 GPU fill operation (O(1))`);
    assert(transformedMatrix !== null, `Transformation matrix was set on pattern`);
  }

  // =========================================================================
  // 7. GridCanvasRenderer Integration & Fast-Path Verification
  // =========================================================================
  console.log('\n[7. GridCanvasRenderer Integration & Fast-Path Verification]');
  {
    const mockCanvas: any = {
      width: 1920,
      height: 1080,
      getContext: () => mockContext,
    };

    let fillRectCount = 0;
    let analyticalStrokeCount = 0;

    const mockContext: any = {
      canvas: mockCanvas,
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      clearRect: () => {},
      scale: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      moveTo: () => {},
      lineTo: () => {},
      setLineDash: () => {},
      stroke: () => {
        analyticalStrokeCount++;
      },
      fillRect: () => {
        fillRectCount++;
      },
      createPattern: () => ({
        setTransform: () => {},
      }),
    };

    const renderer = new GridCanvasRenderer(mockCanvas);
    const canvasMgr = new CanvasManager();
    canvasMgr.showGrid = true;
    canvasMgr.grids = [
      {
        id: 'iso_1',
        type: 'isometric',
        spacing: 20,
        color: '#ffffff',
        visible: true,
      },
    ];

    const scrollArea: any = { clientWidth: 1000, clientHeight: 800 };
    const workBounds = { minX: 0, minY: 0, width: 2000, height: 2000 };

    // 1. Render with pattern cache enabled (default)
    renderer.render({
      scrollArea,
      canvasMgr,
      workBounds,
      cameraOffset: { x: 0, y: 0 },
      zoom: 1.0,
      originX: 0,
      originY: 0,
      enablePatternTileCache: true,
    });

    assert(fillRectCount === 1, `Fast-path executed 1 GPU pattern fill for isometric grid`);
    assert(renderer.getPatternCacheService().getMetrics().hits + renderer.getPatternCacheService().getMetrics().misses > 0, `Pattern cache was utilized`);

    // 2. Render with pattern cache disabled (forces analytical line iteration fallback)
    fillRectCount = 0;
    analyticalStrokeCount = 0;

    renderer.render({
      scrollArea,
      canvasMgr,
      workBounds,
      cameraOffset: { x: 0, y: 0 },
      zoom: 1.0,
      originX: 0,
      originY: 0,
      enablePatternTileCache: false,
    });

    assert(fillRectCount === 0, `No pattern fill when enablePatternTileCache is false`);
    assert(analyticalStrokeCount >= 1, `Fell back to analytical line strokes`);
  }

  console.log(`\nPattern Tile Cache Tests complete: ${passed} passed, ${failed} failed.\n`);
  return failed === 0;
}
