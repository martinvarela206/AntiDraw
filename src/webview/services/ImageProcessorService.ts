/**
 * ARCHITECTURAL RATIONALE: High-Performance Image Optimization & Quantization Service
 *
 * Provides in-memory image processing for AntiDraw vector editor:
 * 1. Smart Ingestion Thresholding (file size, resolution limits).
 * 2. Real-time dimension transformations (width, height, percentage, aspect ratio).
 * 3. Color quantization (palette reduction: 256, 128, 64, 32, 16 colors).
 * 4. Smoothing / noise reduction filter for optimized compression.
 * 5. Multi-format encoding (WebP, PNG, JPEG) with quality compression.
 * 6. Live size estimation and preview generation for dual 2-up comparison.
 */

export interface ImageSourceMeta {
  width: number;
  height: number;
  sizeBytes: number;
  format: 'png' | 'jpeg' | 'webp' | 'gif' | 'svg' | 'unknown';
  hasAlpha: boolean;
  base64: string;
  fileName: string;
}

export interface ImageOptimizationConfig {
  destination: 'linked' | 'embedded';
  format: 'webp' | 'png' | 'jpeg';
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  quality: number; // 0.05 to 1.0 (5% to 100%)
  colorMode: 'rgb' | 'palette';
  paletteColors: number; // 16, 32, 64, 128, 256
  smoothing: number; // 0 to 10
  transparency: boolean; // keep alpha or matte background
  matteColor: string; // hex color for background matte if transparency is false
}

export interface OptimizedImageResult {
  base64: string;
  blob: Blob;
  sizeBytes: number;
  width: number;
  height: number;
  format: 'webp' | 'png' | 'jpeg';
  previewUrl: string;
  savingsPercent: number;
}

export class ImageProcessorService {
  public static readonly DEFAULT_MAX_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
  public static readonly DEFAULT_MAX_DIMENSION = 1920; // 1920 px

  /**
   * Evaluates whether an incoming image exceeds thresholds and requires the optimization modal.
   */
  public static isExceedingThreshold(
    sizeBytes: number,
    width: number,
    height: number,
    maxBytes = ImageProcessorService.DEFAULT_MAX_SIZE_BYTES,
    maxDimension = ImageProcessorService.DEFAULT_MAX_DIMENSION
  ): boolean {
    return sizeBytes > maxBytes || Math.max(width, height) > maxDimension;
  }

