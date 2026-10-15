/**
 * PatternTileCacheService.ts
 *
 * ARCHITECTURAL RATIONALE: Multi-Scale Zoom-Indexed Pattern Tile Cache (LOD Mipmapping)
 *
 * 1. The Zoom-Rasterization Thrashing Problem:
 *    During interactive canvas navigation (continuous pinch-to-zoom, mouse wheel zooming, and panning),
 *    the camera zoom factor changes smoothly across floating-point increments (e.g. 1.001 -> 1.003 -> 1.006...).
 *    If complex repetitive pattern tiles (e.g. isometric triangular/diamond grids, axonometric lattices,
 *    dot matrices, or cross-hatch textures) are re-rasterized onto offscreen buffers on every fractional zoom event,
 *    the engine suffers severe GPU texture churn, high GC allocation pressure, and frame drops below 60 FPS.
 *
 * 2. Multi-Scale Zoom Bucketing (LOD / Sub-Octave Quantization):
 *    This service quantizes continuous zoom levels into discrete logarithmic scale buckets:
 *      exponent = round(octaveSubdivisions * log2(zoom)) / octaveSubdivisions
 *      scaleBucket = 2^exponent
 *    With default half-octave subdivisions (octaveSubdivisions = 2), zoom levels map to discrete steps:
 *    [... 0.25, 0.3536, 0.50, 0.7071, 1.00, 1.4142, 2.00, 2.8284, 4.00, 5.6569, 8.00 ...].
 *    Micro-zooms and smooth pans reuse the identical pre-rasterized tile bitmap from cache with zero re-rasterization.
 *
 * 3. 1-Shot GPU-Accelerated Tiling (CanvasPattern.setTransform):
 *    A single cached CanvasPattern is blitted across the viewport dirty rectangle via:
 *      matrix.translate(originX, originY).scale(zoom / scaleBucket)
 *      pattern.setTransform(matrix)
 *      ctx.fillStyle = pattern
 *      ctx.fillRect(viewport)
 *    This turns multi-thousand line loops into a single O(1) GPU-accelerated raster fill operation.
 *
 * 4. Bounded LRU Memory Management:
 *    Maintains a strict Least-Recently-Used (LRU) eviction policy with bounded capacity (default: 64 entries)
 *    and detailed memory profiling (hits, misses, evictions, total bytes, hit ratio).
 */

export interface PatternTileDescriptor {
  id: string;
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  dash?: number[];
  pathD?: string;
  render?: (ctx: any, width: number, height: number, scale: number) => void;
  metadata?: Record<string, any>;
}

export interface ScaleBucketConfig {
  octaveSubdivisions: number;
  minScale: number;
  maxScale: number;
}

export interface CachedPatternTile {
  key: string;
  patternId: string;
  scaleBucket: number;
  dpr: number;
  pixelWidth: number;
  pixelHeight: number;
  canvas: any;
  ctx: any;
  pattern: any; // CanvasPattern
  lastAccess: number;
  accessCount: number;
  estimatedBytes: number;
}

export interface PatternTileCacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  entryCount: number;
  maxEntries: number;
  totalBytes: number;
  hitRatio: number;
}

export type CanvasFactory = (width: number, height: number) => { canvas: any; ctx: any };

export class PatternTileCacheService {
  private config: ScaleBucketConfig;
  private maxEntries: number;
  private entries: Map<string, CachedPatternTile> = new Map();
  private canvasFactory: CanvasFactory;

  private hitsCount = 0;
  private missesCount = 0;
  private evictionsCount = 0;
  private totalMemoryBytes = 0;

  constructor(options?: {
    config?: Partial<ScaleBucketConfig>;
    maxEntries?: number;
    canvasFactory?: CanvasFactory;
  }) {
    this.config = {
      octaveSubdivisions: options?.config?.octaveSubdivisions ?? 2,
      minScale: options?.config?.minScale ?? 0.05,
      maxScale: options?.config?.maxScale ?? 64.0,
    };
    this.maxEntries = options?.maxEntries ?? 64;
    this.canvasFactory = options?.canvasFactory ?? PatternTileCacheService.createDefaultCanvasFactory();
  }

