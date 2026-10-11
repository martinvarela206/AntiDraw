import { VectorModel, VectorElement } from '../VectorModel.js';
import { SvgSerializer } from '../serialization/SvgSerializer.js';
import { BoundingBoxCalculator } from '../geometry/BoundingBoxCalculator.js';

export type ExportTarget = 'selection' | 'artboard';
export type ExportFormat = 'png' | 'webp' | 'svg';
export type ExportScale = 1 | 2 | 3 | 4;

export interface ExportConfig {
  target: ExportTarget;
  format: ExportFormat;
  scale: ExportScale;
  filename?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  scale: ExportScale;
  format: ExportFormat;
}

/**
 * ARCHITECTURAL RATIONALE: Multi-Scale Asset Exporter (AssetExporter)
 *
 * VectorCraft Lesson (Module 07 / 09 - Asset Export):
 * Modern UI/UX designers and technical artists require instant batch export of illustrations
 * and icons at standardized display densities (1x, 2x @retina, 3x mobile, 4x print):
 *
 * 1. Tight Selection vs. Full Artboard Bounding:
 *    - Selection export calculates precise composite boundary envelopes, fitting the viewBox
 *      directly to outermost anchor vertices with minimal padding.
 *    - Artboard export utilizes native canvas dimensions and user-configured viewBox bounds.
 *
 * 2. Offscreen High-DPI Multi-Scale Rasterization:
 *    Scales internal Canvas 2D render buffers according to requested density factor, preserving
 *    crisp vectors without interpolation fuzziness, and encoding to PNG/WebP with alpha channel.
 *
 * 3. Standardized Asset Naming Conventions:
 *    Generates standard asset bundle suffixes: `${name}@1x.png`, `${name}@2x.png`, etc.
 */
export class AssetExporter {
  /**
   * Generates a self-contained SVG document string for the given target (selection or artboard).
   */
  public static prepareSvg(
    model: VectorModel,
    target: ExportTarget,
    selectedIds?: Set<string> | string[]
  ): { svgString: string; width: number; height: number; defaultName: string } {
    let elementsToExport: VectorElement[] = [];

    if (target === 'selection' && selectedIds) {
      const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
      elementsToExport = model.elements.filter((el) => idSet.has(el.id));
    }

    // Fallback to artboard if selection is empty
    if (elementsToExport.length === 0 || target === 'artboard') {
      const width = model.canvas.width || 800;
      const height = model.canvas.height || 600;
      const svgString = SvgSerializer.toSvgString(model);
      return {
        svgString,
        width,
        height,
        defaultName: 'artboard',
      };
    }

    // Calculate tight selection bounding box
    const box = BoundingBoxCalculator.getGroupBoundingBox(elementsToExport);
    const pad = 4;
    const vbX = box ? Math.floor(box.x - pad) : 0;
    const vbY = box ? Math.floor(box.y - pad) : 0;
    const vbW = box ? Math.ceil(box.width + pad * 2) : model.canvas.width || 800;
    const vbH = box ? Math.ceil(box.height + pad * 2) : model.canvas.height || 600;

    const tempModel = new VectorModel();
    tempModel.canvas = {
      width: vbW,
      height: vbH,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      backgroundColor: 'none',
      currentColor: model.canvas.currentColor || '#000000',
      preserveAspectRatio: 'xMidYMid meet',
    };
    tempModel.elements = elementsToExport;
    tempModel.swatches = model.swatches;
    tempModel.customDefs = model.customDefs;

    const svgString = SvgSerializer.toSvgString(tempModel);
    const defaultName = elementsToExport.length === 1 ? elementsToExport[0].id : 'selection';

    return {
      svgString,
      width: vbW,
      height: vbH,
      defaultName,
    };
  }

  /**
   * Rasterizes an SVG string into an offscreen canvas at the requested scale factor and format.
   */
  public static async rasterizeSvg(
    svgString: string,
    width: number,
    height: number,
    scale: ExportScale,
    format: 'png' | 'webp'
  ): Promise<Blob | null> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    return new Promise<Blob | null>((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        const img = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
          try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw vector asset scaled up cleanly
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
            canvas.toBlob((blob) => resolve(blob), mimeType);
          } catch {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };

        img.src = url;
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Executes the full asset export pipeline, generating the formatted file name and Blob.
   */
  public static async exportAsset(
    model: VectorModel,
    config: ExportConfig,
    selectedIds?: Set<string> | string[]
  ): Promise<ExportResult> {
    const { svgString, width, height, defaultName } = this.prepareSvg(
      model,
      config.target,
      selectedIds
    );

    const baseName = (config.filename && config.filename.trim().length > 0)
      ? config.filename.trim().replace(/\.[^/.]+$/, '')
      : defaultName;

    const scaleSuffix = config.format === 'svg' ? '' : `@${config.scale}x`;
    const finalFilename = `${baseName}${scaleSuffix}.${config.format}`;

    if (config.format === 'svg') {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      return {
        blob,
        filename: finalFilename,
        width,
        height,
        scale: 1,
        format: 'svg',
      };
    }

    const rasterBlob = await this.rasterizeSvg(
      svgString,
      width,
      height,
      config.scale,
      config.format
    );

    const finalBlob = rasterBlob || new Blob([svgString], { type: 'image/svg+xml' });

    return {
      blob: finalBlob,
      filename: finalFilename,
      width: Math.round(width * config.scale),
      height: Math.round(height * config.scale),
      scale: config.scale,
      format: config.format,
    };
  }

  /**
   * Triggers browser download dialog for the generated asset.
   */
  public static triggerDownload(result: ExportResult): void {
    if (typeof document === 'undefined') return;

    try {
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('[AssetExporter] Download dispatch error:', err);
    }
  }
}