  /**
   * Inspects a base64 or blob data to extract dimensions, format, and size.
   */
  public static async analyzeImage(base64: string, fileName = 'image.png', fallbackSizeBytes?: number): Promise<ImageSourceMeta> {
    const sizeBytes = fallbackSizeBytes && fallbackSizeBytes > 0 ? fallbackSizeBytes : this.estimateBase64SizeBytes(base64);
    const format = this.detectFormat(base64, fileName);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const hasAlpha = this.detectImageAlpha(img);
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          sizeBytes,
          format,
          hasAlpha,
          base64,
          fileName,
        });
      };
      img.onerror = (e) => reject(new Error('Failed to load image for analysis: ' + String(e)));
      img.src = base64;
    });
  }

  /**
   * Executes optimization pipeline and returns encoded result with live preview URL.
   */
  public static async processImage(
    sourceImg: HTMLImageElement,
    config: ImageOptimizationConfig,
    originalSizeBytes: number
  ): Promise<OptimizedImageResult> {
    const targetW = Math.max(1, Math.round(config.width));
    const targetH = Math.max(1, Math.round(config.height));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create 2D canvas context');

    // Enable high quality image scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Handle matte background when transparency is disabled or format is JPEG
    const isJpeg = config.format === 'jpeg';
    if (!config.transparency || isJpeg) {
      ctx.fillStyle = config.matteColor || '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    // Draw rescaled image
    ctx.drawImage(sourceImg, 0, 0, targetW, targetH);

    // Apply smoothing filter if requested (> 0)
    if (config.smoothing > 0) {
      this.applySmoothing(ctx, targetW, targetH, config.smoothing);
    }

    // Apply color quantization if palette mode is chosen
    if (config.colorMode === 'palette' && config.paletteColors > 0) {
      this.applyPaletteQuantization(ctx, targetW, targetH, config.paletteColors);
    }

    // Determine output mime type
    const mimeType = isJpeg
      ? 'image/jpeg'
      : config.format === 'webp'
      ? 'image/webp'
      : 'image/png';

    // Compress to Blob
    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b || new Blob([], { type: mimeType })),
        mimeType,
        mimeType === 'image/png' ? undefined : config.quality
      );
    });

    const sizeBytes = blob.size;
    const previewUrl = URL.createObjectURL(blob);
    const base64 = await this.blobToBase64(blob);

    const savings = originalSizeBytes > 0 ? Math.max(0, Math.round(((originalSizeBytes - sizeBytes) / originalSizeBytes) * 100)) : 0;

    return {
      base64,
      blob,
      sizeBytes,
      width: targetW,
      height: targetH,
      format: config.format,
      previewUrl,
      savingsPercent: savings,
    };
  }

  /**
   * Applies box smoothing filter across pixels to reduce high frequency noise.
   */
  private static applySmoothing(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
    const passes = Math.min(3, Math.max(1, Math.round(strength / 3)));
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let p = 0; p < passes; p++) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          // Average with neighbors
          const up = ((y - 1) * w + x) * 4;
          const down = ((y + 1) * w + x) * 4;
          const left = (y * w + (x - 1)) * 4;
          const right = (y * w + (x + 1)) * 4;

          data[idx] = (data[idx] * 2 + data[up] + data[down] + data[left] + data[right]) / 6;
          data[idx + 1] = (data[idx + 1] * 2 + data[up + 1] + data[down + 1] + data[left + 1] + data[right + 1]) / 6;
          data[idx + 2] = (data[idx + 2] * 2 + data[up + 2] + data[down + 2] + data[left + 2] + data[right + 2]) / 6;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Fast palette quantization via uniform color-cube clustering.
   */
  private static applyPaletteQuantization(ctx: CanvasRenderingContext2D, w: number, h: number, maxColors: number): void {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const len = data.length;

    // Determine quantization step based on target color count
    let levelsPerChannel = 6; // 6x6x6 = 216 colors
    if (maxColors <= 16) levelsPerChannel = 2; // 2x2x2 = 8-16
    else if (maxColors <= 32) levelsPerChannel = 3; // 3x3x3 = 27
    else if (maxColors <= 64) levelsPerChannel = 4; // 4x4x4 = 64
    else if (maxColors <= 128) levelsPerChannel = 5; // 5x5x5 = 125
    else levelsPerChannel = 6; // 6x6x6 = 216

    const step = 255 / (levelsPerChannel - 1);

    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue; // Keep pure alpha
      data[i] = Math.round(Math.round(data[i] / step) * step);
      data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
      data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Tests a small thumbnail sample of the image to check if any pixels have partial alpha (< 255).
   */
  private static detectImageAlpha(img: HTMLImageElement): boolean {
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = Math.min(64, img.naturalWidth || img.width);
      sampleCanvas.height = Math.min(64, img.naturalHeight || img.height);
      const ctx = sampleCanvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const data = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  public static estimateBase64SizeBytes(base64: string): number {
    const raw = base64.replace(/^data:[^;]+;base64,/, '');
    const padding = (raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0);
    return Math.floor((raw.length * 3) / 4) - padding;
  }

  public static formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  public static detectFormat(base64: string, fileName = ''): ImageSourceMeta['format'] {
    const lower = (base64.slice(0, 40) + ' ' + fileName).toLowerCase();
    if (lower.includes('image/webp') || lower.endsWith('.webp')) return 'webp';
    if (lower.includes('image/jpeg') || lower.includes('image/jpg') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
    if (lower.includes('image/gif') || lower.endsWith('.gif')) return 'gif';
    if (lower.includes('image/svg+xml') || lower.endsWith('.svg')) return 'svg';
    if (lower.includes('image/png') || lower.endsWith('.png')) return 'png';
    return 'unknown';
  }

  public static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