  /**
   * Default factory for creating offscreen canvases across Browser, WebWorker, and test runtimes.
   */
  public static createDefaultCanvasFactory(): CanvasFactory {
    return (w: number, h: number) => {
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));

      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        return { canvas, ctx };
      }

      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
          const canvas: any = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          if (typeof canvas.getContext === 'function') {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              return { canvas, ctx };
            }
          }
        } catch {}
      }

      // Lightweight mock canvas fallback for headless testing environments
      const mockCanvas: any = {
        width,
        height,
        getContext: () => mockCtx,
      };
      const mockCtx: any = {
        canvas: mockCanvas,
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {},
        rect: () => {},
        scale: () => {},
        setLineDash: () => {},
        createPattern: (_canvas: any, _rep: string) => ({
          setTransform: () => {},
        }),
      };
      return { canvas: mockCanvas, ctx: mockCtx };
    };
  }

  /**
   * Quantizes continuous zoom level into discrete logarithmic scale bucket.
   */
  public getScaleBucket(zoom: number): number {
    const clamped = Math.min(Math.max(zoom, this.config.minScale), this.config.maxScale);
    const exponent =
      Math.round(this.config.octaveSubdivisions * Math.log2(clamped)) / this.config.octaveSubdivisions;
    const bucket = Math.pow(2, exponent);
    const boundedBucket = Math.min(Math.max(bucket, this.config.minScale), this.config.maxScale);
    return Math.round(boundedBucket * 10000) / 10000;
  }

  /**
   * Generates a deterministic cache key for a pattern tile descriptor and quantized scale bucket.
   */
  public getTileKey(descriptor: PatternTileDescriptor, scaleBucket: number, dpr: number = 1): string {
    const sw = descriptor.strokeWidth !== undefined ? descriptor.strokeWidth : 1;
    const col = descriptor.color || 'none';
    const fil = descriptor.fill || 'none';
    const dash = descriptor.dash ? descriptor.dash.join(',') : 'solid';
    const pathSnippet = descriptor.pathD ? descriptor.pathD.slice(0, 40) : 'custom';
    return `${descriptor.id}__s:${scaleBucket.toFixed(4)}__dpr:${dpr.toFixed(2)}__w:${descriptor.width}__h:${descriptor.height}__sw:${sw}__c:${col}__f:${fil}__d:${dash}__p:${pathSnippet}`;
  }

  /**
   * Retrieves or pre-rasterizes a pattern tile for the given descriptor and zoom level.
   */
  public getTile(descriptor: PatternTileDescriptor, zoom: number, dpr: number = 1): CachedPatternTile {
    const scaleBucket = this.getScaleBucket(zoom);
    const key = this.getTileKey(descriptor, scaleBucket, dpr);

    const existing = this.entries.get(key);
    if (existing) {
      this.hitsCount++;
      existing.lastAccess = Date.now();
      existing.accessCount++;
      // Refresh LRU order (delete + set places key at the end of Map iteration)
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }

    this.missesCount++;
    const newEntry = this.rasterizeTile(descriptor, scaleBucket, dpr, key);
    this.entries.set(key, newEntry);
    this.totalMemoryBytes += newEntry.estimatedBytes;
    this.evictIfNecessary();

    return newEntry;
  }

  /**
   * Retrieves or creates a CanvasPattern for the given descriptor and zoom level.
   */
  public getOrCreatePattern(
    targetCtx: any,
    descriptor: PatternTileDescriptor,
    zoom: number,
    dpr: number = 1
  ): any {
    const tile = this.getTile(descriptor, zoom, dpr);
    if (tile.pattern) {
      return tile.pattern;
    }

    if (targetCtx && typeof targetCtx.createPattern === 'function') {
      try {
        const pattern = targetCtx.createPattern(tile.canvas, 'repeat');
        tile.pattern = pattern;
        return pattern;
      } catch {
        // Fallback if target context fails to create pattern
      }
    }

    return null;
  }

  /**
   * High-Performance 1-Shot GPU-Accelerated Tiled Rect Rendering:
   * Uses `CanvasPattern.setTransform` with a single `ctx.fillRect` call,
   * avoiding thousands of per-line loop dispatches.
   */
  public renderTiledRect(
    ctx: any,
    targetRect: { x: number; y: number; width: number; height: number },
    descriptor: PatternTileDescriptor,
    zoom: number,
    cameraOffset: { x: number; y: number },
    origin: { x: number; y: number },
    workBoundsOrigin: { minX: number; minY: number } = { minX: 0, minY: 0 },
    dpr: number = 1
  ): boolean {
    if (!ctx || targetRect.width <= 0 || targetRect.height <= 0) return false;

    const scaleBucket = this.getScaleBucket(zoom);
    const pattern = this.getOrCreatePattern(ctx, descriptor, zoom, dpr);

    if (!pattern) {
      return false;
    }

    // Ratio between continuous camera zoom and discrete quantized bucket
    const scaleRatio = zoom / scaleBucket;

    // Projected screen origin in pixels
    const originScreenX = (origin.x - workBoundsOrigin.minX) * zoom + cameraOffset.x;
    const originScreenY = (origin.y - workBoundsOrigin.minY) * zoom + cameraOffset.y;

    if (typeof pattern.setTransform === 'function') {
      try {
        let matrix: any;
        if (typeof DOMMatrix !== 'undefined') {
          matrix = new DOMMatrix();
          matrix.translateSelf(originScreenX, originScreenY);
          matrix.scaleSelf(scaleRatio, scaleRatio);
        } else {
          // Plain matrix dictionary for runtimes supporting SVGMatrix or duck-typed matrix
          matrix = {
            a: scaleRatio,
            b: 0,
            c: 0,
            d: scaleRatio,
            e: originScreenX,
            f: originScreenY,
          };
        }
        pattern.setTransform(matrix);
        ctx.save();
        ctx.fillStyle = pattern;
        ctx.fillRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        ctx.restore();
        return true;
      } catch {
        // If setTransform fails, fallback gracefully
      }
    }

    return false;
  }

  /**
   * Pre-configured Helper: Generates an Orthogonal Grid Descriptor.
   */
  public static createOrthogonalGridDescriptor(
    spacing: number,
    color: string = 'rgba(255, 255, 255, 0.15)',
    strokeWidth: number = 1,
    dash: number[] = [2, 2]
  ): PatternTileDescriptor {
    const S = Math.max(1, spacing);
    return {
      id: `grid_orthogonal_${S}`,
      width: S,
      height: S,
      color,
      strokeWidth,
      dash,
      pathD: `M ${S} 0 L 0 0 0 ${S}`,
      render: (ctx, w, h) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        if (dash && dash.length > 0 && typeof ctx.setLineDash === 'function') {
          ctx.setLineDash(dash);
        }
        ctx.beginPath();
        ctx.moveTo(w, 0);
        ctx.lineTo(0, 0);
        ctx.lineTo(0, h);
        ctx.stroke();
      },
    };
  }

  /**
   * Pre-configured Helper: Generates an Isometric Grid Descriptor.
   */
  public static createIsometricGridDescriptor(
    spacing: number,
    color: string = 'rgba(255, 255, 255, 0.15)',
    strokeWidth: number = 1,
    dash: number[] = [2, 2]
  ): PatternTileDescriptor {
    const S = Math.max(5, spacing);
    const tileH = S;
    const tileW = Math.round(S * Math.sqrt(3) * 1000) / 1000;
    const halfW = tileW / 2;
    const halfH = tileH / 2;

    return {
      id: `grid_isometric_${S}`,
      width: tileW,
      height: tileH,
      color,
      strokeWidth,
      dash,
      render: (ctx, w, h) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        if (dash && dash.length > 0 && typeof ctx.setLineDash === 'function') {
          ctx.setLineDash(dash);
        }
        ctx.beginPath();
        // 1. Vertical axes
        ctx.moveTo(0, 0);
        ctx.lineTo(0, h);
        ctx.moveTo(halfW, 0);
        ctx.lineTo(halfW, h);

        // 2. Central diamond
        ctx.moveTo(0, halfH);
        ctx.lineTo(halfW, 0);
        ctx.lineTo(w, halfH);
        ctx.lineTo(halfW, h);
        ctx.closePath();

        // 3. Corner diagonals
        ctx.moveTo(0, 0);
        ctx.lineTo(halfW, halfH);
        ctx.lineTo(w, 0);

        ctx.moveTo(0, h);
        ctx.lineTo(halfW, halfH);
        ctx.lineTo(w, h);

        ctx.stroke();
      },
    };
  }

  /**
   * Pre-configured Helper: Generates an Axonometric Grid Descriptor.
   */
  public static createAxonometricGridDescriptor(
    spacing: number,
    color: string = 'rgba(255, 255, 255, 0.15)',
    strokeWidth: number = 1,
    dash: number[] = [2, 2]
  ): PatternTileDescriptor {
    const S = Math.max(5, spacing);
    return {
      id: `grid_axonometric_${S}`,
      width: S,
      height: S,
      color,
      strokeWidth,
      dash,
      render: (ctx, w, h) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        if (dash && dash.length > 0 && typeof ctx.setLineDash === 'function') {
          ctx.setLineDash(dash);
        }
        ctx.beginPath();
        // 45-degree crossing diagonals + vertical axis
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
        ctx.moveTo(0, h);
        ctx.lineTo(w, 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, h);
        ctx.stroke();
      },
    };
  }

  /**
   * Pre-configured Helper: Generates a Dot Grid Descriptor.
   */
  public static createDotGridDescriptor(
    spacing: number,
    color: string = 'rgba(255, 255, 255, 0.3)',
    radius: number = 1
  ): PatternTileDescriptor {
    const S = Math.max(5, spacing);
    return {
      id: `grid_dots_${S}`,
      width: S,
      height: S,
      fill: color,
      render: (ctx) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  }

  /**
   * Invalidates cached entries by patternId prefix or entire cache if omitted.
   */
  public invalidate(patternId?: string): void {
    if (!patternId) {
      this.clear();
      return;
    }

    const toDelete: string[] = [];
    this.entries.forEach((entry, key) => {
      if (entry.patternId === patternId || entry.key.startsWith(patternId)) {
        toDelete.push(key);
      }
    });

    toDelete.forEach((key) => {
      const entry = this.entries.get(key);
      if (entry) {
        this.totalMemoryBytes = Math.max(0, this.totalMemoryBytes - entry.estimatedBytes);
        this.entries.delete(key);
      }
    });
  }

  /**
   * Purges all cached entries and resets memory count.
   */
  public clear(): void {
    this.entries.clear();
    this.totalMemoryBytes = 0;
  }

  /**
   * Sets maximum entries allowed in LRU cache before eviction occurs.
   */
  public setMaxEntries(max: number): void {
    this.maxEntries = Math.max(1, max);
    this.evictIfNecessary();
  }

  /**
   * Returns current operational performance metrics.
   */
  public getMetrics(): PatternTileCacheMetrics {
    const totalRequests = this.hitsCount + this.missesCount;
    const hitRatio = totalRequests > 0 ? this.hitsCount / totalRequests : 0;

    return {
      hits: this.hitsCount,
      misses: this.missesCount,
      evictions: this.evictionsCount,
      entryCount: this.entries.size,
      maxEntries: this.maxEntries,
      totalBytes: this.totalMemoryBytes,
      hitRatio: Math.round(hitRatio * 10000) / 10000,
    };
  }

  /**
   * Resets hit, miss, and eviction counters.
   */
  public resetMetrics(): void {
    this.hitsCount = 0;
    this.missesCount = 0;
    this.evictionsCount = 0;
  }

  /**
   * Internal rasterization of an individual pattern tile at specified scaleBucket and DPR.
   */
  private rasterizeTile(
    descriptor: PatternTileDescriptor,
    scaleBucket: number,
    dpr: number,
    key: string
  ): CachedPatternTile {
    const totalScale = scaleBucket * dpr;
    const pixelWidth = Math.max(1, Math.round(descriptor.width * totalScale));
    const pixelHeight = Math.max(1, Math.round(descriptor.height * totalScale));

    const { canvas, ctx } = this.canvasFactory(pixelWidth, pixelHeight);

    if (ctx) {
      if (typeof ctx.save === 'function') ctx.save();
      if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, pixelWidth, pixelHeight);

      // Scale context so drawing commands use unscaled tile coordinates
      if (typeof ctx.scale === 'function') {
        ctx.scale(totalScale, totalScale);
      }

      if (descriptor.render) {
        descriptor.render(ctx, descriptor.width, descriptor.height, scaleBucket);
      } else if (descriptor.pathD && typeof Path2D !== 'undefined') {
        try {
          const path = new Path2D(descriptor.pathD);
          if (descriptor.fill && descriptor.fill !== 'none') {
            ctx.fillStyle = descriptor.fill;
            ctx.fill(path);
          }
          if (descriptor.strokeWidth && descriptor.strokeWidth > 0 && descriptor.color && descriptor.color !== 'none') {
            ctx.strokeStyle = descriptor.color;
            ctx.lineWidth = descriptor.strokeWidth;
            if (descriptor.dash && typeof ctx.setLineDash === 'function') {
              ctx.setLineDash(descriptor.dash);
            }
            ctx.stroke(path);
          }
        } catch {
          // If Path2D parsing fails in test/minimal env
        }
      }

      if (typeof ctx.restore === 'function') ctx.restore();
    }

    let pattern: any = null;
    if (ctx && typeof ctx.createPattern === 'function') {
      try {
        pattern = ctx.createPattern(canvas, 'repeat');
      } catch {
        pattern = null;
      }
    }

    const estimatedBytes = pixelWidth * pixelHeight * 4;

    return {
      key,
      patternId: descriptor.id,
      scaleBucket,
      dpr,
      pixelWidth,
      pixelHeight,
      canvas,
      ctx,
      pattern,
      lastAccess: Date.now(),
      accessCount: 1,
      estimatedBytes,
    };
  }

  /**
   * Internal LRU eviction: removes oldest accessed entries until within maxEntries.
   */
  private evictIfNecessary(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;

      const entry = this.entries.get(oldestKey);
      if (entry) {
        this.totalMemoryBytes = Math.max(0, this.totalMemoryBytes - entry.estimatedBytes);
        this.evictionsCount++;
      }
      this.entries.delete(oldestKey);
    }
  }
}
